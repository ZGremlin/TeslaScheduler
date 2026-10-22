const axios = require("axios");
const TeslaAPI = require("./teslaAPI");

// Periodically records Powerwall telemetry for every configured site into the
// metrics database. Polling failures are logged but never push-notified, so a
// flaky API or an expired token doesn't flood ntfy.
// Polling intervals in minutes. Saved settings (Customize on the dashboard) override these;
// METRICS_POLL_INTERVAL_MINUTES still sets the default for live readings.
const POLLING_LIMITS = {
	readings_minutes: { min: 1, max: 1440 },
	energy_minutes: { min: 5, max: 1440 },
	backup_minutes: { min: 15, max: 10080 },
	weather_minutes: { min: 5, max: 1440 },
	view_refresh_minutes: { min: 0, max: 1440 }, // 0 = never fetch on view
};

function defaultPolling() {
	return {
		readings_minutes: parseInt(process.env.METRICS_POLL_INTERVAL_MINUTES) || 30,
		energy_minutes: 60,
		backup_minutes: 360,
		weather_minutes: 15,
		view_refresh_minutes: 1,
	};
}

// Check a polling settings object; returns an error message or null
function validatePolling(settings) {
	for (const [key, { min, max }] of Object.entries(POLLING_LIMITS)) {
		const value = settings?.[key];
		if (!Number.isInteger(value) || value < min || value > max) {
			return `${key} must be a whole number of minutes from ${min} to ${max}`;
		}
	}
	return null;
}

class MetricsCollector {
	constructor(db, metricsDb) {
		this.db = db;
		this.metricsDb = metricsDb;
		this.teslaAPI = new TeslaAPI();

		this.retentionDays = parseInt(process.env.METRICS_RETENTION_DAYS) || 90;
		this.TICK_MS = 60 * 1000;
		this.PRUNE_INTERVAL_MS = 60 * 60 * 1000;
		this.lastPruneAt = 0;
		this.applyPolling(defaultPolling());

		// Optional outdoor conditions (Open-Meteo, no API key needed)
		this.latitude = parseFloat(process.env.SITE_LATITUDE);
		this.longitude = parseFloat(process.env.SITE_LONGITUDE);
		this.weatherEnabled = Number.isFinite(this.latitude) && Number.isFinite(this.longitude);
		this.weather = null;

		this.timer = null;
		this.siteState = new Map(); // siteId -> per-site timestamps and last error
		this.inFlight = new Map(); // siteId -> Promise
	}

	applyPolling(settings) {
		this.polling = { ...settings };
		this.pollIntervalMs = settings.readings_minutes * 60 * 1000;
		this.energyIntervalMs = settings.energy_minutes * 60 * 1000;
		this.backupIntervalMs = settings.backup_minutes * 60 * 1000;
		this.weatherIntervalMs = settings.weather_minutes * 60 * 1000;
		this.viewRefreshMs = settings.view_refresh_minutes * 60 * 1000;
	}

	async start() {
		try {
			const saved = await this.db.getSetting("polling");
			if (saved && !validatePolling({ ...defaultPolling(), ...saved })) {
				this.applyPolling({ ...defaultPolling(), ...saved });
			}
		} catch (error) {
			console.warn(`Couldn't load saved polling settings: ${error.message}`);
		}

		// A short tick checks what is due, so interval changes apply without a restart
		this.tick();
		this.timer = setInterval(() => this.tick(), this.TICK_MS);
		console.log(`Metrics collector started (${this.describePolling()}, keeping ${this.retentionDays} days)`);
	}

	stop() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	describePolling() {
		const p = this.polling;
		return (
			`readings every ${p.readings_minutes} min, energy history every ${p.energy_minutes} min, ` +
			`outages every ${p.backup_minutes} min`
		);
	}

	getPolling() {
		return { ...this.polling };
	}

	async updatePolling(settings) {
		const error = validatePolling(settings);
		if (error) throw new Error(error);
		const next = Object.fromEntries(Object.keys(POLLING_LIMITS).map((key) => [key, settings[key]]));
		await this.db.setSetting("polling", next);
		this.applyPolling(next);
		console.log(`Polling updated: ${this.describePolling()}`);
		return this.getPolling();
	}

	// Tesla calls per day per site for given settings (dashboard views not included)
	static estimateDailyCalls(settings) {
		const perDay = (minutes) => Math.ceil(1440 / minutes);
		return (
			perDay(settings.readings_minutes) * 2 +
			perDay(settings.energy_minutes) +
			perDay(settings.backup_minutes)
		);
	}

	getState(siteId) {
		if (!this.siteState.has(siteId)) {
			this.siteState.set(siteId, {
				lastCollectedAt: null,
				lastReadingAttemptAt: null,
				lastEnergyAt: null,
				lastBackupAt: null,
				timeZone: null,
				lastError: null,
			});
		}
		return this.siteState.get(siteId);
	}

	async getValidToken() {
		const authData = await this.db.getAuthToken();
		if (!authData || !authData.access_token || Date.now() >= authData.expires_at) {
			return null;
		}
		return authData.access_token;
	}

	// Run whatever is due for each site. Due times count from the last attempt, so a
	// failing call waits a full interval instead of retrying every tick.
	async tick() {
		if (this.ticking) return;
		this.ticking = true;

		try {
			const token = await this.getValidToken();
			if (!token) return;

			const now = Date.now();
			const due = (last, intervalMs) => !last || now - last >= intervalMs;
			const sites = await this.db.getAllSites();

			for (const site of sites) {
				const siteId = site.site_id;
				const state = this.getState(siteId);

				if (due(state.lastReadingAttemptAt, this.pollIntervalMs)) {
					await this.collectSite(siteId).catch(() => {});
				}

				if (due(state.lastEnergyAt, this.energyIntervalMs)) {
					// Backfill the month on the first pass, then just keep the last week current
					const period = state.lastEnergyAt ? "week" : "month";
					state.lastEnergyAt = now;
					await this.collectEnergyHistory(token, siteId, await this.getTimeZone(siteId), period);
				}

				if (due(state.lastBackupAt, this.backupIntervalMs)) {
					state.lastBackupAt = now;
					await this.collectBackupHistory(token, siteId, await this.getTimeZone(siteId));
				}
			}

			if (now - this.lastPruneAt >= this.PRUNE_INTERVAL_MS) {
				this.lastPruneAt = now;
				await this.metricsDb.pruneSnapshots(now - this.retentionDays * 24 * 60 * 60 * 1000);
			}
		} catch (error) {
			console.error("Metrics collection failed:", error.message);
		} finally {
			this.ticking = false;
		}
	}

	async getTimeZone(siteId) {
		const state = this.getState(siteId);
		if (!state.timeZone) {
			const details = await this.metricsDb.getSiteDetails(siteId);
			state.timeZone = details?.installation_time_zone || null;
		}
		return state.timeZone;
	}

	// Fetch a reading while the dashboard is open, if the latest is older than the view refresh setting
	async refreshForView(siteId) {
		if (this.viewRefreshMs === 0) return;
		const latest = await this.metricsDb.getLatestSnapshot(siteId);
		if (latest && Date.now() - latest.recorded_at < this.viewRefreshMs) return;
		await this.collectSite(siteId).catch(() => {});
	}

	// Concurrent requests for the same site share one reading
	collectSite(siteId) {
		if (!this.inFlight.has(siteId)) {
			const run = this.doCollectSite(siteId).finally(() => this.inFlight.delete(siteId));
			this.inFlight.set(siteId, run);
		}
		return this.inFlight.get(siteId);
	}

	async doCollectSite(siteId) {
		const state = this.getState(siteId);
		state.lastReadingAttemptAt = Date.now();

		try {
			const token = await this.getValidToken();
			if (!token) throw new Error("No valid access token");

			const siteInfo = await this.teslaAPI.getSiteInfo(token, siteId, { notify: false });
			const liveStatus = await this.teslaAPI.getLiveStatus(token, siteId, { notify: false });

			if (!liveStatus) throw new Error("Live status not available");

			const weather = await this.getWeather();
			const now = Date.now();

			await this.metricsDb.saveSiteDetails(siteId, siteInfo);
			await this.metricsDb.saveSnapshot({
				site_id: siteId,
				recorded_at: now,
				percentage_charged: liveStatus.percentage_charged ?? null,
				energy_left: liveStatus.energy_left ?? null,
				total_pack_energy: liveStatus.total_pack_energy ?? null,
				solar_power: liveStatus.solar_power ?? null,
				battery_power: liveStatus.battery_power ?? null,
				load_power: liveStatus.load_power ?? null,
				grid_power: liveStatus.grid_power ?? null,
				generator_power: liveStatus.generator_power ?? null,
				grid_services_power: liveStatus.grid_services_power ?? null,
				grid_status: liveStatus.grid_status ?? null,
				island_status: liveStatus.island_status ?? null,
				grid_services_active: toFlag(liveStatus.grid_services_active),
				backup_capable: toFlag(liveStatus.backup_capable),
				storm_mode_active: toFlag(liveStatus.storm_mode_active),
				storm_watch_enabled: toFlag(siteInfo.user_settings?.storm_mode_enabled),
				operation_mode: siteInfo.default_real_mode ?? null,
				backup_reserve_percent: siteInfo.backup_reserve_percent ?? null,
				outdoor_temp_c: weather?.temperature_c ?? null,
				cloud_cover_percent: weather?.cloud_cover_percent ?? null,
			});

			state.lastCollectedAt = now;
			state.timeZone = siteInfo.installation_time_zone || state.timeZone;
			state.lastError = null;
		} catch (error) {
			state.lastError = error.message;
			console.warn(`Metrics collection for site ${siteId} failed: ${error.message}`);
			throw error;
		}
	}

	async collectEnergyHistory(token, siteId, timeZone, period) {
		try {
			const history = await this.teslaAPI.getCalendarHistory(token, siteId, {
				kind: "energy",
				period,
				endDate: new Date().toISOString(),
				timeZone,
			});

			// Entries may be daily or finer-grained; sum them per local date
			const byDate = new Map();
			for (const entry of history?.time_series || []) {
				if (!entry.timestamp) continue;
				const date = entry.timestamp.slice(0, 10);
				const totals = byDate.get(date) || emptyDailyTotals();
				addEnergyEntry(totals, entry);
				byDate.set(date, totals);
			}

			for (const [date, totals] of byDate) {
				await this.metricsDb.saveDailyEnergy(siteId, date, totals);
			}
		} catch (error) {
			console.warn(`Energy history for site ${siteId} unavailable: ${error.message}`);
		}
	}

	async collectBackupHistory(token, siteId, timeZone) {
		try {
			const history = await this.teslaAPI.getCalendarHistory(token, siteId, {
				kind: "backup",
				period: "year",
				endDate: new Date().toISOString(),
				timeZone,
			});

			for (const event of history?.events || []) {
				if (!event.timestamp) continue;
				await this.metricsDb.saveBackupEvent(siteId, event.timestamp, event.duration ?? null);
			}
		} catch (error) {
			console.warn(`Backup history for site ${siteId} unavailable: ${error.message}`);
		}
	}

	async getWeather() {
		if (!this.weatherEnabled) return null;
		if (this.weather && Date.now() - this.weather.fetchedAt < this.weatherIntervalMs) {
			return this.weather;
		}

		try {
			const response = await axios.get("https://api.open-meteo.com/v1/forecast", {
				timeout: 15000,
				params: {
					latitude: this.latitude,
					longitude: this.longitude,
					current: "temperature_2m,cloud_cover",
				},
			});
			const current = response.data.current || {};
			this.weather = {
				fetchedAt: Date.now(),
				temperature_c: current.temperature_2m ?? null,
				cloud_cover_percent: current.cloud_cover ?? null,
			};
		} catch (error) {
			console.warn(`Outdoor weather unavailable: ${error.message}`);
		}

		return this.weather;
	}

	// Energy (Wh) over the last `hours`, integrated from recorded readings. Each reading
	// counts until the next one, capped at two poll intervals so outages in polling
	// aren't filled with stale values.
	async getRollingEnergy(siteId, hours) {
		const { totals, covered_hours } = await this.getEnergySince(
			siteId,
			Date.now() - hours * 60 * 60 * 1000,
		);
		return { ...totals, covered_hours };
	}

	// Same integration from a fixed start time; with bucketMs, also split into buckets
	async getEnergySince(siteId, sinceMs, bucketMs = null) {
		const rows = await this.metricsDb.getRawSnapshots(siteId, sinceMs);
		const maxStepMs = this.pollIntervalMs * 2;

		const totals = emptyEnergyTotals();
		const buckets = new Map(); // bucket start -> totals
		let coveredMs = 0;

		for (let i = 0; i < rows.length - 1; i++) {
			const row = rows[i];
			const stepMs = Math.min(rows[i + 1].recorded_at - row.recorded_at, maxStepMs);
			coveredMs += stepMs;

			addReadingEnergy(totals, row, stepMs);

			if (bucketMs) {
				const start = sinceMs + Math.floor((row.recorded_at - sinceMs) / bucketMs) * bucketMs;
				if (!buckets.has(start)) buckets.set(start, emptyEnergyTotals());
				addReadingEnergy(buckets.get(start), row, stepMs);
			}
		}

		return {
			totals,
			covered_hours: coveredMs / 3600000,
			first_reading_at: rows.length ? rows[0].recorded_at : null,
			buckets: Array.from(buckets, ([t, bucket]) => ({ t, ...bucket })),
		};
	}

	getStatus(siteId) {
		const state = this.getState(siteId);
		return {
			poll_interval_minutes: this.pollIntervalMs / 60000,
			retention_days: this.retentionDays,
			weather_enabled: this.weatherEnabled,
			last_collected_at: state.lastCollectedAt,
			last_error: state.lastError,
		};
	}
}

function emptyEnergyTotals() {
	return {
		solar_generated: 0,
		home_usage: 0,
		home_from_grid: 0,
		grid_imported: 0,
		grid_exported: 0,
		battery_charged: 0,
		battery_discharged: 0,
	};
}

// Add one reading's energy (Wh), held for stepMs, to running totals
function addReadingEnergy(totals, row, stepMs) {
	const hours = stepMs / 3600000;
	const solar = row.solar_power || 0;
	const load = row.load_power || 0;
	const grid = row.grid_power || 0; // positive = importing
	const battery = row.battery_power || 0; // positive = discharging

	totals.solar_generated += Math.max(solar, 0) * hours;
	totals.home_usage += Math.max(load, 0) * hours;
	// Grid import beyond the home's load went into the battery, not the home
	totals.home_from_grid += Math.min(Math.max(grid, 0), Math.max(load, 0)) * hours;
	totals.grid_imported += Math.max(grid, 0) * hours;
	totals.grid_exported += Math.max(-grid, 0) * hours;
	totals.battery_discharged += Math.max(battery, 0) * hours;
	totals.battery_charged += Math.max(-battery, 0) * hours;
}

// Midnight today in the site's time zone (falls back to the server's), plus that date as YYYY-MM-DD
function startOfToday(timeZone) {
	const now = new Date();
	try {
		if (timeZone) {
			const parts = Object.fromEntries(
				new Intl.DateTimeFormat("en-US", {
					timeZone,
					year: "numeric",
					month: "2-digit",
					day: "2-digit",
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit",
					hourCycle: "h23",
				})
					.formatToParts(now)
					.map((p) => [p.type, p.value]),
			);
			// Wall-clock time in the zone, read as if it were UTC, minus the real instant = zone offset
			const wallAsUtc = Date.UTC(
				parts.year,
				parts.month - 1,
				parts.day,
				parts.hour,
				parts.minute,
				parts.second,
			);
			const offsetMs = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
			return {
				date: `${parts.year}-${parts.month}-${parts.day}`,
				midnightMs: Date.UTC(parts.year, parts.month - 1, parts.day) - offsetMs,
			};
		}
	} catch (error) {
		// Unknown time zone - use the server's local day
	}

	const midnight = new Date(now);
	midnight.setHours(0, 0, 0, 0);
	const pad = (n) => String(n).padStart(2, "0");
	return {
		date: `${midnight.getFullYear()}-${pad(midnight.getMonth() + 1)}-${pad(midnight.getDate())}`,
		midnightMs: midnight.getTime(),
	};
}

function toFlag(value) {
	if (value === undefined || value === null) return null;
	return value ? 1 : 0;
}

function emptyDailyTotals() {
	return {
		solar_generated: 0,
		home_usage: 0,
		grid_imported: 0,
		grid_exported: 0,
		battery_charged: 0,
		battery_discharged: 0,
		home_from_solar: 0,
		home_from_battery: 0,
		home_from_grid: 0,
	};
}

// Fleet API energy entries carry both itemised flows and (usually) totals;
// prefer the totals and fall back to summing the flows
function addEnergyEntry(totals, e) {
	const n = (value) => Number(value) || 0;
	const pick = (total, ...parts) =>
		total !== undefined && total !== null ? n(total) : parts.reduce((sum, p) => sum + n(p), 0);

	totals.home_from_solar += n(e.consumer_energy_imported_from_solar);
	totals.home_from_battery += n(e.consumer_energy_imported_from_battery);
	totals.home_from_grid += n(e.consumer_energy_imported_from_grid);

	totals.solar_generated += pick(e.total_solar_generation, e.solar_energy_exported);
	totals.home_usage += pick(
		e.total_home_usage,
		e.consumer_energy_imported_from_solar,
		e.consumer_energy_imported_from_battery,
		e.consumer_energy_imported_from_grid,
		e.consumer_energy_imported_from_generator,
	);
	totals.grid_imported += pick(
		e.grid_energy_imported,
		e.consumer_energy_imported_from_grid,
		e.battery_energy_imported_from_grid,
	);
	totals.grid_exported += pick(
		e.total_grid_energy_exported,
		e.grid_energy_exported_from_solar,
		e.grid_energy_exported_from_generator,
		e.grid_energy_exported_from_battery,
	);
	totals.battery_charged += pick(
		e.total_battery_charge,
		e.battery_energy_imported_from_grid,
		e.battery_energy_imported_from_solar,
		e.battery_energy_imported_from_generator,
	);
	totals.battery_discharged += pick(e.total_battery_discharge, e.battery_energy_exported);
}

module.exports = MetricsCollector;
module.exports.startOfToday = startOfToday;
module.exports.POLLING_LIMITS = POLLING_LIMITS;

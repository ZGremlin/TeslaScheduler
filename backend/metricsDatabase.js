const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Powerwall telemetry lives in its own database, separate from the
// scheduler's powerwall.db, so it can grow (or be wiped) independently.
class MetricsDatabase {
	constructor() {
		this.dbPath = path.join(__dirname, "metrics.db");
		this.db = null;
	}

	connect() {
		return new Promise((resolve, reject) => {
			this.db = new sqlite3.Database(this.dbPath, (err) => {
				if (err) reject(err);
				else this.createTables().then(resolve, reject);
			});
		});
	}

	close() {
		return new Promise((resolve, reject) => {
			if (this.db) {
				this.db.close((err) => {
					if (err) reject(err);
					else resolve();
				});
			} else {
				resolve();
			}
		});
	}

	run(sql, params = []) {
		return new Promise((resolve, reject) => {
			this.db.run(sql, params, function (err) {
				if (err) reject(err);
				else resolve({ id: this.lastID, changes: this.changes });
			});
		});
	}

	get(sql, params = []) {
		return new Promise((resolve, reject) => {
			this.db.get(sql, params, (err, row) => {
				if (err) reject(err);
				else resolve(row);
			});
		});
	}

	all(sql, params = []) {
		return new Promise((resolve, reject) => {
			this.db.all(sql, params, (err, rows) => {
				if (err) reject(err);
				else resolve(rows);
			});
		});
	}

	async createTables() {
		// Point-in-time readings from live_status + site_info (power in W, energy in Wh)
		await this.run(`
      CREATE TABLE IF NOT EXISTS power_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id TEXT NOT NULL,
        recorded_at INTEGER NOT NULL,
        percentage_charged REAL,
        energy_left REAL,
        total_pack_energy REAL,
        solar_power REAL,
        battery_power REAL,
        load_power REAL,
        grid_power REAL,
        generator_power REAL,
        grid_services_power REAL,
        grid_status TEXT,
        island_status TEXT,
        grid_services_active INTEGER,
        backup_capable INTEGER,
        storm_mode_active INTEGER,
        storm_watch_enabled INTEGER,
        operation_mode TEXT,
        backup_reserve_percent REAL,
        outdoor_temp_c REAL,
        cloud_cover_percent REAL
      )
    `);
		await this.run(
			"CREATE INDEX IF NOT EXISTS idx_power_snapshots_site_time ON power_snapshots (site_id, recorded_at)",
		);

		// Daily energy totals from calendar_history (kind=energy), in Wh
		await this.run(`
      CREATE TABLE IF NOT EXISTS daily_energy (
        site_id TEXT NOT NULL,
        date TEXT NOT NULL,
        solar_generated REAL,
        home_usage REAL,
        grid_imported REAL,
        grid_exported REAL,
        battery_charged REAL,
        battery_discharged REAL,
        home_from_solar REAL,
        home_from_battery REAL,
        home_from_grid REAL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (site_id, date)
      )
    `);

		// Grid outages from calendar_history (kind=backup)
		await this.run(`
      CREATE TABLE IF NOT EXISTS backup_events (
        site_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        duration_ms INTEGER,
        PRIMARY KEY (site_id, started_at)
      )
    `);

		// Latest raw site_info, kept for hardware/firmware details
		await this.run(`
      CREATE TABLE IF NOT EXISTS site_details (
        site_id TEXT PRIMARY KEY,
        site_info TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
	}

	// Snapshots
	async saveSnapshot(snapshot) {
		const columns = Object.keys(snapshot);
		const placeholders = columns.map(() => "?").join(", ");
		return this.run(
			`INSERT INTO power_snapshots (${columns.join(", ")}) VALUES (${placeholders})`,
			columns.map((column) => snapshot[column]),
		);
	}

	async getLatestSnapshot(siteId) {
		return this.get(
			"SELECT * FROM power_snapshots WHERE site_id = ? ORDER BY recorded_at DESC LIMIT 1",
			[siteId],
		);
	}

	// Average snapshots into fixed buckets so long ranges stay a sensible size for charts
	async getSnapshotHistory(siteId, sinceMs, bucketMs) {
		return this.all(
			`SELECT
         (recorded_at / ?) * ? AS recorded_at,
         AVG(percentage_charged) AS percentage_charged,
         AVG(solar_power) AS solar_power,
         AVG(battery_power) AS battery_power,
         AVG(load_power) AS load_power,
         AVG(grid_power) AS grid_power
       FROM power_snapshots
       WHERE site_id = ? AND recorded_at >= ?
       GROUP BY recorded_at / ?
       ORDER BY recorded_at ASC`,
			[bucketMs, bucketMs, siteId, sinceMs, bucketMs],
		);
	}

	async getRawSnapshots(siteId, sinceMs) {
		return this.all(
			`SELECT recorded_at, solar_power, battery_power, load_power, grid_power
       FROM power_snapshots
       WHERE site_id = ? AND recorded_at >= ?
       ORDER BY recorded_at ASC`,
			[siteId, sinceMs],
		);
	}

	async getLatestWeather(siteId, sinceMs) {
		return this.get(
			`SELECT recorded_at, outdoor_temp_c, cloud_cover_percent FROM power_snapshots
       WHERE site_id = ? AND recorded_at >= ? AND outdoor_temp_c IS NOT NULL
       ORDER BY recorded_at DESC LIMIT 1`,
			[siteId, sinceMs],
		);
	}

	async pruneSnapshots(olderThanMs) {
		return this.run("DELETE FROM power_snapshots WHERE recorded_at < ?", [olderThanMs]);
	}

	// Daily energy
	async saveDailyEnergy(siteId, date, totals) {
		return this.run(
			`INSERT INTO daily_energy (site_id, date, solar_generated, home_usage, grid_imported, grid_exported,
         battery_charged, battery_discharged, home_from_solar, home_from_battery, home_from_grid, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (site_id, date) DO UPDATE SET
         solar_generated = excluded.solar_generated,
         home_usage = excluded.home_usage,
         grid_imported = excluded.grid_imported,
         grid_exported = excluded.grid_exported,
         battery_charged = excluded.battery_charged,
         battery_discharged = excluded.battery_discharged,
         home_from_solar = excluded.home_from_solar,
         home_from_battery = excluded.home_from_battery,
         home_from_grid = excluded.home_from_grid,
         updated_at = excluded.updated_at`,
			[
				siteId,
				date,
				totals.solar_generated,
				totals.home_usage,
				totals.grid_imported,
				totals.grid_exported,
				totals.battery_charged,
				totals.battery_discharged,
				totals.home_from_solar,
				totals.home_from_battery,
				totals.home_from_grid,
				Date.now(),
			],
		);
	}

	async getDailyEnergy(siteId, days) {
		const rows = await this.all(
			"SELECT * FROM daily_energy WHERE site_id = ? ORDER BY date DESC LIMIT ?",
			[siteId, days],
		);
		return rows.reverse();
	}

	async getDailyEnergyForDate(siteId, date) {
		return this.get("SELECT * FROM daily_energy WHERE site_id = ? AND date = ?", [siteId, date]);
	}

	// Backup events (outages)
	async saveBackupEvent(siteId, startedAt, durationMs) {
		return this.run(
			`INSERT INTO backup_events (site_id, started_at, duration_ms) VALUES (?, ?, ?)
       ON CONFLICT (site_id, started_at) DO UPDATE SET duration_ms = excluded.duration_ms`,
			[siteId, startedAt, durationMs],
		);
	}

	async getBackupEvents(siteId, limit) {
		return this.all(
			"SELECT * FROM backup_events WHERE site_id = ? ORDER BY started_at DESC LIMIT ?",
			[siteId, limit],
		);
	}

	// Site details
	async saveSiteDetails(siteId, siteInfo) {
		return this.run(
			`INSERT INTO site_details (site_id, site_info, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (site_id) DO UPDATE SET site_info = excluded.site_info, updated_at = excluded.updated_at`,
			[siteId, JSON.stringify(siteInfo), Date.now()],
		);
	}

	async getSiteDetails(siteId) {
		const row = await this.get("SELECT * FROM site_details WHERE site_id = ?", [siteId]);
		if (!row) return null;
		return { ...JSON.parse(row.site_info), _updated_at: row.updated_at };
	}
}

module.exports = MetricsDatabase;

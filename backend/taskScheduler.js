const cron = require("node-cron");
const DatabaseService = require("./database");
const TeslaAPI = require("./teslaAPI");
const WeatherAlertService = require("./weatherAlertService");

class TaskScheduler {
	constructor() {
		this.scheduledJobs = new Map();
		this.retryTimers = new Map();
		this.db = new DatabaseService();
		this.teslaAPI = null;
		this.weatherAlertService = new WeatherAlertService();

		// Retry failed tasks every 10 minutes
		this.RETRY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes in milliseconds

		// Persistence: after an auto storm watch run, verify every 10 minutes that
		// Storm Watch is actually charging the batteries, moving to a new weather
		// event if it is not
		this.persistenceChecks = new Map();
		this.PERSISTENCE_INTERVAL_MS = 10 * 60 * 1000;
		this.CHARGING_THRESHOLD_W = 100; // battery_power below -100W counts as charging
		this.FULL_BATTERY_PERCENT = 99; // nothing left to charge at or above this level
	}

	async initialize() {
		await this.db.connect();
		this.teslaAPI = new TeslaAPI();
		await this.loadAndScheduleTasks();
		console.log("Task scheduler initialized");
	}

	async loadAndScheduleTasks() {
		const tasks = await this.db.getAllTasks();

		for (const task of tasks) {
			if (task.enabled) {
				this.scheduleTask(task);
			}
		}

		console.log(`Loaded ${tasks.filter((t) => t.enabled).length} enabled tasks`);
	}

	scheduleTask(task) {
		// Remove existing job if it exists
		if (this.scheduledJobs.has(task.id)) {
			this.scheduledJobs.get(task.id).stop();
			this.scheduledJobs.delete(task.id);
		}

		// Clear any existing retry timer
		this.clearRetryTimer(task.id);
		this.clearPersistence(task.id);

		// Parse time (format: "HH:MM")
		const [hours, minutes] = task.time.split(":");

		// Create cron expression for daily execution
		const cronExpression = `${minutes} ${hours} * * *`;

		// Schedule the task
		const job = cron.schedule(cronExpression, async () => {
			// Clear any retry timer when scheduled time arrives
			this.clearRetryTimer(task.id);
			await this.executeTask(task);
		});

		this.scheduledJobs.set(task.id, job);
		console.log(`Scheduled task ${task.id}: "${task.name}" at ${task.time}`);
	}

	unscheduleTask(taskId) {
		if (this.scheduledJobs.has(taskId)) {
			this.scheduledJobs.get(taskId).stop();
			this.scheduledJobs.delete(taskId);
			console.log(`Unscheduled task ${taskId}`);
		}

		// Also clear any retry timer
		this.clearRetryTimer(taskId);
		this.clearPersistence(taskId);
	}

	clearPersistence(taskId) {
		if (this.persistenceChecks.has(taskId)) {
			clearTimeout(this.persistenceChecks.get(taskId).timer);
			this.persistenceChecks.delete(taskId);
		}
	}

	formatAddress(address) {
		return `${address.address_line1}, ${address.city}, ${address.state} ${address.zip}`;
	}

	startPersistence(task, address, alertId) {
		this.clearPersistence(task.id);

		const state = {
			attempt: 0,
			address: address,
			triedAlertIds: alertId ? [alertId] : [],
			timer: null,
		};

		this.persistenceChecks.set(task.id, state);
		this.schedulePersistenceCheck(task.id, state);
	}

	schedulePersistenceCheck(taskId, state) {
		state.timer = setTimeout(
			() => this.runPersistenceCheck(taskId, state),
			this.PERSISTENCE_INTERVAL_MS,
		);

		const checkTime = new Date(Date.now() + this.PERSISTENCE_INTERVAL_MS);
		console.log(`⏳ Task ${taskId} persistence check at ${checkTime.toLocaleTimeString()}`);
	}

	async runPersistenceCheck(taskId, state) {
		// Persistence was cancelled or restarted while this check was pending
		const isCurrent = () => this.persistenceChecks.get(taskId) === state;
		if (!isCurrent()) return;

		let finished = false;

		try {
			// Reload the task in case it was changed since the run that started this
			const task = await this.db.getTaskById(taskId);

			if (
				!task ||
				!task.enabled ||
				!task.persistence ||
				!task.auto_storm_watch ||
				task.storm_watch !== "enable"
			) {
				console.log(`⏹️  Task ${taskId} persistence stopped - no longer enabled for this task`);
				finished = true;
				return;
			}

			console.log(`🔎 Persistence check for task ${task.id}: "${task.name}"`);

			const authData = await this.db.getAuthToken();

			if (!authData || !authData.access_token) {
				throw new Error("No authentication token available");
			}

			if (Date.now() >= authData.expires_at) {
				throw new Error("Authentication token expired - automatic refresh should handle this");
			}

			const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

			if (!googleMapsApiKey) {
				throw new Error("Google Maps API key not configured");
			}

			const siteInfo = await this.teslaAPI.getSiteInfo(authData.access_token, task.site_id);
			const liveStatus = await this.teslaAPI.getLiveStatus(authData.access_token, task.site_id);

			if (!liveStatus) {
				throw new Error("Live status not available");
			}

			const stormWatchEnabled = !!siteInfo.user_settings?.storm_mode_enabled;
			const stormActive = !!liveStatus.storm_mode_active;
			const batteryPower = liveStatus.battery_power || 0; // negative = charging
			const batteryPercent = liveStatus.percentage_charged || 0;
			const charging = batteryPower < -this.CHARGING_THRESHOLD_W;
			const batteryFull = batteryPercent >= this.FULL_BATTERY_PERCENT;

			const stateSummary =
				`Storm Watch ${stormWatchEnabled ? "enabled" : "disabled"}, ` +
				`storm event ${stormActive ? "active" : "not active"}, ` +
				`battery ${charging ? "charging" : "not charging"} ` +
				`(${(batteryPower / 1000).toFixed(2)} kW, ${batteryPercent.toFixed(0)}%)`;
			const currentAddress = state.address ? this.formatAddress(state.address) : "unchanged";

			if (stormWatchEnabled && stormActive && (charging || batteryFull)) {
				const message = `Persistence confirmed: ${stateSummary}. Address: ${currentAddress}`;
				console.log(`  ✅ ${message}`);
				await this.db.logTaskExecution(task.id, "success", message);
				finished = true;
				return;
			}

			state.attempt++;
			console.log(`  ⚠️  Persistence attempt ${state.attempt}: ${stateSummary}`);

			if (!stormWatchEnabled) {
				console.log(`  ⛈️  Storm Watch is disabled - enabling`);
				await this.teslaAPI.enableStormWatch(authData.access_token, task.site_id);
			}

			let weatherResult = await this.weatherAlertService.checkForSevereWeatherAndGetAddress(
				googleMapsApiKey,
				state.triedAlertIds,
			);

			// Every active alert has been tried - start over from the full list
			if (!weatherResult.success && weatherResult.exhausted) {
				state.triedAlertIds = [];
				weatherResult =
					await this.weatherAlertService.checkForSevereWeatherAndGetAddress(googleMapsApiKey);
			}

			// Task was edited, disabled or re-run while we were searching
			if (!isCurrent()) return;

			if (!weatherResult.success) {
				await this.db.logTaskExecution(
					task.id,
					"persistence",
					`Persistence attempt ${state.attempt}: ${stateSummary}. ` +
						`No severe weather alerts active - address left at ${currentAddress}`,
				);
				return;
			}

			await this.teslaAPI.updateSiteAddress(
				authData.access_token,
				task.site_id,
				weatherResult.address,
			);

			state.address = weatherResult.address;
			if (weatherResult.alert.id) {
				state.triedAlertIds.push(weatherResult.alert.id);
			}

			await this.db.logTaskExecution(
				task.id,
				"persistence",
				`Persistence attempt ${state.attempt}: ${stateSummary}. ` +
					`Address set to ${this.formatAddress(weatherResult.address)} (${weatherResult.alert.event})`,
			);
		} catch (error) {
			console.error(`❌ Task ${taskId} persistence check failed:`, error.message);
			await this.db
				.logTaskExecution(taskId, "failed", `Persistence check failed: ${error.message}`)
				.catch((logError) => console.error("Failed to log persistence check:", logError.message));
		} finally {
			if (isCurrent()) {
				if (finished) {
					this.persistenceChecks.delete(taskId);
				} else {
					this.schedulePersistenceCheck(taskId, state);
				}
			}
		}
	}

	clearRetryTimer(taskId) {
		if (this.retryTimers.has(taskId)) {
			clearTimeout(this.retryTimers.get(taskId));
			this.retryTimers.delete(taskId);
		}
	}

	scheduleRetry(task) {
		// Clear existing retry timer first
		this.clearRetryTimer(task.id);

		// Calculate when the next scheduled execution is
		const [hours, minutes] = task.time.split(":");
		const now = new Date();
		const nextScheduled = new Date();
		nextScheduled.setHours(parseInt(hours), parseInt(minutes), 0, 0);

		// If the scheduled time today has passed, it's tomorrow
		if (nextScheduled <= now) {
			nextScheduled.setDate(nextScheduled.getDate() + 1);
		}

		const timeUntilNextScheduled = nextScheduled.getTime() - now.getTime();

		// Only schedule retry if we have more than 10 minutes until next scheduled time
		if (timeUntilNextScheduled > this.RETRY_INTERVAL_MS) {
			const retryTimer = setTimeout(async () => {
				console.log(`🔁 Retrying task ${task.id}: "${task.name}"`);
				await this.executeTask(task);
			}, this.RETRY_INTERVAL_MS);

			this.retryTimers.set(task.id, retryTimer);

			const retryTime = new Date(Date.now() + this.RETRY_INTERVAL_MS);
			console.log(`⏳ Task ${task.id} will retry at ${retryTime.toLocaleTimeString()}`);
		} else {
			console.log(
				`⏭️  Task ${task.id} will not retry - next scheduled time is soon (${Math.round(timeUntilNextScheduled / 1000 / 60)} minutes)`,
			);
		}
	}

	async executeTask(task) {
		console.log(`Executing task ${task.id}: "${task.name}"`);

		// A fresh run restarts any persistence checks left over from the last one
		this.clearPersistence(task.id);

		let stormAddress = null;
		let stormAlertId = null;
		let autoStormDetail = null;
		let canPersist = false;

		try {
			// Get auth token
			const authData = await this.db.getAuthToken();

			if (!authData || !authData.access_token) {
				throw new Error("No authentication token available");
			}

			// Check if token is expired
			if (Date.now() >= authData.expires_at) {
				throw new Error("Authentication token expired - automatic refresh should handle this");
			}

			// Verify task has site_id
			if (!task.site_id) {
				throw new Error("Task has no site_id - database migration may be required");
			}

			// Handle auto storm watch if enabled
			if (task.auto_storm_watch && task.storm_watch === "enable") {
				console.log(`  🌩️  Auto Storm Watch enabled - checking for severe weather...`);

				try {
					const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

					if (!googleMapsApiKey) {
						console.warn("  ⚠️  Google Maps API key not configured, skipping auto storm watch");
						autoStormDetail = "Auto Storm Watch skipped: Google Maps API key not configured";
					} else {
						canPersist = true;

						const weatherResult =
							await this.weatherAlertService.checkForSevereWeatherAndGetAddress(googleMapsApiKey);

						if (weatherResult.success) {
							console.log(`  🚨 Severe weather detected: ${weatherResult.alert.event}`);
							console.log(`  📍 Updating site address to trigger Storm Watch...`);

							await this.teslaAPI.updateSiteAddress(
								authData.access_token,
								task.site_id,
								weatherResult.address,
							);

							console.log(`  ✅ Site address updated - Tesla should activate Storm Watch`);

							stormAddress = weatherResult.address;
							stormAlertId = weatherResult.alert.id;
							autoStormDetail =
								`Auto Storm Watch: address set to ${this.formatAddress(stormAddress)} ` +
								`(${weatherResult.alert.event})`;
						} else {
							console.log(`  ℹ️  No severe weather alerts active, skipping address update`);
							autoStormDetail = "Auto Storm Watch: no severe weather alerts active, address unchanged";
						}
					}
				} catch (weatherError) {
					console.error(`  ❌ Auto storm watch failed: ${weatherError.message}`);
					autoStormDetail = `Auto Storm Watch failed: ${weatherError.message}`;
					// Continue with task execution even if weather check fails
				}
			}

			// Execute the operation mode change
			await this.teslaAPI.setOperationMode(
				authData.access_token,
				task.site_id,
				task.mode,
				task.backup_reserve,
			);

			// Execute manual storm watch change if specified (and not auto)
			if (!task.auto_storm_watch) {
				if (task.storm_watch === "enable") {
					console.log(`  ⛈️  Enabling Storm Watch for task ${task.id}`);
					await this.teslaAPI.enableStormWatch(authData.access_token, task.site_id);
				} else if (task.storm_watch === "disable") {
					console.log(`  ☀️  Disabling Storm Watch for task ${task.id}`);
					await this.teslaAPI.disableStormWatch(authData.access_token, task.site_id);
				}
			}

			// Log success
			await this.db.logTaskExecution(task.id, "success", autoStormDetail);
			console.log(`✅ Task ${task.id} executed successfully`);

			// Clear any retry timer on success
			this.clearRetryTimer(task.id);

			// Keep checking that Storm Watch is actually charging the batteries
			if (task.persistence && canPersist) {
				this.startPersistence(task, stormAddress, stormAlertId);
			}
		} catch (error) {
			console.error(`❌ Task ${task.id} failed:`, error.message);
			await this.db.logTaskExecution(task.id, "failed", error.message);

			// Schedule retry on failure
			this.scheduleRetry(task);
		}
	}

	async refreshSchedule() {
		// Stop all existing jobs
		for (const [taskId, job] of this.scheduledJobs) {
			job.stop();
		}
		this.scheduledJobs.clear();

		// Clear all retry timers
		for (const [taskId, timer] of this.retryTimers) {
			clearTimeout(timer);
		}
		this.retryTimers.clear();

		// Clear all persistence checks
		for (const [taskId, state] of this.persistenceChecks) {
			clearTimeout(state.timer);
		}
		this.persistenceChecks.clear();

		// Reload and reschedule tasks
		await this.loadAndScheduleTasks();
	}

	async shutdown() {
		// Stop all jobs
		for (const [taskId, job] of this.scheduledJobs) {
			job.stop();
		}
		this.scheduledJobs.clear();

		// Clear all retry timers
		for (const [taskId, timer] of this.retryTimers) {
			clearTimeout(timer);
		}
		this.retryTimers.clear();

		// Clear all persistence checks
		for (const [taskId, state] of this.persistenceChecks) {
			clearTimeout(state.timer);
		}
		this.persistenceChecks.clear();

		// Close database connection
		await this.db.close();
		console.log("Task scheduler shut down");
	}

	getRetryStatus() {
		const retryingTasks = [];
		for (const [taskId, timer] of this.retryTimers) {
			retryingTasks.push(taskId);
		}
		return retryingTasks;
	}

	getPersistenceStatus() {
		return Array.from(this.persistenceChecks.keys());
	}
}

module.exports = TaskScheduler;

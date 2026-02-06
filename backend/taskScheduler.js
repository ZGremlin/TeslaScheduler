const cron = require("node-cron");
const DatabaseService = require("./database");
const TeslaAPI = require("./teslaAPI");

class TaskScheduler {
	constructor() {
		this.scheduledJobs = new Map();
		this.retryTimers = new Map();
		this.db = new DatabaseService();
		this.teslaAPI = null;

		// Retry failed tasks every 10 minutes
		this.RETRY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes in milliseconds
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

			// Get site configuration
			const config = await this.db.getPowerwallConfig();
			if (!config || !config.site_id) {
				throw new Error("Powerwall site not configured");
			}

			// Execute the operation mode change
			await this.teslaAPI.setOperationMode(
				authData.access_token,
				config.site_id,
				task.mode,
				task.backup_reserve,
			);

			// Execute storm watch change if specified
			if (task.storm_watch === "enable") {
				console.log(`  ⛈️  Enabling Storm Watch for task ${task.id}`);
				await this.teslaAPI.enableStormWatch(authData.access_token, config.site_id);
			} else if (task.storm_watch === "disable") {
				console.log(`  ☀️  Disabling Storm Watch for task ${task.id}`);
				await this.teslaAPI.disableStormWatch(authData.access_token, config.site_id);
			}

			// Log success
			await this.db.logTaskExecution(task.id, "success");
			console.log(`✅ Task ${task.id} executed successfully`);

			// Clear any retry timer on success
			this.clearRetryTimer(task.id);
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
}

module.exports = TaskScheduler;

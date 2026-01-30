const cron = require('node-cron');
const DatabaseService = require('./database');
const TeslaAPI = require('./teslaAPI');

class TaskScheduler {
  constructor() {
    this.scheduledJobs = new Map();
    this.db = new DatabaseService();
    this.teslaAPI = null;
  }

  async initialize() {
    await this.db.connect();
    this.teslaAPI = new TeslaAPI();
    await this.loadAndScheduleTasks();
    console.log('Task scheduler initialized');
  }

  async loadAndScheduleTasks() {
    const tasks = await this.db.getAllTasks();
    
    for (const task of tasks) {
      if (task.enabled) {
        this.scheduleTask(task);
      }
    }
    
    console.log(`Loaded ${tasks.filter(t => t.enabled).length} enabled tasks`);
  }

  scheduleTask(task) {
    // Remove existing job if it exists
    if (this.scheduledJobs.has(task.id)) {
      this.scheduledJobs.get(task.id).stop();
      this.scheduledJobs.delete(task.id);
    }

    // Parse time (format: "HH:MM")
    const [hours, minutes] = task.time.split(':');
    
    // Create cron expression for daily execution
    const cronExpression = `${minutes} ${hours} * * *`;
    
    // Schedule the task
    const job = cron.schedule(cronExpression, async () => {
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
  }

  async executeTask(task) {
    console.log(`Executing task ${task.id}: "${task.name}"`);
    
    try {
      // Get auth token
      let authData = await this.db.getAuthToken();
      
      if (!authData || !authData.access_token) {
        throw new Error('No authentication token available');
      }

      // Check if token is expired and refresh if needed
      if (Date.now() >= authData.expires_at) {
        console.log('Token expired, refreshing...');
        
        if (!authData.refresh_token) {
          throw new Error('No refresh token available - please re-authenticate');
        }

        const newTokens = await this.teslaAPI.refreshAccessToken(authData.refresh_token);
        await this.db.saveAuthToken(
          newTokens.access_token,
          newTokens.refresh_token,
          newTokens.expires_at
        );
        authData = newTokens;
      }

      // Get site configuration
      const config = await this.db.getPowerwallConfig();
      if (!config || !config.site_id) {
        throw new Error('Powerwall site not configured');
      }

      // Execute the task
      await this.teslaAPI.setOperationMode(
        authData.access_token,
        config.site_id,
        task.mode,
        task.backup_reserve
      );

      // Log success
      await this.db.logTaskExecution(task.id, 'success');
      console.log(`Task ${task.id} executed successfully`);
      
    } catch (error) {
      console.error(`Task ${task.id} failed:`, error.message);
      await this.db.logTaskExecution(task.id, 'failed', error.message);
    }
  }

  async refreshSchedule() {
    // Stop all existing jobs
    for (const [taskId, job] of this.scheduledJobs) {
      job.stop();
    }
    this.scheduledJobs.clear();

    // Reload and reschedule tasks
    await this.loadAndScheduleTasks();
  }

  async shutdown() {
    // Stop all jobs
    for (const [taskId, job] of this.scheduledJobs) {
      job.stop();
    }
    this.scheduledJobs.clear();

    // Close database connection
    await this.db.close();
    console.log('Task scheduler shut down');
  }
}

module.exports = TaskScheduler;

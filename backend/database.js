const sqlite3 = require("sqlite3").verbose();
const path = require("path");

class DatabaseService {
	constructor() {
		this.dbPath = path.join(__dirname, "powerwall.db");
		this.db = null;
	}

	connect() {
		return new Promise((resolve, reject) => {
			this.db = new sqlite3.Database(this.dbPath, (err) => {
				if (err) reject(err);
				else resolve();
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

	// Auth Token Methods
	async saveAuthToken(accessToken, refreshToken, expiresAt) {
		return new Promise((resolve, reject) => {
			// Check whether a row already exists
			this.db.get(
				"SELECT id, refresh_token FROM auth_tokens ORDER BY id DESC LIMIT 1",
				(err, existing) => {
					if (err) {
						reject(err);
						return;
					}

					if (existing) {
						// Preserve the current refresh_token if the caller did not supply a new one
						const effectiveRefreshToken = refreshToken || existing.refresh_token;

						this.db.run(
							`UPDATE auth_tokens
             SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
							[accessToken, effectiveRefreshToken, expiresAt, existing.id],
							function (err) {
								if (err) reject(err);
								else resolve({ id: existing.id });
							},
						);
					} else {
						// First-time insert (initial OAuth callback)
						this.db.run(
							`INSERT INTO auth_tokens (access_token, refresh_token, expires_at, updated_at) 
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
							[accessToken, refreshToken, expiresAt],
							function (err) {
								if (err) reject(err);
								else resolve({ id: this.lastID });
							},
						);
					}
				},
			);
		});
	}

	async getAuthToken() {
		return new Promise((resolve, reject) => {
			this.db.get("SELECT * FROM auth_tokens ORDER BY id DESC LIMIT 1", (err, row) => {
				if (err) reject(err);
				else resolve(row);
			});
		});
	}

	// Powerwall Config Methods
	async savePowerwallConfig(siteId, siteName) {
		return new Promise((resolve, reject) => {
			this.db.run("DELETE FROM powerwall_config", (err) => {
				if (err) {
					reject(err);
					return;
				}

				this.db.run(
					`INSERT INTO powerwall_config (site_id, site_name, updated_at) 
           VALUES (?, ?, CURRENT_TIMESTAMP)`,
					[siteId, siteName],
					function (err) {
						if (err) reject(err);
						else resolve({ id: this.lastID });
					},
				);
			});
		});
	}

	async getPowerwallConfig() {
		return new Promise((resolve, reject) => {
			this.db.get("SELECT * FROM powerwall_config ORDER BY id DESC LIMIT 1", (err, row) => {
				if (err) reject(err);
				else resolve(row);
			});
		});
	}

	// Scheduled Task Methods
	async createTask(name, time, mode, backupReserve, stormWatch = "no_change", autoStormWatch = 0) {
		return new Promise((resolve, reject) => {
			this.db.run(
				`INSERT INTO scheduled_tasks (name, time, mode, backup_reserve, storm_watch, auto_storm_watch, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
				[name, time, mode, backupReserve, stormWatch, autoStormWatch],
				function (err) {
					if (err) reject(err);
					else resolve({ id: this.lastID });
				},
			);
		});
	}

	async getAllTasks() {
		return new Promise((resolve, reject) => {
			this.db.all("SELECT * FROM scheduled_tasks ORDER BY time ASC", (err, rows) => {
				if (err) reject(err);
				else resolve(rows);
			});
		});
	}

	async getTaskById(id) {
		return new Promise((resolve, reject) => {
			this.db.get("SELECT * FROM scheduled_tasks WHERE id = ?", [id], (err, row) => {
				if (err) reject(err);
				else resolve(row);
			});
		});
	}

	async updateTask(
		id,
		name,
		time,
		mode,
		backupReserve,
		enabled,
		stormWatch = "no_change",
		autoStormWatch = 0,
	) {
		return new Promise((resolve, reject) => {
			this.db.run(
				`UPDATE scheduled_tasks 
         SET name = ?, time = ?, mode = ?, backup_reserve = ?, enabled = ?, storm_watch = ?, auto_storm_watch = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
				[name, time, mode, backupReserve, enabled, stormWatch, autoStormWatch, id],
				function (err) {
					if (err) reject(err);
					else resolve({ changes: this.changes });
				},
			);
		});
	}

	async deleteTask(id) {
		return new Promise((resolve, reject) => {
			this.db.run("DELETE FROM scheduled_tasks WHERE id = ?", [id], function (err) {
				if (err) reject(err);
				else resolve({ changes: this.changes });
			});
		});
	}

	async toggleTaskEnabled(id) {
		return new Promise((resolve, reject) => {
			this.db.run(
				`UPDATE scheduled_tasks 
         SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END, 
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
				[id],
				function (err) {
					if (err) reject(err);
					else resolve({ changes: this.changes });
				},
			);
		});
	}

	// Task Log Methods
	async logTaskExecution(taskId, status, errorMessage = null) {
		return new Promise((resolve, reject) => {
			this.db.run(
				`INSERT INTO task_logs (task_id, status, error_message) 
         VALUES (?, ?, ?)`,
				[taskId, status, errorMessage],
				function (err) {
					if (err) reject(err);
					else resolve({ id: this.lastID });
				},
			);
		});
	}

	async getTaskLogs(taskId, limit = 50) {
		return new Promise((resolve, reject) => {
			const query = taskId
				? "SELECT * FROM task_logs WHERE task_id = ? ORDER BY executed_at DESC LIMIT ?"
				: "SELECT * FROM task_logs ORDER BY executed_at DESC LIMIT ?";

			const params = taskId ? [taskId, limit] : [limit];

			this.db.all(query, params, (err, rows) => {
				if (err) reject(err);
				else resolve(rows);
			});
		});
	}
}

module.exports = DatabaseService;

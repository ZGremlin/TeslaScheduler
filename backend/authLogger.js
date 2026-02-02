const fs = require("fs");
const path = require("path");

class AuthLogger {
	constructor() {
		this.logDir = path.join(__dirname, "logs");
		this.logFile = path.join(this.logDir, "auth.log");
		this.maxLogSize = 10 * 1024 * 1024; // 10MB
		this.maxLogFiles = 5;

		this.ensureLogDirectory();
	}

	ensureLogDirectory() {
		if (!fs.existsSync(this.logDir)) {
			fs.mkdirSync(this.logDir, { recursive: true });
		}
	}

	formatTimestamp() {
		const now = new Date();
		return now.toISOString();
	}

	formatLogEntry(level, event, details = {}) {
		const timestamp = this.formatTimestamp();
		const detailsStr = Object.keys(details).length > 0 ? JSON.stringify(details) : "";

		return `[${timestamp}] [${level}] [${event}] ${detailsStr}\n`;
	}

	rotateLogIfNeeded() {
		try {
			if (!fs.existsSync(this.logFile)) {
				return;
			}

			const stats = fs.statSync(this.logFile);

			if (stats.size >= this.maxLogSize) {
				// Rotate logs
				for (let i = this.maxLogFiles - 1; i >= 1; i--) {
					const oldFile = `${this.logFile}.${i}`;
					const newFile = `${this.logFile}.${i + 1}`;

					if (fs.existsSync(oldFile)) {
						if (i === this.maxLogFiles - 1) {
							// Delete oldest file
							fs.unlinkSync(oldFile);
						} else {
							fs.renameSync(oldFile, newFile);
						}
					}
				}

				// Move current log to .1
				fs.renameSync(this.logFile, `${this.logFile}.1`);
			}
		} catch (error) {
			console.error("Error rotating log file:", error);
		}
	}

	writeLog(entry) {
		try {
			this.rotateLogIfNeeded();
			fs.appendFileSync(this.logFile, entry, "utf8");
		} catch (error) {
			console.error("Error writing to log file:", error);
		}
	}

	log(level, event, details = {}) {
		const entry = this.formatLogEntry(level, event, details);
		this.writeLog(entry);

		// Also log to console
		console.log(`[AUTH LOG] ${entry.trim()}`);
	}

	info(event, details = {}) {
		this.log("INFO", event, details);
	}

	warn(event, details = {}) {
		this.log("WARN", event, details);
	}

	error(event, details = {}) {
		this.log("ERROR", event, details);
	}

	success(event, details = {}) {
		this.log("SUCCESS", event, details);
	}

	// Authentication-specific methods
	logAuthAttempt(email, method = "oauth") {
		this.info("AUTH_ATTEMPT", { email, method });
	}

	logAuthSuccess(email, expiresAt) {
		this.success("AUTH_SUCCESS", {
			email,
			expires_at: new Date(expiresAt).toISOString(),
		});
	}

	logAuthFailure(email, error) {
		this.error("AUTH_FAILURE", { email, error: error.toString() });
	}

	logTokenRefreshAttempt() {
		this.info("TOKEN_REFRESH_ATTEMPT", {});
	}

	logTokenRefreshSuccess(expiresAt) {
		this.success("TOKEN_REFRESH_SUCCESS", {
			expires_at: new Date(expiresAt).toISOString(),
		});
	}

	logTokenRefreshFailure(error, retryCount = 0) {
		this.error("TOKEN_REFRESH_FAILURE", {
			error: error.toString(),
			retry_count: retryCount,
		});
	}

	logAuthorizationUrlGenerated() {
		this.info("AUTHORIZATION_URL_GENERATED", {});
	}

	logCodeExchangeAttempt() {
		this.info("CODE_EXCHANGE_ATTEMPT", {});
	}

	logCodeExchangeSuccess() {
		this.success("CODE_EXCHANGE_SUCCESS", {});
	}

	logCodeExchangeFailure(error) {
		this.error("CODE_EXCHANGE_FAILURE", { error: error.toString() });
	}

	logSiteConfigured(siteId, siteName) {
		this.info("SITE_CONFIGURED", { site_id: siteId, site_name: siteName });
	}

	// Read logs
	readLogs(lines = 100) {
		try {
			if (!fs.existsSync(this.logFile)) {
				return [];
			}

			const content = fs.readFileSync(this.logFile, "utf8");
			const allLines = content.split("\n").filter((line) => line.trim());

			// Return last N lines
			return allLines.slice(-lines);
		} catch (error) {
			console.error("Error reading log file:", error);
			return [];
		}
	}

	// Get log file stats
	getLogStats() {
		try {
			const files = [];

			if (fs.existsSync(this.logFile)) {
				const stats = fs.statSync(this.logFile);
				files.push({
					name: "auth.log",
					size: stats.size,
					modified: stats.mtime,
				});
			}

			for (let i = 1; i <= this.maxLogFiles; i++) {
				const rotatedFile = `${this.logFile}.${i}`;
				if (fs.existsSync(rotatedFile)) {
					const stats = fs.statSync(rotatedFile);
					files.push({
						name: `auth.log.${i}`,
						size: stats.size,
						modified: stats.mtime,
					});
				}
			}

			return {
				files,
				total_size: files.reduce((sum, f) => sum + f.size, 0),
			};
		} catch (error) {
			console.error("Error getting log stats:", error);
			return { files: [], total_size: 0 };
		}
	}

	// Clear logs
	clearLogs() {
		try {
			if (fs.existsSync(this.logFile)) {
				fs.unlinkSync(this.logFile);
			}

			for (let i = 1; i <= this.maxLogFiles; i++) {
				const rotatedFile = `${this.logFile}.${i}`;
				if (fs.existsSync(rotatedFile)) {
					fs.unlinkSync(rotatedFile);
				}
			}

			this.info("LOGS_CLEARED", {});
			return true;
		} catch (error) {
			console.error("Error clearing logs:", error);
			return false;
		}
	}
}

// Create singleton instance
const authLogger = new AuthLogger();

module.exports = authLogger;

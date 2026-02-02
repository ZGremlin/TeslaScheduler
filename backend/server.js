const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const DatabaseService = require("./database");
const TeslaAPI = require("./teslaAPI");
const TaskScheduler = require("./taskScheduler");
const TokenRefreshManager = require("./tokenRefreshManager");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize services
const db = new DatabaseService();
const taskScheduler = new TaskScheduler();
let tokenRefreshManager = null;

// Initialize database and scheduler
(async () => {
	try {
		await db.connect();
		await taskScheduler.initialize();

		// Initialize token refresh manager
		tokenRefreshManager = await new TokenRefreshManager().initialize();

		console.log("Services initialized successfully");
	} catch (error) {
		console.error("Failed to initialize services:", error);
	}
})();

// ============= AUTH ROUTES =============

// Get OAuth authorization URL
app.get("/api/auth/url", async (req, res) => {
	try {
		const teslaAPI = new TeslaAPI();
		const authData = teslaAPI.getAuthorizationUrl();

		// Store verifier and state temporarily (in production, use Redis or session storage)
		global.authVerifier = authData.verifier;
		global.authState = authData.state;

		res.json({
			authorization_url: authData.url,
			instructions: "Visit this URL to authorize the application",
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Exchange authorization code for token
app.post("/api/auth/callback", async (req, res) => {
	try {
		const { code } = req.body;

		if (!code) {
			return res.status(400).json({ error: "Authorization code is required" });
		}

		if (!global.authVerifier) {
			return res
				.status(400)
				.json({ error: "No authorization session found. Please restart the auth flow." });
		}

		const teslaAPI = new TeslaAPI();
		const tokens = await teslaAPI.exchangeCodeForToken(code, global.authVerifier);

		// Save tokens
		await db.saveAuthToken(tokens.access_token, tokens.refresh_token, tokens.expires_at);

		// Get energy sites
		const sites = await teslaAPI.getEnergySites(tokens.access_token);

		if (sites.length === 0) {
			return res.status(404).json({ error: "No Powerwall sites found on this account" });
		}

		// Save first site as default (in production, let user choose)
		const firstSite = sites[0];
		await db.savePowerwallConfig(firstSite.energy_site_id, firstSite.site_name);

		// Clear temporary auth data
		delete global.authVerifier;
		delete global.authState;

		// Schedule token refresh
		if (tokenRefreshManager) {
			await tokenRefreshManager.scheduleNextRefresh();
			console.log("Token refresh scheduled after authentication");
		}

		res.json({
			success: true,
			message: "Authentication successful",
			expires_at: tokens.expires_at,
			site: {
				id: firstSite.energy_site_id,
				name: firstSite.site_name,
			},
		});
	} catch (error) {
		res.status(401).json({ error: error.message });
	}
});

// Get auth status
app.get("/api/auth/status", async (req, res) => {
	try {
		const authData = await db.getAuthToken();

		if (!authData) {
			return res.json({ authenticated: false });
		}

		const isValid = Date.now() < authData.expires_at;

		res.json({
			authenticated: isValid,
			expires_at: authData.expires_at,
			expired: !isValid,
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Refresh token
app.post("/api/auth/refresh", async (req, res) => {
	try {
		if (tokenRefreshManager) {
			await tokenRefreshManager.forceRefresh();
			res.json({
				success: true,
				message: "Token refresh initiated",
			});
		} else {
			const authData = await db.getAuthToken();

			if (!authData || !authData.refresh_token) {
				return res.status(401).json({ error: "No refresh token available" });
			}

			const teslaAPI = new TeslaAPI();
			const newTokens = await teslaAPI.refreshAccessToken(authData.refresh_token);

			await db.saveAuthToken(newTokens.access_token, newTokens.refresh_token, newTokens.expires_at);

			res.json({
				success: true,
				expires_at: newTokens.expires_at,
			});
		}
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Get detailed token status
app.get("/api/auth/token-status", async (req, res) => {
	try {
		if (tokenRefreshManager) {
			const status = await tokenRefreshManager.getTokenStatus();
			res.json(status);
		} else {
			const authData = await db.getAuthToken();

			if (!authData || !authData.access_token) {
				return res.json({ authenticated: false });
			}

			const now = Date.now();
			const expiresAt = authData.expires_at;
			const timeUntilExpiry = expiresAt - now;

			res.json({
				authenticated: timeUntilExpiry > 0,
				expires_at: new Date(expiresAt).toISOString(),
				expires_in_minutes: Math.round(timeUntilExpiry / 1000 / 60),
				is_valid: timeUntilExpiry > 0,
				has_refresh_token: !!authData.refresh_token,
			});
		}
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ============= TASK ROUTES =============

// Get all tasks
app.get("/api/tasks", async (req, res) => {
	try {
		const tasks = await db.getAllTasks();

		// Add retry status to each task
		const retryingTasks = taskScheduler.getRetryStatus();
		const tasksWithRetryStatus = tasks.map((task) => ({
			...task,
			is_retrying: retryingTasks.includes(task.id),
		}));

		res.json(tasksWithRetryStatus);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Get single task
app.get("/api/tasks/:id", async (req, res) => {
	try {
		const task = await db.getTaskById(req.params.id);
		if (!task) {
			return res.status(404).json({ error: "Task not found" });
		}
		res.json(task);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Create new task
app.post("/api/tasks", async (req, res) => {
	try {
		const { name, time, mode, backup_reserve } = req.body;

		// Validation
		if (!name || !time || !mode || backup_reserve === undefined) {
			return res.status(400).json({ error: "Missing required fields" });
		}

		if (!["self_powered", "time_based_control"].includes(mode)) {
			return res.status(400).json({ error: "Invalid mode" });
		}

		if (backup_reserve < 0 || backup_reserve > 100) {
			return res.status(400).json({ error: "Backup reserve must be between 0 and 100" });
		}

		// Validate time format (HH:MM)
		if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
			return res.status(400).json({ error: "Invalid time format. Use HH:MM" });
		}

		const result = await db.createTask(name, time, mode, backup_reserve);
		const newTask = await db.getTaskById(result.id);

		// Schedule the new task
		taskScheduler.scheduleTask(newTask);

		res.status(201).json(newTask);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Update task
app.put("/api/tasks/:id", async (req, res) => {
	try {
		const { name, time, mode, backup_reserve, enabled } = req.body;
		const taskId = parseInt(req.params.id);

		// Validation
		if (!name || !time || !mode || backup_reserve === undefined || enabled === undefined) {
			return res.status(400).json({ error: "Missing required fields" });
		}

		if (!["self_powered", "time_based_control"].includes(mode)) {
			return res.status(400).json({ error: "Invalid mode" });
		}

		if (backup_reserve < 0 || backup_reserve > 100) {
			return res.status(400).json({ error: "Backup reserve must be between 0 and 100" });
		}

		if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
			return res.status(400).json({ error: "Invalid time format. Use HH:MM" });
		}

		await db.updateTask(taskId, name, time, mode, backup_reserve, enabled ? 1 : 0);
		const updatedTask = await db.getTaskById(taskId);

		// Reschedule
		if (updatedTask.enabled) {
			taskScheduler.scheduleTask(updatedTask);
		} else {
			taskScheduler.unscheduleTask(taskId);
		}

		res.json(updatedTask);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Toggle task enabled status
app.patch("/api/tasks/:id/toggle", async (req, res) => {
	try {
		const taskId = parseInt(req.params.id);
		await db.toggleTaskEnabled(taskId);
		const task = await db.getTaskById(taskId);

		// Update schedule
		if (task.enabled) {
			taskScheduler.scheduleTask(task);
		} else {
			taskScheduler.unscheduleTask(taskId);
		}

		res.json(task);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Delete task
app.delete("/api/tasks/:id", async (req, res) => {
	try {
		const taskId = parseInt(req.params.id);

		// Unschedule first
		taskScheduler.unscheduleTask(taskId);

		await db.deleteTask(taskId);
		res.json({ success: true, message: "Task deleted" });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ============= LOG ROUTES =============

// Get task execution logs
app.get("/api/logs", async (req, res) => {
	try {
		const { task_id, limit } = req.query;
		const logs = await db.getTaskLogs(
			task_id ? parseInt(task_id) : null,
			limit ? parseInt(limit) : 50,
		);
		res.json(logs);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ============= POWERWALL STATUS ROUTES =============

// Get energy sites list
app.get("/api/powerwall/sites", async (req, res) => {
	try {
		const authData = await db.getAuthToken();

		if (!authData || !authData.access_token) {
			return res.status(401).json({ error: "Not authenticated" });
		}

		const teslaAPI = new TeslaAPI();
		const sites = await teslaAPI.getEnergySites(authData.access_token);

		res.json(sites);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Get Powerwall status
app.get("/api/powerwall/status", async (req, res) => {
	try {
		const authData = await db.getAuthToken();
		const config = await db.getPowerwallConfig();

		if (!authData || !authData.access_token) {
			return res.status(401).json({ error: "Not authenticated" });
		}

		if (!config || !config.site_id) {
			return res.status(400).json({ error: "Powerwall site not configured" });
		}

		// Check if token is expired
		if (Date.now() >= authData.expires_at) {
			return res.status(401).json({
				error: "Token expired. Automatic refresh in progress. Please try again in a moment.",
			});
		}

		const teslaAPI = new TeslaAPI();

		// Get complete site data
		const siteData = await teslaAPI.getCompleteSiteData(authData.access_token, config.site_id);

		res.json({
			site_name: config.site_name,
			site_id: config.site_id,
			battery: {
				percentage: siteData.site_info.percentage_charged || 0,
				total_pack_energy: siteData.site_info.total_pack_energy || 0,
				energy_left: siteData.site_info.energy_left || 0,
			},
			operation: {
				default_real_mode: siteData.site_info.default_real_mode,
				backup_reserve_percent: siteData.site_info.backup_reserve_percent,
			},
			live_status: siteData.live_status,
			site_info: siteData.site_info,
		});
	} catch (error) {
		console.error("Powerwall status error:", error);
		res.status(500).json({ error: error.message });
	}
});

// Get current configuration
app.get("/api/config", async (req, res) => {
	try {
		const config = await db.getPowerwallConfig();
		res.json(config || {});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Debug endpoint to test API connectivity
app.get("/api/debug/site-info", async (req, res) => {
	try {
		let authData = await db.getAuthToken();
		const config = await db.getPowerwallConfig();

		if (!authData || !authData.access_token) {
			return res.status(401).json({ error: "Not authenticated" });
		}

		if (!config || !config.site_id) {
			return res.status(400).json({ error: "Powerwall site not configured" });
		}

		// Refresh token if expired
		if (Date.now() >= authData.expires_at && authData.refresh_token) {
			const teslaAPI = new TeslaAPI();
			const newTokens = await teslaAPI.refreshAccessToken(authData.refresh_token);
			await db.saveAuthToken(newTokens.access_token, newTokens.refresh_token, newTokens.expires_at);
			authData = newTokens;
		}

		const teslaAPI = new TeslaAPI();

		// Try each endpoint individually to see which works
		const results = {
			site_id: config.site_id,
			endpoints: {},
		};

		try {
			const siteInfo = await teslaAPI.getSiteInfo(authData.access_token, config.site_id);
			results.endpoints.site_info = { success: true, data: siteInfo };
		} catch (err) {
			results.endpoints.site_info = { success: false, error: err.message };
		}

		try {
			const siteStatus = await teslaAPI.getSiteStatus(authData.access_token, config.site_id);
			results.endpoints.site_status = { success: true, data: siteStatus };
		} catch (err) {
			results.endpoints.site_status = { success: false, error: err.message };
		}

		try {
			const liveStatus = await teslaAPI.getLiveStatus(authData.access_token, config.site_id);
			results.endpoints.live_status = { success: true, data: liveStatus };
		} catch (err) {
			results.endpoints.live_status = { success: false, error: err.message };
		}

		res.json(results);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Test task execution (manual trigger)
app.post("/api/tasks/:id/execute", async (req, res) => {
	try {
		const taskId = parseInt(req.params.id);
		const task = await db.getTaskById(taskId);

		if (!task) {
			return res.status(404).json({ error: "Task not found" });
		}

		// Execute immediately (will handle token refresh if needed)
		await taskScheduler.executeTask(task);

		res.json({ success: true, message: "Task executed" });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Health check
app.get("/api/health", (req, res) => {
	res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
	console.log(`Tesla Powerwall Scheduler API running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
	console.log("\nShutting down gracefully...");
	if (tokenRefreshManager) {
		await tokenRefreshManager.shutdown();
	}
	await taskScheduler.shutdown();
	await db.close();
	process.exit(0);
});

process.on("SIGTERM", async () => {
	console.log("\nShutting down gracefully...");
	if (tokenRefreshManager) {
		await tokenRefreshManager.shutdown();
	}
	await taskScheduler.shutdown();
	await db.close();
	process.exit(0);
});

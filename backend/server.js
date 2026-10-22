const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const DatabaseService = require("./database");
const TeslaAPI = require("./teslaAPI");
const TaskScheduler = require("./taskScheduler");
const TokenRefreshManager = require("./tokenRefreshManager");
const MetricsDatabase = require("./metricsDatabase");
const MetricsCollector = require("./metricsCollector");
const { startOfToday, POLLING_LIMITS } = require("./metricsCollector");
const authLogger = require("./authLogger");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize services
const db = new DatabaseService();
const taskScheduler = new TaskScheduler();
const metricsDb = new MetricsDatabase();
const metricsCollector = new MetricsCollector(db, metricsDb);
let tokenRefreshManager = null;

// Initialize database and scheduler
(async () => {
	try {
		await db.connect();
		await metricsDb.connect();
		await taskScheduler.initialize();

		// Initialize token refresh manager
		tokenRefreshManager = await new TokenRefreshManager().initialize();

		await metricsCollector.start();

		console.log("Services initialized successfully");
	} catch (error) {
		console.error("Failed to initialize services:", error);
	}
})();

// ============= AUTH ROUTES =============

// Get OAuth authorization URL
app.get("/api/auth/url", async (req, res) => {
	try {
		authLogger.logAuthorizationUrlGenerated();

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
		authLogger.error("AUTHORIZATION_URL_ERROR", { error: error.message });
		res.status(500).json({ error: error.message });
	}
});

// OAuth callback - Tesla redirects the user's browser here after authorization
app.get("/api/auth/callback", async (req, res) => {
	try {
		const { code, error: oauthError } = req.query;

		if (oauthError) {
			authLogger.error("CODE_EXCHANGE_ERROR", { error: oauthError });
			return res.send(buildCallbackPage(false, oauthError));
		}

		if (!code) {
			authLogger.error("CODE_EXCHANGE_ERROR", { error: "No authorization code received" });
			return res.send(buildCallbackPage(false, "No authorization code received from Tesla"));
		}

		if (!global.authVerifier) {
			authLogger.error("CODE_EXCHANGE_ERROR", { error: "No authorization session found" });
			return res.send(buildCallbackPage(false, "No authorization session found. Please restart the auth flow."));
		}

		authLogger.logCodeExchangeAttempt();

		const teslaAPI = new TeslaAPI();
		const tokens = await teslaAPI.exchangeCodeForToken(code, global.authVerifier);

		authLogger.logCodeExchangeSuccess();

		await db.saveAuthToken(tokens.access_token, tokens.refresh_token, tokens.expires_at);

		const sites = await teslaAPI.getEnergySites(tokens.access_token);

		if (sites.length === 0) {
			authLogger.warn("NO_SITES_FOUND", {});
			return res.send(buildCallbackPage(false, "No Powerwall sites found on this account"));
		}

		for (const site of sites) {
			const siteId = site.energy_site_id.toString();
			await db.savePowerwallConfig(siteId, site.site_name);
		}

		const firstSite = sites[0];
		const siteId = firstSite.energy_site_id.toString();

		authLogger.logSiteConfigured(siteId, firstSite.site_name);
		authLogger.logAuthSuccess("oauth_user", tokens.expires_at);
		console.log(`✓ Saved ${sites.length} site(s) to database`);

		delete global.authVerifier;
		delete global.authState;

		if (tokenRefreshManager) {
			await tokenRefreshManager.scheduleNextRefresh();
			console.log("Token refresh scheduled after authentication");
		}

		res.send(buildCallbackPage(true, null));
	} catch (error) {
		authLogger.logCodeExchangeFailure(error);
		res.send(buildCallbackPage(false, error.message));
	}
});

function buildCallbackPage(success, errorMsg) {
	const data = success
		? { type: "tesla_auth_success" }
		: { type: "tesla_auth_error", error: errorMsg || "Authentication failed" };
	// JSON.stringify produces safe JS — escape </ to prevent early </script> close
	const dataJson = JSON.stringify(data).replace(/<\//g, "<\\/");

	const bodyText = success
		? "Authorization successful! You can close this window."
		: `Authorization failed: ${errorMsg || "Unknown error"}`;

	return `<!DOCTYPE html>
<html>
<head><title>Tesla Authorization</title></head>
<body><p>${bodyText}</p>
<script>
(function () {
  var data = ${dataJson};
  if (window.opener) {
    window.opener.postMessage(data, '*');
    window.close();
  } else {
    var q = data.error
      ? '?auth_error=' + encodeURIComponent(data.error)
      : '?auth_success=1';
    window.location.href = '/' + q;
  }
}());
</script>
</body>
</html>`;
}

// One-time partner registration with Tesla Fleet API
// Call this once before users can authenticate. Domain must match your registered app domain.
app.post("/api/auth/register-partner", async (req, res) => {
	try {
		const { domain } = req.body;

		if (!domain) {
			return res.status(400).json({ error: "domain is required" });
		}

		const teslaAPI = new TeslaAPI();
		const result = await teslaAPI.registerPartnerAccount(domain);

		console.log("Partner registration result:", result);
		res.json({ success: true, result });
	} catch (error) {
		const detail = error.response?.data
			? JSON.stringify(error.response.data)
			: error.message;
		console.error("Partner registration error:", detail);
		res.status(500).json({ error: detail });
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
		authLogger.logTokenRefreshAttempt();

		if (tokenRefreshManager) {
			await tokenRefreshManager.forceRefresh();
			res.json({
				success: true,
				message: "Token refresh initiated",
			});
		} else {
			const authData = await db.getAuthToken();

			if (!authData || !authData.refresh_token) {
				authLogger.error("MANUAL_REFRESH_ERROR", { error: "No refresh token available" });
				return res.status(401).json({ error: "No refresh token available" });
			}

			const teslaAPI = new TeslaAPI();
			const newTokens = await teslaAPI.refreshAccessToken(authData.refresh_token);

			await db.saveAuthToken(newTokens.access_token, newTokens.refresh_token, newTokens.expires_at);

			authLogger.logTokenRefreshSuccess(newTokens.expires_at);

			res.json({
				success: true,
				expires_at: newTokens.expires_at,
			});
		}
	} catch (error) {
		authLogger.logTokenRefreshFailure(error);
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

// Read the expiry time (ms) out of a Tesla access token, which is a JWT
function getTokenExpiry(accessToken) {
	try {
		const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
		return payload.exp ? payload.exp * 1000 : null;
	} catch (error) {
		return null;
	}
}

// Get stored credentials (tokens and active site) for viewing/editing
app.get("/api/auth/credentials", async (req, res) => {
	try {
		const authData = await db.getAuthToken();
		const config = await db.getPowerwallConfig();

		res.json({
			access_token: authData?.access_token || "",
			refresh_token: authData?.refresh_token || "",
			expires_at: authData?.expires_at || null,
			site_id: config?.site_id || "",
			site_name: config?.site_name || "",
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Manually update stored credentials
app.put("/api/auth/credentials", async (req, res) => {
	try {
		const accessToken = (req.body.access_token || "").trim();
		const refreshToken = (req.body.refresh_token || "").trim();
		const siteId = (req.body.site_id || "").toString().trim();

		if (!accessToken) {
			return res.status(400).json({ error: "Access token is required" });
		}

		const authData = await db.getAuthToken();

		if (!authData || accessToken !== authData.access_token) {
			// Without a readable expiry, assume Tesla's standard 8 hour lifetime
			const expiresAt = getTokenExpiry(accessToken) || Date.now() + 8 * 60 * 60 * 1000;
			await db.saveAuthToken(accessToken, refreshToken, expiresAt);
		} else if (refreshToken && refreshToken !== authData.refresh_token) {
			await db.saveAuthToken(accessToken, refreshToken, authData.expires_at);
		}

		const config = await db.getPowerwallConfig();

		if (siteId && siteId !== config?.site_id) {
			const knownSite = await db.getSiteBySiteId(siteId);

			if (knownSite) {
				await db.setActiveSite(siteId);
			} else if (config) {
				await db.changeSiteId(config.site_id, siteId);
			} else {
				await db.savePowerwallConfig(siteId, "Powerwall");
			}

			// Tasks carry their site ID, so reload them
			await taskScheduler.refreshSchedule();
		}

		authLogger.warn("CREDENTIALS_EDITED", { site_id: siteId || config?.site_id });

		if (tokenRefreshManager) {
			await tokenRefreshManager.scheduleNextRefresh();
		}

		res.json({ success: true });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Logout - remove stored tokens (sites and tasks are kept)
app.post("/api/auth/logout", async (req, res) => {
	try {
		await db.deleteAuthTokens();

		if (tokenRefreshManager) {
			tokenRefreshManager.clearTimers();
		}

		authLogger.warn("LOGOUT", {});
		console.log("✓ Logged out - stored tokens removed");

		res.json({ success: true });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ============= AUTH LOG ROUTES =============

// Get auth logs
app.get("/api/auth/logs", async (req, res) => {
	try {
		const lines = parseInt(req.query.lines) || 100;
		const logs = authLogger.readLogs(lines);

		res.json({
			logs,
			count: logs.length,
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Get log stats
app.get("/api/auth/logs/stats", async (req, res) => {
	try {
		const stats = authLogger.getLogStats();
		res.json(stats);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Clear auth logs
app.delete("/api/auth/logs", async (req, res) => {
	try {
		const success = authLogger.clearLogs();
		if (success) {
			res.json({ success: true, message: "Logs cleared successfully" });
		} else {
			res.status(500).json({ error: "Failed to clear logs" });
		}
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ============= CONFIG ROUTES =============

// Get current configuration (active site info)
app.get("/api/config", async (req, res) => {
	try {
		const config = await db.getPowerwallConfig();

		if (!config) {
			return res.json({
				configured: false,
				site_id: null,
				site_name: null,
			});
		}

		res.json({
			configured: true,
			site_id: config.site_id,
			site_name: config.site_name,
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ============= SITE ROUTES =============

// Get all sites
app.get("/api/sites", async (req, res) => {
	try {
		const sites = await db.getAllSites();
		const activeSite = await db.getPowerwallConfig();

		res.json({
			sites: sites,
			active_site_id: activeSite?.site_id || null,
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Switch active site
app.post("/api/sites/switch", async (req, res) => {
	try {
		const { site_id } = req.body;

		if (!site_id) {
			return res.status(400).json({ error: "site_id is required" });
		}

		// Verify site exists
		const site = await db.getSiteBySiteId(site_id);
		if (!site) {
			return res.status(404).json({ error: "Site not found" });
		}

		// Set as active by updating timestamp
		await db.setActiveSite(site_id);

		console.log(`✓ Switched to site: ${site.site_name} (${site_id})`);

		res.json({
			success: true,
			site: site,
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ============= TASK ROUTES =============

// Get all tasks
app.get("/api/tasks", async (req, res) => {
	try {
		// Get active site
		const activeSite = await db.getPowerwallConfig();

		// If no site configured yet, return empty array
		if (!activeSite || !activeSite.site_id) {
			return res.json([]);
		}

		// Get tasks for active site only
		const tasks = await db.getTasksBySite(activeSite.site_id);

		// Add retry status to each task
		const retryingTasks = taskScheduler.getRetryStatus();
		const persistingTasks = taskScheduler.getPersistenceStatus();
		const tasksWithRetryStatus = tasks.map((task) => ({
			...task,
			is_retrying: retryingTasks.includes(task.id),
			is_persisting: persistingTasks.includes(task.id),
		}));

		res.json(tasksWithRetryStatus);
	} catch (error) {
		console.error("Error in GET /api/tasks:", error);
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
		const {
			name,
			time,
			mode,
			backup_reserve,
			storm_watch,
			auto_storm_watch,
			persistence,
			persistence_interval,
		} = req.body;

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

		// Validate storm_watch if provided
		const validStormWatch = ["enable", "disable", "no_change"];
		const stormWatchValue = storm_watch || "no_change";
		if (!validStormWatch.includes(stormWatchValue)) {
			return res.status(400).json({ error: "Invalid storm_watch value" });
		}

		// Validate auto_storm_watch
		const autoStormWatchValue = auto_storm_watch ? 1 : 0;

		// Auto storm watch can only be enabled if storm_watch is set to 'enable'
		if (autoStormWatchValue && stormWatchValue !== "enable") {
			return res.status(400).json({
				error: "Auto Storm Watch can only be enabled when Storm Watch is set to Enable",
			});
		}

		// Persistence only applies to auto storm watch tasks
		const persistenceValue = persistence && autoStormWatchValue ? 1 : 0;

		// Minutes between persistence checks
		const persistenceIntervalValue =
			persistence_interval === undefined || persistence_interval === null
				? 10
				: Number(persistence_interval);
		if (
			!Number.isInteger(persistenceIntervalValue) ||
			persistenceIntervalValue < 1 ||
			persistenceIntervalValue > 1440
		) {
			return res
				.status(400)
				.json({ error: "Persistence interval must be a whole number of minutes from 1 to 1440" });
		}

		// Validate time format (HH:MM)
		if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
			return res.status(400).json({ error: "Invalid time format. Use HH:MM" });
		}

		// Get active site
		const activeSite = await db.getPowerwallConfig();
		if (!activeSite) {
			return res
				.status(400)
				.json({ error: "No active site configured. Please authenticate first." });
		}

		const result = await db.createTask(
			name,
			time,
			mode,
			backup_reserve,
			stormWatchValue,
			autoStormWatchValue,
			activeSite.site_id,
			persistenceValue,
			persistenceIntervalValue,
		);
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
		const {
			name,
			time,
			mode,
			backup_reserve,
			enabled,
			storm_watch,
			auto_storm_watch,
			persistence,
			persistence_interval,
		} = req.body;
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

		// Validate storm_watch if provided
		const validStormWatch = ["enable", "disable", "no_change"];
		const stormWatchValue = storm_watch || "no_change";
		if (!validStormWatch.includes(stormWatchValue)) {
			return res.status(400).json({ error: "Invalid storm_watch value" });
		}

		// Validate auto_storm_watch
		const autoStormWatchValue = auto_storm_watch ? 1 : 0;

		// Auto storm watch can only be enabled if storm_watch is set to 'enable'
		if (autoStormWatchValue && stormWatchValue !== "enable") {
			return res.status(400).json({
				error: "Auto Storm Watch can only be enabled when Storm Watch is set to Enable",
			});
		}

		// Persistence only applies to auto storm watch tasks
		const persistenceValue = persistence && autoStormWatchValue ? 1 : 0;

		// Minutes between persistence checks
		const persistenceIntervalValue =
			persistence_interval === undefined || persistence_interval === null
				? 10
				: Number(persistence_interval);
		if (
			!Number.isInteger(persistenceIntervalValue) ||
			persistenceIntervalValue < 1 ||
			persistenceIntervalValue > 1440
		) {
			return res
				.status(400)
				.json({ error: "Persistence interval must be a whole number of minutes from 1 to 1440" });
		}

		if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
			return res.status(400).json({ error: "Invalid time format. Use HH:MM" });
		}

		// Get existing task to preserve site_id
		const existingTask = await db.getTaskById(taskId);
		if (!existingTask) {
			return res.status(404).json({ error: "Task not found" });
		}

		await db.updateTask(
			taskId,
			name,
			time,
			mode,
			backup_reserve,
			enabled ? 1 : 0,
			stormWatchValue,
			autoStormWatchValue,
			existingTask.site_id, // Preserve original site_id
			persistenceValue,
			persistenceIntervalValue,
		);
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

// Toggle task persistence
app.patch("/api/tasks/:id/persistence", async (req, res) => {
	try {
		const taskId = parseInt(req.params.id);
		const existingTask = await db.getTaskById(taskId);
		if (!existingTask) {
			return res.status(404).json({ error: "Task not found" });
		}

		// Persistence only applies to auto storm watch tasks
		if (!existingTask.persistence && !existingTask.auto_storm_watch) {
			return res.status(400).json({
				error: "Persistence can only be enabled on Auto Storm Watch tasks",
			});
		}

		await db.toggleTaskPersistence(taskId);
		const task = await db.getTaskById(taskId);

		// Stop any in-progress persistence checks when turned off
		if (!task.persistence) {
			taskScheduler.clearPersistence(taskId);
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

// Enable or disable Storm Watch on the active site
app.post("/api/powerwall/storm-watch", async (req, res) => {
	try {
		const { enabled } = req.body;

		if (typeof enabled !== "boolean") {
			return res.status(400).json({ error: "enabled must be true or false" });
		}

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

		if (enabled) {
			await teslaAPI.enableStormWatch(authData.access_token, config.site_id);
		} else {
			await teslaAPI.disableStormWatch(authData.access_token, config.site_id);
		}

		res.json({ success: true, enabled });
	} catch (error) {
		console.error("Storm watch toggle error:", error);
		res.status(500).json({ error: error.message });
	}
});

// ============= DASHBOARD ROUTES =============

// Everything the dashboard shows for the active site, read from the metrics database.
// The latest reading is refreshed from Tesla first if it is older than the view refresh setting.
app.get("/api/dashboard", async (req, res) => {
	try {
		const config = await db.getPowerwallConfig();

		if (!config || !config.site_id) {
			return res.status(400).json({ error: "Powerwall site not configured" });
		}

		const siteId = config.site_id;
		const hours = Math.min(Math.max(parseInt(req.query.hours) || 24, 1), 24 * 30);
		const days = Math.min(Math.max(parseInt(req.query.days) || 14, 1), 90);

		await metricsCollector.refreshForView(siteId);

		// Aim for ~150 points per chart, but never finer than the poll interval
		const rangeMs = hours * 60 * 60 * 1000;
		const bucketMs = Math.max(Math.round(rangeMs / 150), metricsCollector.pollIntervalMs);

		// Fixed 24h window for the sparkline cards and gauge scales, independent of the chart range
		const dayMs = 24 * 60 * 60 * 1000;
		const dayBucketMs = Math.max(15 * 60 * 1000, metricsCollector.pollIntervalMs);

		const [
			current,
			siteInfo,
			history,
			energy,
			outages,
			recentLogs,
			weather,
			dayHistory,
			dayTotals,
		] = await Promise.all([
			metricsDb.getLatestSnapshot(siteId),
			metricsDb.getSiteDetails(siteId),
			metricsDb.getSnapshotHistory(siteId, Date.now() - rangeMs, bucketMs),
			metricsDb.getDailyEnergy(siteId, days),
			metricsDb.getBackupEvents(siteId, 5),
			db.getRecentLogsForSite(siteId, 8),
			metricsDb.getLatestWeather(siteId, Date.now() - 60 * 60 * 1000),
			metricsDb.getSnapshotHistory(siteId, Date.now() - dayMs, dayBucketMs),
			metricsCollector.getRollingEnergy(siteId, 24),
		]);

		const today = await getTodayEnergy(siteId, siteInfo?.installation_time_zone);
		const components = siteInfo?.components || {};

		res.json({
			site: {
				site_id: siteId,
				site_name: config.site_name,
				battery_count: siteInfo?.battery_count ?? null,
				nameplate_energy: siteInfo?.nameplate_energy ?? null,
				nameplate_power: siteInfo?.nameplate_power ?? null,
				firmware_version: siteInfo?.version ?? null,
				installation_date: siteInfo?.installation_date ?? null,
				time_zone: siteInfo?.installation_time_zone ?? null,
				utility: siteInfo?.utility ?? null,
				battery_type: components.battery_type ?? null,
				has_solar: components.solar ?? null,
				has_grid: components.grid ?? null,
				storm_mode_capable: components.storm_mode_capable ?? null,
				off_grid_ev_reserve_percent: siteInfo?.off_grid_vehicle_charging_reserve_percent ?? null,
				batteries: (components.batteries || []).map((battery) => ({
					part_name: battery.part_name,
					serial_number: battery.serial_number,
					nameplate_energy: battery.nameplate_energy,
					nameplate_max_charge_power: battery.nameplate_max_charge_power,
					nameplate_max_discharge_power: battery.nameplate_max_discharge_power,
				})),
				gateways: (components.gateways || []).map((gateway) => ({
					part_name: gateway.part_name,
					serial_number: gateway.serial_number,
					firmware_version: gateway.firmware_version,
					is_active: gateway.is_active,
				})),
			},
			current,
			weather,
			history,
			history_bucket_ms: bucketMs,
			last_24h: {
				series: dayHistory,
				bucket_ms: dayBucketMs,
				totals: dayTotals,
			},
			today,
			energy,
			outages,
			recent_logs: recentLogs,
			collector: metricsCollector.getStatus(siteId),
		});
	} catch (error) {
		console.error("Dashboard error:", error);
		res.status(500).json({ error: error.message });
	}
});

// Energy since midnight (site time). Tesla's daily total is the most accurate source, but it
// only syncs every 60 minutes, so readings recorded since that sync are added on top. Without a
// Tesla total for today, it falls back to readings alone.
async function getTodayEnergy(siteId, timeZone) {
	const { date, midnightMs } = startOfToday(timeZone);
	const [teslaToday, readings] = await Promise.all([
		metricsDb.getDailyEnergyForDate(siteId, date),
		metricsCollector.getEnergySince(siteId, midnightMs, 60 * 60 * 1000),
	]);

	const keys = [
		"solar_generated",
		"home_usage",
		"home_from_grid",
		"grid_imported",
		"grid_exported",
		"battery_charged",
		"battery_discharged",
	];
	let totals = readings.totals;
	let source = "readings";

	if (teslaToday) {
		const sinceSync = await metricsCollector.getEnergySince(siteId, teslaToday.updated_at);
		totals = Object.fromEntries(
			keys.map((key) => [key, (teslaToday[key] || 0) + sinceSync.totals[key]]),
		);
		source = "tesla";
	}

	return {
		date,
		since: midnightMs,
		source,
		tesla_synced_at: teslaToday?.updated_at ?? null,
		first_reading_at: readings.first_reading_at,
		covered_hours: readings.covered_hours,
		totals,
		hourly: readings.buckets,
	};
}

// Background polling intervals (minutes), with the resulting Tesla call estimate
async function pollingResponse(settings) {
	const sites = await db.getAllSites();
	const siteCount = Math.max(sites.length, 1);
	return {
		settings,
		limits: POLLING_LIMITS,
		site_count: siteCount,
		weather_enabled: metricsCollector.weatherEnabled,
		estimated_calls_per_day: MetricsCollector.estimateDailyCalls(settings) * siteCount,
	};
}

app.get("/api/dashboard/polling", async (req, res) => {
	try {
		res.json(await pollingResponse(metricsCollector.getPolling()));
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

app.put("/api/dashboard/polling", async (req, res) => {
	try {
		const settings = Object.fromEntries(
			Object.keys(POLLING_LIMITS).map((key) => [key, Number(req.body?.settings?.[key])]),
		);
		const saved = await metricsCollector.updatePolling(settings);
		res.json(await pollingResponse(saved));
	} catch (error) {
		res.status(400).json({ error: error.message });
	}
});

// Saved dashboard widget layout: { order: [id], hidden: [id], spans: { id: span } }
app.get("/api/dashboard/layout", async (req, res) => {
	try {
		res.json({ layout: await db.getSetting("dashboard_layout") });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

app.put("/api/dashboard/layout", async (req, res) => {
	try {
		const { layout } = req.body;
		const isIdList = (list) =>
			Array.isArray(list) && list.length <= 50 && list.every((id) => typeof id === "string");

		if (
			!layout ||
			!isIdList(layout.order) ||
			!isIdList(layout.hidden) ||
			typeof layout.spans !== "object" ||
			Object.values(layout.spans).some((span) => ![4, 6, 8, 12].includes(span))
		) {
			return res.status(400).json({ error: "Invalid layout" });
		}

		const saved = { order: layout.order, hidden: layout.hidden, spans: layout.spans };
		await db.setSetting("dashboard_layout", saved);
		res.json({ layout: saved });
	} catch (error) {
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

// Tesla Fleet API required public key endpoint
app.get("/.well-known/appspecific/com.tesla.3p.public-key.pem", (req, res) => {
	const keyPath = require("path").join(__dirname, "tesla-public-key.pem");
	if (!require("fs").existsSync(keyPath)) {
		return res.status(404).send("Public key not found. Run: node generateKeys.js");
	}
	res.setHeader("Content-Type", "application/x-pem-file");
	res.sendFile(keyPath);
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
	metricsCollector.stop();
	await taskScheduler.shutdown();
	await metricsDb.close();
	await db.close();
	process.exit(0);
});

process.on("SIGTERM", async () => {
	console.log("\nShutting down gracefully...");
	if (tokenRefreshManager) {
		await tokenRefreshManager.shutdown();
	}
	metricsCollector.stop();
	await taskScheduler.shutdown();
	await metricsDb.close();
	await db.close();
	process.exit(0);
});

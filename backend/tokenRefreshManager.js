const DatabaseService = require("./database");
const TeslaAPI = require("./teslaAPI");

class TokenRefreshManager {
	constructor() {
		this.db = new DatabaseService();
		this.teslaAPI = new TeslaAPI();
		this.refreshTimer = null;
		this.retryTimer = null;
		this.isRefreshing = false;
		this.retryCount = 0;
		this.maxRetries = 100; // Keep retrying for ~8 hours (100 * 5 min)

		// Refresh 2 hours before expiration
		this.REFRESH_BUFFER_MS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

		// Retry every 5 minutes on failure
		this.RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
	}

	async initialize() {
		await this.db.connect();
		console.log("Token Refresh Manager initialized");

		// Schedule initial refresh
		await this.scheduleNextRefresh();

		return this;
	}

	async scheduleNextRefresh() {
		try {
			// Clear any existing timers
			this.clearTimers();

			const authData = await this.db.getAuthToken();

			if (!authData || !authData.access_token) {
				console.log("No auth token found - refresh manager waiting for authentication");
				return;
			}

			if (!authData.refresh_token) {
				console.warn("No refresh token available - cannot schedule automatic refresh");
				return;
			}

			const now = Date.now();
			const expiresAt = authData.expires_at;
			const refreshAt = expiresAt - this.REFRESH_BUFFER_MS;
			const timeUntilRefresh = refreshAt - now;

			if (timeUntilRefresh <= 0) {
				// Token already expired or within refresh window
				console.log("Token needs immediate refresh");
				await this.refreshToken();
			} else {
				// Schedule refresh for 2 hours before expiration
				const refreshDate = new Date(refreshAt);
				console.log(`Token refresh scheduled for: ${refreshDate.toLocaleString()}`);
				console.log(`Time until refresh: ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`);

				this.refreshTimer = setTimeout(() => {
					this.refreshToken();
				}, timeUntilRefresh);
			}
		} catch (error) {
			console.error("Error scheduling token refresh:", error.message);
			// Retry scheduling in 5 minutes
			this.scheduleRetry();
		}
	}

	async refreshToken() {
		if (this.isRefreshing) {
			console.log("Token refresh already in progress, skipping...");
			return;
		}

		this.isRefreshing = true;
		console.log("🔄 Refreshing authentication token...");

		try {
			const authData = await this.db.getAuthToken();

			if (!authData || !authData.refresh_token) {
				throw new Error("No refresh token available");
			}

			// Call Tesla API to refresh the token
			const newTokens = await this.teslaAPI.refreshAccessToken(authData.refresh_token);

			// Save new tokens to database
			await this.db.saveAuthToken(
				newTokens.access_token,
				newTokens.refresh_token,
				newTokens.expires_at,
			);

			const expiresAt = new Date(newTokens.expires_at);
			console.log("✅ Token refreshed successfully");
			console.log(`   New token expires at: ${expiresAt.toLocaleString()}`);

			// Reset retry counter on success
			this.retryCount = 0;

			// Schedule next refresh
			await this.scheduleNextRefresh();
		} catch (error) {
			console.error("❌ Token refresh failed:", error.message);

			// Increment retry counter
			this.retryCount++;

			if (this.retryCount <= this.maxRetries) {
				console.log(`⏳ Will retry in 5 minutes (attempt ${this.retryCount}/${this.maxRetries})`);
				this.scheduleRetry();
			} else {
				console.error("⚠️  Max retry attempts reached. Manual re-authentication required.");
				// Could send notification/alert here
			}
		} finally {
			this.isRefreshing = false;
		}
	}

	scheduleRetry() {
		// Clear existing retry timer
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}

		// Schedule retry in 5 minutes
		this.retryTimer = setTimeout(() => {
			console.log("🔁 Retrying token refresh...");
			this.refreshToken();
		}, this.RETRY_INTERVAL_MS);
	}

	clearTimers() {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}

		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
	}

	async getTokenStatus() {
		try {
			const authData = await this.db.getAuthToken();

			if (!authData || !authData.access_token) {
				return {
					authenticated: false,
					message: "No token available",
				};
			}

			const now = Date.now();
			const expiresAt = authData.expires_at;
			const refreshAt = expiresAt - this.REFRESH_BUFFER_MS;
			const timeUntilExpiry = expiresAt - now;
			const timeUntilRefresh = refreshAt - now;

			return {
				authenticated: true,
				expires_at: new Date(expiresAt).toISOString(),
				expires_in_minutes: Math.round(timeUntilExpiry / 1000 / 60),
				refresh_scheduled_at: new Date(refreshAt).toISOString(),
				refresh_in_minutes: Math.round(timeUntilRefresh / 1000 / 60),
				is_valid: timeUntilExpiry > 0,
				has_refresh_token: !!authData.refresh_token,
				retry_count: this.retryCount,
				is_refreshing: this.isRefreshing,
			};
		} catch (error) {
			return {
				authenticated: false,
				error: error.message,
			};
		}
	}

	async forceRefresh() {
		console.log("🔄 Manual token refresh triggered");
		await this.refreshToken();
	}

	async shutdown() {
		console.log("Shutting down Token Refresh Manager...");
		this.clearTimers();
		await this.db.close();
	}
}

module.exports = TokenRefreshManager;

const axios = require("axios");
const crypto = require("crypto");

class TeslaAPI {
	constructor() {
		this.baseUrl = "https://owner-api.teslamotors.com";
		this.authUrl = "https://auth.tesla.com";

		this.client = axios.create({
			timeout: 30000,
		});
	}

	/**
	 * Generate code verifier and challenge for PKCE
	 */
	generateCodeChallenge() {
		const verifier = crypto.randomBytes(32).toString("base64url");
		const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

		return { verifier, challenge };
	}

	/**
	 * Step 1: Get authorization URL for user to login
	 */
	getAuthorizationUrl() {
		const { verifier, challenge } = this.generateCodeChallenge();
		const state = crypto.randomBytes(16).toString("hex");

		const params = new URLSearchParams({
			client_id: "ownerapi",
			code_challenge: challenge,
			code_challenge_method: "S256",
			redirect_uri: "https://auth.tesla.com/void/callback",
			response_type: "code",
			scope: "openid email offline_access",
			state: state,
		});

		return {
			url: `${this.authUrl}/oauth2/v3/authorize?${params.toString()}`,
			verifier,
			state,
		};
	}

	/**
	 * Step 2: Exchange authorization code for access token
	 */
	async exchangeCodeForToken(code, verifier) {
		try {
			const response = await this.client.post(`${this.authUrl}/oauth2/v3/token`, {
				grant_type: "authorization_code",
				client_id: "ownerapi",
				code: code,
				code_verifier: verifier,
				redirect_uri: "https://auth.tesla.com/void/callback",
			});

			return {
				access_token: response.data.access_token,
				refresh_token: response.data.refresh_token,
				expires_at: Date.now() + response.data.expires_in * 1000,
			};
		} catch (error) {
			throw new Error(`Token exchange failed: ${error.message}`);
		}
	}

	/**
	 * Refresh access token using refresh token
	 */
	async refreshAccessToken(refreshToken) {
		try {
			const response = await this.client.post(`${this.authUrl}/oauth2/v3/token`, {
				grant_type: "refresh_token",
				client_id: "ownerapi",
				refresh_token: refreshToken,
			});

			return {
				access_token: response.data.access_token,
				refresh_token: response.data.refresh_token,
				expires_at: Date.now() + response.data.expires_in * 1000,
			};
		} catch (error) {
			throw new Error(`Token refresh failed: ${error.message}`);
		}
	}

	/**
	 * Get list of energy sites (Powerwalls)
	 */
	async getEnergySites(token) {
		try {
			const response = await this.client.get(`${this.baseUrl}/api/1/products`, {
				headers: { Authorization: `Bearer ${token}` },
			});

			// Filter for energy products (Powerwalls)
			const energySites = response.data.response.filter(
				(product) => product.resource_type === "battery",
			);

			return energySites;
		} catch (error) {
			throw new Error(`Failed to get energy sites: ${error.message}`);
		}
	}

	/**
	 * Get site status and information
	 */
	async getSiteStatus(token, siteId) {
		try {
			const response = await this.client.get(
				`${this.baseUrl}/api/1/energy_sites/${siteId}/site_status`,
				{
					headers: { Authorization: `Bearer ${token}` },
				},
			);
			return response.data.response;
		} catch (error) {
			const errorMsg = error.response?.data?.error || error.message;
			const statusCode = error.response?.status;
			throw new Error(`Failed to get site status (${statusCode}): ${errorMsg}`);
		}
	}

	/**
	 * Get site info and configuration
	 */
	async getSiteInfo(token, siteId) {
		try {
			const response = await this.client.get(
				`${this.baseUrl}/api/1/energy_sites/${siteId}/site_info`,
				{
					headers: { Authorization: `Bearer ${token}` },
				},
			);
			return response.data.response;
		} catch (error) {
			const errorMsg = error.response?.data?.error || error.message;
			const statusCode = error.response?.status;
			throw new Error(`Failed to get site info (${statusCode}): ${errorMsg}`);
		}
	}

	/**
	 * Get live site status (real-time data)
	 */
	async getLiveStatus(token, siteId) {
		try {
			const response = await this.client.get(
				`${this.baseUrl}/api/1/energy_sites/${siteId}/live_status`,
				{
					headers: { Authorization: `Bearer ${token}` },
				},
			);
			return response.data.response;
		} catch (error) {
			const errorMsg = error.response?.data?.error || error.message;
			const statusCode = error.response?.status;
			// Live status might not be available for all sites
			console.warn(`Live status not available (${statusCode}): ${errorMsg}`);
			return null;
		}
	}

	/**
	 * Get complete site data (combines multiple endpoints)
	 */
	async getCompleteSiteData(token, siteId) {
		try {
			// Get site info which includes battery percentage and operation mode
			const siteInfo = await this.getSiteInfo(token, siteId);

			// Try to get live status for real-time data
			let liveStatus = null;
			try {
				liveStatus = await this.getLiveStatus(token, siteId);
			} catch (err) {
				console.warn("Live status not available");
			}

			return {
				site_info: siteInfo,
				live_status: liveStatus,
			};
		} catch (error) {
			throw new Error(`Failed to get complete site data: ${error.message}`);
		}
	}

	/**
	 * Set operation mode
	 * @param {string} token - Auth token
	 * @param {number} siteId - Energy site ID
	 * @param {string} mode - 'self_powered' or 'time_based_control'
	 * @param {number} backupReserve - Backup reserve percentage (0-100)
	 */
	async setOperationMode(token, siteId, mode, backupReserve) {
		try {
			// Map mode to Tesla's API values
			const defaultRealMode = mode === "self_powered" ? "self_consumption" : "autonomous";

			const payload = {
				default_real_mode: defaultRealMode,
				backup_reserve_percent: backupReserve,
			};

			console.log("submitting operation change", payload);

			await this.client.post(`${this.baseUrl}/api/1/energy_sites/${siteId}/operation`, payload, {
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			});

			console.log("submitting backup % change", payload);
			await this.client.post(`${this.baseUrl}/api/1/energy_sites/${siteId}/backup`, payload, {
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			});

			return { success: true, mode, backupReserve };
		} catch (error) {
			throw new Error(`Failed to set operation mode: ${error.message}`);
		}
	}

	/**
	 * Get current operation mode
	 */
	async getOperationMode(token, siteId) {
		try {
			const siteInfo = await this.getSiteInfo(token, siteId);
			return {
				default_real_mode: siteInfo.default_real_mode,
				backup_reserve_percent: siteInfo.backup_reserve_percent,
			};
		} catch (error) {
			throw new Error(`Failed to get operation mode: ${error.message}`);
		}
	}

	/**
	 * Get battery percentage and energy data
	 */
	async getBatteryStatus(token, siteId) {
		try {
			const siteInfo = await this.getSiteInfo(token, siteId);
			return {
				percentage: siteInfo.percentage_charged || 0,
				total_pack_energy: siteInfo.total_pack_energy || 0,
				energy_left: siteInfo.energy_left || 0,
			};
		} catch (error) {
			throw new Error(`Failed to get battery status: ${error.message}`);
		}
	}

	/**
	 * Enable Storm Watch mode
	 */
	async enableStormWatch(token, siteId) {
		try {
			console.log("setting storm mode to active");
			const req = await this.client.post(
				`${this.baseUrl}/api/1/energy_sites/${siteId}/storm_mode`,
				{ enabled: true },
				{
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
				},
			);
			console.log("storm mode response", req.data);
			return { success: true, storm_watch: "enabled" };
		} catch (error) {
			throw new Error(`Failed to enable storm watch: ${error.message}`);
		}
	}

	/**
	 * Disable Storm Watch mode
	 */
	async disableStormWatch(token, siteId) {
		try {
			await this.client.post(
				`${this.baseUrl}/api/1/energy_sites/${siteId}/storm_mode`,
				{ enabled: false },
				{
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
				},
			);
			return { success: true, storm_watch: "disabled" };
		} catch (error) {
			throw new Error(`Failed to disable storm watch: ${error.message}`);
		}
	}

	/**
	 * Get current storm watch status
	 */
	async getStormWatchStatus(token, siteId) {
		try {
			const siteInfo = await this.getSiteInfo(token, siteId);
			return {
				enabled: siteInfo.user_settings?.storm_mode_enabled || false,
			};
		} catch (error) {
			throw new Error(`Failed to get storm watch status: ${error.message}`);
		}
	}

	/**
	 * Update site address (triggers Storm Watch if in affected area)
	 * @param {string} token - Auth token
	 * @param {number} siteId - Energy site ID
	 * @param {object} address - Address object with all required fields
	 */
	async updateSiteAddress(token, siteId, address) {
		try {
			const payload = {
				address: {
					county: address.county,
					city: address.city,
					longitude: address.longitude,
					country: address.country || "US",
					address_line1: address.address_line1,
					address_line2: address.address_line2 || "",
					zip: address.zip,
					latitude: address.latitude,
					state: address.state,
				},
			};

			await this.client.post(`${this.baseUrl}/api/1/energy_sites/${siteId}/site_address`, payload, {
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			});

			return {
				success: true,
				message: "Site address updated successfully",
				address: payload.address,
			};
		} catch (error) {
			throw new Error(`Failed to update site address: ${error.message}`);
		}
	}
}

module.exports = TeslaAPI;

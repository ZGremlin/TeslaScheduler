const axios = require("axios");
const crypto = require("crypto");

const ntfy = require("./ntfy");

class TeslaAPI {
	constructor() {
		this.fleetBaseUrl =
			process.env.TESLA_FLEET_BASE_URL || "https://fleet-api.prd.na.vn.cloud.tesla.com";
		this.authUrl = "https://auth.tesla.com";
		this.clientId = process.env.TESLA_CLIENT_ID;
		this.clientSecret = process.env.TESLA_CLIENT_SECRET;
		this.redirectUri = process.env.TESLA_REDIRECT_URI;

		this.client = axios.create({
			timeout: 30000,
		});
	}

	generateCodeChallenge() {
		const verifier = crypto.randomBytes(32).toString("base64url");
		const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
		return { verifier, challenge };
	}

	getAuthorizationUrl() {
		const { verifier, challenge } = this.generateCodeChallenge();
		const state = crypto.randomBytes(16).toString("hex");

		const params = new URLSearchParams({
			client_id: this.clientId,
			code_challenge: challenge,
			code_challenge_method: "S256",
			redirect_uri: this.redirectUri,
			response_type: "code",
			scope: "openid offline_access energy_device_data energy_cmds",
			state: state,
		});

		return {
			url: `${this.authUrl}/oauth2/v3/authorize?${params.toString()}`,
			verifier,
			state,
		};
	}

	async getPartnerToken() {
		const params = new URLSearchParams({
			grant_type: "client_credentials",
			client_id: this.clientId,
			client_secret: this.clientSecret,
			scope: "openid",
			audience: this.fleetBaseUrl,
		});

		const response = await this.client.post(
			`${this.authUrl}/oauth2/v3/token`,
			params.toString(),
			{ headers: { "Content-Type": "application/x-www-form-urlencoded" } },
		);

		return response.data.access_token;
	}

	async registerPartnerAccount(domain) {
		const partnerToken = await this.getPartnerToken();

		const response = await this.client.post(
			`${this.fleetBaseUrl}/api/1/partner_accounts`,
			{ domain },
			{
				headers: {
					Authorization: `Bearer ${partnerToken}`,
					"Content-Type": "application/json",
				},
			},
		);

		return response.data;
	}

	async exchangeCodeForToken(code, verifier) {
		try {
			const params = new URLSearchParams({
				grant_type: "authorization_code",
				client_id: this.clientId,
				client_secret: this.clientSecret,
				code: code,
				code_verifier: verifier,
				redirect_uri: this.redirectUri,
			});

			const response = await this.client.post(
				`${this.authUrl}/oauth2/v3/token`,
				params.toString(),
				{ headers: { "Content-Type": "application/x-www-form-urlencoded" } },
			);

			return {
				access_token: response.data.access_token,
				refresh_token: response.data.refresh_token,
				expires_at: Date.now() + response.data.expires_in * 1000,
			};
		} catch (error) {
			const detail = error.response?.data
				? JSON.stringify(error.response.data)
				: error.message;
			console.error("Token exchange error response:", detail);
			ntfy.sendPushNotification(`❌ Tesla token exchange failed: ${detail}`);
			throw new Error(`Token exchange failed: ${detail}`);
		}
	}

	async refreshAccessToken(refreshToken) {
		try {
			const params = new URLSearchParams({
				grant_type: "refresh_token",
				client_id: this.clientId,
				client_secret: this.clientSecret,
				refresh_token: refreshToken,
			});

			const response = await this.client.post(
				`${this.authUrl}/oauth2/v3/token`,
				params.toString(),
				{ headers: { "Content-Type": "application/x-www-form-urlencoded" } },
			);

			ntfy.sendPushNotification("🔄 Tesla token refreshed successfully");

			return {
				access_token: response.data.access_token,
				refresh_token: response.data.refresh_token,
				expires_at: Date.now() + response.data.expires_in * 1000,
			};
		} catch (error) {
			ntfy.sendPushNotification(`❌ Tesla token refresh failed: ${error.message}`);
			throw new Error(`Token refresh failed: ${error.message}`);
		}
	}

	async getEnergySites(token) {
		try {
			const response = await this.client.get(`${this.fleetBaseUrl}/api/1/products`, {
				headers: { Authorization: `Bearer ${token}` },
			});

			const energySites = response.data.response.filter(
				(product) => product.resource_type === "battery",
			);

			return energySites;
		} catch (error) {
			ntfy.sendPushNotification(`❌ Failed to get energy sites: ${error.message}`);
			throw new Error(`Failed to get energy sites: ${error.message}`);
		}
	}

	async getSiteStatus(token, siteId) {
		try {
			const response = await this.client.get(
				`${this.fleetBaseUrl}/api/1/energy_sites/${siteId}/site_status`,
				{
					headers: { Authorization: `Bearer ${token}` },
				},
			);
			return response.data.response;
		} catch (error) {
			const errorMsg = error.response?.data?.error || error.message;
			const statusCode = error.response?.status;
			ntfy.sendPushNotification(`❌ Failed to get site status: ${errorMsg}`);
			throw new Error(`Failed to get site status (${statusCode}): ${errorMsg}`);
		}
	}

	async getSiteInfo(token, siteId) {
		try {
			const response = await this.client.get(
				`${this.fleetBaseUrl}/api/1/energy_sites/${siteId}/site_info`,
				{
					headers: { Authorization: `Bearer ${token}` },
				},
			);
			return response.data.response;
		} catch (error) {
			const errorMsg = error.response?.data?.error || error.message;
			const statusCode = error.response?.status;
			ntfy.sendPushNotification(`❌ Failed to get site info: ${errorMsg}`);
			throw new Error(`Failed to get site info (${statusCode}): ${errorMsg}`);
		}
	}

	async getLiveStatus(token, siteId) {
		try {
			const response = await this.client.get(
				`${this.fleetBaseUrl}/api/1/energy_sites/${siteId}/live_status`,
				{
					headers: { Authorization: `Bearer ${token}` },
				},
			);
			return response.data.response;
		} catch (error) {
			const errorMsg = error.response?.data?.error || error.message;
			const statusCode = error.response?.status;
			ntfy.sendPushNotification(`⚠ Failed to get live status: ${errorMsg}`);
			console.warn(`Live status not available (${statusCode}): ${errorMsg}`);
			return null;
		}
	}

	async getCompleteSiteData(token, siteId) {
		try {
			const siteInfo = await this.getSiteInfo(token, siteId);

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
			ntfy.sendPushNotification(`❌ Failed to get complete site data: ${error.message}`);
			throw new Error(`Failed to get complete site data: ${error.message}`);
		}
	}

	async setOperationMode(token, siteId, mode, backupReserve) {
		try {
			const defaultRealMode = mode === "self_powered" ? "self_consumption" : "autonomous";

			const payload = {
				default_real_mode: defaultRealMode,
				backup_reserve_percent: backupReserve,
			};

			console.log("submitting operation change", payload);

			await this.client.post(
				`${this.fleetBaseUrl}/api/1/energy_sites/${siteId}/operation`,
				payload,
				{
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
				},
			);

			console.log("submitting backup % change", payload);
			await this.client.post(
				`${this.fleetBaseUrl}/api/1/energy_sites/${siteId}/backup`,
				payload,
				{
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
				},
			);

			return { success: true, mode, backupReserve };
		} catch (error) {
			ntfy.sendPushNotification(`❌ Failed to set operation mode: ${error.message}`);
			throw new Error(`Failed to set operation mode: ${error.message}`);
		}
	}

	async getOperationMode(token, siteId) {
		try {
			const siteInfo = await this.getSiteInfo(token, siteId);
			return {
				default_real_mode: siteInfo.default_real_mode,
				backup_reserve_percent: siteInfo.backup_reserve_percent,
			};
		} catch (error) {
			ntfy.sendPushNotification(`❌ Failed to get operation mode: ${error.message}`);
			throw new Error(`Failed to get operation mode: ${error.message}`);
		}
	}

	async getBatteryStatus(token, siteId) {
		try {
			const siteInfo = await this.getSiteInfo(token, siteId);
			return {
				percentage: siteInfo.percentage_charged || 0,
				total_pack_energy: siteInfo.total_pack_energy || 0,
				energy_left: siteInfo.energy_left || 0,
			};
		} catch (error) {
			ntfy.sendPushNotification(`❌ Failed to get battery status: ${error.message}`);
			throw new Error(`Failed to get battery status: ${error.message}`);
		}
	}

	async enableStormWatch(token, siteId) {
		try {
			console.log("setting storm mode to active");
			const req = await this.client.post(
				`${this.fleetBaseUrl}/api/1/energy_sites/${siteId}/storm_mode`,
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
			ntfy.sendPushNotification(`❌ Failed to enable storm watch: ${error.message}`);
			throw new Error(`Failed to enable storm watch: ${error.message}`);
		}
	}

	async disableStormWatch(token, siteId) {
		try {
			await this.client.post(
				`${this.fleetBaseUrl}/api/1/energy_sites/${siteId}/storm_mode`,
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
			ntfy.sendPushNotification(`❌ Failed to disable storm watch: ${error.message}`);
			throw new Error(`Failed to disable storm watch: ${error.message}`);
		}
	}

	async getStormWatchStatus(token, siteId) {
		try {
			const siteInfo = await this.getSiteInfo(token, siteId);
			return {
				enabled: siteInfo.user_settings?.storm_mode_enabled || false,
			};
		} catch (error) {
			ntfy.sendPushNotification(`❌ Failed to get storm watch status: ${error.message}`);
			throw new Error(`Failed to get storm watch status: ${error.message}`);
		}
	}

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

			await this.client.post(
				`${this.fleetBaseUrl}/api/1/energy_sites/${siteId}/site_address`,
				payload,
				{
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
				},
			);

			return {
				success: true,
				message: "Site address updated successfully",
				address: payload.address,
			};
		} catch (error) {
			ntfy.sendPushNotification(`❌ Failed to update site address: ${error.message}`);
			throw new Error(`Failed to update site address: ${error.message}`);
		}
	}
}

module.exports = TeslaAPI;

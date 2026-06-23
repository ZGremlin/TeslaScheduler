const axios = require("axios");

const TOPIC = process.env.NTFY_TOPIC || false;

class Ntfy {
	constructor() {
		this.baseUrl = "https://ntfy.sh";

		this.client = axios.create({
			timeout: 30000,
		});
	}

	async sendPushNotification(message) {
		if (!TOPIC) {
			console.warn("⚠️  NTFY_TOPIC not set - skipping notification:", message);
			return;
		}

		try {
			await this.client.post(`${this.baseUrl}/${TOPIC}`, message);
		} catch (error) {
			console.error(`Notification failed: ${error.message}`);
		}
	}
}

const ntfy = new Ntfy();

module.exports = ntfy;

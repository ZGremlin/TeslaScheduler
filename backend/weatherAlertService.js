const axios = require("axios");

class WeatherAlertService {
	constructor() {
		this.weatherGovBaseUrl = "https://api.weather.gov";

		// Severe weather alert types that warrant Storm Watch
		this.severeAlertTypes = [
			"Blizzard Warning",
			"Winter Storm Warning",
			"Red Flag Warning",
			"Hurricane Warning",
			"Hurricane Watch",
			"Thunderstorm Warning",
			"Tornado Warning",
			"High Wind Warning",
			"Ice Storm Warning",
			"Snow Squall Warning",
			"Wind Chill Warning",
			"Flood Warning",
			"Flash Flood Warning",
			"Coastal Flood Warning",
			"Lakeshore Flood Warning",
		];

		this.client = axios.create({
			timeout: 30000,
			headers: {
				"User-Agent": "TeslaPowerwallScheduler/1.0 (Emergency Weather Monitoring)",
			},
		});

		this.geocodeClient = axios.create({
			timeout: 30000,
		});
	}

	/**
	 * Get active severe weather alerts from weather.gov
	 */
	async getActiveSevereAlerts() {
		try {
			console.log("🌩️  Checking for active severe weather alerts...");

			const response = await this.client.get(`${this.weatherGovBaseUrl}/alerts/active`, {
				params: {
					status: "actual",
				},
			});

			const alerts = response.data.features || [];

			// Filter for severe alerts
			const severeAlerts = alerts.filter((alert) => {
				const event = alert.properties?.event;
				return this.severeAlertTypes.includes(event);
			});

			console.log(`   Found ${alerts.length} total alerts, ${severeAlerts.length} severe alerts`);

			return severeAlerts;
		} catch (error) {
			throw new Error(`Failed to get weather alerts: ${error.message}`);
		}
	}

	/**
	 * Get the geometry polygon for an alert zone
	 */
	async getAlertZoneGeometry(zoneUrl) {
		try {
			const response = await this.client.get(zoneUrl);
			const geometry = response.data.geometry;

			if (!geometry || !geometry.coordinates) {
				throw new Error("No geometry found for zone");
			}

			return geometry;
		} catch (error) {
			throw new Error(`Failed to get zone geometry: ${error.message}`);
		}
	}

	/**
	 * Pick a random point within a polygon
	 * Simplified approach: pick random point from polygon coordinates
	 */
	getRandomPointInPolygon(geometry) {
		try {
			// Handle different geometry types
			let coordinates;

			if (geometry.type === "Polygon") {
				coordinates = geometry.coordinates[0]; // Outer ring
			} else if (geometry.type === "MultiPolygon") {
				// Pick first polygon
				coordinates = geometry.coordinates[0][0];
			} else {
				throw new Error(`Unsupported geometry type: ${geometry.type}`);
			}

			// Pick a random coordinate from the polygon
			const randomIndex = Math.floor(Math.random() * coordinates.length);
			const [longitude, latitude] = coordinates[randomIndex];

			console.log(`   Selected random point: ${latitude}, ${longitude}`);

			return { latitude, longitude };
		} catch (error) {
			throw new Error(`Failed to get random point: ${error.message}`);
		}
	}

	/**
	 * Get address from coordinates using Google Maps Geocoding API
	 */
	async getAddressFromCoordinates(latitude, longitude, googleMapsApiKey) {
		try {
			if (!googleMapsApiKey) {
				throw new Error("Google Maps API key not configured");
			}

			console.log(`   Geocoding coordinates: ${latitude}, ${longitude}`);

			const response = await this.geocodeClient.get(
				"https://maps.googleapis.com/maps/api/geocode/json",
				{
					params: {
						latlng: `${latitude},${longitude}`,
						key: googleMapsApiKey,
					},
				},
			);

			if (response.data.status !== "OK" || !response.data.results[0]) {
				throw new Error(`Geocoding failed: ${response.data.status}`);
			}

			const result = response.data.results[0];
			const addressComponents = result.address_components;

			// Extract address components
			const address = {
				address_line1: "",
				address_line2: "",
				city: "",
				county: "",
				state: "",
				zip: "",
				country: "US",
				latitude: latitude,
				longitude: longitude,
			};

			// Parse address components
			for (const component of addressComponents) {
				const types = component.types;

				if (types.includes("street_number")) {
					address.address_line1 = component.long_name + " ";
				} else if (types.includes("route")) {
					address.address_line1 += component.long_name;
				} else if (types.includes("locality")) {
					address.city = component.long_name;
				} else if (types.includes("administrative_area_level_2")) {
					address.county = component.long_name;
				} else if (types.includes("administrative_area_level_1")) {
					address.state = component.short_name;
				} else if (types.includes("postal_code")) {
					address.zip = component.long_name;
				} else if (types.includes("country")) {
					address.country = component.short_name;
				}
			}

			// Clean up address_line1
			address.address_line1 =
				address.address_line1.trim() || result.formatted_address.split(",")[0];

			console.log(
				`   Found address: ${address.address_line1}, ${address.city}, ${address.state} ${address.zip}`,
			);

			return address;
		} catch (error) {
			throw new Error(`Failed to geocode address: ${error.message}`);
		}
	}

	/**
	 * Process a severe weather alert and return a fake address
	 */
	async processAlertForAddress(alert, googleMapsApiKey) {
		try {
			const event = alert.properties.event;
			const headline = alert.properties.headline;

			console.log(`   Processing alert: ${event}`);
			console.log(`   Headline: ${headline}`);

			// Get affected zones
			const affectedZones = alert.properties.affectedZones || [];

			if (affectedZones.length === 0) {
				throw new Error("No affected zones found for this alert");
			}

			// Try each zone until we get a valid address
			for (const zoneUrl of affectedZones.slice(0, 3)) {
				// Try up to 3 zones
				try {
					console.log(`   Fetching geometry for zone: ${zoneUrl}`);

					const geometry = await this.getAlertZoneGeometry(zoneUrl);
					const point = this.getRandomPointInPolygon(geometry);
					const address = await this.getAddressFromCoordinates(
						point.latitude,
						point.longitude,
						googleMapsApiKey,
					);

					return {
						success: true,
						address: address,
						alert: {
							event: event,
							headline: headline,
							severity: alert.properties.severity,
							urgency: alert.properties.urgency,
						},
					};
				} catch (error) {
					console.warn(`   Failed to process zone ${zoneUrl}: ${error.message}`);
					continue; // Try next zone
				}
			}

			throw new Error("Failed to process any affected zones");
		} catch (error) {
			throw new Error(`Failed to process alert: ${error.message}`);
		}
	}

	/**
	 * Main function: Check for severe weather and return address if found
	 */
	async checkForSevereWeatherAndGetAddress(googleMapsApiKey) {
		try {
			console.log("🔍 Starting severe weather check...");

			// Get active severe alerts
			const alerts = await this.getActiveSevereAlerts();

			if (alerts.length === 0) {
				console.log("✅ No active severe weather alerts found");
				return {
					success: false,
					message: "No severe weather alerts active",
					alertsChecked: 0,
				};
			}

			console.log(`⚠️  Found ${alerts.length} severe weather alert(s)`);

			// Process the first severe alert
			const result = await this.processAlertForAddress(alerts[0], googleMapsApiKey);

			console.log("✅ Successfully processed weather alert");

			return result;
		} catch (error) {
			console.error("❌ Weather alert check failed:", error.message);
			throw error;
		}
	}
}

module.exports = WeatherAlertService;

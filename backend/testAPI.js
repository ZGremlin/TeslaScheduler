#!/usr/bin/env node

/**
 * Tesla API Testing Utility
 * Run this script after authentication to test API endpoints
 */

const DatabaseService = require("./database");
const TeslaAPI = require("./teslaAPI");

async function testAPI() {
	const db = new DatabaseService();

	try {
		console.log("🔍 Testing Tesla API Endpoints...\n");

		await db.connect();

		// Get auth token
		const authData = await db.getAuthToken();
		if (!authData || !authData.access_token) {
			console.error("❌ No authentication token found. Please authenticate first.");
			process.exit(1);
		}

		console.log("✓ Authentication token found");
		console.log(`  Expires: ${new Date(authData.expires_at).toLocaleString()}`);
		console.log(`  Valid: ${Date.now() < authData.expires_at ? "Yes" : "No"}\n`);

		// Get config
		const config = await db.getPowerwallConfig();
		if (!config || !config.site_id) {
			console.error("❌ No site configuration found. Please complete authentication.");
			process.exit(1);
		}

		console.log("✓ Site configuration found");
		console.log(`  Site ID: ${config.site_id}`);
		console.log(`  Site Name: ${config.site_name || "N/A"}\n`);

		const teslaAPI = new TeslaAPI();

		// Test 1: Get energy sites
		console.log("Test 1: Getting energy sites list...");
		try {
			const sites = await teslaAPI.getEnergySites(authData.access_token);
			console.log("✓ Success!");
			console.log(`  Found ${sites.length} site(s):`);
			sites.forEach((site, i) => {
				console.log(`  ${i + 1}. ${site.site_name} (ID: ${site.energy_site_id})`);
			});
			console.log();
		} catch (err) {
			console.error("✗ Failed:", err.message);
			console.log();
		}

		// Test 2: Get site info
		console.log("Test 2: Getting site info...");
		try {
			const siteInfo = await teslaAPI.getSiteInfo(authData.access_token, config.site_id);
			console.log("✓ Success!");
			console.log("  Key fields:");
			console.log(`  - Site Name: ${siteInfo.site_name}`);
			console.log(`  - Battery Percentage: ${siteInfo.percentage_charged}%`);
			console.log(`  - Operation Mode: ${siteInfo.default_real_mode}`);
			console.log(`  - Backup Reserve: ${siteInfo.backup_reserve_percent}%`);
			console.log(`  - Installation Date: ${siteInfo.installation_date || "N/A"}`);
			console.log();
		} catch (err) {
			console.error("✗ Failed:", err.message);
			console.log();
		}

		// Test 3: Get site status
		console.log("Test 3: Getting site status...");
		try {
			const siteStatus = await teslaAPI.getSiteStatus(authData.access_token, config.site_id);
			console.log("✓ Success!");
			console.log("  Available fields:", Object.keys(siteStatus).join(", "));
			console.log();
		} catch (err) {
			console.error("✗ Failed:", err.message);
			console.log();
		}

		// Test 4: Get live status
		console.log("Test 4: Getting live status...");
		try {
			const liveStatus = await teslaAPI.getLiveStatus(authData.access_token, config.site_id);
			if (liveStatus) {
				console.log("✓ Success!");
				console.log("  Available fields:", Object.keys(liveStatus).join(", "));
				if (liveStatus.solar_power !== undefined) {
					console.log(`  - Solar Power: ${liveStatus.solar_power} W`);
				}
				if (liveStatus.battery_power !== undefined) {
					console.log(`  - Battery Power: ${liveStatus.battery_power} W`);
				}
				if (liveStatus.load_power !== undefined) {
					console.log(`  - Load Power: ${liveStatus.load_power} W`);
				}
			} else {
				console.log("⚠ Live status not available for this site");
			}
			console.log();
		} catch (err) {
			console.error("✗ Failed:", err.message);
			console.log();
		}

		// Test 5: Get battery status
		console.log("Test 5: Getting battery status...");
		try {
			const batteryStatus = await teslaAPI.getBatteryStatus(authData.access_token, config.site_id);
			console.log("✓ Success!");
			console.log(`  - Percentage: ${batteryStatus.percentage}%`);
			console.log(`  - Energy Left: ${batteryStatus.energy_left} Wh`);
			console.log(`  - Total Pack Energy: ${batteryStatus.total_pack_energy} Wh`);
			console.log();
		} catch (err) {
			console.error("✗ Failed:", err.message);
			console.log();
		}

		console.log("✅ Testing complete!");
	} catch (error) {
		console.error("❌ Error:", error.message);
		process.exit(1);
	} finally {
		await db.close();
	}
}

testAPI();

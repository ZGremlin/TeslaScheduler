import React, { useState, useEffect } from "react";
import * as api from "../services/api";

function PowerwallStatus() {
	const [status, setStatus] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		loadStatus();
		const interval = setInterval(loadStatus, 10000); // Refresh every 10 seconds
		return () => clearInterval(interval);
	}, []);

	const loadStatus = async () => {
		try {
			const response = await api.getPowerwallStatus();
			setStatus(response.data);
			console.log("status data", response.data);
			setError(null);
		} catch (err) {
			setError("Failed to load Powerwall status");
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	if (loading) {
		return (
			<div className="loading-container">
				<div className="loading-spinner"></div>
				<p>Loading Powerwall status...</p>
			</div>
		);
	}

	if (error) {
		return <div className="alert alert-error">{error}</div>;
	}

	if (!status) {
		return null;
	}

	const batteryPercentage = status.live_status?.percentage_charged || 0;
	const operationMode = status.operation?.default_real_mode || "unknown";
	const backupReserve = status.operation?.backup_reserve_percent || 0;
	const siteName = status.site_name || "Powerwall";
	const stormWatchEnabled = status.live_status?.storm_mode_active || "UNKNOWN";

	const getModeDisplay = (mode) => {
		const modes = {
			self_consumption: "Self-Powered",
			autonomous: "Time-Based Control",
			backup: "Backup Only",
		};
		return modes[mode] || mode;
	};

	const getBatteryColor = (percentage) => {
		if (percentage >= 75) return "#10b981";
		if (percentage >= 50) return "#3b82f6";
		if (percentage >= 25) return "#f59e0b";
		return "#ef4444";
	};

	return (
		<div className="powerwall-status">
			<div className="status-section">
				<h2>{siteName} Status</h2>

				<div className="status-grid">
					<div className="status-card battery-card">
						<div className="card-icon">🔋</div>
						<div className="card-content">
							<h3>Battery Level</h3>
							<div className="battery-display">
								<div
									className="battery-percentage"
									style={{ color: getBatteryColor(batteryPercentage) }}
								>
									{batteryPercentage.toFixed(1)}%
								</div>
								<div className="battery-bar">
									<div
										className="battery-fill"
										style={{
											width: `${batteryPercentage}%`,
											backgroundColor: getBatteryColor(batteryPercentage),
										}}
									></div>
								</div>
							</div>
						</div>
					</div>

					<div className="status-card">
						<div className="card-icon">⚙️</div>
						<div className="card-content">
							<h3>Operation Mode</h3>
							<div className="card-value">{getModeDisplay(operationMode)}</div>
						</div>
					</div>

					<div className="status-card">
						<div className="card-icon">🛡️</div>
						<div className="card-content">
							<h3>Backup Reserve</h3>
							<div className="card-value">{backupReserve}%</div>
						</div>
					</div>

					<div className="status-card">
						<div className="card-icon">🛡️</div>
						<div className="card-content">
							<h3>Storm Watch</h3>
							<div className="card-value">
								{status.live_status.storm_mode_active ? "Enabled" : "Disabled"}
							</div>
						</div>
					</div>
				</div>
			</div>

			{status.live_status && status.live_status.solar_power !== undefined && (
				<div className="status-section">
					<h2>Power Flow</h2>
					<div className="status-grid">
						<div className="status-card">
							<div className="card-icon">☀️</div>
							<div className="card-content">
								<h3>Solar</h3>
								<div className="card-value">
									{((status.live_status.solar_power || 0) / 1000).toFixed(2)} kW
								</div>
							</div>
						</div>

						<div className="status-card">
							<div className="card-icon">🏠</div>
							<div className="card-content">
								<h3>Home</h3>
								<div className="card-value">
									{((status.live_status.load_power || 0) / 1000).toFixed(2)} kW
								</div>
							</div>
						</div>

						<div className="status-card">
							<div className="card-icon">🔌</div>
							<div className="card-content">
								<h3>Grid</h3>
								<div className="card-value">
									{((status.live_status.grid_power || 0) / 1000).toFixed(2)} kW
								</div>
							</div>
						</div>

						<div className="status-card">
							<div className="card-icon">🔋</div>
							<div className="card-content">
								<h3>Battery</h3>
								<div className="card-value">
									{((status.live_status.battery_power || 0) / 1000).toFixed(2)} kW
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			<div className="status-footer">
				<button className="btn btn-secondary" onClick={loadStatus}>
					🔄 Refresh
				</button>
				<small>Last updated: {new Date().toLocaleTimeString()}</small>
			</div>
		</div>
	);
}

export default PowerwallStatus;

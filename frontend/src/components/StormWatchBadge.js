import React, { useState, useEffect } from "react";
import * as api from "../services/api";

function StormWatchBadge() {
	const [status, setStatus] = useState(null);
	const [toggling, setToggling] = useState(false);

	useEffect(() => {
		loadStatus();
		const interval = setInterval(loadStatus, 60000); // Update every 60 seconds
		return () => clearInterval(interval);
	}, []);

	const loadStatus = async () => {
		try {
			const response = await api.getPowerwallStatus();
			setStatus({
				enabled: !!response.data.site_info?.user_settings?.storm_mode_enabled,
				active: !!response.data.live_status?.storm_mode_active,
				batteryPercent: response.data.live_status?.percentage_charged ?? null,
				batteryPower: response.data.live_status?.battery_power || 0,
			});
		} catch (err) {
			console.error("Failed to load storm watch status:", err);
			setStatus(null);
		}
	};

	const handleToggle = async () => {
		const enabled = !status.enabled;

		try {
			setToggling(true);
			await api.setStormWatch(enabled);
			// Tesla can take a moment to report the new setting, so trust the
			// successful response here and let the next poll reconcile
			setStatus((prev) => ({ ...prev, enabled }));
		} catch (err) {
			alert(
				`Failed to ${enabled ? "enable" : "disable"} Storm Watch: ` +
					(err.response?.data?.error || err.message),
			);
		} finally {
			setToggling(false);
		}
	};

	if (!status) {
		return null;
	}

	let className = "status-neutral";
	let label = "☀️ Storm Watch Off";
	let title = "Storm Watch is disabled - click to enable";

	if (status.enabled) {
		className = status.active ? "status-warning" : "status-success";
		label = status.active ? "⛈️ Storm Watch Active" : "⛈️ Storm Watch On";
		title = status.active
			? "Tesla has detected a storm event - click to disable Storm Watch"
			: "Storm Watch is enabled - click to disable";
	}

	// battery_power is negative while charging; ignore noise around zero
	const charging = status.batteryPower < -100;
	const chargeKw = (Math.abs(status.batteryPower) / 1000).toFixed(1);

	const getBatteryColor = (percentage) => {
		if (percentage >= 75) return "#10b981";
		if (percentage >= 50) return "#3b82f6";
		if (percentage >= 25) return "#f59e0b";
		return "#ef4444";
	};

	return (
		<>
			{status.batteryPercent !== null && (
				<div
					className={`battery-indicator ${charging ? "battery-charging" : ""}`}
					title={
						charging
							? `Battery charging at ${chargeKw} kW (${status.batteryPercent.toFixed(0)}%)`
							: `Battery not charging (${status.batteryPercent.toFixed(0)}%)`
					}
				>
					<div className="battery-icon">
						<div
							className="battery-icon-fill"
							style={{
								width: `${Math.min(100, Math.max(0, status.batteryPercent))}%`,
								backgroundColor: getBatteryColor(status.batteryPercent),
							}}
						></div>
						{charging && <span className="battery-icon-bolt">⚡</span>}
					</div>
					<span>{status.batteryPercent.toFixed(0)}%</span>
				</div>
			)}
			<button
				className={`status-badge status-badge-button ${className}`}
				onClick={handleToggle}
				disabled={toggling}
				title={title}
			>
				{toggling ? "⏳ Updating..." : label}
			</button>
		</>
	);
}

export default StormWatchBadge;

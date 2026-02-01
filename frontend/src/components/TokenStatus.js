import React, { useState, useEffect } from "react";
import * as api from "../services/api";

function TokenStatus() {
	const [status, setStatus] = useState(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);

	useEffect(() => {
		loadStatus();
		const interval = setInterval(loadStatus, 30000); // Update every 30 seconds
		return () => clearInterval(interval);
	}, []);

	const loadStatus = async () => {
		try {
			const response = await api.getTokenStatus();
			setStatus(response.data);
		} catch (err) {
			console.error("Failed to load token status:", err);
		} finally {
			setLoading(false);
		}
	};

	const handleRefresh = async () => {
		try {
			setRefreshing(true);
			await api.refreshToken();
			await loadStatus();
			alert("Token refresh initiated successfully!");
		} catch (err) {
			alert("Failed to refresh token: " + err.message);
		} finally {
			setRefreshing(false);
		}
	};

	if (loading || !status || !status.authenticated) {
		return null;
	}

	const getStatusColor = () => {
		if (!status.is_valid) return "#ef4444";
		if (status.expires_in_minutes < 120) return "#f59e0b";
		return "#10b981";
	};

	const getStatusText = () => {
		if (!status.is_valid) return "Expired";
		if (status.is_refreshing) return "Refreshing...";
		if (status.retry_count > 0) return `Retrying (${status.retry_count})`;
		if (status.expires_in_minutes < 120) return "Expiring Soon";
		return "Active";
	};

	return (
		<div className="token-status-widget">
			<div className="token-status-header">
				<span className="token-status-label">🔑 Token Status</span>
				<span className="token-status-indicator" style={{ backgroundColor: getStatusColor() }}>
					{getStatusText()}
				</span>
			</div>

			<div className="token-status-details">
				{status.is_valid ? (
					<>
						<div className="token-detail">
							<span className="detail-label">Expires in:</span>
							<span className="detail-value">{status.expires_in_minutes} minutes</span>
						</div>
						{status.refresh_in_minutes !== undefined && status.refresh_in_minutes > 0 && (
							<div className="token-detail">
								<span className="detail-label">Auto-refresh in:</span>
								<span className="detail-value">{status.refresh_in_minutes} minutes</span>
							</div>
						)}
						{status.retry_count > 0 && (
							<div className="token-detail warning">
								<span className="detail-label">⚠️ Refresh attempts:</span>
								<span className="detail-value">{status.retry_count}</span>
							</div>
						)}
					</>
				) : (
					<div className="token-detail error">
						<span>⚠️ Token expired - please re-authenticate</span>
					</div>
				)}
			</div>

			<button
				className="btn btn-secondary btn-small"
				onClick={handleRefresh}
				disabled={refreshing || status.is_refreshing}
				style={{ marginTop: "0.5rem", width: "100%" }}
			>
				{refreshing || status.is_refreshing ? "Refreshing..." : "🔄 Refresh Now"}
			</button>
		</div>
	);
}

export default TokenStatus;

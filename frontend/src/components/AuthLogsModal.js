import React, { useState, useEffect } from "react";
import * as api from "../services/api";

function AuthLogsModal({ onClose }) {
	const [logs, setLogs] = useState([]);
	const [stats, setStats] = useState(null);
	const [loading, setLoading] = useState(true);
	const [autoRefresh, setAutoRefresh] = useState(true);
	const [lineCount, setLineCount] = useState(100);

	useEffect(() => {
		loadLogs();
		loadStats();

		if (autoRefresh) {
			const interval = setInterval(() => {
				loadLogs();
				loadStats();
			}, 5000); // Refresh every 5 seconds
			return () => clearInterval(interval);
		}
	}, [autoRefresh, lineCount]);

	const loadLogs = async () => {
		try {
			const response = await api.getAuthLogs(lineCount);
			setLogs(response.data.logs);
		} catch (err) {
			console.error("Failed to load logs:", err);
		} finally {
			setLoading(false);
		}
	};

	const loadStats = async () => {
		try {
			const response = await api.getAuthLogStats();
			setStats(response.data);
		} catch (err) {
			console.error("Failed to load stats:", err);
		}
	};

	const handleClearLogs = async () => {
		if (!window.confirm("Are you sure you want to clear all authentication logs?")) {
			return;
		}

		try {
			await api.clearAuthLogs();
			setLogs([]);
			loadStats();
			alert("Logs cleared successfully!");
		} catch (err) {
			alert("Failed to clear logs: " + err.message);
		}
	};

	const formatFileSize = (bytes) => {
		if (bytes < 1024) return bytes + " B";
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
		return (bytes / 1024 / 1024).toFixed(2) + " MB";
	};

	const parseLogLine = (line) => {
		// Parse format: [timestamp] [level] [event] {details}
		const regex = /\[(.*?)\] \[(.*?)\] \[(.*?)\](.*)/;
		const match = line.match(regex);

		if (match) {
			return {
				timestamp: match[1],
				level: match[2],
				event: match[3],
				details: match[4].trim(),
			};
		}

		return { raw: line };
	};

	const getLevelColor = (level) => {
		switch (level) {
			case "SUCCESS":
				return "#10b981";
			case "INFO":
				return "#3b82f6";
			case "WARN":
				return "#f59e0b";
			case "ERROR":
				return "#ef4444";
			default:
				return "#6b7280";
		}
	};

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal modal-xlarge" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2>Authentication Logs</h2>
					<button className="btn-close" onClick={onClose}>
						×
					</button>
				</div>

				<div className="modal-body">
					{/* Stats Section */}
					{stats && (
						<div className="log-stats">
							<div className="stat-item">
								<span className="stat-label">Log Files:</span>
								<span className="stat-value">{stats.files.length}</span>
							</div>
							<div className="stat-item">
								<span className="stat-label">Total Size:</span>
								<span className="stat-value">{formatFileSize(stats.total_size)}</span>
							</div>
							<div className="stat-item">
								<span className="stat-label">Entries Shown:</span>
								<span className="stat-value">{logs.length}</span>
							</div>
						</div>
					)}

					{/* Controls */}
					<div className="log-controls">
						<div className="control-group">
							<label htmlFor="line-count">Lines to show:</label>
							<select
								id="line-count"
								value={lineCount}
								onChange={(e) => setLineCount(parseInt(e.target.value))}
								className="control-select"
							>
								<option value={50}>50</option>
								<option value={100}>100</option>
								<option value={200}>200</option>
								<option value={500}>500</option>
								<option value={1000}>1000</option>
							</select>
						</div>

						<div className="control-group">
							<label className="checkbox-label">
								<input
									type="checkbox"
									checked={autoRefresh}
									onChange={(e) => setAutoRefresh(e.target.checked)}
								/>
								<span>Auto-refresh (5s)</span>
							</label>
						</div>

						<button className="btn btn-secondary btn-small" onClick={loadLogs}>
							🔄 Refresh
						</button>

						<button className="btn btn-danger btn-small" onClick={handleClearLogs}>
							🗑️ Clear Logs
						</button>
					</div>

					{/* Logs Display */}
					<div className="logs-container">
						{loading ? (
							<div className="loading-container">
								<div className="loading-spinner"></div>
								<p>Loading logs...</p>
							</div>
						) : logs.length === 0 ? (
							<div className="empty-state">
								<p>No authentication logs found</p>
							</div>
						) : (
							<div className="log-entries">
								{logs.map((line, index) => {
									const parsed = parseLogLine(line);

									if (parsed.raw) {
										return (
											<div key={index} className="log-entry">
												<pre>{parsed.raw}</pre>
											</div>
										);
									}

									return (
										<div key={index} className="log-entry">
											<span className="log-timestamp">
												{new Date(parsed.timestamp).toLocaleString()}
											</span>
											<span
												className="log-level"
												style={{ backgroundColor: getLevelColor(parsed.level) }}
											>
												{parsed.level}
											</span>
											<span className="log-event">{parsed.event}</span>
											{parsed.details && <span className="log-details">{parsed.details}</span>}
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>

				<div className="modal-footer">
					<button className="btn btn-secondary" onClick={onClose}>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}

export default AuthLogsModal;

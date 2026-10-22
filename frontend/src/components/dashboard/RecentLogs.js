import React from "react";

// SQLite CURRENT_TIMESTAMP is UTC without a zone marker
const parseLogTime = (value) => new Date(value.replace(" ", "T") + "Z");

function formatRelative(date) {
	const minutes = Math.round((Date.now() - date.getTime()) / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return date.toLocaleDateString();
}

const STATUS = {
	success: { className: "status-success", label: "✓ Success" },
	persistence: { className: "status-warning", label: "🔁 Persistence" },
	failed: { className: "status-error", label: "✗ Failed" },
};

function RecentLogs({ logs, onViewAll }) {
	return (
		<section className="widget">
			<div className="widget-header">
				<h3>Recent Executions</h3>
				<button className="widget-link" onClick={onViewAll}>
					All logs →
				</button>
			</div>

			{logs.length === 0 ? (
				<p className="widget-empty">No tasks have run yet</p>
			) : (
				<ul className="widget-list">
					{logs.map((log) => {
						const executedAt = parseLogTime(log.executed_at);
						const status = STATUS[log.status] || STATUS.failed;
						return (
							<li key={log.id} className="widget-list-item">
								<span className={`status-badge log-status ${status.className}`}>{status.label}</span>
								<div className="widget-list-main">
									<div className="widget-list-title">
										{log.task_name || `Deleted task #${log.task_id}`}
									</div>
									{log.error_message && (
										<div className="widget-list-meta log-message" title={log.error_message}>
											{log.error_message}
										</div>
									)}
								</div>
								<span className="widget-list-time" title={executedAt.toLocaleString()}>
									{formatRelative(executedAt)}
								</span>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

export default RecentLogs;

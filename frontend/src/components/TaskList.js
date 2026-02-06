import React from "react";

function TaskList({ tasks, onEdit, onDelete, onToggle, onExecute }) {
	if (tasks.length === 0) {
		return (
			<div className="empty-state">
				<div className="empty-icon">📅</div>
				<h3>No Scheduled Tasks</h3>
				<p>Create your first task to automate your Powerwall settings</p>
			</div>
		);
	}

	const formatTime = (time) => {
		const [hours, minutes] = time.split(":");
		const hour = parseInt(hours);
		const ampm = hour >= 12 ? "PM" : "AM";
		const displayHour = hour % 12 || 12;
		return `${displayHour}:${minutes} ${ampm}`;
	};

	const getModeDisplay = (mode) => {
		return mode === "self_powered" ? "Self-Powered" : "Time-Based Control";
	};

	const getStormWatchDisplay = (stormWatch) => {
		if (stormWatch === "enable") return "⛈️ Enable";
		if (stormWatch === "disable") return "☀️ Disable";
		return "➖ No Change";
	};

	const getStormWatchIcon = (stormWatch) => {
		if (stormWatch === "enable") return "⛈️";
		if (stormWatch === "disable") return "☀️";
		return "➖";
	};

	return (
		<div className="task-list">
			{tasks.map((task) => (
				<div key={task.id} className={`task-card ${task.enabled ? "" : "task-disabled"}`}>
					<div className="task-header">
						<div className="task-title-section">
							<h3>{task.name}</h3>
							<div className="task-status-badges">
								<span
									className={`task-status ${task.enabled ? "status-active" : "status-inactive"}`}
								>
									{task.enabled ? "Active" : "Inactive"}
								</span>
								{task.is_retrying && (
									<span className="task-status status-retrying">🔄 Retrying</span>
								)}
							</div>
						</div>
						<div className="task-actions">
							<button className="btn-icon" onClick={() => onExecute(task.id)} title="Execute Now">
								▶️
							</button>
							<button
								className="btn-icon"
								onClick={() => onToggle(task.id)}
								title={task.enabled ? "Disable" : "Enable"}
							>
								{task.enabled ? "⏸️" : "▶️"}
							</button>
							<button className="btn-icon" onClick={() => onEdit(task)} title="Edit">
								✏️
							</button>
							<button
								className="btn-icon btn-danger"
								onClick={() => onDelete(task.id)}
								title="Delete"
							>
								🗑️
							</button>
						</div>
					</div>

					<div className="task-details">
						<div className="task-detail-item">
							<span className="detail-icon">🕐</span>
							<div>
								<div className="detail-label">Execution Time</div>
								<div className="detail-value">{formatTime(task.time)}</div>
							</div>
						</div>

						<div className="task-detail-item">
							<span className="detail-icon">⚙️</span>
							<div>
								<div className="detail-label">Operation Mode</div>
								<div className="detail-value">{getModeDisplay(task.mode)}</div>
							</div>
						</div>

						<div className="task-detail-item">
							<span className="detail-icon">🔋</span>
							<div>
								<div className="detail-label">Backup Reserve</div>
								<div className="detail-value">{task.backup_reserve}%</div>
							</div>
						</div>

						{task.storm_watch && task.storm_watch !== "no_change" && (
							<div className="task-detail-item">
								<span className="detail-icon">{getStormWatchIcon(task.storm_watch)}</span>
								<div>
									<div className="detail-label">Storm Watch</div>
									<div className="detail-value">{getStormWatchDisplay(task.storm_watch)}</div>
								</div>
							</div>
						)}
					</div>

					<div className="task-footer">
						<small>Created: {new Date(task.created_at).toLocaleDateString()}</small>
						<small>Updated: {new Date(task.updated_at).toLocaleDateString()}</small>
					</div>
				</div>
			))}
		</div>
	);
}

export default TaskList;

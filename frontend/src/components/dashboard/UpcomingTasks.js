import React, { useEffect, useState } from "react";

// Tasks run daily at HH:MM (server time); find the next occurrence from now
function getNextRun(time, now) {
	const [hours, minutes] = time.split(":").map(Number);
	const next = new Date(now);
	next.setHours(hours, minutes, 0, 0);
	if (next <= now) next.setDate(next.getDate() + 1);
	return next;
}

function formatCountdown(ms) {
	const totalMinutes = Math.max(Math.round(ms / 60000), 0);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours === 0) return `in ${minutes}m`;
	return `in ${hours}h ${minutes}m`;
}

const MODE_LABELS = {
	self_powered: "Self-Powered",
	time_based_control: "Time-Based",
};

function UpcomingTasks({ tasks, onViewAll }) {
	const [now, setNow] = useState(new Date());

	// Keep countdowns current
	useEffect(() => {
		const interval = setInterval(() => setNow(new Date()), 30000);
		return () => clearInterval(interval);
	}, []);

	const upcoming = tasks
		.filter((task) => task.enabled)
		.map((task) => ({ ...task, nextRun: getNextRun(task.time, now) }))
		.sort((a, b) => a.nextRun - b.nextRun)
		.slice(0, 6);

	const disabledCount = tasks.filter((task) => !task.enabled).length;

	return (
		<section className="widget">
			<div className="widget-header">
				<h3>Upcoming Tasks</h3>
				<button className="widget-link" onClick={onViewAll}>
					Manage →
				</button>
			</div>

			{upcoming.length === 0 ? (
				<p className="widget-empty">No enabled tasks scheduled</p>
			) : (
				<ul className="widget-list">
					{upcoming.map((task) => (
						<li key={task.id} className="widget-list-item">
							<div className="upcoming-time">
								<span className="upcoming-clock">
									{task.nextRun.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
								</span>
								<span className="upcoming-countdown">
									{task.nextRun.getDate() !== now.getDate() ? "Tomorrow · " : ""}
									{formatCountdown(task.nextRun - now)}
								</span>
							</div>
							<div className="widget-list-main">
								<div className="widget-list-title">
									{task.name}
									{task.is_retrying && (
										<span className="task-status status-retrying">🔄 Retrying</span>
									)}
									{task.is_persisting && (
										<span className="task-status status-retrying">🔁 Persisting</span>
									)}
								</div>
								<div className="widget-list-meta">
									{MODE_LABELS[task.mode] || task.mode} · {task.backup_reserve}% reserve
									{task.storm_watch === "enable" &&
										(task.auto_storm_watch ? " · ⛈️ Auto Storm Watch" : " · ⛈️ Storm Watch on")}
									{task.storm_watch === "disable" && " · ☀️ Storm Watch off"}
								</div>
							</div>
						</li>
					))}
				</ul>
			)}

			{disabledCount > 0 && (
				<p className="widget-footnote">
					{disabledCount} disabled task{disabledCount === 1 ? "" : "s"} not shown
				</p>
			)}
		</section>
	);
}

export default UpcomingTasks;

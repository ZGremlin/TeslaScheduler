import React, { useState, useEffect } from "react";
import "./styles/App.css";
import AuthenticationModal from "./components/AuthenticationModal";
import AuthLogsModal from "./components/AuthLogsModal";
import TaskList from "./components/TaskList";
import TaskModal from "./components/TaskModal";
import PowerwallStatus from "./components/PowerwallStatus";
import ExecutionLogs from "./components/ExecutionLogs";
import TokenStatus from "./components/TokenStatus";
import * as api from "./services/api";

function App() {
	const [showAuthModal, setShowAuthModal] = useState(false);
	const [showAuthLogsModal, setShowAuthLogsModal] = useState(false);
	const [showTaskModal, setShowTaskModal] = useState(false);
	const [editingTask, setEditingTask] = useState(null);
	const [tasks, setTasks] = useState([]);
	const [config, setConfig] = useState(null);
	const [authStatus, setAuthStatus] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [activeTab, setActiveTab] = useState("tasks");

	useEffect(() => {
		loadInitialData();
	}, []);

	const loadInitialData = async () => {
		try {
			setLoading(true);
			const [configRes, authRes, tasksRes] = await Promise.all([
				api.getConfig(),
				api.getAuthStatus(),
				api.getTasks(),
			]);

			setConfig(configRes.data);
			setAuthStatus(authRes.data);
			setTasks(tasksRes.data);

			// Show auth modal if not authenticated
			if (!authRes.data.authenticated) {
				setShowAuthModal(true);
			}
		} catch (err) {
			setError("Failed to load initial data");
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	const handleLogin = async (authCode) => {
		try {
			await api.completeAuth(authCode);
			const authRes = await api.getAuthStatus();
			const configRes = await api.getConfig();
			setAuthStatus(authRes.data);
			setConfig(configRes.data);
			setShowAuthModal(false);
		} catch (err) {
			throw new Error("Authentication failed: " + err.response?.data?.error || err.message);
		}
	};

	const handleCreateTask = () => {
		setEditingTask(null);
		setShowTaskModal(true);
	};

	const handleEditTask = (task) => {
		setEditingTask(task);
		setShowTaskModal(true);
	};

	const handleTaskSave = async (taskData) => {
		try {
			if (editingTask) {
				await api.updateTask(editingTask.id, taskData);
			} else {
				await api.createTask(taskData);
			}

			const tasksRes = await api.getTasks();
			setTasks(tasksRes.data);
			setShowTaskModal(false);
			setEditingTask(null);
		} catch (err) {
			alert("Failed to save task: " + err.message);
		}
	};

	const handleDeleteTask = async (taskId) => {
		if (!window.confirm("Are you sure you want to delete this task?")) {
			return;
		}

		try {
			await api.deleteTask(taskId);
			const tasksRes = await api.getTasks();
			setTasks(tasksRes.data);
		} catch (err) {
			alert("Failed to delete task: " + err.message);
		}
	};

	const handleToggleTask = async (taskId) => {
		try {
			await api.toggleTask(taskId);
			const tasksRes = await api.getTasks();
			setTasks(tasksRes.data);
		} catch (err) {
			alert("Failed to toggle task: " + err.message);
		}
	};

	const handleExecuteTask = async (taskId) => {
		if (!window.confirm("Execute this task now?")) {
			return;
		}

		try {
			await api.executeTask(taskId);
			alert("Task executed successfully!");
		} catch (err) {
			alert("Failed to execute task: " + err.message);
		}
	};

	if (loading) {
		return (
			<div className="app">
				<div className="loading-container">
					<div className="loading-spinner"></div>
					<p>Loading Tesla Powerwall Scheduler...</p>
				</div>
			</div>
		);
	}

	const isConfigured = config && config.site_id;
	const isAuthenticated = authStatus && authStatus.authenticated;

	return (
		<div className="app">
			<header className="app-header">
				<div className="header-content">
					<div className="header-left">
						<div className="logo">
							<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path
									d="M12 2L2 7L12 12L22 7L12 2Z"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinejoin="round"
								/>
								<path
									d="M2 17L12 22L22 17"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
								<path
									d="M2 12L12 17L22 12"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</div>
						<div className="header-title">
							<h1>Powerwall Scheduler</h1>
							<p>Automated Energy Management</p>
						</div>
					</div>
					<div className="header-right">
						<div className="status-indicators">
							{isConfigured && (
								<div className="status-badge status-success">
									✓ Site: {config.site_name || "Configured"}
								</div>
							)}
							<div
								className={`status-badge ${isAuthenticated ? "status-success" : "status-error"}`}
							>
								{isAuthenticated ? "✓ Authenticated" : "✗ Not Authenticated"}
							</div>
						</div>
						<button
							className="btn btn-secondary btn-small"
							onClick={() => setShowAuthLogsModal(true)}
							title="View Authentication Logs"
						>
							📋 Logs
						</button>
						{!isAuthenticated && (
							<button className="btn btn-primary" onClick={() => setShowAuthModal(true)}>
								🔐 Login
							</button>
						)}
					</div>
				</div>
			</header>

			<nav className="app-nav">
				<button
					className={`nav-btn ${activeTab === "tasks" ? "active" : ""}`}
					onClick={() => setActiveTab("tasks")}
				>
					<span className="nav-icon">📅</span>
					<span>Scheduled Tasks</span>
				</button>
				<button
					className={`nav-btn ${activeTab === "status" ? "active" : ""}`}
					onClick={() => setActiveTab("status")}
					disabled={!isAuthenticated}
				>
					<span className="nav-icon">⚡</span>
					<span>Powerwall Status</span>
				</button>
				<button
					className={`nav-btn ${activeTab === "logs" ? "active" : ""}`}
					onClick={() => setActiveTab("logs")}
				>
					<span className="nav-icon">📊</span>
					<span>Execution Logs</span>
				</button>
			</nav>

			<main className="app-main">
				{activeTab === "tasks" && (
					<div className="tab-content">
						{isAuthenticated && <TokenStatus />}

						<div className="section-header">
							<h2>Scheduled Tasks</h2>
							<button
								className="btn btn-primary"
								onClick={handleCreateTask}
								disabled={!isAuthenticated}
							>
								+ New Task
							</button>
						</div>
						<TaskList
							tasks={tasks}
							onEdit={handleEditTask}
							onDelete={handleDeleteTask}
							onToggle={handleToggleTask}
							onExecute={handleExecuteTask}
						/>
					</div>
				)}

				{activeTab === "status" && isAuthenticated && (
					<div className="tab-content">
						<PowerwallStatus />
					</div>
				)}

				{activeTab === "logs" && (
					<div className="tab-content">
						<ExecutionLogs tasks={tasks} />
					</div>
				)}
			</main>

			{showAuthModal && (
				<AuthenticationModal onLogin={handleLogin} onClose={() => setShowAuthModal(false)} />
			)}

			{showAuthLogsModal && <AuthLogsModal onClose={() => setShowAuthLogsModal(false)} />}

			{showTaskModal && (
				<TaskModal
					task={editingTask}
					onSave={handleTaskSave}
					onClose={() => {
						setShowTaskModal(false);
						setEditingTask(null);
					}}
				/>
			)}
		</div>
	);
}

export default App;

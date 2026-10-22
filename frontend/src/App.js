import React, { useState, useEffect } from "react";
import "./styles/App.css";
import "./styles/Dashboard.css";
import Dashboard from "./components/Dashboard";
import AuthenticationModal from "./components/AuthenticationModal";
import AuthLogsModal from "./components/AuthLogsModal";
import AccountModal from "./components/AccountModal";
import SiteSwitcher from "./components/SiteSwitcher";
import TaskList from "./components/TaskList";
import TaskModal from "./components/TaskModal";
import PowerwallStatus from "./components/PowerwallStatus";
import StormWatchBadge from "./components/StormWatchBadge";
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
	const [activeTab, setActiveTab] = useState("dashboard");
	const [activeSiteId, setActiveSiteId] = useState(null);
	const [showAccountModal, setShowAccountModal] = useState(false);
	const [credentialsVersion, setCredentialsVersion] = useState(0);

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

			// Show auth modal if not authenticated; the dashboard needs a login
			if (!authRes.data.authenticated) {
				setShowAuthModal(true);
				setActiveTab("tasks");
			}
		} catch (err) {
			setError("Failed to load initial data");
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	const handleLogin = async () => {
		try {
			const [authRes, configRes, tasksRes] = await Promise.all([
				api.getAuthStatus(),
				api.getConfig(),
				api.getTasks(),
			]);

			setAuthStatus(authRes.data);
			setConfig(configRes.data);
			setTasks(tasksRes.data);
			setShowAuthModal(false);
			// Remount the site switcher and storm watch badge with the new credentials
			setCredentialsVersion((version) => version + 1);
		} catch (err) {
			throw new Error("Failed to reload after authentication: " + err.message);
		}
	};

	const handleCredentialsChanged = async () => {
		await handleLogin();
		setShowAccountModal(false);
	};

	const handleReauthenticate = () => {
		setShowAccountModal(false);
		setShowAuthModal(true);
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

	const handleTogglePersistence = async (taskId) => {
		try {
			await api.toggleTaskPersistence(taskId);
			const tasksRes = await api.getTasks();
			setTasks(tasksRes.data);
		} catch (err) {
			alert("Failed to toggle persistence: " + (err.response?.data?.error || err.message));
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

	const handleSiteChange = async (siteId) => {
		console.log("Site switched to:", siteId);
		setActiveSiteId(siteId);

		// Reload tasks for the new active site
		try {
			const tasksRes = await api.getTasks();
			setTasks(tasksRes.data);
		} catch (error) {
			console.error("Failed to reload tasks after site switch:", error);
			setError("Failed to load tasks for selected site");
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
							{isAuthenticated && (
								<SiteSwitcher key={credentialsVersion} onSiteChange={handleSiteChange} />
							)}
							{isAuthenticated && isConfigured && (
								<StormWatchBadge key={`${credentialsVersion}-${activeSiteId}`} />
							)}
							<button
								className={`status-badge status-badge-button ${isAuthenticated ? "status-success" : "status-error"}`}
								onClick={() => setShowAccountModal(true)}
								title="View or edit Tesla tokens and site ID, log out or re-authenticate"
							>
								{isAuthenticated ? "✓ Authenticated" : "✗ Not Authenticated"}
							</button>
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
					className={`nav-btn ${activeTab === "dashboard" ? "active" : ""}`}
					onClick={() => setActiveTab("dashboard")}
					disabled={!isAuthenticated}
				>
					<span className="nav-icon">📈</span>
					<span>Dashboard</span>
				</button>
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
				{activeTab === "dashboard" && isAuthenticated && (
					<div className="tab-content">
						<Dashboard
							key={`${credentialsVersion}-${activeSiteId}`}
							tasks={tasks}
							onNavigate={setActiveTab}
						/>
					</div>
				)}

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
							onTogglePersistence={handleTogglePersistence}
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

			{showAccountModal && (
				<AccountModal
					onClose={() => setShowAccountModal(false)}
					onSaved={handleCredentialsChanged}
					onLogout={handleCredentialsChanged}
					onReauthenticate={handleReauthenticate}
				/>
			)}

			{showAuthLogsModal &&<AuthLogsModal onClose={() => setShowAuthLogsModal(false)} />}

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

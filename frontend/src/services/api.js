import axios from "axios";

const API_BASE_URL =
	process.env.REACT_APP_API_URL ||
	window.location.protocol + "//" + window.location.host.replace(":3000", ":3001") + "/api";

const api = axios.create({
	baseURL: API_BASE_URL,
	headers: {
		"Content-Type": "application/json",
	},
});

// Authentication
export const getAuthUrl = () => api.get("/auth/url");
export const completeAuth = (code) => api.post("/auth/callback", { code });
export const getAuthStatus = () => api.get("/auth/status");
export const getTokenStatus = () => api.get("/auth/token-status");
export const refreshToken = () => api.post("/auth/refresh");
export const getAuthLogs = (lines = 100) => api.get(`/auth/logs?lines=${lines}`);
export const getAuthLogStats = () => api.get("/auth/logs/stats");
export const clearAuthLogs = () => api.delete("/auth/logs");

// Configuration
export const getConfig = () => api.get("/config");

// Tasks
export const getTasks = () => api.get("/tasks");
export const getTask = (id) => api.get(`/tasks/${id}`);
export const createTask = (task) => api.post("/tasks", task);
export const updateTask = (id, task) => api.put(`/tasks/${id}`, task);
export const deleteTask = (id) => api.delete(`/tasks/${id}`);
export const toggleTask = (id) => api.patch(`/tasks/${id}/toggle`);
export const executeTask = (id) => api.post(`/tasks/${id}/execute`);

// Logs
export const getLogs = (taskId = null, limit = 100) => {
	const params = new URLSearchParams();
	if (taskId) params.append("task_id", taskId);
	if (limit) params.append("limit", limit);
	return api.get(`/logs?${params.toString()}`);
};

// Powerwall Status
export const getPowerwallStatus = () => api.get("/powerwall/status");
export const getEnergySites = () => api.get("/powerwall/sites");

export default api;

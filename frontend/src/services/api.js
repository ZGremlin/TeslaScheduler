import axios from "axios";

// Determine API base URL
const getApiBaseUrl = () => {
	// 1. Environment variable (highest priority) - set via REACT_APP_API_URL
	if (process.env.REACT_APP_API_URL) {
		return process.env.REACT_APP_API_URL;
	}

	// 2. Check if running in production (built and served from backend)
	//    In this case, use relative path since frontend is served from same origin
	if (process.env.NODE_ENV === "production") {
		return "/api";
	}

	// 3. Development mode - try to detect backend on current network
	//    Use current hostname instead of hardcoded localhost
	const hostname = window.location.hostname;

	// If accessing via IP address (e.g., 192.168.x.x), use that IP for API
	// If accessing via localhost, use localhost for API
	const apiUrl = `http://${hostname}:3001/api`;

	return apiUrl;
};

const API_BASE_URL = getApiBaseUrl();

console.log("API Base URL:", API_BASE_URL);
const api = axios.create({
	baseURL: API_BASE_URL,
	headers: {
		"Content-Type": "application/json",
	},
});

// Authentication
export const getAuthUrl = () => api.get("/auth/url");
export const getAuthStatus = () => api.get("/auth/status");
export const getTokenStatus = () => api.get("/auth/token-status");
export const refreshToken = () => api.post("/auth/refresh");
export const getAuthLogs = (lines = 100) => api.get(`/auth/logs?lines=${lines}`);
export const getAuthLogStats = () => api.get("/auth/logs/stats");
export const clearAuthLogs = () => api.delete("/auth/logs");

// Configuration
export const getConfig = () => api.get("/config");

// Sites
export const getSites = () => api.get("/sites");
export const switchSite = (siteId) => api.post("/sites/switch", { site_id: siteId });

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

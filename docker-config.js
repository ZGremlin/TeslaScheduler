module.exports = {
	apps: [
		{
			name: "backend-api",
			script: "server.js",
			cwd: "./backend",
			env: { NODE_ENV: "production", PORT: 3001 },
		},
		{
			name: "frontend-app",
			script: "npm",
			args: "start",
			cwd: "./frontend",
			env: { NODE_ENV: "production", PORT: 3000 },
		},
	],
};

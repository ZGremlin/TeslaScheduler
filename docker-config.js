module.exports = {
	apps: [
		{
			name: "backend-api",
			script: "server.js",
			cwd: "/app/backend", // Absolute path inside container
			env: {
				NODE_ENV: "production",
				PORT: 3001, // Note: Ensure your Docker run maps 3001
			},
		},
		{
			name: "frontend-app",
			script: "npm",
			args: "start",
			cwd: "/app/frontend", // Absolute path inside container
			env: {
				NODE_ENV: "production",
				PORT: 3000,
			},
		},
	],
};

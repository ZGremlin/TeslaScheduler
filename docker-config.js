module.exports = {
	apps: [
		{
			name: "frontend-api",
			script: "./src/server-a.js",
			env: { NODE_ENV: "production", PORT: 3000 },
		},
		{
			name: "background-worker",
			script: "./src/server-b.js",
			env: { NODE_ENV: "production", PORT: 4000 },
		},
	],
};

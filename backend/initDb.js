const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "powerwall.db");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
	// Create authentication tokens table
	db.run(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

	// Create scheduled tasks table
	db.run(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      time TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('self_powered', 'time_based_control')),
      backup_reserve INTEGER NOT NULL CHECK(backup_reserve >= 0 AND backup_reserve <= 100),
      storm_watch TEXT CHECK(storm_watch IN ('enable', 'disable', 'no_change')),
      auto_storm_watch INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

	// Create task execution log table
	db.run(`
    CREATE TABLE IF NOT EXISTS task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL,
      error_message TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
    )
  `);

	// Create Powerwall configuration table
	db.run(`
    CREATE TABLE IF NOT EXISTS powerwall_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      site_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

	console.log("Database tables created successfully!");
});

db.close((err) => {
	if (err) {
		console.error("Error closing database:", err);
	} else {
		console.log("Database connection closed.");
	}
});

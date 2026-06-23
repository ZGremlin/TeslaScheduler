const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "powerwall.db");
const db = new sqlite3.Database(dbPath);

console.log("Running migration: Add site_id to scheduled_tasks");

db.serialize(() => {
	// Check if column already exists
	db.all("PRAGMA table_info(scheduled_tasks)", (err, columns) => {
		if (err) {
			console.error("Error checking table schema:", err);
			db.close();
			return;
		}

		const hasSiteId = columns.some((col) => col.name === "site_id");

		if (hasSiteId) {
			console.log("✓ site_id column already exists, skipping migration");
			db.close();
			return;
		}

		// Add the column
		db.run(`ALTER TABLE scheduled_tasks ADD COLUMN site_id TEXT`, (err) => {
			if (err) {
				console.error("✗ Migration failed:", err);
				db.close();
				return;
			}

			console.log("✓ Added site_id column to scheduled_tasks");

			// Get the current active site (most recently updated)
			db.get(
				"SELECT site_id FROM powerwall_config ORDER BY updated_at DESC LIMIT 1",
				(err, config) => {
					if (err || !config) {
						console.warn(
							"⚠ No site found in powerwall_config, tasks will need site_id set manually",
						);
						db.close();
						return;
					}

					// Assign all existing tasks to the current active site
					db.run(
						"UPDATE scheduled_tasks SET site_id = ? WHERE site_id IS NULL",
						[config.site_id],
						function (err) {
							if (err) {
								console.error("✗ Failed to assign tasks to site:", err);
							} else {
								console.log(
									`✓ Assigned ${this.changes} existing task(s) to site ${config.site_id}`,
								);
							}
							db.close();
						},
					);
				},
			);
		});
	});
});

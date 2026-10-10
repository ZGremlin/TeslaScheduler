const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "powerwall.db");
const db = new sqlite3.Database(dbPath);

console.log("Running migration: Add persistence column to scheduled_tasks");

db.serialize(() => {
	// Check if column already exists
	db.all("PRAGMA table_info(scheduled_tasks)", (err, columns) => {
		if (err) {
			console.error("Error checking table schema:", err);
			db.close();
			return;
		}

		const hasPersistence = columns.some((col) => col.name === "persistence");

		if (hasPersistence) {
			console.log("✓ persistence column already exists, skipping migration");
			db.close();
			return;
		}

		// Add the column
		db.run(
			`
      ALTER TABLE scheduled_tasks
      ADD COLUMN persistence INTEGER DEFAULT 0
    `,
			(err) => {
				if (err) {
					console.error("✗ Migration failed:", err);
				} else {
					console.log("✓ Migration successful: Added persistence column");
				}
				db.close();
			},
		);
	});
});

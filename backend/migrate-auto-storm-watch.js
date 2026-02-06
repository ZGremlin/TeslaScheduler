const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "powerwall.db");
const db = new sqlite3.Database(dbPath);

console.log("Running migration: Add auto_storm_watch column to scheduled_tasks");

db.serialize(() => {
	// Check if column already exists
	db.all("PRAGMA table_info(scheduled_tasks)", (err, columns) => {
		if (err) {
			console.error("Error checking table schema:", err);
			db.close();
			return;
		}

		const hasAutoStormWatch = columns.some((col) => col.name === "auto_storm_watch");

		if (hasAutoStormWatch) {
			console.log("✓ auto_storm_watch column already exists, skipping migration");
			db.close();
			return;
		}

		// Add the column
		db.run(
			`
      ALTER TABLE scheduled_tasks 
      ADD COLUMN auto_storm_watch INTEGER DEFAULT 0
    `,
			(err) => {
				if (err) {
					console.error("✗ Migration failed:", err);
				} else {
					console.log("✓ Migration successful: Added auto_storm_watch column");

					// Set default value for existing rows
					db.run(
						`
          UPDATE scheduled_tasks 
          SET auto_storm_watch = 0 
          WHERE auto_storm_watch IS NULL
        `,
						(err) => {
							if (err) {
								console.error("✗ Failed to set default values:", err);
							} else {
								console.log("✓ Set default auto_storm_watch values for existing tasks");
							}
							db.close();
						},
					);
				}
			},
		);
	});
});

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "powerwall.db");
const db = new sqlite3.Database(dbPath);

console.log("Running migration: Add storm_watch column to scheduled_tasks");

db.serialize(() => {
	// Check if column already exists
	db.all("PRAGMA table_info(scheduled_tasks)", (err, columns) => {
		if (err) {
			console.error("Error checking table schema:", err);
			db.close();
			return;
		}

		const hasStormWatch = columns.some((col) => col.name === "storm_watch");

		if (hasStormWatch) {
			console.log("✓ storm_watch column already exists, skipping migration");
			db.close();
			return;
		}

		// Add the column
		db.run(
			`
      ALTER TABLE scheduled_tasks 
      ADD COLUMN storm_watch TEXT CHECK(storm_watch IN ('enable', 'disable', 'no_change'))
    `,
			(err) => {
				if (err) {
					console.error("✗ Migration failed:", err);
				} else {
					console.log("✓ Migration successful: Added storm_watch column");

					// Set default value for existing rows
					db.run(
						`
          UPDATE scheduled_tasks 
          SET storm_watch = 'no_change' 
          WHERE storm_watch IS NULL
        `,
						(err) => {
							if (err) {
								console.error("✗ Failed to set default values:", err);
							} else {
								console.log("✓ Set default storm_watch values for existing tasks");
							}
							db.close();
						},
					);
				}
			},
		);
	});
});

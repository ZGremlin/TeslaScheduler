# Upgrade Guide - Storm Watch Feature

If you're upgrading from a previous version that doesn't have the Storm Watch feature, you need to run a database migration.

## For Existing Installations

### Step 1: Stop the Application

```bash
# Stop the backend server (Ctrl+C if running in terminal)
```

### Step 2: Run the Migration

```bash
cd backend
npm run migrate
```

You should see:

```
Running migration: Add storm_watch column to scheduled_tasks
✓ Migration successful: Added storm_watch column
✓ Set default storm_watch values for existing tasks
```

If you see "✓ storm_watch column already exists, skipping migration", your database is already up to date.

### Step 3: Restart the Application

```bash
# Restart backend
npm start
```

### Step 4: Verify

1. Open the frontend
2. Click "+ New Task"
3. You should see the new "Storm Watch Mode" dropdown

## For New Installations

No migration needed! The database will be created with the Storm Watch column automatically when you run:

```bash
npm run init-db
```

## What Changed

### Database Schema

A new column was added to the `scheduled_tasks` table:

```sql
ALTER TABLE scheduled_tasks
ADD COLUMN storm_watch TEXT CHECK(storm_watch IN ('enable', 'disable', 'no_change'))
```

### Default Value

All existing tasks will have `storm_watch` set to `'no_change'`, which means they won't modify Storm Watch settings when they execute.

### API Changes

**Task Creation:**

```json
POST /api/tasks
{
  "name": "Morning Mode",
  "time": "06:00",
  "mode": "self_powered",
  "backup_reserve": 20,
  "storm_watch": "no_change"  // NEW FIELD
}
```

**Task Update:**

```json
PUT /api/tasks/:id
{
  "name": "Morning Mode",
  "time": "06:00",
  "mode": "self_powered",
  "backup_reserve": 20,
  "storm_watch": "enable",  // NEW FIELD
  "enabled": 1
}
```

## Troubleshooting

### Migration fails with "table scheduled_tasks has no column named storm_watch"

This error during task execution means the migration didn't complete. Run:

```bash
cd backend
npm run migrate
```

### Tasks show "undefined" for Storm Watch

Clear your browser cache and refresh the page. The frontend may be caching the old task structure.

### Manual Migration (if script fails)

If the migration script fails, you can manually update the database:

```bash
cd backend
sqlite3 powerwall.db

# Run these commands in the SQLite prompt:
ALTER TABLE scheduled_tasks ADD COLUMN storm_watch TEXT CHECK(storm_watch IN ('enable', 'disable', 'no_change'));
UPDATE scheduled_tasks SET storm_watch = 'no_change' WHERE storm_watch IS NULL;
.quit
```

## Rollback (if needed)

If you need to remove the Storm Watch feature:

```bash
cd backend
sqlite3 powerwall.db

# Run this in the SQLite prompt:
# Note: SQLite doesn't support DROP COLUMN easily, so we recreate the table

BEGIN TRANSACTION;

CREATE TABLE scheduled_tasks_backup AS
SELECT id, name, time, mode, backup_reserve, enabled, created_at, updated_at
FROM scheduled_tasks;

DROP TABLE scheduled_tasks;

CREATE TABLE scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  time TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('self_powered', 'time_based_control')),
  backup_reserve INTEGER NOT NULL CHECK(backup_reserve >= 0 AND backup_reserve <= 100),
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO scheduled_tasks SELECT * FROM scheduled_tasks_backup;
DROP TABLE scheduled_tasks_backup;

COMMIT;
.quit
```

Then restart the backend with the old code version.

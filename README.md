# Tesla Powerwall Scheduler

A full-stack application for automating Tesla Powerwall operation mode changes and backup reserve settings on a scheduled basis. Built with Node.js, SQLite, and React.

## Features

- 🔐 **Secure Authentication**: OAuth 2.0 with PKCE for secure access to Tesla's cloud API
- 🔄 **Automatic Token Refresh**: Tokens automatically refresh 2 hours before expiration with retry logic
- ⏰ **Scheduled Tasks**: Create daily scheduled tasks to automate Powerwall settings
- 🔁 **Task Retry Logic**: Failed tasks automatically retry every 10 minutes until next scheduled time
- ⚡ **Real-time Status**: Monitor your Powerwall's battery level, power flow, and operation mode
- 📊 **Execution Logs**: Track task execution history with success/failure status
- 🎨 **Modern UI**: Beautiful, responsive interface with dark mode design
- 🔧 **Robust Error Handling**: Automatic retry for both authentication and task execution

## System Architecture

### Backend (Node.js + Express)

- RESTful API for managing tasks and authentication
- SQLite database for persistent storage
- Node-cron for task scheduling
- **Automatic token refresh manager** - Refreshes tokens 2 hours before expiration
- **Retry logic** - Retries every 5 minutes if refresh fails
- Direct integration with Tesla's public cloud API

### Frontend (React)

- Single-page application with responsive design
- Real-time status monitoring
- Task management interface
- Execution log viewing

## Prerequisites

- Node.js 16.x or higher
- npm or yarn
- Tesla Powerwall installed on your local network
- Powerwall gateway IP address

## Installation

### 1. Clone or Extract the Project

```bash
cd tesla-powerwall-scheduler
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Initialize the Database

```bash
npm run init-db
```

This creates the SQLite database with the following tables:

- `auth_tokens` - Stores Tesla API authentication tokens
- `scheduled_tasks` - Stores scheduled automation tasks
- `task_logs` - Logs task execution history
- `powerwall_config` - Stores Powerwall gateway configuration

### 4. Start the Backend Server

```bash
npm start
```

The backend API will start on `http://localhost:3001`

For development with auto-restart:

```bash
npm run dev
```

### 5. Install Frontend Dependencies

Open a new terminal window:

```bash
cd frontend
npm install
```

### 6. Start the Frontend Development Server

```bash
npm start
```

The React app will start on `http://localhost:3000` and open in your browser.

## Configuration

### First-Time Setup

1. **Launch the Application**
   - Start both backend and frontend servers
   - Navigate to `http://localhost:3000`

2. **Authenticate with Tesla**
   - Click the "🔐 Login" button
   - A Tesla login page will open in a new window
   - Log in with your Tesla account credentials
   - After successful login, you'll be redirected to a blank page
   - Copy the authorization code from the URL (everything after `code=`)
   - Paste it into the application and complete authentication

3. **Automatic Site Detection**
   - The app will automatically detect your Powerwall sites
   - Your first site will be configured as the default

The authentication uses OAuth 2.0 with PKCE for secure access to Tesla's cloud API. Tokens are automatically refreshed when they expire.

## Token Refresh System

The application includes an intelligent token refresh manager that ensures uninterrupted access to your Powerwall:

### Automatic Refresh

- **Proactive Refresh**: Tokens are automatically refreshed **2 hours before expiration**
- **No Manual Intervention**: You never need to worry about expired tokens
- **Seamless Operation**: Tasks continue running without interruption

### Retry Logic

- **Automatic Retry**: If token refresh fails, the system retries every **5 minutes**
- **Persistent**: Will continue retrying for up to **8 hours** (100 attempts)
- **Logging**: All refresh attempts and failures are logged to the console

### Monitoring

- **Token Status Widget**: Displays current token health on the Tasks page
- **Shows**:
  - Time until expiration
  - Time until automatic refresh
  - Number of retry attempts (if any)
  - Current refresh status
- **Manual Refresh**: Button to manually trigger token refresh if needed

### Console Logging

The backend logs all token refresh activity:

```
Token refresh scheduled for: 1/15/2024, 10:30:00 AM
Time until refresh: 120 minutes
🔄 Refreshing authentication token...
✅ Token refreshed successfully
   New token expires at: 1/15/2024, 8:30:00 PM
```

If refresh fails:

```
❌ Token refresh failed: [error message]
⏳ Will retry in 5 minutes (attempt 1/100)
```

## Task Retry System

The scheduler includes intelligent retry logic to ensure tasks eventually succeed even if they fail initially:

### Automatic Retry on Failure

- **Immediate Logging**: Failures are logged immediately with error details
- **Retry Every 10 Minutes**: Failed tasks automatically retry every 10 minutes
- **Continues Until Success**: Retries continue until the task succeeds
- **Smart Cutoff**: Stops retrying when the next scheduled execution time approaches

### How It Works

```
Scheduled time: 6:00 AM
├──────┬──────┬──────┬──────┬──────┬──────┤
6:00   6:10   6:20   6:30   6:40   6:50   Next day 6:00
 ↓      ↓      ↓      ↓      ✓
Fail   Retry  Retry  Retry  Success
```

**Example Timeline:**

1. **6:00 AM**: Task scheduled to run, execution fails (network issue)
2. **6:10 AM**: Automatic retry #1, still fails
3. **6:20 AM**: Automatic retry #2, still fails
4. **6:30 AM**: Automatic retry #3, succeeds! ✓
5. Retry timer cleared, waits for next scheduled time (tomorrow 6:00 AM)

### Retry Behavior

**When Task Fails:**

- Error is logged to execution logs with timestamp and reason
- System calculates time until next scheduled execution
- If more than 10 minutes away, schedules retry in 10 minutes
- If less than 10 minutes away, waits for next scheduled time

**When Task Succeeds:**

- All retry timers for that task are cleared
- Task waits for next scheduled execution time
- Success is logged to execution logs

**Visual Indicator:**

- Tasks currently in retry mode show a **🔄 Retrying** badge
- Badge pulses to indicate active retry status
- Disappears when task succeeds or is disabled

### Console Output

```bash
❌ Task 1 failed: Request failed with status code 503
⏳ Task 1 will retry at 6:10:00 AM
🔁 Retrying task 1: "Morning Solar Mode"
✅ Task 1 executed successfully
```

## Usage

### Creating a Scheduled Task

1. Click the "+ New Task" button
2. Fill in the task details:
   - **Task Name**: Descriptive name (e.g., "Morning Solar Mode")
   - **Execution Time**: Time to run daily (24-hour format)
   - **Operation Mode**:
     - **Self-Powered**: Maximizes solar self-consumption
     - **Time-Based Control**: Optimizes for time-of-use rates
   - **Backup Reserve**: Minimum battery percentage to reserve (0-100%)
3. Click "Create Task"

### Managing Tasks

- **Enable/Disable**: Click the play/pause button to toggle task execution
- **Execute Now**: Click the play button (▶️) to run a task immediately
- **Edit**: Click the pencil icon to modify task settings
- **Delete**: Click the trash icon to remove a task

### Monitoring

- **Scheduled Tasks Tab**: View and manage all scheduled tasks
- **Powerwall Status Tab**: See real-time battery level, operation mode, and power flow
- **Execution Logs Tab**: Review task execution history and troubleshoot failures

## API Endpoints

### Authentication

- `GET /api/auth/url` - Get OAuth authorization URL
- `POST /api/auth/callback` - Exchange authorization code for tokens
- `GET /api/auth/status` - Check authentication status
- `GET /api/auth/token-status` - Get detailed token status (expiry, refresh schedule, retry count)
- `POST /api/auth/refresh` - Manually trigger token refresh

### Configuration

- `GET /api/config` - Get current site configuration

### Tasks

- `GET /api/tasks` - Get all tasks
- `GET /api/tasks/:id` - Get specific task
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `PATCH /api/tasks/:id/toggle` - Toggle task enabled status
- `POST /api/tasks/:id/execute` - Execute task immediately

### Logs

- `GET /api/logs` - Get execution logs (supports filtering by task_id)

### Powerwall

- `GET /api/powerwall/sites` - List all energy sites
- `GET /api/powerwall/status` - Get current Powerwall status

## Database Schema

### auth_tokens

```sql
CREATE TABLE auth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### scheduled_tasks

```sql
CREATE TABLE scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  time TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('self_powered', 'time_based_control')),
  backup_reserve INTEGER NOT NULL CHECK(backup_reserve >= 0 AND backup_reserve <= 100),
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### task_logs

```sql
CREATE TABLE task_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL,
  error_message TEXT,
  FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
)
```

### powerwall_config

```sql
CREATE TABLE powerwall_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  site_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)
```

## Troubleshooting

### Authentication Fails

- Ensure you're logging in with your Tesla account (not local gateway)
- Copy the entire authorization code from the URL after `code=`
- Make sure you complete the authorization in the popup window
- Try restarting the authentication flow if the code expired

### Tasks Not Executing

- Check if task shows **🔄 Retrying** badge (indicates automatic retry in progress)
- Review Execution Logs for specific error messages
- Failed tasks automatically retry every 10 minutes
- Verify your Tesla account has access to the Powerwall
- If task keeps failing, check Powerwall is online and accessible

### Cannot Connect to Backend

- Ensure the backend server is running on port 3001
- Check for port conflicts
- Review backend console logs for errors

## Security Considerations

- Uses OAuth 2.0 with PKCE for secure authentication
- Access tokens are stored in the local SQLite database
- Refresh tokens enable automatic token renewal
- Connects to Tesla's official cloud API
- All communication uses HTTPS
- Consider running the backend on a secure server
- Do not expose the backend API to the public internet without additional security measures
- Keep your SQLite database file secure (contains access tokens)

## Development

### Backend Development

```bash
cd backend
npm run dev  # Uses nodemon for auto-restart
```

### Frontend Development

```bash
cd frontend
npm start  # React development server with hot reload
```

### Building for Production

Frontend:

```bash
cd frontend
npm run build
```

This creates an optimized production build in the `build` folder.

## Technology Stack

### Backend

- **Express.js** - Web framework
- **SQLite3** - Database
- **node-cron** - Task scheduling
- **Axios** - HTTP client for Powerwall API
- **CORS** - Cross-origin resource sharing

### Frontend

- **React** - UI framework
- **Axios** - API client
- **CSS3** - Modern styling with CSS Grid/Flexbox

## License

This project is for personal use. Please respect Tesla's terms of service when using their API.

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues or questions:

1. Check the Execution Logs for error details
2. Review backend console output
3. Ensure all dependencies are installed correctly
4. Verify network connectivity to Powerwall

## Disclaimer

This application is not affiliated with or endorsed by Tesla, Inc. Use at your own risk. Always monitor your Powerwall's operation and have appropriate backup power safeguards in place.

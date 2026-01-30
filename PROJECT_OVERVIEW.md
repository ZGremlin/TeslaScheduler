# Tesla Powerwall Scheduler - Project Overview

## 🎯 Project Summary

A comprehensive full-stack automation system for scheduling Tesla Powerwall operation mode changes and backup reserve settings. The application provides a modern web interface for creating, managing, and monitoring scheduled tasks that automatically adjust your Powerwall's behavior throughout the day.

## 📁 Project Structure

```
tesla-powerwall-scheduler/
├── backend/                    # Node.js/Express API Server
│   ├── package.json           # Backend dependencies
│   ├── server.js              # Main Express server with REST API
│   ├── initDb.js              # Database initialization script
│   ├── database.js            # Database service layer
│   ├── teslaAPI.js            # Tesla Powerwall API integration
│   ├── taskScheduler.js       # Cron-based task scheduler
│   ├── .env.example           # Environment configuration template
│   └── powerwall.db           # SQLite database (created on init)
│
├── frontend/                   # React Application
│   ├── package.json           # Frontend dependencies
│   ├── public/
│   │   └── index.html         # HTML template
│   └── src/
│       ├── index.js           # React entry point
│       ├── App.js             # Main application component
│       ├── services/
│       │   └── api.js         # API client service
│       ├── components/
│       │   ├── ConfigurationModal.js    # Powerwall setup
│       │   ├── AuthenticationModal.js   # Login interface
│       │   ├── TaskModal.js             # Task creation/editing
│       │   ├── TaskList.js              # Task display grid
│       │   ├── PowerwallStatus.js       # Real-time monitoring
│       │   └── ExecutionLogs.js         # Execution history
│       └── styles/
│           └── App.css        # Complete styling
│
├── README.md                   # Comprehensive documentation
├── QUICKSTART.md              # Quick start guide
├── setup.sh                   # Automated installation script
└── .gitignore                 # Git ignore rules
```

## 🔧 Technology Stack

### Backend
- **Node.js + Express**: RESTful API server
- **SQLite3**: Lightweight database for persistent storage
- **node-cron**: Reliable task scheduling
- **Axios**: HTTP client for Powerwall communication
- **CORS**: Cross-origin resource sharing

### Frontend
- **React 18**: Modern component-based UI
- **Axios**: API communication
- **CSS3**: Modern responsive design with Grid/Flexbox
- **Custom Fonts**: Outfit + JetBrains Mono

## 🌟 Key Features

### 1. Scheduled Task Management
- Create unlimited daily scheduled tasks
- Set specific execution times (24-hour format)
- Choose between Self-Powered or Time-Based Control modes
- Configure backup reserve percentage (0-100%)
- Enable/disable tasks without deletion
- Immediate task execution for testing

### 2. Powerwall Integration
- Tesla's official cloud API (OAuth 2.0)
- Secure token-based authentication with automatic refresh
- Real-time status monitoring:
  - Battery level percentage
  - Current operation mode
  - Site information
  - Backup reserve setting
- Multi-site support (auto-detects all Powerwalls on account)

### 3. Execution Monitoring
- Complete task execution history
- Success/failure status tracking
- Error message logging
- Filter logs by specific task
- Detailed timestamps

### 4. User Experience
- Modern dark-themed interface
- Responsive design (mobile-friendly)
- Intuitive navigation
- Real-time status indicators
- Form validation
- Loading states and error handling

## 🗄️ Database Schema

### Tables

**auth_tokens**
- Stores Tesla API authentication tokens
- Tracks expiration times
- Single active token approach

**scheduled_tasks**
- Task configuration and metadata
- Enabled/disabled status
- Creation and update timestamps

**task_logs**
- Execution history with status
- Error messages for failures
- Foreign key to tasks

**powerwall_config**
- Gateway IP address
- Optional email reference

## 🔐 Security Features

- OAuth 2.0 with PKCE for secure authentication
- Official Tesla cloud API integration
- Token-based authentication
- Automatic token refresh
- Secure token storage in SQLite
- HTTPS communication with Tesla servers

## 📊 API Endpoints

### Configuration
- `GET /api/config` - Get site configuration

### Authentication
- `GET /api/auth/url` - Get OAuth URL
- `POST /api/auth/callback` - Complete OAuth
- `GET /api/auth/status` - Check auth status
- `POST /api/auth/refresh` - Refresh token

### Tasks
- `GET /api/tasks` - List all tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `PATCH /api/tasks/:id/toggle` - Toggle enabled
- `POST /api/tasks/:id/execute` - Execute now

### Monitoring
- `GET /api/powerwall/sites` - List sites
- `GET /api/powerwall/status` - Powerwall status
- `GET /api/logs` - Execution logs

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ installed
- Tesla account with Powerwall access
- Internet connection for Tesla API

### Installation
```bash
# Quick setup (Linux/Mac)
./setup.sh

# Or manual setup
cd backend && npm install && npm run init-db
cd ../frontend && npm install
```

### Running
```bash
# Terminal 1 - Backend
cd backend && npm start

# Terminal 2 - Frontend
cd frontend && npm start
```

### Configuration
1. Authenticate with Tesla account via OAuth
2. App automatically detects your Powerwall sites
3. Create your first scheduled task

## 💡 Use Cases

### Home Solar Optimization
- **6:00 AM**: Switch to Self-Powered mode (20% reserve)
- **6:00 PM**: Switch to Time-Based Control (30% reserve)

### Time-of-Use Rate Management
- **9:00 PM**: Begin charging from grid (Off-peak rates)
- **7:00 AM**: Stop grid charging (Peak rates begin)

### Seasonal Adjustments
- **Summer**: Higher backup reserve for AC loads
- **Winter**: Lower reserve for solar optimization

### Storm Preparation
- Manual execution to maximize battery charge
- Increase backup reserve to 100%

## 🎨 Design Philosophy

### Modern, Professional Interface
- Dark theme for reduced eye strain
- Gradient accents and shadows for depth
- Clean typography with distinctive fonts
- Smooth animations and transitions
- Card-based layout for information hierarchy

### Responsive & Accessible
- Mobile-first design approach
- Touch-friendly interactive elements
- Keyboard navigation support
- Clear status indicators
- Helpful tooltips and descriptions

## 🔄 Workflow

1. **Setup**: Authenticate with Tesla account via OAuth
2. **Create**: Define scheduled tasks with specific settings
3. **Monitor**: Watch real-time Powerwall status
4. **Track**: Review execution logs for reliability
5. **Adjust**: Modify tasks based on performance

## 📈 Future Enhancement Ideas

- Multi-day scheduling (weekday/weekend)
- Seasonal task templates
- Weather-based automation
- Energy usage analytics
- Mobile app (React Native)
- Cloud backup for configuration
- Multiple Powerwall support
- Integration with home automation systems

## 🛠️ Maintenance

- Database is single SQLite file (easy backup)
- Tokens automatically refresh (no manual intervention)
- Logs auto-rotate (can configure retention)
- Cloud-based (works from anywhere with internet)
- Minimal server resource usage

## ⚠️ Important Notes

- Uses Tesla's official cloud API
- Works from anywhere with internet connection
- Requires Tesla account with Powerwall access
- Not affiliated with Tesla, Inc.
- Monitor system initially to verify behavior
- Keep backup power safeguards in place
- Tokens stored locally - keep database secure

## 📝 License

Personal use. Respect Tesla's terms of service.

---

**Built with precision for reliable home energy automation** ⚡🏠

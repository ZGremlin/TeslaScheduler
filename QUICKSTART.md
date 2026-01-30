# Quick Start Guide

## Installation

### Option 1: Using Setup Script (Linux/Mac)
```bash
chmod +x setup.sh
./setup.sh
```

### Option 2: Manual Setup
```bash
# Install backend
cd backend
npm install
npm run init-db

# Install frontend
cd ../frontend
npm install
```

## Running the Application

### Terminal 1 - Backend
```bash
cd backend
npm start
```
Backend runs on http://localhost:3001

### Terminal 2 - Frontend
```bash
cd frontend
npm start
```
Frontend runs on http://localhost:3000 (opens automatically)

## First-Time Configuration

### Step 1: Launch Application
Both backend and frontend should be running

### Step 2: Authenticate with Tesla
1. Click the "🔐 Login" button
2. Click "Open Tesla Login" in the popup
3. Log in with your Tesla account in the new window
4. After login, copy the authorization code from the URL
5. Paste it back in the app and click "Complete Authentication"

### Step 3: Create Your First Task
1. Click "+ New Task"
2. Fill in:
   - Name: "Morning Solar Mode"
   - Time: "06:00"
   - Mode: "Self-Powered"
   - Backup Reserve: 20%
3. Click "Create Task"

## Example Use Cases

### Daily Solar Optimization
**Morning Task (6:00 AM)**
- Mode: Self-Powered
- Backup Reserve: 20%
- _Maximize solar self-consumption during the day_

**Evening Task (6:00 PM)**
- Mode: Time-Based Control
- Backup Reserve: 30%
- _Prepare for evening time-of-use rates_

### Emergency Backup Preparation
**Before Storm (Manually Trigger)**
- Mode: Self-Powered
- Backup Reserve: 100%
- _Maximize battery charge for potential outage_

## Troubleshooting

**Cannot authenticate with Tesla**
- Make sure you have a Tesla account with Powerwall access
- Use your Tesla account credentials (not local gateway password)
- Copy the entire authorization code from the URL
- The code appears after `code=` and before `&state=`

**Tasks not executing**
- Check task is enabled (green "Active" badge)
- View Execution Logs for errors
- Tokens are automatically refreshed

**Authentication expired**
- Authentication is automatically refreshed
- If issues persist, click "🔐 Login" to re-authenticate

## Tips

- Use descriptive task names
- Start with conservative backup reserve percentages
- Monitor execution logs for the first few days
- Test tasks using "Execute Now" before relying on schedule
- Keep authentication token valid by periodic use

## Need Help?

See the full README.md for detailed documentation, API reference, and troubleshooting.

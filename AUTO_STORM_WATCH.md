# Auto Storm Watch Feature

## Overview

Auto Storm Watch is an intelligent weather monitoring system that automatically activates Tesla Storm Watch mode **only when severe weather is actually detected** in your area. This prevents false activations while ensuring your Powerwall is prepared for real emergencies.

## How It Works

### 1. Weather Monitoring

The system checks the National Weather Service (weather.gov) API for active severe weather alerts, including:

- Blizzard Warning
- Winter Storm Warning
- Red Flag Warning
- Hurricane Warning/Watch
- Tornado Warning
- Thunderstorm Warning
- High Wind Warning
- Ice Storm Warning
- Snow Squall Warning
- Wind Chill Warning
- Flood Warning
- Flash Flood Warning
- Coastal Flood Warning
- Lakeshore Flood Warning

### 2. Location Determination

When a severe alert is found:

1. Fetches the affected geographic zone polygon
2. Selects a random point within the alert area
3. Uses Google Maps Geocoding API to find a real address at that location

### 3. Tesla Address Update

Updates your Tesla site address to a location within the severe weather zone, which triggers Tesla's automatic Storm Watch activation.

### 4. Storm Watch Activation

Tesla's system recognizes your "address" is in a severe weather zone and automatically:

- Charges Powerwall to 100%
- Prioritizes charging even during peak rates
- Maintains full charge until conditions improve

## Setup

### Prerequisites

**Required:**

- Tesla Powerwall with Storm Watch capability
- Active Tesla account with API access

**Required for Auto Storm Watch:**

- Google Maps API key (for geocoding)

### Google Maps API Setup

1. **Create a Google Cloud Project:**
   - Visit https://console.cloud.google.com
   - Create a new project or select existing

2. **Enable Geocoding API:**
   - Go to "APIs & Services" → "Library"
   - Search for "Geocoding API"
   - Click "Enable"

3. **Create API Key:**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy the API key

4. **Restrict API Key (Recommended):**
   - Click on the API key
   - Under "API restrictions", select "Restrict key"
   - Check only "Geocoding API"
   - Under "Application restrictions", choose "IP addresses"
   - Add your server's IP address
   - Save

5. **Configure on Server:**

   ```bash
   cd backend
   echo "GOOGLE_MAPS_API_KEY=your_api_key_here" >> .env
   ```

   Or export as environment variable:

   ```bash
   export GOOGLE_MAPS_API_KEY=your_api_key_here
   ```

## Usage

### Creating an Auto Storm Watch Task

1. **Click "+ New Task"**

2. **Fill in basic details:**
   - **Task Name**: "Auto Storm Watch Check"
   - **Execution Time**: When to check for alerts (e.g., 6:00 AM daily)
   - **Operation Mode**: Self-Powered or Time-Based Control
   - **Backup Reserve**: 100% (recommended for storm prep)

3. **Set Storm Watch to "Enable"**

4. **Check "🌩️ Auto Storm Watch"**

5. **Click "Create Task"**

### Example Tasks

#### Daily Storm Check (Recommended)

```
Task Name: "Daily Storm Watch Check"
Time: 06:00 (6:00 AM)
Mode: Self-Powered
Backup Reserve: 100%
Storm Watch: Enable
Auto Storm Watch: ✓ Enabled
```

This task runs every morning. If severe weather is detected, Storm Watch activates. If no severe weather, nothing happens.

#### Hurricane Season Monitoring

```
Task Name: "Hurricane Season Check"
Time: 18:00 (6:00 PM)
Mode: Self-Powered
Backup Reserve: 100%
Storm Watch: Enable
Auto Storm Watch: ✓ Enabled

Schedule: June 1 - November 30
```

Run twice daily during hurricane season for maximum protection.

#### Winter Storm Monitoring

```
Task Name: "Winter Storm Check"
Time: 22:00 (10:00 PM)
Mode: Self-Powered
Backup Reserve: 100%
Storm Watch: Enable
Auto Storm Watch: ✓ Enabled

Schedule: December 1 - March 31
```

## Behavior

### When Severe Weather Detected

```
Console Output:
🔍 Starting severe weather check...
🌩️  Checking for active severe weather alerts...
   Found 45 total alerts, 3 severe alerts
⚠️  Found 3 severe weather alert(s)
   Processing alert: Hurricane Warning
   Headline: Hurricane Warning issued for...
   Fetching geometry for zone: https://api.weather.gov/zones/...
   Selected random point: 27.9506, -82.4572
   Geocoding coordinates: 27.9506, -82.4572
   Found address: 123 Main St, Tampa, FL 33601
✅ Successfully processed weather alert
🚨 Severe weather detected: Hurricane Warning
📍 Updating site address to trigger Storm Watch...
✅ Site address updated - Tesla should activate Storm Watch
```

### When No Severe Weather

```
Console Output:
🔍 Starting severe weather check...
🌩️  Checking for active severe weather alerts...
   Found 12 total alerts, 0 severe alerts
✅ No active severe weather alerts found
ℹ️  No severe weather alerts active, skipping address update
```

### If Google Maps API Key Missing

```
Console Output:
⚠️  Google Maps API key not configured, skipping auto storm watch
```

Task continues to execute normally, but Auto Storm Watch is skipped.

## Task Badge Indicators

When viewing tasks:

- **🌩️ Auto** - Task has Auto Storm Watch enabled
- **Active** - Task is enabled and scheduled
- **🔄 Retrying** - Task failed, retrying in 10 minutes

## Important Notes

### Address Updates

- Your **actual** site address is temporarily replaced with an address in the severe weather zone
- This is only to trigger Tesla's Storm Watch automation
- You may want to restore your real address after the storm passes
- Consider creating a "Restore Address" task for after storms

### API Costs

- **Weather.gov**: Free, no API key required
- **Google Maps Geocoding**:
  - $5 per 1000 requests
  - First $200/month free (40,000 requests)
  - Daily check = ~365 requests/year = ~$1.83/year
  - Effectively free for personal use

### Weather Alert Coverage

- Uses U.S. National Weather Service data
- Only works for locations in the United States
- Alerts are issued by NWS, not this system
- System reacts to officially issued warnings

### False Activations

Auto Storm Watch dramatically reduces false activations compared to scheduled Storm Watch:

**Without Auto Storm Watch:**

- Activates every time the scheduled task runs
- Must manually schedule before each known storm
- Risk of forgetting to disable after storm

**With Auto Storm Watch:**

- Only activates when NWS issues severe weather alert
- No manual intervention needed
- Automatically monitors 24/7
- No false activations on clear days

## Troubleshooting

### "Auto Storm Watch" checkbox is disabled

- Storm Watch must be set to "Enable" first
- Auto mode only makes sense when enabling Storm Watch

### Task runs but Storm Watch doesn't activate

**Check:**

1. Google Maps API key is configured: `echo $GOOGLE_MAPS_API_KEY`
2. API key has Geocoding API enabled
3. Look at task execution logs for errors
4. No severe weather alerts may be active (this is normal!)

### "Geocoding failed" errors

**Solutions:**

- Verify API key is correct
- Check API key has Geocoding API enabled
- Ensure you have available quota (check Google Cloud Console)
- Verify IP restrictions allow your server

### Storm Watch activates when no local weather

**This is expected!** The system finds severe weather **anywhere in the U.S.** and updates your address to that location. This triggers Storm Watch even if your actual location has clear skies.

If you only want local alerts, you would need to:

1. Get your Powerwall's real GPS coordinates
2. Filter alerts by distance from your location
3. This feature is not currently implemented

## Advanced Configuration

### Multiple Daily Checks

Create multiple tasks with Auto Storm Watch:

```
Task 1: "Morning Storm Check" - 6:00 AM
Task 2: "Evening Storm Check" - 6:00 PM
Task 3: "Night Storm Check" - 10:00 PM
```

### Seasonal Scheduling

Use task enable/disable to run only during storm seasons:

- Hurricane season: June-November
- Tornado season: March-June
- Winter storms: December-February

(Manual enable/disable required - no built-in seasonal scheduling yet)

### Restore Original Address

After storms, create a task to restore your real address:

```
Task Name: "Restore Real Address"
Time: 12:00 PM (day after storm expected)
Storm Watch: Disable
Auto Storm Watch: ✗ Disabled
```

Then manually update your Tesla site address back to your real location through the Tesla app.

## Privacy & Security

**Data Collected:**

- None. The system doesn't store or log addresses.

**Data Transmitted:**

- Weather alert requests to weather.gov (public API)
- Geocoding requests to Google Maps (coordinates only)
- Site address updates to Tesla API (temporary addresses)

**Tesla Privacy:**

- Tesla sees your site address change
- Tesla knows Storm Watch was activated
- This is no different than if you moved to a new house

## Future Enhancements

Potential improvements (not yet implemented):

- Local-only alert filtering (only activate for nearby storms)
- Automatic address restoration after storms
- Webhook notifications when Storm Watch activates
- Storm severity thresholds (only activate for Cat 3+ hurricanes)
- Multi-day forecast monitoring (activate 48hrs before predicted landfall)

## API Rate Limits

**Weather.gov:**

- No rate limits for reasonable use
- User-Agent header required (already configured)

**Google Maps Geocoding:**

- No specific rate limit, but quota-based
- Default: 40,000 free requests/month
- Task runs once/day = ~30 requests/month
- Will last decades on free tier

## Support

If Auto Storm Watch isn't working:

1. Check execution logs: Logs tab in web interface
2. Check server console for detailed error messages
3. Verify Google Maps API key: `npm run test-api` (if test script supports it)
4. Confirm weather alerts exist: Visit https://api.weather.gov/alerts/active?status=actual

Remember: No errors means no severe weather detected - this is the expected behavior most days!

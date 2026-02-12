#!/bin/sh

echo "Starting Backend..."
cd /app/backend
pm2 start server.js --name backend-api --env production -- PORT=3001

echo "Starting Frontend..."
cd /app/frontend
pm2 start npm --name frontend-app -- start --env production -- PORT=3000

echo "Both apps started. Monitoring logs..."
# This keeps the container running and pipes all logs to the docker console
pm2-runtime logs
#!/bin/sh

echo "Starting Backend..."
cd /app/backend
pm2 start server.js --name "backend-api"

echo "Starting Frontend..."
cd /app/frontend
# We use 'npm -- start' to ensure arguments are passed correctly
pm2 start npm --name "frontend-app" -- start

# Show status of what is running
pm2 list

echo "Both apps started. Monitoring..."
# 'pm2-runtime' itself keeps the container alive. 
# We just need to point it at the active processes.
pm2-runtime

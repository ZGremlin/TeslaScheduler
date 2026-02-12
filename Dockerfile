# Use a lightweight Node image
FROM node:20-alpine

#Install PM2 globally
RUN npm install pm2 -g

#Set the working directory
WORKDIR /app

#1. Install Backend dependencies
COPY backend/package*.json ./backend/ RUN cd backend && npm install --omit=dev

#2. Install Frontend dependencies
#Note: We don't use --omit=dev here because 'npm start'
# often requires dev scripts or build tools.
COPY frontend/package*.json ./frontend/ RUN cd frontend && npm install

#3. Copy the rest of the project source code
COPY . .

#4. Create the config directory and setup symlinks as requested
RUN mkdir -p config &&

ln -sf /app/backend/.env /app/config/backend.env &&

ln -sf /app/backend/.env.example /app/config/backend.env.example &&

ln -sf /app/backend/.env.local /app/config/backend.env.local &&

ln -sf /app/frontend/.env /app/config/frontend.env &&

ln -sf /app/frontend/.env.example /app/config/frontend.env.example &&

ln -sf /app/frontend/.env.local /app/config/frontend.env.local

#Expose the ports for both servers
EXPOSE 3000 3001

#Start both apps using the ecosystem file
CMD ["pm2-runtime", "docker-config.js"]
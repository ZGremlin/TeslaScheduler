# Use a lightweight Node image
FROM node:20-alpine

#Install PM2 globally
RUN npm install pm2 -g

#Set the working directory
WORKDIR /app

#1. Install Backend dependencies
COPY backend/package*.json ./backend/ 
RUN cd backend && npm install --omit=dev

#2. Install Frontend dependencies
#Note: We don't use --omit=dev here because 'npm start'
# often requires dev scripts or build tools.
COPY frontend/package*.json ./frontend/ 
RUN cd frontend && npm install

#3. Copy the rest of the project source code
COPY . .

#4. Create the config directory and setup symlinks as requested
RUN mkdir -p config && \
cp /app/backend/.env.example /config/backend.env && \
cp /app/frontend/.env.example /config/frontend.env.local && \
ln -sf /config/frontend.env.local /app/frontend/.env.local && \
ln -sf /config/backend.env /app/backend/.env

#Expose the ports for both servers
EXPOSE 3000 3001

#Start both apps using the ecosystem file
CMD ["pm2-runtime", "docker-config.js"]
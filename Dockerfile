# Use a lightweight Node image
FROM node:20-alpine

# Install PM2 globally
RUN npm install pm2 -g

WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy the rest of your code
COPY . .

# Expose both ports (if both are web servers)
EXPOSE 3000 4000

# Use 'pm2-runtime' instead of 'pm2' to keep the container alive
CMD ["pm2-runtime", "dockerconfig.js"]
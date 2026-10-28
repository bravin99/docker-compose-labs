# Base image selection
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy dependency configs
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application sources
COPY server.js db.js db.json ./
COPY public ./public

# Expose server service port
EXPOSE 3000

# Run the server
CMD ["node", "server.js"]

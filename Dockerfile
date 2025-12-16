# syntax=docker/dockerfile:1
FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY server.js ./server.js
COPY "Mê Ry Chí Mớt" "./Mê Ry Chí Mớt"

# Copy env file if provided at build time (or use --env-file at run time)
COPY .env ./.env 2>/dev/null || true

EXPOSE 3000
CMD ["npm", "start"]

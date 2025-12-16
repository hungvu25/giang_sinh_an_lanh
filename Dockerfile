# syntax=docker/dockerfile:1
FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY server.js ./server.js
COPY media ./media
COPY .env ./.env 2>/dev/null || true


EXPOSE 3000
CMD ["npm", "start"]

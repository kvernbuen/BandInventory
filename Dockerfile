# --- Build stage: compile native modules ---
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --production

# --- Runtime stage: clean image, no build tools ---
FROM node:20-alpine

# Upgrade all Alpine packages to pick up latest security fixes (e.g. zlib)
RUN apk upgrade --no-cache

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /data

ENV DB_PATH=/data/bandinventory.db
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]

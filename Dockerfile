FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN mkdir -p /data

ENV DB_PATH=/data/korpsinventar.db
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]

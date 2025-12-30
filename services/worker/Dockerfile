# 修正版：services/worker/Dockerfile
FROM node:20-slim AS builder
WORKDIR /app
# ビルドに必要な最小限の部品をインストール
RUN apt-get update -y && apt-get install -y openssl
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim
WORKDIR /app
# 実行環境にも openssl を入れる
RUN apt-get update -y && apt-get install -y openssl
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 8080
CMD ["node", "dist/index.js"]
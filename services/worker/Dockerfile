# ステージ1: ビルド環境
FROM node:18-alpine AS builder
WORKDIR /app
COPY . .
RUN cd services/worker && npm install && npm run build

# ---
# ステージ2: 本番環境
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/services/worker .
CMD ["node", "dist/index.js"]

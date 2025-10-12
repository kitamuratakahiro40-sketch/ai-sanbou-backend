# ===== builder =====
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# 依存だけ先に入れる
COPY package*.json ./
RUN npm install

# ソースをビルド
COPY . .
RUN npm run build

# ===== runtime =====
FROM node:20-bookworm-slim
WORKDIR /app

# ffmpeg/ffprobe を入れる（音声分割で必須）
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

# 必要物だけコピー
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

ENV NODE_ENV=production
CMD ["node", "dist/worker.js"]

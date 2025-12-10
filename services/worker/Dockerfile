FROM node:20-bullseye

# ▼ ffmpeg / ffprobe をインストール（ここが今回のポイント）
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# ビルド用に dev も入れる
RUN npm install --include=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

# TypeScript ビルド
RUN npx tsc -p tsconfig.json

# 本番は prod 依存だけに絞る
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/worker.js"]

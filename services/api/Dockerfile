# services/api/Dockerfile
# --- Builder stage -----------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# 依存解決（再現性確保のため package-lock を前提）
COPY package*.json ./
RUN npm ci

# ソース取り込み＆ビルド
COPY . .
RUN npm run build

# 本番用に devDependencies を削減
RUN npm prune --omit=dev

# --- Runtime stage -----------------------------------------------------------
FROM node:20-bookworm-slim AS runner

# 1) 斥候兵の配備：ffmpeg（＝ffprobe含む）を導入
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# 2) 実行に必要な成果物のみ配置
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# 3) 非root 実行（推奨：セキュリティ強化）
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Cloud Run 用（明示）
EXPOSE 8080

# 4) エントリポイント
CMD ["node", "dist/index.js"]

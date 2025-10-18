# === services/api/Dockerfile (最終確定・完全版) ===

# ----------------------------------------------------------------
# Stage 1: Production Dependencies
# モノレポ構造をDocker内で再現し、本番用の依存関係だけを
# ルートの node_modules に正しくインストールするステージ。
# ----------------------------------------------------------------
FROM node:18-bookworm-slim AS dependencies
WORKDIR /app

# ワークスペース構造を正しく認識させるため、全てのpackage.jsonをコピー
COPY package.json package-lock.json ./
COPY services/api/package.json ./services/api/
COPY services/worker/package.json ./services/worker/

# 全てのワークスペースの「本番用」依存関係のみをインストール
# これにより、ルートに軽量な node_modules が作成される
RUN npm install --production

# ----------------------------------------------------------------
# Stage 2: Production Image
# 最終的な本番用のコンテナイメージ。
# ----------------------------------------------------------------
FROM node:18-bookworm-slim AS production
ENV NODE_ENV production

# 【重要】ffmpegをインストール
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Stage 1 から、本番用に整理された「ルートの」node_modules をコピー
COPY --from=dependencies /app/node_modules ./node_modules

# Cloud Build が事前にビルドした、api の実行コード (dist) をコピー
COPY services/api/dist ./dist

# Prisma のスキーマをコピー
COPY services/api/prisma ./prisma

# package.jsonをコピー（一部ライブラリが実行時に参照するため）
COPY services/api/package.json ./package.json

# コンテナ起動時に実行するコマンド
CMD ["node", "dist/index.js"]
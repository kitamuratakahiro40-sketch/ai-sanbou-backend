# 1. ビルド環境
FROM node:20 AS builder
WORKDIR /app
# 必要なライブラリのインストール
RUN apt-get update -y && apt-get install -y openssl
COPY package*.json ./
RUN npm install --frozen-lockfile
COPY . .

# --- 【最重要】Next.js の設定 ---
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXTAUTH_SECRET=p8H6n9B2r4L1v0X3z5Q7w9K2j5M8n0B3
ENV NEXTAUTH_URL=http://localhost:3000
ENV DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy

# Prisma Client の生成（ここで debian-openssl-1.1.x 用も焼かれます）
RUN npx prisma generate
# ビルド実行
RUN npm run build

# 2. 実行環境（軽量版に openssl を追加）
FROM node:20-slim
WORKDIR /app

# 【ここが重要！】実行時に必要なライブラリをインストール
RUN apt-get update -y && apt-get install -y openssl libssl-dev

# standaloneモード用のコピー
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# 実行時の環境変数
ENV NEXTAUTH_SECRET=p8H6n9B2r4L1v0X3z5Q7w9K2j5M8n0B3

CMD ["node", "server.js"]
# ---------- build ----------
FROM node:20-slim AS build
WORKDIR /app

# Prisma ネイティブのために OpenSSL
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# 依存定義だけ先にコピー
COPY package*.json ./

# lockfile があってもなくても postinstall を回避してインストール
RUN if [ -f package-lock.json ]; then \
      npm ci --ignore-scripts --omit=dev=false; \
    else \
      npm install --ignore-scripts; \
    fi

# tsconfig と Prisma スキーマをコピー
COPY tsconfig.json ./
COPY prisma ./prisma

# ここで明示的に Prisma Client 生成（postinstall ではなく手動）
RUN npx prisma generate --schema=prisma/schema.prisma

# アプリのソースをコピーしてビルド
COPY src ./src
RUN npx tsc -p tsconfig.json

# ---------- runtime ----------
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# ランタイムにも OpenSSL（Prisma が使用）
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# 必要物のみコピー
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY package*.json ./

# Cloud Run が $PORT を注入
ENV PORT=8080
EXPOSE 8080

CMD ["node","dist/index.js"]

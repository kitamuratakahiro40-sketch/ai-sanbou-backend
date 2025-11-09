FROM node:20-bullseye
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
CMD ["node","dist/worker.js"]

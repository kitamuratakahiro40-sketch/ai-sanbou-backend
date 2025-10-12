cat > services/api/src/db.ts <<'TS'
/**
 * services/api/src/db.ts
 * - node-postgres Pool を用いた安全な DB 接続モジュール
 * - withTx / query / advisory lock / graceful shutdown を提供
 *
 * 環境変数:
 *  - DATABASE_URL (優先)
 *  - OR: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
 *  - PG_POOL_MAX (default: 15)
 *  - PG_IDLE_TIMEOUT_MS (default: 30000)
 *  - PG_CONNECTION_TIMEOUT_MS (default: 5000)
 *  - CLOUD_SQL_CONNECTION_NAME (optional, for Cloud Run + Cloud SQL Unix socket)
 */

import { Pool, QueryResult } from "pg";
import type { PoolClient, QueryConfig, QueryResultRow } from "pg";

const {
  DATABASE_URL,
  PGHOST,
  PGPORT,
  PGUSER,
  PGPASSWORD,
  PGDATABASE,
  PG_POOL_MAX,
  PG_IDLE_TIMEOUT_MS,
  PG_CONNECTION_TIMEOUT_MS,
  PG_SSL, // "require" 等（任意）
  CLOUD_SQL_CONNECTION_NAME,
  NODE_ENV,
} = process.env;

// --- プール設定の組み立て ---
function createPool(): Pool {
  if (DATABASE_URL) {
    return new Pool({
      connectionString: DATABASE_URL,
      max: Number(PG_POOL_MAX ?? 15),
      idleTimeoutMillis: Number(PG_IDLE_TIMEOUT_MS ?? 30000),
      connectionTimeoutMillis: Number(PG_CONNECTION_TIMEOUT_MS ?? 5000),
      ssl: PG_SSL ? { rejectUnauthorized: false } : undefined,
    });
  }

  // Cloud SQL Unix socket を使うパターン（Cloud Run の場合）
  if (CLOUD_SQL_CONNECTION_NAME && !PGHOST) {
    const socketPath = `/cloudsql/${CLOUD_SQL_CONNECTION_NAME}`;
    return new Pool({
      host: socketPath,
      port: Number(PGPORT ?? 5432),
      user: PGUSER,
      password: PGPASSWORD,
      database: PGDATABASE,
      max: Number(PG_POOL_MAX ?? 15),
      idleTimeoutMillis: Number(PG_IDLE_TIMEOUT_MS ?? 30000),
      connectionTimeoutMillis: Number(PG_CONNECTION_TIMEOUT_MS ?? 5000),
      ssl: PG_SSL ? { rejectUnauthorized: false } : undefined,
    });
  }

  // TCP 接続（ローカル / dev）
  return new Pool({
    host: PGHOST ?? "127.0.0.1",
    port: Number(PGPORT ?? 5432),
    user: PGUSER,
    password: PGPASSWORD,
    database: PGDATABASE,
    max: Number(PG_POOL_MAX ?? 15),
    idleTimeoutMillis: Number(PG_IDLE_TIMEOUT_MS ?? 30000),
    connectionTimeoutMillis: Number(PG_CONNECTION_TIMEOUT_MS ?? 5000),
    ssl: PG_SSL ? { rejectUnauthorized: false } : undefined,
  });
}

// --- グローバルに Pool を一つだけ持つ（開発の hot-reload 対策） ---
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  var __GLOBAL_PG_POOL__: Pool | undefined;
}
let pool: Pool;
if (globalThis.__GLOBAL_PG_POOL__) {
  pool = globalThis.__GLOBAL_PG_POOL__;
} else {
  pool = createPool();
  globalThis.__GLOBAL_PG_POOL__ = pool;
}

// pool のエラーはキャッチしてログ
pool.on("error", (err) => {
  // 本番では監視/アラートを仕込むこと
  // eslint-disable-next-line no-console
  console.error("Unexpected idle client error", err);
});

// --- クエリラッパー (簡易リトライ付き) ---
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string | QueryConfig,
  params?: any[],
  opts?: { retries?: number; retryDelayMs?: number }
): Promise<QueryResult<T>> {
  const retries = opts?.retries ?? 1;
  const retryDelayMs = opts?.retryDelayMs ?? 200;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (typeof text === "string") {
        return await pool.query<T>(text, params as any);
      } else {
        return await pool.query<T>(text as QueryConfig);
      }
    } catch (err) {
      const isLast = attempt === retries;
      // 遷移的なエラーなら再試行、それ以外は即投げる
      if (!isLast) {
        // eslint-disable-next-line no-console
        console.warn(`DB query failed (attempt ${attempt + 1}), retrying after ${retryDelayMs}ms`, err);
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      throw err;
    }
  }
  // ここには到達しない
  throw new Error("unreachable");
}

// --- トランザクションユーティリティ ---
export async function withTx<T>(fn: (client: PoolClient) => Promise<T>, opts?: { readonly?: boolean }): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      // eslint-disable-next-line no-console
      console.error("Error during rollback", rollbackErr);
    }
    throw e;
  } finally {
    client.release();
  }
}

// --- Advisory Lock ヘルパー ---
export async function acquireAdvisoryLock(clientOrKey: PoolClient | string, key?: string): Promise<boolean> {
  if (typeof clientOrKey === "string") {
    const lockKey = clientOrKey;
    const res = await pool.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock(hashtext($1)) AS ok`, [lockKey]);
    return res.rows[0]?.ok ?? false;
  } else {
    const client = clientOrKey;
    if (!key) throw new Error("key required when passing client");
    const res = await client.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock(hashtext($1)) AS ok`, [key]);
    return res.rows[0]?.ok ?? false;
  }
}

export async function releaseAdvisoryLock(clientOrKey: PoolClient | string, key?: string): Promise<boolean> {
  if (typeof clientOrKey === "string") {
    const lockKey = clientOrKey;
    const res = await pool.query<{ ok: boolean }>(`SELECT pg_advisory_unlock(hashtext($1)) AS ok`, [lockKey]);
    return res.rows[0]?.ok ?? false;
  } else {
    const client = clientOrKey;
    if (!key) throw new Error("key required when passing client");
    const res = await client.query<{ ok: boolean }>(`SELECT pg_advisory_unlock(hashtext($1)) AS ok`, [key]);
    return res.rows[0]?.ok ?? false;
  }
}

// --- プールのシャットダウン（グレースフル） ---
export async function shutdownPool(): Promise<void> {
  try {
    // eslint-disable-next-line no-console
    console.info("Shutting down DB pool...");
    await pool.end();
    globalThis.__GLOBAL_PG_POOL__ = undefined;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Error shutting down DB pool", e);
  }
}

// 既存コードが getPool を参照する箇所に対応するユーティリティ
export function getPool(): Pool {
  return pool;
}

// SIGTERM 等で graceful shutdown を行う（Cloud Run が SIGTERM を送る）
if (typeof process !== "undefined") {
  const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT", "SIGHUP"];
  signals.forEach((sig) => {
    // avoid adding multiple listeners in dev/hot-reload
    if (!process.listenerCount(sig)) {
      process.on(sig, async () => {
        // eslint-disable-next-line no-console
        console.info(`Received ${sig}, closing DB pool...`);
        try {
          await shutdownPool();
        } catch (_) {
          // noop
        } finally {
          process.exit(0);
        }
      });
    }
  });
}

export { pool };
export default {
  pool,
  query,
  withTx,
  acquireAdvisoryLock,
  releaseAdvisoryLock,
  shutdownPool,
};
TS

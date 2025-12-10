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
  PG_SSL,
  CLOUD_SQL_CONNECTION_NAME,
} = process.env;

// Cloud Run 上では K_SERVICE が必ず入るので判定に使う
const IS_CLOUD_RUN = !!process.env.K_SERVICE;

function createPool(): Pool {
  // 【ローカル開発専用】Cloud Run では DATABASE_URL を使わない
  if (DATABASE_URL && !IS_CLOUD_RUN) {
    return new Pool({
      connectionString: DATABASE_URL,
      max: Number(PG_POOL_MAX ?? 15),
      idleTimeoutMillis: Number(PG_IDLE_TIMEOUT_MS ?? 30000),
      connectionTimeoutMillis: Number(PG_CONNECTION_TIMEOUT_MS ?? 5000),
      ssl: PG_SSL ? { rejectUnauthorized: false } : undefined,
    });
  }

  // 【Cloud SQL Unix ソケット経由】CLOUD_SQL_CONNECTION_NAME があり PGHOST が未セットのとき
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

  // 【通常の TCP / またはソケットパスを PGHOST に直書きした場合】
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

declare global {
  // eslint-disable-next-line no-var
  var __GLOBAL_PG_POOL__: Pool | undefined;
}

let pool: Pool;
if (globalThis.__GLOBAL_PG_POOL__) {
  pool = globalThis.__GLOBAL_PG_POOL__;
} else {
    pool = createPool();
    globalThis.__GLOBAL_PG_POOL__ = pool;
}

pool.on("error", (err: Error) => {
  console.error("Unexpected idle client error", err);
});

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
      if (!isLast) {
        console.warn(
          `DB query failed (attempt ${attempt + 1}), retrying after ${retryDelayMs}ms`,
          err
        );
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function acquireAdvisoryLock(
  clientOrKey: PoolClient | string,
  key?: string
): Promise<boolean> {
  if (typeof clientOrKey === "string") {
    const res = await pool.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS ok`,
      [clientOrKey]
    );
    return res.rows[0]?.ok ?? false;
  } else {
    const client = clientOrKey;
    if (!key) throw new Error("key required when passing client");
    const res = await client.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS ok`,
      [key]
    );
    return res.rows[0]?.ok ?? false;
  }
}

export async function releaseAdvisoryLock(
  clientOrKey: PoolClient | string,
  key?: string
): Promise<boolean> {
  if (typeof clientOrKey === "string") {
    const res = await pool.query<{ ok: boolean }>(
      `SELECT pg_advisory_unlock(hashtext($1)) AS ok`,
      [clientOrKey]
    );
    return res.rows[0]?.ok ?? false;
  } else {
    const client = clientOrKey;
    if (!key) throw new Error("key required when passing client");
    const res = await client.query<{ ok: boolean }>(
      `SELECT pg_advisory_unlock(hashtext($1)) AS ok`,
      [key]
    );
    return res.rows[0]?.ok ?? false;
  }
}

export async function shutdownPool(): Promise<void> {
  try {
    console.info("Shutting down DB pool...");
    await pool.end();
    globalThis.__GLOBAL_PG_POOL__ = undefined;
  } catch (e) {
    console.error("Error shutting down DB pool", e);
  }
}

export function getPool(): Pool {
  return pool;
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

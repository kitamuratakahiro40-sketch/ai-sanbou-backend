"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
exports.withTx = withTx;
exports.acquireAdvisoryLock = acquireAdvisoryLock;
exports.releaseAdvisoryLock = releaseAdvisoryLock;
exports.shutdownPool = shutdownPool;
exports.getPool = getPool;
const pg_1 = require("pg");
const { DATABASE_URL, PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PG_POOL_MAX, PG_IDLE_TIMEOUT_MS, PG_CONNECTION_TIMEOUT_MS, PG_SSL, CLOUD_SQL_CONNECTION_NAME, } = process.env;
// Cloud Run 上では K_SERVICE が必ず入るので判定に使う
const IS_CLOUD_RUN = !!process.env.K_SERVICE;
function createPool() {
    // 【ローカル開発専用】Cloud Run では DATABASE_URL を使わない
    if (DATABASE_URL && !IS_CLOUD_RUN) {
        return new pg_1.Pool({
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
        return new pg_1.Pool({
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
    return new pg_1.Pool({
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
let pool;
if (globalThis.__GLOBAL_PG_POOL__) {
    exports.pool = pool = globalThis.__GLOBAL_PG_POOL__;
}
else {
    exports.pool = pool = createPool();
    globalThis.__GLOBAL_PG_POOL__ = pool;
}
pool.on("error", (err) => {
    console.error("Unexpected idle client error", err);
});
async function query(text, params, opts) {
    const retries = opts?.retries ?? 1;
    const retryDelayMs = opts?.retryDelayMs ?? 200;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            if (typeof text === "string") {
                return await pool.query(text, params);
            }
            else {
                return await pool.query(text);
            }
        }
        catch (err) {
            const isLast = attempt === retries;
            if (!isLast) {
                console.warn(`DB query failed (attempt ${attempt + 1}), retrying after ${retryDelayMs}ms`, err);
                await new Promise((r) => setTimeout(r, retryDelayMs));
                continue;
            }
            throw err;
        }
    }
    throw new Error("unreachable");
}
async function withTx(fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        throw e;
    }
    finally {
        client.release();
    }
}
async function acquireAdvisoryLock(clientOrKey, key) {
    if (typeof clientOrKey === "string") {
        const res = await pool.query(`SELECT pg_try_advisory_lock(hashtext($1)) AS ok`, [clientOrKey]);
        return res.rows[0]?.ok ?? false;
    }
    else {
        const client = clientOrKey;
        if (!key)
            throw new Error("key required when passing client");
        const res = await client.query(`SELECT pg_try_advisory_lock(hashtext($1)) AS ok`, [key]);
        return res.rows[0]?.ok ?? false;
    }
}
async function releaseAdvisoryLock(clientOrKey, key) {
    if (typeof clientOrKey === "string") {
        const res = await pool.query(`SELECT pg_advisory_unlock(hashtext($1)) AS ok`, [clientOrKey]);
        return res.rows[0]?.ok ?? false;
    }
    else {
        const client = clientOrKey;
        if (!key)
            throw new Error("key required when passing client");
        const res = await client.query(`SELECT pg_advisory_unlock(hashtext($1)) AS ok`, [key]);
        return res.rows[0]?.ok ?? false;
    }
}
async function shutdownPool() {
    try {
        console.info("Shutting down DB pool...");
        await pool.end();
        globalThis.__GLOBAL_PG_POOL__ = undefined;
    }
    catch (e) {
        console.error("Error shutting down DB pool", e);
    }
}
function getPool() {
    return pool;
}
exports.default = {
    pool,
    query,
    withTx,
    acquireAdvisoryLock,
    releaseAdvisoryLock,
    shutdownPool,
};

// services/worker/src/db.ts
import { Pool } from "pg";
const INSTANCE = process.env.DB_INSTANCE_CONNECTION_NAME; // proj:region:instance
const DB_USER = process.env.DB_USER;
const DB_PASS = process.env.DB_PASS;
const DB_NAME = process.env.DB_NAME;
export const pool = new Pool({
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    host: `/cloudsql/${INSTANCE}`, // Cloud SQL Unix ソケット
    port: 5432,
    max: 10,
});
/** 既存の単一 Pool を返す（新規生成しない） */
export function getPool() {
    return pool;
}
/** rows 以外の情報も保持する正式な戻り値で query できるヘルパ */
export function query(text, params) {
    return pool.query(text, params);
}
/** トランザクション等で使いやすい withClient ヘルパ（任意） */
export async function withClient(fn) {
    const client = await pool.connect();
    try {
        return await fn(client);
    }
    finally {
        client.release();
    }
}

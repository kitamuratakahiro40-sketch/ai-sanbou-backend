// services/api/src/db.ts
import pg from 'pg'; // ★修正点1: QueryResultRow をインポート
const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, INSTANCE_CONNECTION_NAME, CLOUD_SQL_CONNECTION_NAME, CLOUDSQL_CONNECTION_NAME, // 誤記にも対応
 } = process.env;
// 1) 明示PGHOSTが最優先
let host = PGHOST;
// 2) それ以外は Cloud SQL 接続名からソケットパスを組み立て
const conn = INSTANCE_CONNECTION_NAME ||
    CLOUD_SQL_CONNECTION_NAME ||
    CLOUDSQL_CONNECTION_NAME;
if (!host) {
    if (!conn) {
        throw new Error('DB host not resolved. Set PGHOST or INSTANCE_CONNECTION_NAME / CLOUD_SQL_CONNECTION_NAME.');
    }
    host = `/cloudsql/${conn}`;
}
export const pool = new pg.Pool({
    host,
    user: PGUSER,
    password: PGPASSWORD, // ★修正点2: 'PGPWORD' -> 'PGPASSWORD' に修正
    database: PGDATABASE,
    port: 5432,
    ssl: false, // /cloudsql/ の Unix ソケット接続なら不要
});
export function query(text, params) {
    return pool.query(text, params);
}

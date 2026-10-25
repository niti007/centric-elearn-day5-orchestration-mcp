import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Fallback only: in the plugin, LEARNHUB_DB_* come from userConfig via the process env (dotenv never overrides).
dotenv.config({ path: path.resolve(here, "../../.env"), quiet: true } as any);

const pool = mysql.createPool({
  host: process.env.LEARNHUB_DB_HOST ?? "127.0.0.1",
  port: Number(process.env.LEARNHUB_DB_PORT ?? 3306),
  user: process.env.LEARNHUB_DB_USER ?? "root",
  password: process.env.LEARNHUB_DB_PASSWORD ?? "",
  database: "learnhub",
  connectionLimit: 4,
  dateStrings: true,
});

/** Run a query inside a READ ONLY transaction. */
export async function query(sql: string, params: unknown[] = []): Promise<any[]> {
  const conn = await pool.getConnection();
  try {
    await conn.query("SET TRANSACTION READ ONLY");
    await conn.beginTransaction();
    const [rows] = await conn.query(sql, params);
    await conn.rollback();
    return rows as any[];
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    conn.release();
  }
}

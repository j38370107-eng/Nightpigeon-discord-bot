import { Pool } from "pg";
import { logger } from "../../lib/logger";

// Aiven uses a self-signed CA chain — disable Node TLS verification for pg connections only
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

const url = process.env["BOT_DATABASE_URL"] ?? process.env["DATABASE_URL"];

if (!url) {
  throw new Error("BOT_DATABASE_URL or DATABASE_URL environment variable is required");
}

export const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected PostgreSQL pool error");
});

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_store (
      store_name TEXT NOT NULL,
      key        TEXT NOT NULL,
      data       JSONB NOT NULL,
      PRIMARY KEY (store_name, key)
    )
  `);
  logger.info("Database table ensured");
}

export async function dbGet<T>(storeName: string, key: string): Promise<T | null> {
  const res = await pool.query(
    "SELECT data FROM bot_store WHERE store_name = $1 AND key = $2",
    [storeName, key]
  );
  return (res.rows[0]?.data as T) ?? null;
}

export async function dbSet(storeName: string, key: string, data: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO bot_store (store_name, key, data)
     VALUES ($1, $2, $3)
     ON CONFLICT (store_name, key) DO UPDATE SET data = EXCLUDED.data`,
    [storeName, key, JSON.stringify(data)]
  );
}

export async function dbDelete(storeName: string, key: string): Promise<void> {
  await pool.query(
    "DELETE FROM bot_store WHERE store_name = $1 AND key = $2",
    [storeName, key]
  );
}

export async function dbGetAll<T>(storeName: string): Promise<Array<{ key: string; data: T }>> {
  const res = await pool.query(
    "SELECT key, data FROM bot_store WHERE store_name = $1",
    [storeName]
  );
  return res.rows.map((r) => ({ key: r.key as string, data: r.data as T }));
}

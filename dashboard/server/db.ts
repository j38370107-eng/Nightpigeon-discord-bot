import { Pool } from "pg";

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

const url = process.env["DATABASE_URL"] ?? process.env["BOT_DATABASE_URL"];
if (!url) throw new Error("DATABASE_URL is required for dashboard");

export const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_configs (
      guild_id TEXT PRIMARY KEY,
      config   TEXT NOT NULL DEFAULT ''
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_store (
      store_name TEXT NOT NULL,
      key        TEXT NOT NULL,
      data       JSONB NOT NULL,
      PRIMARY KEY (store_name, key)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid"    VARCHAR    NOT NULL COLLATE "default",
      "sess"   JSON       NOT NULL,
      "expire" TIMESTAMP  NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    ) WITH (OIDS=FALSE)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
  `);
}

export async function dbGet<T>(store: string, key: string): Promise<T | null> {
  const r = await pool.query(
    "SELECT data FROM bot_store WHERE store_name=$1 AND key=$2",
    [store, key]
  );
  return (r.rows[0]?.data as T) ?? null;
}

export async function dbSet(store: string, key: string, data: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO bot_store(store_name,key,data) VALUES($1,$2,$3)
     ON CONFLICT(store_name,key) DO UPDATE SET data=EXCLUDED.data`,
    [store, key, JSON.stringify(data)]
  );
}

export async function dbDelete(store: string, key: string): Promise<void> {
  await pool.query("DELETE FROM bot_store WHERE store_name=$1 AND key=$2", [store, key]);
}

export async function dbGetAll<T>(store: string): Promise<Array<{ key: string; data: T }>> {
  const r = await pool.query("SELECT key,data FROM bot_store WHERE store_name=$1", [store]);
  return r.rows.map((row) => ({ key: row.key as string, data: row.data as T }));
}

export async function dbGetByGuildPrefix(store: string, guildId: string): Promise<Array<{ key: string; data: unknown }>> {
  const r = await pool.query(
    "SELECT key,data FROM bot_store WHERE store_name=$1 AND key LIKE $2",
    [store, `${guildId}%`]
  );
  return r.rows.map((row) => ({ key: row.key as string, data: row.data }));
}

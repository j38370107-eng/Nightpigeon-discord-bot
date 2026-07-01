import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

async function dbGet(storeName: string, key: string): Promise<any> {
  const res = await pool.query(
    "SELECT data FROM bot_store WHERE store_name = $1 AND key = $2",
    [storeName, key]
  );
  return res.rows[0]?.data ?? null;
}

router.get("/stats", async (_req: any, res: any) => {
  try {
    // Try the live bot API first
    const botApiUrl = process.env["BOT_API_URL"];
    if (botApiUrl) {
      const r = await fetch(`${botApiUrl}/api/stats`).catch(() => null);
      if (r?.ok) {
        const data = await r.json();
        return res.json(data);
      }
    }

    // Read cached stats written by the bot's ready event
    const [cachedStats, serverStartRow] = await Promise.all([
      dbGet("_meta", "stats").catch(() => null),
      dbGet("_meta", "serverStart").catch(() => null),
    ]);

    // Persistent uptime: use the DB anchor the bot writes on first ready
    const startMs: number = serverStartRow?.startMs ?? Date.now();
    const uptimeMs = Date.now() - startMs;

    const guildCount: number = cachedStats?.guildCount ?? 0;
    // null means "never cached yet" — frontend can show "—" instead of 0
    const userCount: number | null = cachedStats != null ? (cachedStats.userCount ?? 0) : null;

    res.json({
      guildCount,
      userCount,
      uptimeMs,
      status: "online",
      commandCount: 60,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;

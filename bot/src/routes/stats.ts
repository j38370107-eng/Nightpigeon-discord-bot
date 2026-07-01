import { Router } from "express";

const router = Router();

const startTime = Date.now();

export function setStatsClient(c: any): void {
  statsClient = c;
}

let statsClient: any = null;

router.get("/stats", async (_req, res) => {
  const uptimeMs = Date.now() - startTime;

  let guildCount = 0;
  let userCount = 0;
  let status: "online" | "degraded" | "offline" = "offline";

  if (statsClient) {
    try {
      guildCount = statsClient.guilds.cache.size;
      userCount = statsClient.guilds.cache.reduce(
        (acc: number, g: any) => acc + (g.memberCount ?? 0),
        0
      );
      status = statsClient.ws.status === 0 ? "online" : "degraded";
    } catch {
      status = "degraded";
    }
  }

  res.json({
    guildCount,
    userCount,
    uptimeMs,
    status,
    commandCount: 60,
  });
});

export default router;

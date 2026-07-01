import { Router } from "express";
import { invalidateCache } from "../bot/store/guildConfig";
import { logger } from "../lib/logger";

const router = Router();

router.post("/cache/yaml-config/:guildId", async (req: any, res: any) => {
  const { guildId } = req.params;
  try {
    invalidateCache(guildId);
    logger.info({ guildId }, "YAML config cache invalidated via API");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, guildId }, "Failed to invalidate YAML config cache");
    res.status(500).json({ error: "invalidation failed" });
  }
});

export default router;

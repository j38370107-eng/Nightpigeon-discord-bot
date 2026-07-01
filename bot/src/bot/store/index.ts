import { initDb } from "./db";
import { initGuildConfigStore } from "./guildConfig";
import { logger } from "../../lib/logger";

export async function initAllStores(): Promise<void> {
  await initDb();
  await initGuildConfigStore();
  logger.info("Stores initialised");
}

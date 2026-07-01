import { logger } from "../../lib/logger";
import { dbSet, dbGetAll } from "./db";

const STORE = "muteConfig";

export interface MuteConfig {
  mode: "timeout" | "role";
  muteRoleId: string | null;
  stripRoles: boolean;
}

const DEFAULT_CONFIG: MuteConfig = {
  mode: "timeout",
  muteRoleId: null,
  stripRoles: false,
};

const cache = new Map<string, MuteConfig>();

async function loadFromDb(): Promise<void> {
  const rows = await dbGetAll<MuteConfig>(STORE);
  for (const { key, data } of rows) cache.set(key, data);
}

export async function initMuteConfigStore(): Promise<void> {
  await loadFromDb();
  logger.info({ count: cache.size }, "Loaded muteConfig store from DB");
  // Refresh every 5 seconds so dashboard changes are picked up without a bot restart
  setInterval(() => {
    loadFromDb().catch((err) => logger.error({ err }, "Failed to refresh muteConfig cache"));
  }, 5_000);
}

function getConfig(guildId: string): MuteConfig {
  if (!cache.has(guildId)) {
    cache.set(guildId, { ...DEFAULT_CONFIG });
  }
  const cfg = cache.get(guildId)!;
  cfg.mode      ??= DEFAULT_CONFIG.mode;
  cfg.muteRoleId = cfg.muteRoleId ?? DEFAULT_CONFIG.muteRoleId;
  cfg.stripRoles ??= DEFAULT_CONFIG.stripRoles;
  return cfg;
}

function persist(guildId: string): void {
  dbSet(STORE, guildId, cache.get(guildId)!).catch((err) =>
    logger.error({ err }, "Failed to save mute config"),
  );
}

export function getMuteConfig(guildId: string): MuteConfig {
  return getConfig(guildId);
}

export function setMuteMode(guildId: string, mode: "timeout" | "role"): void {
  getConfig(guildId).mode = mode;
  persist(guildId);
}

export function setMuteRoleId(guildId: string, roleId: string | null): void {
  getConfig(guildId).muteRoleId = roleId;
  persist(guildId);
}

export function setStripRoles(guildId: string, enabled: boolean): void {
  getConfig(guildId).stripRoles = enabled;
  persist(guildId);
}

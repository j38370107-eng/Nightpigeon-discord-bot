import { logger } from "../../lib/logger";
import { dbSet, dbGetAll } from "./db";

const STORE = "settings";

export interface WarnEscalationStep {
  strikes: number;
  action: "warn" | "mute" | "kick" | "ban";
  duration?: string;
}

interface GuildSettings {
  logChannelId?: string;
  serverLogChannelId?: string;
  prefix?: string;
  warnExpiryMonths?: number;
  warnExpiryMs?: number;
  automodWarnExpiryMs?: number;
  warnEscalation?: { steps: WarnEscalationStep[] };
}

const cache = new Map<string, GuildSettings>();

async function loadFromDb(): Promise<void> {
  const rows = await dbGetAll<GuildSettings>(STORE);
  for (const { key, data } of rows) cache.set(key, data);
}

export async function initSettingsStore(): Promise<void> {
  await loadFromDb();
  logger.info({ count: cache.size }, "Loaded settings store from DB");
  setInterval(() => {
    loadFromDb().catch((err) => logger.error({ err }, "Failed to refresh settings cache"));
  }, 5_000);
}

function save(guildId: string): void {
  dbSet(STORE, guildId, cache.get(guildId) ?? {}).catch((err) =>
    logger.error({ err }, "Failed to save guild settings")
  );
}

export function getGuildSetting<K extends keyof GuildSettings>(
  guildId: string,
  key: K
): GuildSettings[K] {
  return cache.get(guildId)?.[key];
}

export function setGuildSetting<K extends keyof GuildSettings>(
  guildId: string,
  key: K,
  value: GuildSettings[K]
): void {
  if (!cache.has(guildId)) cache.set(guildId, {});
  cache.get(guildId)![key] = value;
  save(guildId);
}

export function clearGuildSettings(guildId: string): void {
  cache.set(guildId, {});
  save(guildId);
}

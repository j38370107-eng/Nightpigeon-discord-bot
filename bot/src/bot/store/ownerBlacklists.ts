import { logger } from "../../lib/logger";
import { dbSet, dbGetAll } from "./db";

const STORE = "ownerBlacklists";
const SINGLETON_KEY = "__ownerBlacklists__";

export const OWNER_ID = "1216140996463689810";

interface BlacklistStore {
  guilds: string[];
  users: string[];
}

let cache: BlacklistStore = { guilds: [], users: [] };

export async function initOwnerBlacklistsStore(): Promise<void> {
  const rows = await dbGetAll<BlacklistStore>(STORE);
  for (const { data } of rows) {
    cache = data;
  }
  logger.info("Loaded ownerBlacklists store from DB");
}

function save(): void {
  dbSet(STORE, SINGLETON_KEY, cache).catch((err) =>
    logger.error({ err }, "Failed to save owner blacklists")
  );
}

export function blacklistGuild(guildId: string): boolean {
  if (cache.guilds.includes(guildId)) return false;
  cache.guilds.push(guildId);
  save();
  return true;
}

export function unblacklistGuild(guildId: string): boolean {
  const idx = cache.guilds.indexOf(guildId);
  if (idx === -1) return false;
  cache.guilds.splice(idx, 1);
  save();
  return true;
}

export function isGuildBlacklisted(guildId: string): boolean {
  return cache.guilds.includes(guildId);
}

export function getBlacklistedGuilds(): string[] {
  return [...cache.guilds];
}

export function blacklistUser(userId: string): boolean {
  if (cache.users.includes(userId)) return false;
  cache.users.push(userId);
  save();
  return true;
}

export function unblacklistUser(userId: string): boolean {
  const idx = cache.users.indexOf(userId);
  if (idx === -1) return false;
  cache.users.splice(idx, 1);
  save();
  return true;
}

export function isUserBlacklisted(userId: string): boolean {
  return cache.users.includes(userId);
}

export function getBlacklistedUsers(): string[] {
  return [...cache.users];
}

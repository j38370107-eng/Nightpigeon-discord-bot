import { logger } from "../../lib/logger";
import { dbSet, dbDelete, dbGetAll } from "./db";

const STORE = "aliases";
type GuildAliases = Record<string, string>;
const cache = new Map<string, GuildAliases>();

export async function initAliasesStore(): Promise<void> {
  const rows = await dbGetAll<GuildAliases>(STORE);
  for (const { key, data } of rows) cache.set(key, data);
  logger.info({ count: rows.length }, "Loaded aliases store from DB");
}

function save(guildId: string): void {
  dbSet(STORE, guildId, cache.get(guildId) ?? {}).catch((err) =>
    logger.error({ err }, "Failed to save aliases")
  );
}

export function setAlias(guildId: string, alias: string, commandName: string): void {
  if (!cache.has(guildId)) cache.set(guildId, {});
  cache.get(guildId)![alias] = commandName;
  save(guildId);
}

export function getAlias(guildId: string, alias: string): string | null {
  return cache.get(guildId)?.[alias] ?? null;
}

export function deleteAlias(guildId: string, alias: string): boolean {
  const g = cache.get(guildId);
  if (!g?.[alias]) return false;
  delete g[alias];
  save(guildId);
  return true;
}

export function listAliases(guildId: string): Record<string, string> {
  return cache.get(guildId) ?? {};
}

export function clearAliases(guildId: string): void {
  cache.delete(guildId);
  dbDelete(STORE, guildId).catch((err) => logger.error({ err }, "Failed to delete aliases"));
}

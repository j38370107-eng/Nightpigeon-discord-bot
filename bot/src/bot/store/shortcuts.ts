import { logger } from "../../lib/logger";
import { dbSet, dbDelete, dbGetAll } from "./db";

const STORE = "shortcuts";

export type ShortcutType = "warn" | "mute" | "kick" | "ban";

export interface Shortcut {
  name: string;
  type: ShortcutType;
  reason: string;
  duration?: string;
}

type GuildShortcuts = Record<string, Shortcut>;
const cache = new Map<string, GuildShortcuts>();

export async function initShortcutsStore(): Promise<void> {
  const rows = await dbGetAll<GuildShortcuts>(STORE);
  for (const { key, data } of rows) cache.set(key, data);
  logger.info({ count: rows.length }, "Loaded shortcuts store from DB");
}

export async function refreshShortcutsFromDb(): Promise<void> {
  const rows = await dbGetAll<GuildShortcuts>(STORE);
  for (const { key, data } of rows) cache.set(key, data);
}

function save(guildId: string): void {
  dbSet(STORE, guildId, cache.get(guildId) ?? {}).catch((err) =>
    logger.error({ err }, "Failed to save shortcuts")
  );
}

export function setShortcut(guildId: string, shortcut: Shortcut): void {
  if (!cache.has(guildId)) cache.set(guildId, {});
  cache.get(guildId)![shortcut.name] = shortcut;
  save(guildId);
}

export function getShortcut(guildId: string, name: string): Shortcut | null {
  return cache.get(guildId)?.[name] ?? null;
}

export function deleteShortcut(guildId: string, name: string): boolean {
  const g = cache.get(guildId);
  if (!g?.[name]) return false;
  delete g[name];
  save(guildId);
  return true;
}

export function listShortcuts(guildId: string): Shortcut[] {
  return Object.values(cache.get(guildId) ?? {});
}

export function clearShortcuts(guildId: string): void {
  cache.delete(guildId);
  dbDelete(STORE, guildId).catch((err) => logger.error({ err }, "Failed to delete shortcuts"));
}

export function getShortcutsRaw(guildId: string): Record<string, Shortcut> {
  return cache.get(guildId) ?? {};
}

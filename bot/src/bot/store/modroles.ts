import { logger } from "../../lib/logger";
import { dbSet, dbGetAll } from "./db";

const STORE = "modroles";

const cache = new Map<string, string[]>();

async function loadFromDb(): Promise<void> {
  const rows = await dbGetAll<string[]>(STORE);
  for (const { key, data } of rows) cache.set(key, data);
}

export async function initModrolesStore(): Promise<void> {
  await loadFromDb();
  logger.info({ count: cache.size }, "Loaded modroles store from DB");
  setInterval(() => {
    loadFromDb().catch((err) => logger.error({ err }, "Failed to refresh modroles cache"));
  }, 5_000);
}

function save(guildId: string): void {
  dbSet(STORE, guildId, cache.get(guildId) ?? []).catch((err) =>
    logger.error({ err }, "Failed to save modroles")
  );
}

export function getModRoles(guildId: string): string[] {
  return cache.get(guildId) ?? [];
}

export function addModRole(guildId: string, roleId: string): boolean {
  const roles = cache.get(guildId) ?? [];
  if (roles.includes(roleId)) return false;
  roles.push(roleId);
  cache.set(guildId, roles);
  save(guildId);
  return true;
}

export function removeModRole(guildId: string, roleId: string): boolean {
  const roles = cache.get(guildId) ?? [];
  const idx = roles.indexOf(roleId);
  if (idx === -1) return false;
  roles.splice(idx, 1);
  cache.set(guildId, roles);
  save(guildId);
  return true;
}

export function clearModRoles(guildId: string): void {
  cache.set(guildId, []);
  save(guildId);
}

export function memberHasModRole(guildId: string, memberRoleIds: string[]): boolean {
  return (cache.get(guildId) ?? []).some((r) => memberRoleIds.includes(r));
}

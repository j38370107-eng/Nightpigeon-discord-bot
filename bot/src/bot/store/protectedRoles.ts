import { logger } from "../../lib/logger";
import { dbSet, dbGetAll } from "./db";

const STORE = "protectedRoles";
const cache = new Map<string, string[]>();

async function loadFromDb(): Promise<void> {
  const rows = await dbGetAll<string[]>(STORE);
  for (const { key, data } of rows) cache.set(key, Array.isArray(data) ? data : []);
}

export async function initProtectedRolesStore(): Promise<void> {
  await loadFromDb();
  logger.info({ count: cache.size }, "Loaded protectedRoles store from DB");
  setInterval(() => {
    loadFromDb().catch((err) => logger.error({ err }, "Failed to refresh protectedRoles cache"));
  }, 5_000);
}

function save(guildId: string): void {
  dbSet(STORE, guildId, cache.get(guildId) ?? []).catch((err) =>
    logger.error({ err }, "Failed to save protectedRoles"),
  );
}

export function getProtectedRoles(guildId: string): string[] {
  return cache.get(guildId) ?? [];
}

export function setProtectedRoles(guildId: string, roles: string[]): void {
  cache.set(guildId, [...roles]);
  save(guildId);
}

export function addProtectedRole(guildId: string, roleId: string): boolean {
  const roles = cache.get(guildId) ?? [];
  if (roles.includes(roleId)) return false;
  roles.push(roleId);
  cache.set(guildId, roles);
  save(guildId);
  return true;
}

export function removeProtectedRole(guildId: string, roleId: string): boolean {
  const roles = cache.get(guildId) ?? [];
  const idx = roles.indexOf(roleId);
  if (idx === -1) return false;
  roles.splice(idx, 1);
  cache.set(guildId, roles);
  save(guildId);
  return true;
}

export function memberHasProtectedRole(guildId: string, memberRoleIds: string[]): boolean {
  return (cache.get(guildId) ?? []).some((r) => memberRoleIds.includes(r));
}

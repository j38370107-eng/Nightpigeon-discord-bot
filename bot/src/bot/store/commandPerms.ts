import { dbSet, dbGetAll } from "./db";
import { logger } from "../../lib/logger";

const STORE = "commandPerms";

export interface CommandPerm {
  allowedRoles: string[];
  deniedRoles: string[];
  allowedChannels: string[];
  deniedChannels: string[];
}

const cache = new Map<string, Record<string, CommandPerm>>();

export async function initCommandPermsStore(): Promise<void> {
  const rows = await dbGetAll<Record<string, CommandPerm>>(STORE);
  for (const { key, data } of rows) cache.set(key, data);
  logger.info({ count: rows.length }, "Loaded commandPerms store");
}

function save(guildId: string): void {
  dbSet(STORE, guildId, cache.get(guildId) ?? {}).catch((err) =>
    logger.error({ err }, "Failed to save commandPerms")
  );
}

const DEFAULT_PERM: CommandPerm = {
  allowedRoles: [],
  deniedRoles: [],
  allowedChannels: [],
  deniedChannels: [],
};

export function getCommandPerm(guildId: string, commandName: string): CommandPerm {
  return cache.get(guildId)?.[commandName] ?? { ...DEFAULT_PERM };
}

export function setCommandPerm(
  guildId: string,
  commandName: string,
  perm: CommandPerm
): void {
  if (!cache.has(guildId)) cache.set(guildId, {});
  cache.get(guildId)![commandName] = perm;
  save(guildId);
}

export function getAllCommandPerms(guildId: string): Record<string, CommandPerm> {
  return cache.get(guildId) ?? {};
}

export function setAllCommandPerms(
  guildId: string,
  perms: Record<string, CommandPerm>
): void {
  cache.set(guildId, perms);
  save(guildId);
}

export function checkCommandPerm(
  guildId: string,
  commandName: string,
  memberRoleIds: string[],
  channelId: string
): boolean {
  const perm = getCommandPerm(guildId, commandName);

  if (perm.deniedChannels.includes(channelId)) return false;
  if (perm.allowedChannels.length > 0 && !perm.allowedChannels.includes(channelId)) return false;

  const hasDeniedRole = perm.deniedRoles.some((r) => memberRoleIds.includes(r));
  if (hasDeniedRole) return false;

  if (perm.allowedRoles.length > 0) {
    return perm.allowedRoles.some((r) => memberRoleIds.includes(r));
  }

  return true;
}

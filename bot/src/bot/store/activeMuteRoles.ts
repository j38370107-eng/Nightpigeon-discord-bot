import { logger } from "../../lib/logger";
import { dbGet, dbSet, dbDelete, dbGetAll } from "./db";

const STORE = "activeMuteRoles";

export interface ActiveMuteRecord {
  roleId: string;
  expiresAt?: number;
  /** Role IDs stripped from the user at mute time — restored on unmute */
  strippedRoles?: string[];
}

const cache = new Map<string, ActiveMuteRecord>();

function rowKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export async function initActiveMuteRolesStore(): Promise<void> {
  const rows = await dbGetAll<ActiveMuteRecord>(STORE);
  for (const { key, data } of rows) {
    if (!data.expiresAt || data.expiresAt > Date.now()) {
      cache.set(key, data);
    } else {
      await dbDelete(STORE, key).catch(() => {});
    }
  }
  logger.info({ count: cache.size }, "activeMuteRoles store loaded");
}

export async function recordActiveMute(
  guildId: string,
  userId: string,
  roleId: string,
  expiresAt?: number,
  strippedRoles?: string[],
): Promise<void> {
  const key = rowKey(guildId, userId);
  const record: ActiveMuteRecord = { roleId, expiresAt, strippedRoles };
  cache.set(key, record);
  await dbSet(STORE, key, record).catch((err) =>
    logger.error({ err }, "Failed to save activeMuteRole"),
  );
}

/**
 * Restore stripped roles after unmute. Silently ignores roles that no longer exist.
 */
export async function restoreStrippedRoles(
  member: import("discord.js").GuildMember,
  record: ActiveMuteRecord,
): Promise<void> {
  if (!record.strippedRoles?.length) return;
  const toRestore = record.strippedRoles.filter(
    (id) => member.guild.roles.cache.has(id) && id !== record.roleId
  );
  if (!toRestore.length) return;
  await member.roles.add(toRestore, "Restoring roles after unmute").catch(() => {});
}

export async function clearActiveMute(
  guildId: string,
  userId: string,
): Promise<void> {
  const key = rowKey(guildId, userId);
  cache.delete(key);
  await dbDelete(STORE, key).catch((err) =>
    logger.error({ err }, "Failed to delete activeMuteRole"),
  );
}

export function getActiveMute(
  guildId: string,
  userId: string,
): ActiveMuteRecord | null {
  const key = rowKey(guildId, userId);
  const record = cache.get(key);
  if (!record) return null;
  if (record.expiresAt && record.expiresAt <= Date.now()) {
    cache.delete(key);
    dbDelete(STORE, key).catch(() => {});
    return null;
  }
  return record;
}

export function getAllActiveMutes(): Array<{ guildId: string; userId: string; record: ActiveMuteRecord }> {
  const results: Array<{ guildId: string; userId: string; record: ActiveMuteRecord }> = [];
  for (const [key, record] of cache.entries()) {
    const [guildId, userId] = key.split(":") as [string, string];
    results.push({ guildId, userId, record });
  }
  return results;
}

/**
 * Start a 30-second poll that removes expired role-based mutes and restores
 * any roles that were stripped at mute time.
 */
export function startMuteExpiryScheduler(client: import("discord.js").Client): void {
  setInterval(async () => {
    const now = Date.now();
    for (const { guildId, userId, record } of getAllActiveMutes()) {
      if (!record.expiresAt || record.expiresAt > now) continue;

      // Remove from store first so it doesn't fire again
      await clearActiveMute(guildId, userId).catch(() => {});

      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;

      let member: import("discord.js").GuildMember | null = null;
      try { member = await guild.members.fetch(userId); } catch { continue; }
      if (!member) continue;

      // Remove mute role
      await member.roles.remove(record.roleId, "Timed mute expired").catch(() => {});

      // Restore any stripped roles
      await restoreStrippedRoles(member, record);

      logger.info({ guildId, userId, roleId: record.roleId }, "Timed mute expired — role removed, stripped roles restored");
    }
  }, 30_000);
}

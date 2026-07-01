/**
 * Invite tracking system.
 *
 * Maintains an in-memory invite cache per guild for join detection,
 * and persists per-member invite attribution + per-inviter counts to
 * the bot_store table.
 */

import type { Client, Guild, Invite } from "discord.js";
import { logger } from "../../lib/logger";
import { dbGet, dbSet, dbGetAll } from "../store/db";

// In-memory invite cache
/** guildId → Map<inviteCode, uses> */
const inviteCache = new Map<string, Map<string, number>>();

export async function cacheGuildInvites(guild: Guild): Promise<void> {
  try {
    const fetched = await guild.invites.fetch();
    const map = new Map<string, number>();
    for (const inv of fetched.values()) {
      map.set(inv.code, inv.uses ?? 0);
    }
    inviteCache.set(guild.id, map);
  } catch {
    // No Manage Guild permission — skip silently
  }
}

export async function cacheAllGuildInvites(client: Client): Promise<void> {
  await Promise.allSettled(client.guilds.cache.map((g) => cacheGuildInvites(g)));
  logger.info({ guilds: client.guilds.cache.size }, "Invite cache loaded");
}

// Invite detection
export interface InviteContext {
  code?: string;
  inviterId?: string;
  inviterTag?: string;
  uses?: number;
  channelName?: string;
  createdAt?: Date | null;
  expiresAt?: Date | null;
  maxUses?: number | null;
  temporary?: boolean;
  unknown: boolean;
  unknownLabel: string;
}

/**
 * Compare the fresh invite list against the cached snapshot to figure out
 * which invite was just used.  Updates the cache as a side effect.
 */
export async function detectInvite(
  guild: Guild,
  unknownLabel: string
): Promise<InviteContext> {
  const oldCache = inviteCache.get(guild.id) ?? new Map<string, number>();

  let freshMap: Map<string, Invite>;
  try {
    const fetched = await guild.invites.fetch();
    freshMap = new Map(fetched.map((inv) => [inv.code, inv]));
  } catch {
    return { unknown: true, unknownLabel };
  }

  // Rebuild cache from fresh data
  const newCache = new Map<string, number>();
  for (const [code, inv] of freshMap) {
    newCache.set(code, inv.uses ?? 0);
  }
  inviteCache.set(guild.id, newCache);

  // Find the invite whose use count incremented
  for (const [code, inv] of freshMap) {
    const prevUses = oldCache.get(code) ?? 0;
    if ((inv.uses ?? 0) > prevUses) {
      const channelName =
        inv.channel && "name" in inv.channel
          ? (inv.channel as { name?: string | null }).name ?? undefined
          : undefined;

      return {
        code,
        inviterId:   inv.inviter?.id,
        inviterTag:  inv.inviter?.username ?? unknownLabel,
        uses:        inv.uses ?? 0,
        channelName,
        createdAt:   inv.createdAt,
        expiresAt:   inv.expiresAt,
        maxUses:     inv.maxUses,
        temporary:   inv.temporary ?? false,
        unknown:     false,
        unknownLabel,
      };
    }
  }

  // Vanity URL, widget, or discovery join
  return { unknown: true, unknownLabel };
}

// Persistent invite count store
interface InviterRecord {
  total:  number;
  left:   number;
  banned: number;
}

interface MemberInviteRecord {
  inviterId:   string | null;
  inviterTag:  string | null;
  inviteCode:  string | null;
}

/** Record a new join.  Returns the inviter's current net count (after this join). */
export async function recordMemberJoin(
  guildId: string,
  userId: string,
  inviterId: string | null,
  inviterTag: string | null,
  inviteCode: string | null
): Promise<number> {
  await dbSet("invite_members", `${guildId}:${userId}`, {
    inviterId,
    inviterTag,
    inviteCode,
  });

  if (!inviterId) return 0;

  const key = `${guildId}:${inviterId}`;
  const rec = (await dbGet<InviterRecord>("invite_counts", key)) ?? {
    total: 0, left: 0, banned: 0,
  };
  const updated = { ...rec, total: rec.total + 1 };
  await dbSet("invite_counts", key, updated);

  return Math.max(0, updated.total - updated.left - updated.banned);
}

export async function recordMemberLeave(guildId: string, userId: string): Promise<void> {
  const rec = await dbGet<MemberInviteRecord>("invite_members", `${guildId}:${userId}`);
  if (!rec?.inviterId) return;

  const key = `${guildId}:${rec.inviterId}`;
  const counts = (await dbGet<InviterRecord>("invite_counts", key)) ?? {
    total: 0, left: 0, banned: 0,
  };
  await dbSet("invite_counts", key, { ...counts, left: counts.left + 1 });
}

export async function recordMemberBan(guildId: string, userId: string): Promise<void> {
  const rec = await dbGet<MemberInviteRecord>("invite_members", `${guildId}:${userId}`);
  if (!rec?.inviterId) return;

  const key = `${guildId}:${rec.inviterId}`;
  const counts = (await dbGet<InviterRecord>("invite_counts", key)) ?? {
    total: 0, left: 0, banned: 0,
  };
  await dbSet("invite_counts", key, { ...counts, banned: counts.banned + 1 });
}

export interface InviteStats {
  net:    number;
  total:  number;
  left:   number;
  banned: number;
}

export async function getInviteCount(guildId: string, userId: string): Promise<InviteStats> {
  const rec = (await dbGet<InviterRecord>("invite_counts", `${guildId}:${userId}`)) ?? {
    total: 0, left: 0, banned: 0,
  };
  return { ...rec, net: Math.max(0, rec.total - rec.left - rec.banned) };
}

export interface LeaderboardEntry extends InviteStats {
  userId: string;
}

export async function getInviteLeaderboard(guildId: string): Promise<LeaderboardEntry[]> {
  const rows = await dbGetAll<InviterRecord>("invite_counts");
  const prefix = `${guildId}:`;
  return rows
    .filter((r) => r.key.startsWith(prefix))
    .map((r) => ({
      userId: r.key.slice(prefix.length),
      total:  r.data.total,
      left:   r.data.left,
      banned: r.data.banned,
      net:    Math.max(0, r.data.total - r.data.left - r.data.banned),
    }))
    .sort((a, b) => b.net - a.net)
    .slice(0, 15);
}

export async function resetInviteCount(guildId: string, userId: string): Promise<void> {
  await dbSet("invite_counts", `${guildId}:${userId}`, {
    total: 0, left: 0, banned: 0,
  });
}

export async function getMemberInviter(
  guildId: string,
  userId: string
): Promise<MemberInviteRecord | null> {
  return dbGet<MemberInviteRecord>("invite_members", `${guildId}:${userId}`);
}

/** Fetch a live invite by code (returns null if not found or no permission). */
export async function getInviteByCode(guild: Guild, code: string): Promise<Invite | null> {
  try {
    return await guild.invites.fetch(code);
  } catch {
    return null;
  }
}

import {
  Client,
  Guild,
  GuildMember,
  TextChannel,
  AuditLogEvent,
  PermissionsBitField,
} from "discord.js";
import { getCachedConfig, getGuildConfig } from "../store/guildConfig";
import { sendYamlMessage, applyVars, buildVars } from "../lib/yamlFormatter";
import { addCase } from "../lib/cases";
import { logger } from "../../lib/logger";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG TYPES — mirrors the YAML schema under plugins.antinuke
// ═══════════════════════════════════════════════════════════════════════════════

export interface AntiNukeThresholds {
  channel_delete?: number;
  channel_create?: number;
  channel_update?: number;
  role_delete?: number;
  role_create?: number;
  role_update?: number;
  role_everyone_update?: number;
  ban?: number;
  kick?: number;
  member_update?: number;
  webhook_create?: number;
  webhook_delete?: number;
  guild_update?: number;
  emoji_delete?: number;
  emoji_create?: number;
  sticker_delete?: number;
  integration_delete?: number;
  bot_add?: number;
}

interface AntiNukeRestore {
  enabled?: boolean;
  restore_deleted_channels?: boolean;
  restore_deleted_roles?: boolean;
  restore_everyone_permissions?: boolean;
}

export interface AntiNukeMessages {
  triggered?: any;
  staff_alert?: any;
  ban_success?: string;
  kick_success?: string;
  strip_success?: string;
  quarantine_success?: string;
  action_failed?: any;
  owner_dm?: string;
  restore_channel_success?: string;
  restore_channel_failed?: string;
  restore_role_success?: string;
  restore_role_failed?: string;
  restore_everyone_success?: string;
  restore_everyone_failed?: string;
  restore_summary?: string;
}

export interface AntiNukeYamlConfig {
  enabled?: boolean;
  whitelist_roles?: string[];
  whitelist_users?: string[];
  thresholds?: AntiNukeThresholds;
  interval_seconds?: number;
  audit_log_delay_ms?: number;
  action?: "ban" | "kick" | "strip_roles" | "quarantine";
  quarantine_role?: string | null;
  create_case?: boolean;
  action_overrides?: Record<string, "ban" | "kick" | "strip_roles" | "quarantine">;
  restore?: AntiNukeRestore;
  alert_channel?: string | null;
  alert_roles?: string[];
  dm_owner?: boolean;
  messages?: AntiNukeMessages;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IN-MEMORY STATE
// ═══════════════════════════════════════════════════════════════════════════════

// guildId → userId → actionType → array of timestamps (ms)
const rollingCounts = new Map<string, Map<string, Map<string, number[]>>>();

// guildId → userId → currently being actioned (prevent double-trigger)
const actionLocks = new Map<string, Set<string>>();

// Restoration caches
interface CachedChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
  topic: string | null;
  nsfw: boolean;
  deletedAt: number;
}

interface CachedRole {
  id: string;
  name: string;
  color: number;
  permissions: string;
  mentionable: boolean;
  hoist: boolean;
  deletedAt: number;
}

const channelCache = new Map<string, CachedChannel[]>();
const roleCache = new Map<string, CachedRole[]>();
// guildId → @everyone permission bitfield before last known-good state
const everyonePermCache = new Map<string, bigint>();

const CACHE_MAX_AGE_MS = 30 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function getAntiNukeYamlCfg(guildId: string): AntiNukeYamlConfig | null {
  const full = getCachedConfig(guildId);
  const an = ((full?.plugins as any)?.antinuke ?? {}) as AntiNukeYamlConfig;
  return an.enabled ? an : null;
}

function isWhitelisted(
  userId: string,
  memberRoles: string[],
  cfg: AntiNukeYamlConfig
): boolean {
  if ((cfg.whitelist_users ?? []).includes(userId)) return true;
  return (cfg.whitelist_roles ?? []).some((r) => memberRoles.includes(r));
}

function getThreshold(cfg: AntiNukeYamlConfig, actionType: string): number {
  const val = (cfg.thresholds as any)?.[actionType];
  return typeof val === "number" ? val : 0;
}

function getAction(
  cfg: AntiNukeYamlConfig,
  actionType: string
): "ban" | "kick" | "strip_roles" | "quarantine" {
  return cfg.action_overrides?.[actionType] ?? cfg.action ?? "ban";
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROLLING COUNTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Increment the rolling counter for (guild, user, actionType).
 * Returns the current count after pruning stale entries.
 */
function increment(
  guildId: string,
  userId: string,
  actionType: string,
  windowMs: number
): number {
  if (!rollingCounts.has(guildId)) rollingCounts.set(guildId, new Map());
  const byUser = rollingCounts.get(guildId)!;
  if (!byUser.has(userId)) byUser.set(userId, new Map());
  const byAction = byUser.get(userId)!;
  if (!byAction.has(actionType)) byAction.set(actionType, []);

  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = byAction.get(actionType)!.filter((t) => t > cutoff);
  timestamps.push(now);
  byAction.set(actionType, timestamps);
  return timestamps.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

async function executeMemberAction(
  guild: Guild,
  targetId: string,
  action: "ban" | "kick" | "strip_roles" | "quarantine",
  cfg: AntiNukeYamlConfig,
  auditReason: string
): Promise<boolean> {
  try {
    switch (action) {
      case "ban":
        await guild.members.ban(targetId, { reason: auditReason });
        break;
      case "kick":
        await guild.members.kick(targetId, auditReason);
        break;
      case "strip_roles": {
        const member = guild.members.cache.get(targetId)
          ?? await guild.members.fetch(targetId).catch(() => null);
        if (!member) return false;
        const roles = member.roles.cache
          .filter((r) => r.id !== guild.roles.everyone.id)
          .map((r) => r.id);
        for (const rId of roles) {
          await member.roles.remove(rId, auditReason).catch(() => {});
        }
        break;
      }
      case "quarantine": {
        const qRole = cfg.quarantine_role;
        if (!qRole) {
          logger.warn({ guildId: guild.id, targetId }, "antinukeHandler: quarantine action but no quarantine_role set");
          return false;
        }
        const member = guild.members.cache.get(targetId)
          ?? await guild.members.fetch(targetId).catch(() => null);
        if (!member) return false;
        const roles = member.roles.cache
          .filter((r) => r.id !== guild.roles.everyone.id)
          .map((r) => r.id);
        for (const rId of roles) {
          await member.roles.remove(rId, auditReason).catch(() => {});
        }
        await member.roles.add(qRole, auditReason).catch(() => {});
        break;
      }
    }
    return true;
  } catch (err) {
    logger.warn({ err, guildId: guild.id, targetId, action }, "antinukeHandler: action failed");
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEND HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function sendAlert(
  guild: Guild,
  cfg: AntiNukeYamlConfig,
  msgVal: any,
  vars: Record<string, string | undefined>
): Promise<void> {
  if (!msgVal) return;
  const chId = cfg.alert_channel;
  if (!chId) return;
  const ch = guild.channels.cache.get(chId) as TextChannel | undefined;
  if (!ch?.isTextBased()) return;
  await sendYamlMessage(ch, msgVal, buildVars(vars)).catch(() => {});
}

async function pingAlertRoles(guild: Guild, cfg: AntiNukeYamlConfig): Promise<void> {
  const chId = cfg.alert_channel;
  if (!chId || !(cfg.alert_roles?.length)) return;
  const ch = guild.channels.cache.get(chId) as TextChannel | undefined;
  if (!ch?.isTextBased()) return;
  const mentions = (cfg.alert_roles ?? []).map((r) => `<@&${r}>`).join(" ");
  if (mentions) await ch.send(mentions).catch(() => {});
}

async function dmOwner(guild: Guild, cfg: AntiNukeYamlConfig, vars: Record<string, string | undefined>): Promise<void> {
  if (cfg.dm_owner === false) return;
  const msgs = cfg.messages ?? {};
  if (!msgs.owner_dm) return;
  try {
    const owner = await guild.fetchOwner();
    const text = applyVars(msgs.owner_dm, buildVars(vars));
    if (text) await owner.send(text).catch(() => {});
  } catch {
    // DM failures are silent
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESTORATION
// ═══════════════════════════════════════════════════════════════════════════════

async function attemptRestore(
  guild: Guild,
  cfg: AntiNukeYamlConfig,
  actionType: string
): Promise<void> {
  const restore = cfg.restore;
  if (!restore?.enabled) return;
  const msgs = cfg.messages ?? {};
  const alertChId = cfg.alert_channel;
  const alertCh = alertChId ? guild.channels.cache.get(alertChId) as TextChannel | undefined : undefined;

  async function sendRestoreMsg(msgVal: any, vars: Record<string, string | undefined>) {
    if (!alertCh?.isTextBased() || !msgVal) return;
    await sendYamlMessage(alertCh, msgVal, buildVars(vars)).catch(() => {});
  }

  if (actionType === "channel_delete" && restore.restore_deleted_channels) {
    const list = (channelCache.get(guild.id) ?? []).filter(
      (c) => Date.now() - c.deletedAt < CACHE_MAX_AGE_MS
    );
    let restoredCount = 0;
    let failCount = 0;
    for (const cached of list) {
      try {
        await guild.channels.create({
          name: cached.name,
          type: cached.type as any,
          parent: cached.parentId ?? undefined,
          position: cached.position,
          topic: cached.topic ?? undefined,
          nsfw: cached.nsfw,
          reason: "Antinuke: restoring deleted channel",
        });
        restoredCount++;
        if (msgs.restore_channel_success) {
          await sendRestoreMsg(msgs.restore_channel_success, { trigger: cached.name });
        }
      } catch (err) {
        failCount++;
        if (msgs.restore_channel_failed) {
          await sendRestoreMsg(msgs.restore_channel_failed, { trigger: cached.name, reason: String(err) });
        }
      }
    }
    channelCache.set(guild.id, []);
    if (msgs.restore_summary) {
      await sendRestoreMsg(msgs.restore_summary, {
        count: String(restoredCount),
        trigger: "0",
        reason: String(failCount),
      });
    }
  }

  if (actionType === "role_delete" && restore.restore_deleted_roles) {
    const list = (roleCache.get(guild.id) ?? []).filter(
      (r) => Date.now() - r.deletedAt < CACHE_MAX_AGE_MS
    );
    let restoredCount = 0;
    let failCount = 0;
    for (const cached of list) {
      try {
        await guild.roles.create({
          name: cached.name,
          color: cached.color,
          permissions: BigInt(cached.permissions),
          mentionable: cached.mentionable,
          hoist: cached.hoist,
          reason: "Antinuke: restoring deleted role",
        });
        restoredCount++;
        if (msgs.restore_role_success) {
          await sendRestoreMsg(msgs.restore_role_success, { trigger: cached.name });
        }
      } catch (err) {
        failCount++;
        if (msgs.restore_role_failed) {
          await sendRestoreMsg(msgs.restore_role_failed, { trigger: cached.name, reason: String(err) });
        }
      }
    }
    roleCache.set(guild.id, []);
    if (msgs.restore_summary) {
      await sendRestoreMsg(msgs.restore_summary, {
        count: "0",
        trigger: String(restoredCount),
        reason: String(failCount),
      });
    }
  }

  if (actionType === "role_everyone_update" && restore.restore_everyone_permissions) {
    const cachedPerms = everyonePermCache.get(guild.id);
    if (cachedPerms !== undefined) {
      try {
        await guild.roles.everyone.setPermissions(
          new PermissionsBitField(cachedPerms),
          "Antinuke: restoring @everyone permissions"
        );
        await sendRestoreMsg(msgs.restore_everyone_success ?? "", {});
      } catch (err) {
        await sendRestoreMsg(msgs.restore_everyone_failed ?? "", { reason: String(err) });
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE TRIGGER
// ═══════════════════════════════════════════════════════════════════════════════

async function trigger(
  client: Client,
  guild: Guild,
  cfg: AntiNukeYamlConfig,
  executorId: string,
  actionType: string,
  count: number
): Promise<void> {
  // Prevent concurrent double-triggers for the same user
  const lockKey = `${guild.id}:${executorId}`;
  if (!actionLocks.has(guild.id)) actionLocks.set(guild.id, new Set());
  const locks = actionLocks.get(guild.id)!;
  if (locks.has(executorId)) return;
  locks.add(executorId);

  try {
    const msgs = cfg.messages ?? {};
    const threshold = getThreshold(cfg, actionType);
    const action = getAction(cfg, actionType);

    // Fetch executor info
    let executorTag = executorId;
    let executorMention = `<@${executorId}>`;
    const executorMember = guild.members.cache.get(executorId)
      ?? await guild.members.fetch(executorId).catch(() => null);
    if (executorMember) {
      executorTag = executorMember.user.tag;
      executorMention = executorMember.toString();
    }

    logger.warn(
      { guildId: guild.id, executorId, actionType, count, threshold, action },
      "antinukeHandler: threshold exceeded — triggering"
    );

    // Execute the action
    const ok = await executeMemberAction(guild, executorId, action, cfg, `Antinuke: ${actionType} threshold exceeded (${count}/${threshold})`);

    // Create case
    let caseId = 0;
    if (cfg.create_case !== false && ok) {
      const record = await addCase(guild.id, {
        action,
        userId: executorId,
        userTag: executorTag,
        modId: client.user?.id ?? "bot",
        modTag: client.user?.tag ?? "Bot",
        reason: `Antinuke: ${actionType} (${count}/${threshold})`,
      }).catch(() => null);
      if (record) caseId = record.id;
    }

    const actionLabel = ok ? action : "failed";

    const sharedVars: Record<string, string | undefined> = {
      user: executorTag,
      "user.id": executorId,
      "user.mention": executorMention,
      rule: actionType,
      count: String(count),
      trigger: String(threshold),
      action: actionLabel,
      case_id: String(caseId),
      server: guild.name,
      reason: action,
    };

    // Send role pings
    await pingAlertRoles(guild, cfg);

    if (ok) {
      // Post triggered alert
      await sendAlert(guild, cfg, msgs.triggered, sharedVars);

      // Post action-specific success message
      const successKey = `${action}_success` as keyof AntiNukeMessages;
      const successMsg = msgs[successKey];
      if (successMsg) {
        await sendAlert(guild, cfg, successMsg, sharedVars);
      }

      // DM owner
      await dmOwner(guild, cfg, sharedVars);

      // Attempt restoration
      await attemptRestore(guild, cfg, actionType);
    } else {
      // Action failed
      await sendAlert(guild, cfg, msgs.action_failed, { ...sharedVars, reason: "Hierarchy error or missing permissions" });
    }

    // Staff alert (always send regardless of action success)
    await sendAlert(guild, cfg, msgs.staff_alert, sharedVars);

    logger.info({ guildId: guild.id, executorId, actionType, action, ok, caseId }, "antinukeHandler: trigger complete");
  } finally {
    // Release lock after a short cooldown to prevent re-trigger on burst
    setTimeout(() => locks.delete(executorId), 5000);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function getAuditExecutor(
  guild: Guild,
  auditLogEvent: AuditLogEvent,
  delayMs: number,
  targetId?: string
): Promise<string | null> {
  await new Promise((r) => setTimeout(r, delayMs));
  try {
    const entries = await guild.fetchAuditLogs({ limit: 5, type: auditLogEvent });
    const cutoff = Date.now() - 5000; // only entries from last 5 seconds
    for (const entry of entries.entries.values()) {
      if (entry.createdTimestamp < cutoff) continue;
      if (targetId && entry.target && (entry.target as any).id !== targetId) continue;
      return entry.executor?.id ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED CHECK LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

async function checkAndTrigger(
  client: Client,
  guild: Guild,
  executorId: string,
  actionType: string,
  memberRoles: string[],
  cfg: AntiNukeYamlConfig
): Promise<void> {
  // Skip bot itself
  if (executorId === client.user?.id) return;

  // Whitelist check
  if (isWhitelisted(executorId, memberRoles, cfg)) return;

  // Threshold check
  const threshold = getThreshold(cfg, actionType);
  if (threshold === 0) return; // disabled

  const windowMs = (cfg.interval_seconds ?? 10) * 1000;
  const count = increment(guild.id, executorId, actionType, windowMs);

  if (count >= threshold) {
    await trigger(client, guild, cfg, executorId, actionType, count);
  }
}

async function resolveExecutorRoles(guild: Guild, executorId: string): Promise<string[]> {
  try {
    const member = guild.members.cache.get(executorId)
      ?? await guild.members.fetch(executorId).catch(() => null);
    return member?.roles.cache.map((r) => r.id) ?? [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleAntinukeChannelDelete(
  client: Client,
  channel: import("discord.js").GuildChannel
): Promise<void> {
  const guild = channel.guild;
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  // Cache channel for potential restore
  if (cfg.restore?.enabled && cfg.restore.restore_deleted_channels) {
    const existing = channelCache.get(guild.id) ?? [];
    existing.push({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      position: channel.rawPosition,
      topic: (channel as any).topic ?? null,
      nsfw: (channel as any).nsfw ?? false,
      deletedAt: Date.now(),
    });
    channelCache.set(guild.id, existing.filter((c) => Date.now() - c.deletedAt < CACHE_MAX_AGE_MS));
  }

  const delay = cfg.audit_log_delay_ms ?? 500;
  const executorId = await getAuditExecutor(guild, AuditLogEvent.ChannelDelete, delay, channel.id);
  if (!executorId) return;

  const roles = await resolveExecutorRoles(guild, executorId);
  await checkAndTrigger(client, guild, executorId, "channel_delete", roles, cfg);
}

export async function handleAntinukeChannelCreate(
  client: Client,
  channel: import("discord.js").GuildChannel
): Promise<void> {
  const guild = channel.guild;
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  const delay = cfg.audit_log_delay_ms ?? 500;
  const executorId = await getAuditExecutor(guild, AuditLogEvent.ChannelCreate, delay, channel.id);
  if (!executorId) return;

  const roles = await resolveExecutorRoles(guild, executorId);
  await checkAndTrigger(client, guild, executorId, "channel_create", roles, cfg);
}

export async function handleAntinukeChannelUpdate(
  client: Client,
  channel: import("discord.js").GuildChannel
): Promise<void> {
  const guild = channel.guild;
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  const threshold = getThreshold(cfg, "channel_update");
  if (threshold === 0) return;

  const delay = cfg.audit_log_delay_ms ?? 500;
  const executorId = await getAuditExecutor(guild, AuditLogEvent.ChannelUpdate, delay, channel.id);
  if (!executorId) return;

  const roles = await resolveExecutorRoles(guild, executorId);
  await checkAndTrigger(client, guild, executorId, "channel_update", roles, cfg);
}

export async function handleAntinukeRoleDelete(
  client: Client,
  role: import("discord.js").Role
): Promise<void> {
  const guild = role.guild;
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  // Cache role for potential restore
  if (cfg.restore?.enabled && cfg.restore.restore_deleted_roles) {
    const existing = roleCache.get(guild.id) ?? [];
    existing.push({
      id: role.id,
      name: role.name,
      color: role.color,
      permissions: role.permissions.bitfield.toString(),
      mentionable: role.mentionable,
      hoist: role.hoist,
      deletedAt: Date.now(),
    });
    roleCache.set(guild.id, existing.filter((r) => Date.now() - r.deletedAt < CACHE_MAX_AGE_MS));
  }

  const delay = cfg.audit_log_delay_ms ?? 500;
  const executorId = await getAuditExecutor(guild, AuditLogEvent.RoleDelete, delay, role.id);
  if (!executorId) return;

  const roles = await resolveExecutorRoles(guild, executorId);
  await checkAndTrigger(client, guild, executorId, "role_delete", roles, cfg);
}

export async function handleAntinukeRoleCreate(
  client: Client,
  role: import("discord.js").Role
): Promise<void> {
  const guild = role.guild;
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  const delay = cfg.audit_log_delay_ms ?? 500;
  const executorId = await getAuditExecutor(guild, AuditLogEvent.RoleCreate, delay, role.id);
  if (!executorId) return;

  const roles = await resolveExecutorRoles(guild, executorId);
  await checkAndTrigger(client, guild, executorId, "role_create", roles, cfg);
}

export async function handleAntinukeRoleUpdate(
  client: Client,
  oldRole: import("discord.js").Role,
  newRole: import("discord.js").Role
): Promise<void> {
  const guild = newRole.guild;
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  const isEveryone = newRole.id === guild.roles.everyone.id;

  // Cache @everyone perms before a change (store the OLD state for restore)
  if (isEveryone && cfg.restore?.enabled && cfg.restore.restore_everyone_permissions) {
    // Only update cache if permissions actually changed
    if (!everyonePermCache.has(guild.id) || oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      // Store the old (pre-change) perms as the "good" state if we don't have one yet
      if (!everyonePermCache.has(guild.id)) {
        everyonePermCache.set(guild.id, oldRole.permissions.bitfield);
      }
    }
  }

  const delay = cfg.audit_log_delay_ms ?? 500;

  if (isEveryone) {
    // Only check role_everyone_update if permissions actually changed
    if (oldRole.permissions.bitfield === newRole.permissions.bitfield) return;

    const threshold = getThreshold(cfg, "role_everyone_update");
    if (threshold === 0) return;

    const executorId = await getAuditExecutor(guild, AuditLogEvent.RoleUpdate, delay, newRole.id);
    if (!executorId) return;

    const roles = await resolveExecutorRoles(guild, executorId);
    await checkAndTrigger(client, guild, executorId, "role_everyone_update", roles, cfg);
  } else {
    const threshold = getThreshold(cfg, "role_update");
    if (threshold === 0) return;

    const executorId = await getAuditExecutor(guild, AuditLogEvent.RoleUpdate, delay, newRole.id);
    if (!executorId) return;

    const roles = await resolveExecutorRoles(guild, executorId);
    await checkAndTrigger(client, guild, executorId, "role_update", roles, cfg);
  }
}

export async function handleAntinukeBan(
  client: Client,
  ban: import("discord.js").GuildBan
): Promise<void> {
  const guild = ban.guild;
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  const delay = cfg.audit_log_delay_ms ?? 500;
  const executorId = await getAuditExecutor(guild, AuditLogEvent.MemberBanAdd, delay, ban.user.id);
  if (!executorId) return;

  const roles = await resolveExecutorRoles(guild, executorId);
  await checkAndTrigger(client, guild, executorId, "ban", roles, cfg);
}

export async function handleAntinukeMemberRemove(
  client: Client,
  member: import("discord.js").GuildMember | import("discord.js").PartialGuildMember
): Promise<void> {
  const guild = member.guild;
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  const threshold = getThreshold(cfg, "kick");
  if (threshold === 0) return;

  const delay = cfg.audit_log_delay_ms ?? 500;
  // For kicks, we need to check the MEMBER_KICK audit log
  const executorId = await getAuditExecutor(guild, AuditLogEvent.MemberKick, delay, member.id);
  if (!executorId) return; // not a kick — it was a leave

  const roles = await resolveExecutorRoles(guild, executorId);
  await checkAndTrigger(client, guild, executorId, "kick", roles, cfg);
}

export async function handleAntinukeMemberUpdate(
  client: Client,
  _old: import("discord.js").GuildMember | import("discord.js").PartialGuildMember,
  newMember: import("discord.js").GuildMember
): Promise<void> {
  const guild = newMember.guild;
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  const threshold = getThreshold(cfg, "member_update");
  if (threshold === 0) return;

  const delay = cfg.audit_log_delay_ms ?? 500;
  const executorId = await getAuditExecutor(guild, AuditLogEvent.MemberRoleUpdate, delay, newMember.id);
  if (!executorId) return;

  const roles = await resolveExecutorRoles(guild, executorId);
  await checkAndTrigger(client, guild, executorId, "member_update", roles, cfg);
}

export async function handleAntinukeWebhookUpdate(
  client: Client,
  channel: import("discord.js").TextChannel
): Promise<void> {
  const guild = channel.guild;
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  const delay = cfg.audit_log_delay_ms ?? 500;

  // Check both create and delete
  const createThreshold = getThreshold(cfg, "webhook_create");
  const deleteThreshold = getThreshold(cfg, "webhook_delete");

  if (createThreshold > 0) {
    const executorId = await getAuditExecutor(guild, AuditLogEvent.WebhookCreate, delay);
    if (executorId) {
      const roles = await resolveExecutorRoles(guild, executorId);
      await checkAndTrigger(client, guild, executorId, "webhook_create", roles, cfg);
    }
  }

  if (deleteThreshold > 0) {
    const executorId = await getAuditExecutor(guild, AuditLogEvent.WebhookDelete, delay);
    if (executorId) {
      const roles = await resolveExecutorRoles(guild, executorId);
      await checkAndTrigger(client, guild, executorId, "webhook_delete", roles, cfg);
    }
  }
}

export async function handleAntinukeGuildUpdate(
  client: Client,
  _old: Guild,
  newGuild: Guild
): Promise<void> {
  const cfg = getAntiNukeYamlCfg(newGuild.id);
  if (!cfg) return;

  const threshold = getThreshold(cfg, "guild_update");
  if (threshold === 0) return;

  const delay = cfg.audit_log_delay_ms ?? 500;
  const executorId = await getAuditExecutor(newGuild, AuditLogEvent.GuildUpdate, delay);
  if (!executorId) return;

  const roles = await resolveExecutorRoles(newGuild, executorId);
  await checkAndTrigger(client, newGuild, executorId, "guild_update", roles, cfg);
}

export async function handleAntinukeEmojiDelete(
  client: Client,
  emoji: import("discord.js").GuildEmoji
): Promise<void> {
  const guild = emoji.guild;
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  const threshold = getThreshold(cfg, "emoji_delete");
  if (threshold === 0) return;

  const delay = cfg.audit_log_delay_ms ?? 500;
  const executorId = await getAuditExecutor(guild, AuditLogEvent.EmojiDelete, delay, emoji.id);
  if (!executorId) return;

  const roles = await resolveExecutorRoles(guild, executorId);
  await checkAndTrigger(client, guild, executorId, "emoji_delete", roles, cfg);
}

export async function handleAntinukeEmojiCreate(
  client: Client,
  emoji: import("discord.js").GuildEmoji
): Promise<void> {
  const guild = emoji.guild;
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  const threshold = getThreshold(cfg, "emoji_create");
  if (threshold === 0) return;

  const delay = cfg.audit_log_delay_ms ?? 500;
  const executorId = await getAuditExecutor(guild, AuditLogEvent.EmojiCreate, delay, emoji.id);
  if (!executorId) return;

  const roles = await resolveExecutorRoles(guild, executorId);
  await checkAndTrigger(client, guild, executorId, "emoji_create", roles, cfg);
}

export async function handleAntinukeStickerDelete(
  client: Client,
  sticker: import("discord.js").Sticker
): Promise<void> {
  if (!sticker.guildId) return;
  const guild = (await (client.guilds.cache.get(sticker.guildId)
    ?? client.guilds.fetch(sticker.guildId).catch(() => null)));
  if (!guild) return;

  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  const threshold = getThreshold(cfg, "sticker_delete");
  if (threshold === 0) return;

  const delay = cfg.audit_log_delay_ms ?? 500;
  const executorId = await getAuditExecutor(guild, AuditLogEvent.StickerDelete, delay, sticker.id);
  if (!executorId) return;

  const roles = await resolveExecutorRoles(guild, executorId);
  await checkAndTrigger(client, guild, executorId, "sticker_delete", roles, cfg);
}

export async function handleAntinukeIntegrationsUpdate(
  client: Client,
  guild: Guild
): Promise<void> {
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  const threshold = getThreshold(cfg, "integration_delete");
  if (threshold === 0) return;

  const delay = cfg.audit_log_delay_ms ?? 500;
  const executorId = await getAuditExecutor(guild, AuditLogEvent.IntegrationDelete, delay);
  if (!executorId) return;

  const roles = await resolveExecutorRoles(guild, executorId);
  await checkAndTrigger(client, guild, executorId, "integration_delete", roles, cfg);
}

export async function handleAntinukeBotAdd(
  client: Client,
  member: GuildMember
): Promise<void> {
  if (!member.user.bot) return;
  if (member.id === client.user?.id) return; // Don't flag ourselves

  const guild = member.guild;
  const cfg = getAntiNukeYamlCfg(guild.id);
  if (!cfg) return;

  const threshold = getThreshold(cfg, "bot_add");
  if (threshold === 0) return;

  // Use fresh config for bot_add events
  const full = await getGuildConfig(guild.id);
  const freshCfg = ((full?.plugins as any)?.antinuke ?? {}) as AntiNukeYamlConfig;
  if (!freshCfg.enabled) return;

  const delay = freshCfg.audit_log_delay_ms ?? 500;
  const executorId = await getAuditExecutor(guild, AuditLogEvent.BotAdd, delay, member.id);
  if (!executorId) return;

  const roles = await resolveExecutorRoles(guild, executorId);
  await checkAndTrigger(client, guild, executorId, "bot_add", roles, freshCfg);
}

// ═══════════════════════════════════════════════════════════════════════════════
// @EVERYONE PERM CACHE INITIALIZER
// ═══════════════════════════════════════════════════════════════════════════════

/** Call at startup/guildCreate to prime the @everyone permission cache */
export function cacheEveryonePerms(guild: Guild): void {
  everyonePermCache.set(guild.id, guild.roles.everyone.permissions.bitfield);
}

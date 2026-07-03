import { Client, GuildMember, TextChannel, PermissionsBitField } from "discord.js";
import { getCachedConfig, getGuildConfig } from "../store/guildConfig";
import { sendYamlMessage, applyVars, buildVars } from "../lib/yamlFormatter";
import { addCase } from "../lib/cases";
import { dbGet, dbSet } from "../store/db";
import { logger } from "../../lib/logger";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG TYPES — mirrors the YAML schema under plugins.antiraid
// ═══════════════════════════════════════════════════════════════════════════════

interface AntiRaidVerificationGate {
  enabled?: boolean;
  auto_verify_age_days?: number;
  verified_role?: string | null;
}

interface AntiRaidAdvanced {
  similar_username_detection?: boolean;
  username_similarity_threshold?: number;
  default_avatar_flag?: boolean;
  join_pattern_detection?: boolean;
  min_account_age_in_guild_minutes?: number;
}

export interface AntiRaidMessages {
  raid_detected?: any;
  raid_ended?: any;
  raidmode_enabled?: any;
  raidmode_disabled?: any;
  raidmode_already_on?: string;
  raidmode_already_off?: string;
  raidmode_status_on?: any;
  raidmode_status_off?: any;
  lockdown_notice?: string;
  unlock_notice?: string;
  auto_unlock_warning?: string;
  new_account_flagged?: any;
  new_account_dm?: string;
  raid_member_dm?: string;
  quarantine_notice?: string;
  staff_alert?: any;
  raid_summary?: any;
  verification_required?: string;
  verified?: string;
}

export interface AntiRaidYamlConfig {
  enabled?: boolean;
  join_threshold?: number;
  join_interval_seconds?: number;
  account_age_min_days?: number;
  account_age_action?: "flag" | "kick" | "ban" | "quarantine";
  account_age_dm?: boolean;
  action?: "kick" | "ban" | "mute" | "quarantine" | "lockonly" | "flag";
  ban_delete_days?: number;
  dm_raid_members?: boolean;
  create_cases?: boolean;
  lockdown_channels?: string[];
  lock_during_raid?: boolean;
  post_lockdown_notice?: boolean;
  auto_unlock_minutes?: number;
  quarantine_role?: string | null;
  verification_gate?: AntiRaidVerificationGate;
  whitelist_roles?: string[];
  whitelist_users?: string[];
  alert_channel?: string | null;
  alert_roles?: string[];
  persist_raid_mode?: boolean;
  advanced?: AntiRaidAdvanced;
  messages?: AntiRaidMessages;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RAID STATE — DB-backed, optional persistence
// ═══════════════════════════════════════════════════════════════════════════════

export interface RaidState {
  active: boolean;
  activatedAt: number | null;
  activatedBy: string | null;
  lockedChannels: string[];
  actionedCount: number;
}

const RAID_STATE_STORE = "raid_state";

export async function getRaidState(guildId: string): Promise<RaidState> {
  return (
    (await dbGet<RaidState>(RAID_STATE_STORE, guildId)) ?? {
      active: false,
      activatedAt: null,
      activatedBy: null,
      lockedChannels: [],
      actionedCount: 0,
    }
  );
}

export async function setRaidState(guildId: string, state: RaidState): Promise<void> {
  await dbSet(RAID_STATE_STORE, guildId, state);
}

// ═══════════════════════════════════════════════════════════════════════════════
// IN-MEMORY TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

// guildId → array of join timestamps (ms), rolling window
const joinTimestamps = new Map<string, number[]>();

// guildId → channelId → original SendMessages override value
const lockedChannelPerms = new Map<string, Map<string, boolean | null>>();

// guildId → auto-unlock timer handle
const autoUnlockTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function getAntiRaidYamlCfg(guildId: string): AntiRaidYamlConfig | null {
  const full = getCachedConfig(guildId);
  const ar = ((full?.plugins as any)?.antiraid ?? {}) as AntiRaidYamlConfig;
  return ar.enabled ? ar : null;
}

function isWhitelisted(member: GuildMember, cfg: AntiRaidYamlConfig): boolean {
  if ((cfg.whitelist_users ?? []).includes(member.id)) return true;
  return (cfg.whitelist_roles ?? []).some((r) => member.roles.cache.has(r));
}

/** Levenshtein-based string similarity [0–1] */
function similarity(a: string, b: string): number {
  const la = a.toLowerCase(), lb = b.toLowerCase();
  if (la === lb) return 1;
  const m = la.length, n = lb.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        la[i - 1] === lb[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return 1 - dp[m][n] / Math.max(m, n);
}

async function sendToAlertChannel(
  guild: import("discord.js").Guild,
  cfg: AntiRaidYamlConfig,
  msg: any,
  vars: Record<string, string | undefined>
): Promise<void> {
  if (!msg) return;
  const chId = cfg.alert_channel;
  if (!chId) return;
  const ch = guild.channels.cache.get(chId) as TextChannel | undefined;
  if (!ch?.isTextBased()) return;
  await sendYamlMessage(ch, msg, buildVars(vars)).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHANNEL LOCKDOWN
// ═══════════════════════════════════════════════════════════════════════════════

export async function lockChannels(
  guild: import("discord.js").Guild,
  cfg: AntiRaidYamlConfig,
  msgs: AntiRaidMessages
): Promise<string[]> {
  const channelIds =
    cfg.lockdown_channels?.length
      ? cfg.lockdown_channels
      : guild.channels.cache
          .filter((c) => c.isTextBased() && !c.isDMBased())
          .map((c) => c.id);

  const locked: string[] = [];
  const permMap = new Map<string, boolean | null>();

  for (const chId of channelIds) {
    const ch = guild.channels.cache.get(chId) as TextChannel | undefined;
    if (!ch?.isTextBased()) continue;
    try {
      const existing = ch.permissionOverwrites.cache.get(guild.roles.everyone.id);
      const orig: boolean | null = existing?.allow.has(PermissionsBitField.Flags.SendMessages)
        ? true
        : existing?.deny.has(PermissionsBitField.Flags.SendMessages)
        ? false
        : null;
      permMap.set(chId, orig);
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      locked.push(chId);
      if (cfg.post_lockdown_notice !== false && msgs.lockdown_notice) {
        await ch.send(msgs.lockdown_notice).catch(() => {});
      }
    } catch (err) {
      logger.warn({ err, chId }, "antiraidHandler: failed to lock channel");
    }
  }

  lockedChannelPerms.set(guild.id, permMap);
  return locked;
}

export async function unlockChannels(
  guild: import("discord.js").Guild,
  lockedIds: string[],
  msgs: AntiRaidMessages
): Promise<number> {
  const permMap = lockedChannelPerms.get(guild.id) ?? new Map<string, boolean | null>();
  let count = 0;
  for (const chId of lockedIds) {
    const ch = guild.channels.cache.get(chId) as TextChannel | undefined;
    if (!ch) continue;
    try {
      const orig = permMap.get(chId) ?? null;
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: orig });
      count++;
      if (msgs.unlock_notice) {
        await ch.send(msgs.unlock_notice).catch(() => {});
      }
    } catch (err) {
      logger.warn({ err, chId }, "antiraidHandler: failed to unlock channel");
    }
  }
  lockedChannelPerms.delete(guild.id);
  return count;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION A SINGLE MEMBER
// ═══════════════════════════════════════════════════════════════════════════════

async function actionMember(
  guild: import("discord.js").Guild,
  member: GuildMember,
  action: string,
  cfg: AntiRaidYamlConfig,
  reason: string,
  dmMessage?: string
): Promise<boolean> {
  try {
    if (dmMessage) {
      await member.send(dmMessage).catch(() => {});
    }
    switch (action) {
      case "kick":
        await guild.members.kick(member.id, reason);
        break;
      case "ban":
        await guild.members.ban(member.id, {
          reason,
          deleteMessageSeconds: (cfg.ban_delete_days ?? 1) * 86400,
        });
        break;
      case "mute": {
        const until = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);
        await member.disableCommunicationUntil(until, reason);
        break;
      }
      case "quarantine": {
        const qRole = cfg.quarantine_role;
        if (qRole) {
          const roleIds = member.roles.cache
            .filter((r) => r.id !== guild.roles.everyone.id)
            .map((r) => r.id);
          for (const rId of roleIds) {
            await member.roles.remove(rId, reason).catch(() => {});
          }
          await member.roles.add(qRole, reason).catch(() => {});
        }
        break;
      }
      case "flag":
      case "lockonly":
      default:
        break;
    }
    return true;
  } catch (err) {
    logger.warn({ err, userId: member.id, action }, "antiraidHandler: failed to action member");
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEACTIVATE RAID MODE
// ═══════════════════════════════════════════════════════════════════════════════

export async function deactivateRaidMode(
  client: Client,
  guildId: string,
  triggeredBy: "auto" | "manual",
  modTag?: string
): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const state = await getRaidState(guildId);
  if (!state.active) return;

  const cfg = getAntiRaidYamlCfg(guildId);
  const msgs = cfg?.messages ?? {};

  const durationMinutes = state.activatedAt
    ? Math.round((Date.now() - state.activatedAt) / 60000)
    : 0;

  const unlocked = await unlockChannels(guild, state.lockedChannels, msgs);

  await setRaidState(guildId, {
    active: false,
    activatedAt: null,
    activatedBy: null,
    lockedChannels: [],
    actionedCount: 0,
  });

  const vars = {
    duration: String(durationMinutes),
    count: String(unlocked),
    mod: modTag ?? "Auto",
    "mod.mention": modTag ? `<@${modTag}>` : "Auto",
  };

  if (cfg) {
    const msgKey = triggeredBy === "manual" ? "raid_ended" : "raid_ended";
    await sendToAlertChannel(guild, cfg, msgs[msgKey], vars);
  }

  // Clear auto-unlock timer if exists
  const timer = autoUnlockTimers.get(guildId);
  if (timer) {
    clearTimeout(timer);
    autoUnlockTimers.delete(guildId);
  }

  logger.info({ guildId, triggeredBy, durationMinutes }, "antiraidHandler: raid mode deactivated");
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVATE RAID MODE
// ═══════════════════════════════════════════════════════════════════════════════

export async function activateRaidMode(
  client: Client,
  guild: import("discord.js").Guild,
  cfg: AntiRaidYamlConfig,
  raidMembers: GuildMember[],
  triggerType: "auto" | "manual",
  modTag?: string
): Promise<void> {
  const guildId = guild.id;

  const currentState = await getRaidState(guildId);
  if (currentState.active) return;

  const msgs = cfg.messages ?? {};
  const action = cfg.action ?? "kick";
  const threshold = cfg.join_threshold ?? 10;
  const intervalSec = cfg.join_interval_seconds ?? 10;

  // Post staff alert pings before anything else
  const alertChId = cfg.alert_channel;
  if (alertChId) {
    const alertCh = guild.channels.cache.get(alertChId) as TextChannel | undefined;
    if (alertCh?.isTextBased()) {
      const roleMentions = (cfg.alert_roles ?? []).map((r) => `<@&${r}>`).join(" ");
      if (roleMentions) {
        await alertCh.send(roleMentions).catch(() => {});
      }
      if (msgs.staff_alert) {
        await sendYamlMessage(alertCh, msgs.staff_alert, buildVars({
          count: String(raidMembers.length),
          duration: String(intervalSec),
          action,
          trigger: String(threshold),
          reason: String(intervalSec),
        })).catch(() => {});
      }
    }
  }

  // Lock channels
  let lockedIds: string[] = [];
  if (cfg.lock_during_raid !== false) {
    lockedIds = await lockChannels(guild, cfg, msgs);
  }

  // Save raid state
  await setRaidState(guildId, {
    active: true,
    activatedAt: Date.now(),
    activatedBy: modTag ?? "Auto-detection",
    lockedChannels: lockedIds,
    actionedCount: 0,
  });

  if (triggerType === "manual") {
    // Manual activation — just post alert and return
    const vars = buildVars({
      mod: modTag ?? "Manual",
      "mod.mention": modTag ?? "Manual",
      count: String(lockedIds.length),
      trigger: String(cfg.auto_unlock_minutes ?? 10),
    });
    await sendToAlertChannel(guild, cfg, msgs.raidmode_enabled, vars);
  } else {
    // Auto detection — action all raid members
    const baseVars = {
      count: String(raidMembers.length),
      duration: String(intervalSec),
      action,
      trigger: String(threshold),
      reason: String(intervalSec),
    };

    // Post raid_detected
    await sendToAlertChannel(guild, cfg, msgs.raid_detected, baseVars);

    let successCount = 0, failCount = 0;

    for (const member of raidMembers) {
      if (isWhitelisted(member, cfg)) continue;

      let dmMsg: string | undefined;
      if (cfg.dm_raid_members !== false && msgs.raid_member_dm) {
        dmMsg = applyVars(msgs.raid_member_dm, buildVars({
          action,
          server: guild.name,
          ...baseVars,
        }));
      }

      const ok = await actionMember(guild, member, action, cfg, "Automated raid response", dmMsg);
      if (ok) successCount++; else failCount++;

      if (cfg.create_cases !== false && action !== "flag" && action !== "lockonly") {
        await addCase(guildId, {
          action,
          userId: member.id,
          userTag: member.user.tag,
          modId: client.user?.id ?? "bot",
          modTag: client.user?.tag ?? "Bot",
          reason: "Automated raid response",
        }, { isAutomod: true }).catch(() => {});
      }
    }

    // Update state with actioned count
    const updatedState = await getRaidState(guildId);
    await setRaidState(guildId, { ...updatedState, actionedCount: successCount });

    // Post raid_summary
    await sendToAlertChannel(guild, cfg, msgs.raid_summary, {
      ...baseVars,
      success_count: String(successCount),
      fail_count: String(failCount),
    });

    logger.info(
      { guildId, action, total: raidMembers.length, successCount, failCount },
      "antiraidHandler: raid actioned"
    );
  }

  // Auto-unlock timer
  const autoMin = cfg.auto_unlock_minutes ?? 10;
  if (autoMin > 0) {
    const timer = setTimeout(() => {
      deactivateRaidMode(client, guildId, "auto").catch((err) =>
        logger.error({ err }, "antiraidHandler: auto-deactivate failed")
      );
    }, autoMin * 60_000);
    autoUnlockTimers.set(guildId, timer);
  }

  logger.info(
    { guildId, action, lockedCount: lockedIds.length, triggerType },
    "antiraidHandler: raid mode activated"
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT AGE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

async function handleAccountAge(
  guild: import("discord.js").Guild,
  member: GuildMember,
  cfg: AntiRaidYamlConfig
): Promise<void> {
  const minDays = cfg.account_age_min_days ?? 0;
  if (minDays === 0) return;

  const ageDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
  if (ageDays >= minDays) return;

  const msgs = cfg.messages ?? {};
  const accountAction = cfg.account_age_action ?? "flag";

  const vars = buildVars({
    user: member.user.tag,
    "user.id": member.id,
    "user.mention": `<@${member.id}>`,
    "user.avatar": member.user.displayAvatarURL(),
    "user.created_at": new Date(member.user.createdTimestamp).toLocaleDateString("en-US"),
    count: String(Math.floor(ageDays)),
    trigger: String(minDays),
    reason: accountAction,
    server: guild.name,
    action: accountAction,
  });

  // Log to alert channel
  await sendToAlertChannel(guild, cfg, msgs.new_account_flagged, vars);

  // DM before action
  if (cfg.account_age_dm !== false && accountAction !== "flag" && msgs.new_account_dm) {
    await member.send(applyVars(msgs.new_account_dm, vars)).catch(() => {});
  }

  // Take action
  if (accountAction !== "flag") {
    await actionMember(
      guild,
      member,
      accountAction,
      cfg,
      `Account age ${Math.floor(ageDays)}d below minimum ${minDays}d`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADVANCED: SIMILAR USERNAME DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function countSimilarUsernamePairs(
  usernames: string[],
  threshold: number
): number {
  let pairs = 0;
  for (let i = 0; i < usernames.length; i++) {
    for (let j = i + 1; j < usernames.length; j++) {
      if (similarity(usernames[i], usernames[j]) >= threshold) pairs++;
    }
  }
  return pairs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT: guildMemberAdd
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleAntiraidMemberJoin(
  client: Client,
  member: GuildMember
): Promise<void> {
  const guildId = member.guild.id;
  const guild = member.guild;

  // Load fresh YAML config (uses 30s cache)
  const full = await getGuildConfig(guildId);
  const cfg = ((full?.plugins as any)?.antiraid ?? {}) as AntiRaidYamlConfig;
  if (!cfg.enabled) return;

  // Whitelist: skip all checks
  if (isWhitelisted(member, cfg)) return;

  // 1. Account age check (always runs)
  await handleAccountAge(guild, member, cfg).catch((err) =>
    logger.warn({ err }, "antiraidHandler: account age check error")
  );

  // 2. Verification gate during active raid
  const state = await getRaidState(guildId);
  if (state.active) {
    const gate = cfg.verification_gate;
    if (gate?.enabled) {
      const ageDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
      const autoVerifyDays = gate.auto_verify_age_days ?? 30;
      if (autoVerifyDays === 0 || ageDays < autoVerifyDays) {
        if (cfg.quarantine_role) {
          await member.roles.add(cfg.quarantine_role, "Verification gate: raid mode active").catch(() => {});
        }
        const vmsg = cfg.messages?.verification_required;
        if (vmsg) await member.send(vmsg).catch(() => {});
      }
    }
    return; // raid already active, skip flood detection
  }

  // 3. Join flood detection
  const now = Date.now();
  const intervalMs = (cfg.join_interval_seconds ?? 10) * 1000;
  const threshold = cfg.join_threshold ?? 10;

  let stamps = joinTimestamps.get(guildId) ?? [];
  stamps.push(now);
  stamps = stamps.filter((t) => now - t < intervalMs);
  joinTimestamps.set(guildId, stamps);

  // 4. Advanced signals
  let effectiveCount = stamps.length;
  const advanced = cfg.advanced ?? {};

  if (advanced.similar_username_detection && stamps.length >= 2) {
    const simThreshold = advanced.username_similarity_threshold ?? 0.8;
    const recentUsernames = guild.members.cache
      .filter(
        (m) => m.joinedTimestamp != null && now - m.joinedTimestamp < intervalMs
      )
      .map((m) => m.user.username);
    const pairs = countSimilarUsernamePairs(recentUsernames, simThreshold);
    if (pairs > 0) {
      effectiveCount = Math.min(effectiveCount * 2, threshold + 5);
      logger.info(
        { guildId, pairs, effectiveCount },
        "antiraidHandler: similar usernames detected, boosting count"
      );
    }
  }

  if (advanced.default_avatar_flag && !member.user.avatar) {
    logger.info({ guildId, userId: member.id }, "antiraidHandler: default avatar detected");
  }

  // 5. Trigger raid mode?
  if (effectiveCount >= threshold) {
    // Collect all members who joined within the window
    const windowStart = now - intervalMs;
    const raidMembers = guild.members.cache
      .filter(
        (m) => m.joinedTimestamp != null && m.joinedTimestamp >= windowStart
      )
      .map((m) => m);

    // Reset timestamps so we don't re-trigger on the next join
    joinTimestamps.set(guildId, []);

    await activateRaidMode(client, guild, cfg, raidMembers, "auto").catch((err) =>
      logger.error({ err }, "antiraidHandler: activateRaidMode failed")
    );
  }
}

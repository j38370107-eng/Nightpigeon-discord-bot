/**
 * slowmodeAuto — automatic channel slowmode based on message-rate detection.
 *
 * HOW IT WORKS
 * ─────────────
 * Per channel, the bot keeps an in-memory list of message timestamps.
 * On every messageCreate it trims stale timestamps (outside window_seconds),
 * then checks if the remaining count ≥ messages_per_seconds.
 *
 * If so, slowmode is applied (or scaled up if scaling is enabled).
 * A background task (every 10 s) checks whether any auto-managed channel
 * has been calm for ≥ remove_after_seconds and removes slowmode if so.
 *
 * The plugin NEVER touches manually-set slowmode (slowmode set before
 * the bot applied it, or set via !slowmode command).
 * On bot restart, in-memory state is lost; any leftover slowmode will be
 * cleared the next time the channel sees activity (if calm long enough).
 */

import { Client, TextChannel } from "discord.js";
import type { Message } from "discord.js";
import { getGuildConfig } from "../store/guildConfig";
import { buildPayload } from "./msgTemplate";
import { logger } from "../../lib/logger";

// Config types
export interface SlowmodeAutoRule {
  channel: string | null;
  messages_per_seconds: number;
  window_seconds: number;
  apply_slowmode: number;
  remove_after_seconds: number;
  min_slowmode?: number;
  max_slowmode?: number;
  scale?: boolean;
  scale_step?: number;
  scale_max?: number;
  scale_interval?: number;
  notify_channel?: string | null;
  ignore_channels?: string[];
  ignore_roles?: string[];
  enabled?: boolean;
}

export interface SlowmodeAutoMessages {
  slowmode_applied?: string | object | null;
  slowmode_scaled?: string | object | null;
  slowmode_removed?: string | object | null;
}

export interface SlowmodeAutoConfig {
  enabled?: boolean;
  ignore_channels?: string[];
  ignore_roles?: string[];
  ignore_bots?: boolean;
  count_edits?: boolean;
  rules?: SlowmodeAutoRule[];
  messages?: SlowmodeAutoMessages;
}

// Valid Discord slowmode values
const VALID_SLOWMODE = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600];

function snapToDiscord(seconds: number): number {
  if (seconds <= 0) return 0;
  for (const v of VALID_SLOWMODE) {
    if (seconds <= v) return v;
  }
  return 21600;
}

// In-memory state
/** channelId → sorted list of message timestamps (ms) */
const channelTimestamps = new Map<string, number[]>();

interface ChannelState {
  ruleSnapshot: SlowmodeAutoRule;
  guildId: string;
  currentSlowmode: number;
  lastMessageAt: number;
  /** Timestamp (ms) when slowmode was last applied or scaled. Used for scale_interval */
  lastScaleAt: number;
}

/** channelId → active auto-slowmode state */
const managedChannels = new Map<string, ChannelState>();

// Rule lookup
function findRule(cfg: SlowmodeAutoConfig, channelId: string): SlowmodeAutoRule | null {
  const rules = cfg.rules ?? [];
  // Channel-specific first
  const specific = rules.find(
    (r) => (r.enabled ?? true) && r.channel === channelId
  );
  if (specific) return specific;
  // Global fallback
  const global = rules.find(
    (r) => (r.enabled ?? true) && r.channel === null
  );
  return global ?? null;
}

function isChannelIgnored(cfg: SlowmodeAutoConfig, rule: SlowmodeAutoRule, channelId: string): boolean {
  const globalIgnore = cfg.ignore_channels ?? [];
  const ruleIgnore = rule.ignore_channels ?? [];
  return globalIgnore.includes(channelId) || ruleIgnore.includes(channelId);
}

function isMemberIgnored(cfg: SlowmodeAutoConfig, rule: SlowmodeAutoRule, roleIds: string[]): boolean {
  const globalIgnore = cfg.ignore_roles ?? [];
  const ruleIgnore = rule.ignore_roles ?? [];
  const allIgnore = [...globalIgnore, ...ruleIgnore];
  return allIgnore.some((rid) => roleIds.includes(rid));
}

// Send a slowmode notification
async function sendSlowmodeMessage(
  client: Client,
  guildId: string,
  channelId: string,
  notifyChannelId: string | null | undefined,
  template: string | object | null | undefined,
  fallback: string,
  vars: Record<string, string | number>
): Promise<void> {
  if (template === null) return; // explicit null = silent

  const targetChannelId = notifyChannelId ?? channelId;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const ch = guild.channels.cache.get(targetChannelId) as TextChannel | undefined;
  if (!ch || !ch.isTextBased()) return;

  const payload = buildPayload(
    template as any,
    {
      ...vars,
      timestamp: new Date().toLocaleTimeString(),
    },
    fallback
  );

  await ch.send(payload).catch((err) =>
    logger.warn({ err, channelId: targetChannelId }, "slowmodeAuto: failed to send message")
  );
}

// Core handler — called on every messageCreate
export async function handleSlowmodeAuto(
  client: Client,
  message: Message
): Promise<void> {
  if (!message.guild) return;

  const guildId = message.guild.id;
  const channelId = message.channelId;

  const cfg = await getGuildConfig(guildId);
  const autoConfig: SlowmodeAutoConfig | undefined =
    (cfg as any).plugins?.slowmode_auto ?? (cfg as any).slowmode_auto;

  if (!autoConfig?.enabled) return;

  // Bot / role ignore checks
  const ignoreBots = autoConfig.ignore_bots !== false; // default true
  if (ignoreBots && message.author.bot) return;

  const rule = findRule(autoConfig, channelId);
  if (!rule) return;

  if (isChannelIgnored(autoConfig, rule, channelId)) return;

  const memberRoles = message.member?.roles.cache.map((r) => r.id) ?? [];
  if (isMemberIgnored(autoConfig, rule, memberRoles)) {
    // Still update last-message time so calm detection works
    const state = managedChannels.get(channelId);
    if (state) state.lastMessageAt = Date.now();
    return;
  }

  // Timestamp tracking
  const now = Date.now();
  const windowMs = rule.window_seconds * 1000;
  const cutoff = now - windowMs;

  const timestamps = channelTimestamps.get(channelId) ?? [];
  const fresh = timestamps.filter((t) => t >= cutoff);
  fresh.push(now);
  channelTimestamps.set(channelId, fresh);

  // Update calm-detection timestamp
  const state = managedChannels.get(channelId);
  if (state) state.lastMessageAt = now;

  if (fresh.length < rule.messages_per_seconds) return;

  // Threshold exceeded — apply or scale
  const channel = message.guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel?.isTextBased()) return;

  const minSlowmode = rule.min_slowmode ?? 0;
  const maxSlowmode = rule.max_slowmode ?? 21600;
  const msgs = autoConfig.messages ?? {};

  if (!managedChannels.has(channelId)) {
    // First trigger — apply initial slowmode
    const raw = Math.max(rule.apply_slowmode, minSlowmode);
    const capped = Math.min(raw, maxSlowmode);
    const snapped = snapToDiscord(capped);

    await channel.setRateLimitPerUser(snapped, "Auto-slowmode: high activity").catch((err) =>
      logger.warn({ err, channelId }, "slowmodeAuto: failed to set slowmode")
    );

    managedChannels.set(channelId, {
      ruleSnapshot: rule,
      guildId,
      currentSlowmode: snapped,
      lastMessageAt: now,
      lastScaleAt: now,
    });

    logger.info({ guildId, channelId, slowmode: snapped }, "slowmodeAuto: applied");

    const channelObj = message.guild.channels.cache.get(channelId);
    const channelName = "name" in (channelObj ?? {}) ? (channelObj as any).name : channelId;

    await sendSlowmodeMessage(
      client, guildId, channelId,
      rule.notify_channel,
      msgs.slowmode_applied ?? `🐢 Slowmode of **{count}s** applied due to high activity`,
      "🐢 Slowmode of {count}s applied due to high activity",
      {
        count: snapped,
        channel: channelName,
        "channel.mention": `<#${channelId}>`,
        trigger: fresh.length,
        reason: rule.window_seconds,
      }
    );
  } else if (rule.scale) {
    // Scaling — check if scale_interval has elapsed
    const activeState = managedChannels.get(channelId)!;
    const scaleInterval = (rule.scale_interval ?? 30) * 1000;
    if (now - activeState.lastScaleAt < scaleInterval) return;

    const scaleMax = Math.min(rule.scale_max ?? maxSlowmode, maxSlowmode);
    const nextRaw = activeState.currentSlowmode + (rule.scale_step ?? 5);
    if (nextRaw > scaleMax) return; // already at cap

    const nextCapped = Math.min(nextRaw, scaleMax);
    const nextSnapped = snapToDiscord(nextCapped);
    if (nextSnapped <= activeState.currentSlowmode) return;

    await channel.setRateLimitPerUser(nextSnapped, "Auto-slowmode: sustained high activity").catch((err) =>
      logger.warn({ err, channelId }, "slowmodeAuto: failed to scale slowmode")
    );

    activeState.currentSlowmode = nextSnapped;
    activeState.lastScaleAt = now;

    logger.info({ guildId, channelId, slowmode: nextSnapped }, "slowmodeAuto: scaled");

    const channelObj = message.guild.channels.cache.get(channelId);
    const channelName = "name" in (channelObj ?? {}) ? (channelObj as any).name : channelId;

    await sendSlowmodeMessage(
      client, guildId, channelId,
      rule.notify_channel,
      msgs.slowmode_scaled ?? `📈 Slowmode increased to **{count}s** due to continued high activity`,
      "📈 Slowmode increased to {count}s due to continued high activity",
      {
        count: nextSnapped,
        channel: channelName,
        "channel.mention": `<#${channelId}>`,
        trigger: fresh.length,
        reason: rule.window_seconds,
      }
    );
  }
}

// Also called on messageUpdate if count_edits is true
export async function handleSlowmodeAutoEdit(
  client: Client,
  message: Message
): Promise<void> {
  if (!message.guild) return;
  const guildId = message.guild.id;
  const cfg = await getGuildConfig(guildId);
  const autoConfig: SlowmodeAutoConfig | undefined =
    (cfg as any).plugins?.slowmode_auto ?? (cfg as any).slowmode_auto;

  if (!autoConfig?.enabled) return;
  if (!autoConfig.count_edits) return;

  await handleSlowmodeAuto(client, message);
}

// Background calm-check scheduler
export function startSlowmodeAutoScheduler(client: Client): void {
  setInterval(async () => {
    const now = Date.now();
    for (const [channelId, state] of managedChannels.entries()) {
      const rule = state.ruleSnapshot;
      const calmMs = rule.remove_after_seconds * 1000;
      if (now - state.lastMessageAt < calmMs) continue;

      // Channel has been calm long enough — remove auto-slowmode
      const guild = client.guilds.cache.get(state.guildId);
      if (!guild) {
        managedChannels.delete(channelId);
        channelTimestamps.delete(channelId);
        continue;
      }

      const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
      if (channel?.isTextBased()) {
        const removedSlowmode = state.currentSlowmode;
        await channel.setRateLimitPerUser(0, "Auto-slowmode: activity calmed").catch((err) =>
          logger.warn({ err, channelId }, "slowmodeAuto: failed to remove slowmode")
        );
        logger.info({ guildId: state.guildId, channelId }, "slowmodeAuto: removed (channel calm)");

        const cfg = await getGuildConfig(state.guildId).catch(() => null);
        const autoConfig: SlowmodeAutoConfig | undefined = cfg
          ? ((cfg as any).plugins?.slowmode_auto ?? (cfg as any).slowmode_auto)
          : undefined;
        const msgs = autoConfig?.messages ?? {};

        const channelName = "name" in channel ? channel.name : channelId;

        await sendSlowmodeMessage(
          client, state.guildId, channelId,
          rule.notify_channel,
          msgs.slowmode_removed ?? `✅ Slowmode removed — activity has calmed down`,
          "✅ Slowmode removed — activity has calmed down",
          {
            count: removedSlowmode,
            channel: channelName,
            "channel.mention": `<#${channelId}>`,
          }
        ).catch(() => {});
      }

      managedChannels.delete(channelId);
      channelTimestamps.delete(channelId);
    }
  }, 10_000); // every 10 seconds
}

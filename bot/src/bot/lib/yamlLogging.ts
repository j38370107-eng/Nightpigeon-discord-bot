/**
 * YAML-driven logging system (3-category schema).
 *
 * Reads `logging.config` from the guild's YAML and routes log events to the
 * correct Discord channel using this resolution algorithm per event:
 *
 *   1. Detect category: "server" | "moderation" | "mass_action"
 *      (can be overridden via ctx.category)
 *   2. If category.enabled[eventKey] === false → skip entirely.
 *   3. Look up category.events[eventKey] to get a named channel alias.
 *      Resolve through channels[alias] → Discord channel ID.
 *      If alias looks like a raw snowflake, use it directly.
 *   4. Fall back to default_channels[category].
 *   5. Legacy flat-schema fallback (default_log_channel / events / enabled).
 *   6. If still no channel → skip silently.
 *
 * Message template resolution:
 *   If category.messages[eventKey] exists, build an embed from that YAML
 *   template (supports title / description / color / fields).
 *   Otherwise, build a default embed from the event key name + vars.
 *
 * Duplicate suppression:
 *   A short-lived in-memory flag (guildId:userId:actionType) prevents
 *   gateway-sourced server-log events from double-firing when a mod command
 *   already sent a moderation log for the same action.
 */

import {
  AttachmentBuilder,
  Client,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { getCachedConfig, getGuildConfig } from "../store/guildConfig";
import type { YamlLoggingConfig } from "../store/guildConfig";
import { applyVars, buildVars, buildYamlEmbed } from "./yamlFormatter";
import type { TemplateVars } from "./yamlFormatter";
import { sendViaWebhook } from "./webhookSender";
import { logger } from "../../lib/logger";

// Category detection
const MODERATION_EVENTS = new Set([
  // New clean keys (matching docs schema)
  "warn", "mute", "unmute", "kick", "ban", "unban", "softban", "forceban",
  "tempban", "note", "timeout", "timeout_remove", "role_add", "role_remove",
  "nickname_reset", "nickname_force", "case_edit", "case_delete", "case_hide",
  // Legacy keys still emitted by modlog.ts and serverLogEvents
  "member_ban", "member_unban", "member_kick", "member_timeout",
  "timeout_removed", "member_warn", "member_note", "mod_action",
]);

const MASS_ACTION_EVENTS = new Set([
  "massban", "masskick", "masswarn", "massmute", "massunmute",
  "massrole_add", "massrole_remove", "clean", "lock", "unlock",
  "slowmode_set", "purge_invites", "prune_members",
]);

type LogCategory = "server" | "moderation" | "mass_action";

function detectCategory(eventKey: string): LogCategory {
  if (MODERATION_EVENTS.has(eventKey)) return "moderation";
  if (MASS_ACTION_EVENTS.has(eventKey)) return "mass_action";
  return "server";
}

// Duplicate suppression
const dupSuppressMap = new Map<string, number>();
const DUP_SUPPRESS_TTL_MS = 5_000;

export function suppressModDuplicate(
  guildId: string,
  userId: string,
  actionType: string
): void {
  const key = `${guildId}:${userId}:${actionType}`;
  dupSuppressMap.set(key, Date.now() + DUP_SUPPRESS_TTL_MS);
}

export function isModDuplicateSuppressed(
  guildId: string,
  userId: string,
  actionType: string
): boolean {
  const key = `${guildId}:${userId}:${actionType}`;
  const exp = dupSuppressMap.get(key);
  if (!exp) return false;
  if (Date.now() > exp) {
    dupSuppressMap.delete(key);
    return false;
  }
  return true;
}

// Channel resolution
const SNOWFLAKE_RE = /^\d{17,20}$/;

function resolveChannel(
  cfg: YamlLoggingConfig,
  eventKey: string,
  category: LogCategory
): string | null {
  const catCfg = cfg[category];

  // 1. Per-event enabled check
  if (catCfg?.enabled?.[eventKey] === false) return null;

  // 2. Per-event channel alias → named channel ID (or raw snowflake)
  const alias = catCfg?.events?.[eventKey];
  if (alias) {
    if (SNOWFLAKE_RE.test(alias)) return alias;
    const id = cfg.channels?.[alias];
    if (id && SNOWFLAKE_RE.test(id)) return id;
  }

  // 3. Per-category default
  const catDefault = cfg.default_channels?.[category];
  if (catDefault && SNOWFLAKE_RE.test(catDefault)) return catDefault;

  // 4. Legacy flat-schema fallbacks
  if (cfg.enabled?.[eventKey] === false) return null;
  const legacyAlias = cfg.events?.[eventKey];
  if (legacyAlias) {
    if (SNOWFLAKE_RE.test(legacyAlias)) return legacyAlias;
    const legacyId = cfg.channels?.[legacyAlias];
    if (legacyId && SNOWFLAKE_RE.test(legacyId)) return legacyId;
  }
  if (cfg.default_log_channel && SNOWFLAKE_RE.test(cfg.default_log_channel)) {
    return cfg.default_log_channel;
  }

  return null;
}

// Embed colour helper
const RED     = 0xED4245;
const YELLOW  = 0xFEE75C;
const GREEN   = 0x57F287;
const BLURPLE = 0x5865F2;

const EVENT_COLORS: Record<string, number> = {
  // red
  message_delete: RED, message_delete_bulk: RED, message_bulk_delete: RED,
  member_ban: RED, ban: RED, tempban: RED, softban: RED, forceban: RED,
  member_kick: RED, kick: RED, member_leave: RED,
  channel_delete: RED, role_delete: RED, emoji_delete: RED,
  sticker_delete: RED, thread_delete: RED, invite_delete: RED,
  webhook_delete: RED, massban: RED, masskick: RED,
  // yellow
  message_edit: YELLOW, member_timeout: YELLOW, timeout: YELLOW,
  nickname_change: YELLOW, nickname_reset: YELLOW, nickname_force: YELLOW,
  member_nickname_change: YELLOW, username_change: YELLOW,
  member_username_change: YELLOW, avatar_change: YELLOW,
  roles_change: YELLOW, member_roles_change: YELLOW,
  role_update: YELLOW, channel_update: YELLOW, server_update: YELLOW,
  boost_change: YELLOW, thread_update: YELLOW,
  warn: YELLOW, masswarn: YELLOW, massmute: YELLOW, case_edit: YELLOW,
  slowmode_set: YELLOW, lock: YELLOW, clean: YELLOW, prune_members: YELLOW,
  // green
  member_join: GREEN, member_unban: GREEN, unban: GREEN,
  mute: GREEN, unmute: GREEN, massunmute: GREEN,
  channel_create: GREEN, role_create: GREEN, emoji_create: GREEN,
  sticker_create: GREEN, thread_create: GREEN, invite_create: GREEN,
  webhook_create: GREEN, bot_added: GREEN, role_add: GREEN,
  massrole_add: GREEN, unlock: GREEN,
};

function eventColor(eventKey: string): number {
  return EVENT_COLORS[eventKey] ?? BLURPLE;
}

// Default embed builder
/**
 * Build a structured embed from template vars when no YAML message template
 * is configured. Uses vars.title / vars.description / vars.footer directly,
 * then adds every remaining var (before, after, author, content, etc.) as an
 * inline embed field — producing the same look as the legacy DB log path.
 */
function buildDefaultEmbed(eventKey: string, vars: TemplateVars): EmbedBuilder {
  const META = new Set([
    "title", "description", "footer", "thumbnail", "image",
    "timestamp", "timestamp.date", "timestamp.time",
  ]);

  const title =
    (vars.title ? String(vars.title) : null) ??
    eventKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const embed = new EmbedBuilder()
    .setTitle(title.slice(0, 256))
    .setTimestamp()
    .setColor(eventColor(eventKey));

  if (vars.description) embed.setDescription(String(vars.description).slice(0, 4096));
  if (vars.footer)      embed.setFooter({ text: String(vars.footer).slice(0, 2048) });
  if (vars.thumbnail && String(vars.thumbnail).startsWith("http"))
    embed.setThumbnail(String(vars.thumbnail));

  const fields = Object.entries(vars)
    .filter(([k, v]) => !META.has(k) && v)
    .map(([k, v]) => ({
      name:   k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 256),
      value:  String(v).slice(0, 1024),
      inline: true,
    }));

  if (fields.length) embed.addFields(fields.slice(0, 25));
  return embed;
}

// Text file builder (bulk deletes / mass actions)
function buildTextFile(eventKey: string, vars: TemplateVars): AttachmentBuilder {
  const lines: string[] = [
    `Event: ${eventKey}`,
    `Time: ${vars["timestamp"] ?? new Date().toISOString()}`,
  ];
  const skip = new Set(["timestamp", "timestamp.date", "timestamp.time"]);
  for (const [k, v] of Object.entries(vars)) {
    if (skip.has(k) || !v) continue;
    lines.push(`${k}: ${v}`);
  }
  const buf = Buffer.from(lines.join("\n"), "utf-8");
  return new AttachmentBuilder(buf, { name: `${eventKey}_${Date.now()}.txt` });
}

// Message sender
async function sendToChannel(
  client: Client,
  channelId: string,
  eventKey: string,
  vars: TemplateVars,
  cfg: YamlLoggingConfig,
  category: LogCategory,
  attachFile = false
): Promise<void> {
  let channel: TextChannel | null = null;
  try {
    channel = (await client.channels.fetch(channelId)) as TextChannel;
  } catch {
    return;
  }
  if (!channel || !("send" in channel)) return;

  // Prefer YAML-defined message template if present
  const msgTemplate = cfg[category]?.messages?.[eventKey];

  const embed = msgTemplate
    ? buildYamlEmbed(msgTemplate, vars).setTimestamp()
    : buildDefaultEmbed(eventKey, vars);

  if (attachFile) {
    const file = buildTextFile(eventKey, vars);
    await sendViaWebhook(client, channel, { embeds: [embed], files: [file] });
  } else {
    await sendViaWebhook(client, channel, { embeds: [embed] });
  }
}

// Public API
export interface YamlLogContext {
  /** The event key, e.g. "message_delete", "ban", "massban" */
  eventKey: string;
  /** Placeholder vars for embed fields */
  vars: Record<string, string | undefined>;
  /** Override the auto-detected category */
  category?: LogCategory;
  /** If true, attach a .txt file (bulk deletes, mass action lists) */
  attachFile?: boolean;
}

/**
 * Send a log event through the YAML-driven logging system (DB-backed config).
 * Silently does nothing if logging is not configured or the event is
 * disabled / has no channel mapped.
 */
export async function sendYamlLog(
  client: Client,
  guildId: string,
  ctx: YamlLogContext
): Promise<void> {
  try {
    const cfg = await getGuildConfig(guildId);
    const loggingCfg = cfg.logging?.config;
    if (!loggingCfg) return;

    const category = ctx.category ?? detectCategory(ctx.eventKey);
    const channelId = resolveChannel(loggingCfg, ctx.eventKey, category);
    if (!channelId) return;

    const vars = buildVars(ctx.vars);
    await sendToChannel(client, channelId, ctx.eventKey, vars, loggingCfg, category, ctx.attachFile);
  } catch (err) {
    logger.warn({ err, guildId, eventKey: ctx.eventKey }, "YAML log send failed");
  }
}

/**
 * Cached-config version for hot paths (avoids a full DB hit).
 */
export async function sendYamlLogCached(
  client: Client,
  guildId: string,
  ctx: YamlLogContext
): Promise<void> {
  try {
    const cfg = getCachedConfig(guildId);
    const loggingCfg = cfg.logging?.config;
    if (!loggingCfg) return;

    const category = ctx.category ?? detectCategory(ctx.eventKey);
    const channelId = resolveChannel(loggingCfg, ctx.eventKey, category);
    if (!channelId) return;

    const vars = buildVars(ctx.vars);
    await sendToChannel(client, channelId, ctx.eventKey, vars, loggingCfg, category, ctx.attachFile);
  } catch (err) {
    logger.warn({ err, guildId, eventKey: ctx.eventKey }, "YAML log (cached) send failed");
  }
}

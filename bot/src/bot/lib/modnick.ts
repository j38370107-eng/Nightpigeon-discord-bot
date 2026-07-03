/**
 * Modnick — automatic nickname moderation engine.
 *
 * Runs 10 detection rules in order. The first rule that fires wins.
 * Supports four action types: rename, warn, mute, log.
 * Fires automatically on guildMemberAdd and guildMemberUpdate.
 * Can also be triggered manually via !modnick @user.
 */

import { Client, GuildMember } from "discord.js";
import { getGuildConfig } from "../store/guildConfig";
import type { GuildConfig, YamlMessage } from "../store/guildConfig";
import { buildPayload } from "./msgTemplate";
import { addCase } from "./cases";
import { sendModLog } from "./modlog";
import { parseDuration } from "./parseDuration";
import { getMuteConfig } from "../store/muteConfig";
import { logger } from "../../lib/logger";

// Config types
export interface ModnickHoistRule {
  enabled?: boolean;
  hoist_characters?: string[];
  allow_emoji_start?: boolean;
}

export interface ModnickBlankRule {
  enabled?: boolean;
  invisible_characters?: string[];
}

export interface ModnickUnreadableRule {
  enabled?: boolean;
  min_readable_ratio?: number;
  allow_unicode_names?: boolean;
}

export interface ModnickZalgoRule {
  enabled?: boolean;
  max_combining_chars?: number;
}

export interface ModnickBadWordsRule {
  enabled?: boolean;
  use_automod_wordlist?: boolean;
  custom_words?: string[];
  normalize_map?: Record<string, string>;
  whole_word_only?: boolean;
  /** Match words with exact casing instead of case-insensitively. Defaults to false. */
  case_sensitive?: boolean;
}

export interface ModnickImpersonationRule {
  enabled?: boolean;
  protected_names?: string[];
  protected_users?: string[];
  similarity_threshold?: number;
}

export interface ModnickMassMentionsRule {
  enabled?: boolean;
  block_at_symbol?: boolean;
}

export interface ModnickExcessiveSpecialCharsRule {
  enabled?: boolean;
  max_special_ratio?: number;
  allowed_special_chars?: string;
}

export interface ModnickTooLongRule {
  enabled?: boolean;
  max_length?: number;
}

export interface ModnickCustomPatternsRule {
  enabled?: boolean;
  patterns?: string[];
  /** Evaluate regex patterns with exact casing instead of case-insensitively. Defaults to false. */
  case_sensitive?: boolean;
}

export interface ModnickRules {
  hoist?: ModnickHoistRule;
  blank?: ModnickBlankRule;
  unreadable?: ModnickUnreadableRule;
  zalgo?: ModnickZalgoRule;
  bad_words?: ModnickBadWordsRule;
  impersonation?: ModnickImpersonationRule;
  mass_mentions?: ModnickMassMentionsRule;
  excessive_special_chars?: ModnickExcessiveSpecialCharsRule;
  too_long?: ModnickTooLongRule;
  custom_patterns?: ModnickCustomPatternsRule;
}

export interface ModnickActionConfig {
  type?: "rename" | "warn" | "mute" | "log";
  warn_on_rename?: boolean;
  warn_reason?: string;
  mute_duration?: string | null;
  revert_after_seconds?: number | null;
}

export interface ModnickMessages {
  nickname_changed?: YamlMessage;
  nickname_changed_dm?: YamlMessage;
  modnick_manual?: YamlMessage;
  modnick_clean?: YamlMessage;
  modnick_no_nick?: YamlMessage;
  error_hierarchy?: YamlMessage;
  error_missing_perms?: YamlMessage;
}

export interface ModnickConfig {
  enabled?: boolean;
  default_name?: string;
  random_names?: string[];
  log_changes?: boolean;
  dm_on_change?: boolean;
  recheck_on_rejoin?: boolean;
  recheck_on_boost?: boolean;
  staff_bypass?: boolean;
  bypass_roles?: string[];
  bypass_users?: string[];
  rules?: ModnickRules;
  action?: ModnickActionConfig;
  messages?: ModnickMessages;
}

// Constants
const DEFAULT_HOIST_CHARS = new Set([
  "!", "\"", "#", "$", "%", "&", "'", "(", ")", "*", "+", ",", "-", ".", "/",
  ":", ";", "<", "=", ">", "?", "@", "[", "\\", "]", "^", "_", "`", "{", "|", "}", "~",
  " ",
]);

const DEFAULT_INVISIBLE_CHARS = [
  "\u200B", "\u200C", "\u200D", "\u2060", "\uFEFF", "\u00AD", "\u180E", "\u2800",
];

const EMOJI_START_RE = /^\p{Emoji_Presentation}/u;

const COMBINING_RANGES: [number, number][] = [
  [0x0300, 0x036F],
  [0x0610, 0x061A],
  [0x064B, 0x065F],
  [0x1AB0, 0x1AFF],
  [0x1DC0, 0x1DFF],
  [0x20D0, 0x20FF],
  [0xFE20, 0xFE2F],
];

const DEFAULT_NORMALIZE_MAP: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a",
  "5": "s", "7": "t", "@": "a", "$": "s", "!": "i",
};

// Low-level helpers
function isCombining(cp: number): boolean {
  return COMBINING_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

function isReadableChar(cp: number, allowUnicode: boolean): boolean {
  if (cp >= 0x0020 && cp <= 0x007E) return true;
  if (cp >= 0x00A0 && cp <= 0x024F) return true;
  if (cp >= 0x1E00 && cp <= 0x1EFF) return true;

  if (allowUnicode) {
    if (cp >= 0x0370 && cp <= 0x03FF) return true;
    if (cp >= 0x0400 && cp <= 0x04FF) return true;
    if (cp >= 0x0590 && cp <= 0x05FF) return true;
    if (cp >= 0x0600 && cp <= 0x06FF) return true;
    if (cp >= 0x3040 && cp <= 0x30FF) return true;
    if (cp >= 0x4E00 && cp <= 0x9FFF) return true;
    if (cp >= 0xAC00 && cp <= 0xD7AF) return true;
  }

  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

function similarity(a: string, b: string): number {
  const al = a.toLowerCase(), bl = b.toLowerCase();
  const longer = al.length >= bl.length ? al : bl;
  const shorter = al.length >= bl.length ? bl : al;
  if (longer.length === 0) return 1;
  return (longer.length - levenshtein(longer, shorter)) / longer.length;
}

function normalizeWithMap(nick: string, map: Record<string, string>, caseSensitive = false): string {
  let out = caseSensitive ? nick : nick.toLowerCase();
  for (const [from, to] of Object.entries(map)) {
    out = out.split(from).join(to);
  }
  return out;
}

function getAutomodWords(cfg: GuildConfig): string[] {
  const words: string[] = [];
  const rules: Record<string, any> = (cfg as any)?.automod?.config?.rules ?? {};
  for (const rule of Object.values(rules)) {
    for (const trigger of rule?.triggers ?? []) {
      if (trigger?.type === "word_filter" && Array.isArray(trigger.words)) {
        words.push(...trigger.words);
      }
    }
  }
  return words;
}

function pickEnforcedName(mcfg: ModnickConfig): string {
  const randoms = mcfg.random_names ?? [];
  if (randoms.length > 0) return randoms[Math.floor(Math.random() * randoms.length)]!;
  return mcfg.default_name ?? "Moderated Nickname";
}

function getMemberLevel(member: GuildMember, cfg: GuildConfig): number {
  const uid = member.id;
  const BOT_OWNER = process.env["BOT_OWNER_ID"];
  if (BOT_OWNER && uid === BOT_OWNER) return 100;
  if (uid === member.guild.ownerId) return 100;
  const levels = cfg.levels;
  let level = levels.users[uid] ?? 0;
  for (const [roleId, roleLevel] of Object.entries(levels.roles)) {
    if (member.roles.cache.has(roleId)) level = Math.max(level, roleLevel);
  }
  return level;
}

// Rule checkers
function checkHoist(nick: string, rule?: ModnickHoistRule): string | null {
  if (!rule?.enabled) return null;
  const chars = [...nick];
  const first = chars[0];
  if (!first) return null;
  if (rule.allow_emoji_start && EMOJI_START_RE.test(nick)) return null;
  const customChars = rule.hoist_characters ?? [];
  const hoistSet = customChars.length > 0 ? new Set(customChars) : DEFAULT_HOIST_CHARS;
  const invisSet = new Set(DEFAULT_INVISIBLE_CHARS);
  if (hoistSet.has(first) || invisSet.has(first)) return "hoist";
  return null;
}

function checkBlank(nick: string, rule?: ModnickBlankRule): string | null {
  if (!rule?.enabled) return null;
  const invisSet = new Set(rule.invisible_characters ?? DEFAULT_INVISIBLE_CHARS);
  const stripped = [...nick].filter(c => c.trim() !== "" && !invisSet.has(c)).join("");
  return stripped.length === 0 ? "blank" : null;
}

function checkUnreadable(nick: string, rule?: ModnickUnreadableRule): string | null {
  if (!rule?.enabled) return null;
  const minRatio = rule.min_readable_ratio ?? 0.3;
  const allowUnicode = rule.allow_unicode_names ?? false;
  let readable = 0, total = 0;
  for (const char of nick) {
    const cp = char.codePointAt(0) ?? 0;
    if (isCombining(cp)) continue;
    total++;
    if (isReadableChar(cp, allowUnicode)) readable++;
  }
  if (total === 0) return null;
  return readable / total < minRatio ? "unreadable" : null;
}

function checkZalgo(nick: string, rule?: ModnickZalgoRule): string | null {
  if (!rule?.enabled) return null;
  const max = rule.max_combining_chars ?? 4;
  let count = 0;
  for (const char of nick) {
    const cp = char.codePointAt(0) ?? 0;
    if (isCombining(cp)) {
      count++;
      if (count > max) return "zalgo";
    } else {
      count = 0;
    }
  }
  return null;
}

function checkBadWords(nick: string, rule?: ModnickBadWordsRule, cfg?: GuildConfig): string | null {
  if (!rule?.enabled) return null;
  const caseSensitive = rule.case_sensitive ?? false;
  const map = rule.normalize_map ?? DEFAULT_NORMALIZE_MAP;
  const normalized = normalizeWithMap(nick, map, caseSensitive);
  const words: string[] = [...(rule.custom_words ?? [])];
  if (rule.use_automod_wordlist !== false && cfg) words.push(...getAutomodWords(cfg));
  const wholeWord = rule.whole_word_only ?? false;
  const regexFlags = caseSensitive ? "" : "i";
  for (const word of words) {
    if (!word) continue;
    const w = caseSensitive ? word : word.toLowerCase();
    if (wholeWord) {
      try {
        if (new RegExp(`(?<![a-zA-Z0-9])${escapeRegex(w)}(?![a-zA-Z0-9])`, regexFlags).test(normalized)) return "bad_words";
      } catch {
        if (normalized.includes(w)) return "bad_words";
      }
    } else {
      if (normalized.includes(w)) return "bad_words";
    }
  }
  return null;
}

async function checkImpersonation(nick: string, rule: ModnickImpersonationRule | undefined, member: GuildMember): Promise<string | null> {
  if (!rule?.enabled) return null;
  const threshold = rule.similarity_threshold ?? 0.85;
  const nickLower = nick.toLowerCase();
  const protected_: string[] = [...(rule.protected_names ?? [])];

  for (const uid of (rule.protected_users ?? [])) {
    const m = await member.guild.members.fetch(uid).catch(() => null);
    if (m) {
      protected_.push(m.displayName);
      protected_.push(m.user.username);
    }
  }

  for (const name of protected_) {
    if (name.toLowerCase() === member.displayName.toLowerCase()) continue;
    if (similarity(nickLower, name) >= threshold) return "impersonation";
  }
  return null;
}

function checkMassMentions(nick: string, rule?: ModnickMassMentionsRule): string | null {
  if (!rule?.enabled) return null;
  if (rule.block_at_symbol !== false) {
    if (nick.includes("@")) return "mass_mentions";
  } else {
    const lower = nick.toLowerCase();
    if (lower.includes("@everyone") || lower.includes("@here")) return "mass_mentions";
  }
  return null;
}

function checkExcessiveSpecialChars(nick: string, rule?: ModnickExcessiveSpecialCharsRule): string | null {
  if (!rule?.enabled) return null;
  const maxRatio = rule.max_special_ratio ?? 0.5;
  const allowed = new Set([...(rule.allowed_special_chars ?? "-_. ")]);
  let special = 0, total = 0;
  for (const char of nick) {
    const cp = char.codePointAt(0) ?? 0;
    total++;
    const isAlnum = (cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A) || (cp >= 0x30 && cp <= 0x39);
    if (!isAlnum && !allowed.has(char)) special++;
  }
  if (total === 0) return null;
  return special / total > maxRatio ? "excessive_special_chars" : null;
}

function checkTooLong(nick: string, rule?: ModnickTooLongRule): string | null {
  if (!rule?.enabled) return null;
  return [...nick].length > (rule.max_length ?? 25) ? "too_long" : null;
}

function checkCustomPatterns(nick: string, rule?: ModnickCustomPatternsRule): string | null {
  if (!rule?.enabled) return null;
  const flags = rule.case_sensitive ? "" : "i";
  for (const pattern of (rule.patterns ?? [])) {
    try {
      if (new RegExp(pattern, flags).test(nick)) return "custom_patterns";
    } catch {
      logger.debug({ pattern }, "modnick: invalid custom regex pattern — skipping");
    }
  }
  return null;
}

// Public API
export type ModnickSource = "join" | "update" | "boost" | "manual";

export interface ModnickResult {
  triggered: boolean;
  rule?: string;
  newNick?: string;
  skipped?: boolean;
}

/**
 * Run modnick enforcement on a guild member.
 *
 * @param client  Discord client (for logging)
 * @param member  The member whose nickname should be checked
 * @param source  What triggered this check
 * @param replyFn Optional reply function for error messages (manual invocation)
 */
export async function runModnick(
  client: Client,
  member: GuildMember,
  source: ModnickSource,
  replyFn?: (content: string) => Promise<void>,
): Promise<ModnickResult> {
  const guildId = member.guild.id;
  const cfg = await getGuildConfig(guildId);

  // Support both "plugins:" (correct) and "plugin:" (common typo) YAML keys.
  // Log a warning if the typo form is being used so the user knows to fix it.
  const pluginsKey = cfg.plugins?.modnick as ModnickConfig | undefined;
  const pluginKey  = (cfg as any).plugin?.modnick as ModnickConfig | undefined;
  if (!pluginsKey && pluginKey) {
    logger.warn(
      { guildId },
      'modnick: config found under "plugin:" (singular) — rename it to "plugins:" (plural) in your YAML',
    );
  }
  const mcfg: ModnickConfig = pluginsKey ?? pluginKey ?? {};

  logger.info(
    { guildId, userId: member.id, source, enabled: mcfg.enabled, nick: member.displayName },
    "modnick: runModnick called",
  );

  if (!mcfg.enabled) {
    logger.info({ guildId, source }, "modnick: plugin disabled (enabled: false) — skipping");
    return { triggered: false, skipped: true };
  }
  if (source === "join" && !mcfg.recheck_on_rejoin) {
    logger.info({ guildId, source }, "modnick: recheck_on_rejoin is false — skipping join check");
    return { triggered: false, skipped: true };
  }
  if (source === "boost" && !mcfg.recheck_on_boost) {
    logger.info({ guildId, source }, "modnick: recheck_on_boost is false — skipping boost check");
    return { triggered: false, skipped: true };
  }

  // displayName resolves: server nickname → global display name → username.
  // This is exactly what Discord shows in the member list, so we filter whatever is visible.
  const nick = member.displayName;
  if (!nick) {
    logger.info({ guildId, userId: member.id, source }, "modnick: member has no display name — skipping");
    return { triggered: false };
  }

  logger.info({ guildId, userId: member.id, nick, source }, "modnick: checking display name against rules");

  // Bypass checks
  if (mcfg.bypass_users?.includes(member.id)) {
    logger.info({ guildId, userId: member.id }, "modnick: user in bypass_users — skipping");
    return { triggered: false, skipped: true };
  }
  if (mcfg.bypass_roles?.some(r => member.roles.cache.has(r))) {
    logger.info({ guildId, userId: member.id }, "modnick: user has a bypass role — skipping");
    return { triggered: false, skipped: true };
  }
  if (mcfg.staff_bypass && getMemberLevel(member, cfg) >= 50) {
    logger.info({ guildId, userId: member.id }, "modnick: staff_bypass active and user is staff — skipping");
    return { triggered: false, skipped: true };
  }

  // Rules — checked in order, first match wins
  const rules = mcfg.rules ?? {};
  let triggeredRule: string | null = null;

  triggeredRule ??= checkHoist(nick, rules.hoist);
  triggeredRule ??= checkBlank(nick, rules.blank);
  triggeredRule ??= checkUnreadable(nick, rules.unreadable);
  triggeredRule ??= checkZalgo(nick, rules.zalgo);
  triggeredRule ??= checkBadWords(nick, rules.bad_words, cfg);
  if (!triggeredRule) triggeredRule = await checkImpersonation(nick, rules.impersonation, member);
  triggeredRule ??= checkMassMentions(nick, rules.mass_mentions);
  triggeredRule ??= checkExcessiveSpecialChars(nick, rules.excessive_special_chars);
  triggeredRule ??= checkTooLong(nick, rules.too_long);
  triggeredRule ??= checkCustomPatterns(nick, rules.custom_patterns);

  logger.info({ guildId, userId: member.id, nick, triggeredRule }, "modnick: rule evaluation complete");

  if (!triggeredRule) return { triggered: false };

  // Action setup
  const action = mcfg.action ?? {};
  const actionType = action.type ?? "rename";
  const newNick = pickEnforcedName(mcfg);
  const botTag = client.user?.tag ?? "NightPigeon";
  const botId = client.user?.id ?? "0";
  const warnReason = action.warn_reason ?? "Inappropriate nickname";

  const vars = {
    user: `<@${member.id}>`,
    "user.id": member.id,
    "user.mention": `<@${member.id}>`,
    "user.avatar": member.user.displayAvatarURL(),
    server: member.guild.name,
    trigger: nick,
    reason: newNick,
    count: triggeredRule,
    timestamp: new Date().toISOString(),
  };

  // Apply rename / mute
  // renameSucceeded tracks whether the nickname was actually changed.
  // Even if the rename fails (hierarchy / permissions), we still log,
  // create a case, and DM — so the violation is never silently dropped.
  let renameSucceeded = false;

  if (actionType !== "log") {
    if (!member.manageable) {
      logger.warn(
        { guildId, userId: member.id, nick, triggeredRule, source },
        "modnick: violation detected but cannot change nickname — member is not manageable " +
        "(they may be the guild owner, or their highest role is above the bot's highest role)",
      );
      if (replyFn) {
        const p = buildPayload(mcfg.messages?.error_hierarchy, vars,
          `Cannot change nickname for <@${member.id}> — their role is above mine`);
        await replyFn(p.content ?? "Cannot change nickname — role hierarchy issue");
      }
      // Fall through to log / warn / DM below
    } else {
      try {
        await member.setNickname(newNick, `modnick: ${triggeredRule}`);
        renameSucceeded = true;
        logger.info({ guildId, userId: member.id, oldNick: nick, newNick, triggeredRule, source }, "modnick: nickname changed");
      } catch (err: any) {
        if (err?.code === 50013) {
          logger.warn(
            { guildId, userId: member.id, nick, triggeredRule },
            "modnick: violation detected but bot is missing Manage Nicknames permission",
          );
          if (replyFn) {
            const p = buildPayload(mcfg.messages?.error_missing_perms, vars, "Missing Manage Nicknames permission");
            await replyFn(p.content ?? "Missing Manage Nicknames permission");
          }
          // Fall through to log / warn / DM below
        } else {
          logger.warn({ err, guildId, userId: member.id, nick, triggeredRule }, "modnick: setNickname failed");
          // Fall through to log / warn / DM below
        }
      }

      if (renameSucceeded) {
        // Optional revert
        if (action.revert_after_seconds) {
          const delay = action.revert_after_seconds * 1000;
          setTimeout(async () => {
            const fresh = await member.guild.members.fetch(member.id).catch(() => null);
            if (fresh && fresh.nickname === newNick) {
              await fresh.setNickname(null, "modnick: revert after timeout").catch(() => {});
            }
          }, delay);
        }

        // Mute
        if (actionType === "mute" && action.mute_duration) {
          const ms = parseDuration(action.mute_duration);
          if (ms) {
            const muteCfg = getMuteConfig(member.guild.id);
            const roleId = muteCfg.mode === "role" ? (muteCfg as any).muteRoleId as string | undefined : undefined;
            const muteRole = roleId ? member.guild.roles.cache.get(roleId) : undefined;
            if (muteRole) {
              await member.roles.add(muteRole, `modnick: ${triggeredRule}`).catch(() => {});
            } else {
              await member.timeout(ms, `modnick: ${triggeredRule}`).catch(() => {});
            }
          }
        }
      }
    }
  }

  // Warning / case
  if (actionType === "warn" || (actionType === "rename" && action.warn_on_rename)) {
    await addCase(member.guild.id, {
      action: "Warn",
      userId: member.id,
      userTag: member.user.tag,
      modId: botId,
      modTag: botTag,
      reason: warnReason,
    }).catch((err) => logger.warn({ err }, "modnick: addCase failed"));
  }

  // Mod log
  if (mcfg.log_changes !== false) {
    const logAction = actionType === "log"
      ? "Nickname Flagged (log only)"
      : !renameSucceeded && actionType !== "log"
        ? "Nickname Violation (rename failed — hierarchy)"
        : source === "manual" ? "Nickname Force (manual)" : "Nickname Force";
    const logReason = actionType === "log"
      ? `"${nick}" flagged by rule: ${triggeredRule}`
      : !renameSucceeded
        ? `"${nick}" violated rule: ${triggeredRule} — could not rename (hierarchy or permissions)`
        : `Old: "${nick}" → New: "${newNick}" (rule: ${triggeredRule})`;

    await sendModLog(client, member.guild.id, {
      action: logAction,
      executor: { tag: botTag, id: botId },
      target: { tag: member.user.tag, id: member.id },
      reason: logReason,
      color: 0xFFA500,
    }).catch((err) => logger.warn({ err }, "modnick: sendModLog failed"));
  }

  // DM
  if (mcfg.dm_on_change !== false && actionType !== "log") {
    const dmMessage = renameSucceeded
      ? mcfg.messages?.nickname_changed_dm
      : undefined;
    const fallbackText = renameSucceeded
      ? `Your nickname in **${member.guild.name}** was changed to **${newNick}** because it violated our nickname policy | Rule: ${triggeredRule}`
      : `Your nickname **${nick}** in **${member.guild.name}** violates the nickname policy (rule: ${triggeredRule}). Please change it.`;
    const p = buildPayload(dmMessage, vars, fallbackText);
    member.user.send(p).catch(() => {});
  }

  return { triggered: true, rule: triggeredRule, newNick: renameSucceeded ? newNick : undefined };
}

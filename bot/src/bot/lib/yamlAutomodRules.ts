/**
 * YAML-driven automod rules engine.
 *
 * Reads `automod.config.rules` from the guild's YAML config.
 * Each rule has:
 *   - triggers: array of trigger conditions (AND logic — all must fire)
 *   - conditions: ignore/only filters for roles, channels, users
 *   - actions: ordered list of actions to execute
 *
 * Trigger types:
 *   message_spam, word_filter, invite_link, link_filter, mention_spam,
 *   caps_filter, emoji_spam, attachment_filter, member_join, zalgo_filter,
 *   repeated_characters
 *
 * Action types:
 *   delete_message, clean, warn, mute, kick, ban,
 *   add_role, remove_role, add_message_to_channel, log, set_nickname,
 *   add_to_blacklist
 *
 * Trigger field names (new spec):
 *   message_spam   — max_messages, within_seconds, per_channel
 *   mention_spam   — max_mentions, max_unique_mentions, global_max_mentions, within_seconds
 *   caps_filter    — min_length, percent
 *   link_filter    — block_all, allowed_domains, blocked_domains
 *   member_join    — account_age_below
 *   word_filter    — words, match_type, case_sensitive
 *
 * Legacy field names are still accepted for backward compatibility.
 */

import {
  Client,
  GuildMember,
  Message,
  TextChannel,
} from "discord.js";
import { getGuildConfig } from "../store/guildConfig";
import type {
  YamlAutomodRule,
  YamlAutomodTrigger,
  YamlAutomodConditions,
  YamlAutomodAction,
} from "../store/guildConfig";
import { getMuteConfig } from "../store/muteConfig";
import { recordActiveMute } from "../store/activeMuteRoles";
import { addCase } from "./cases";
import { checkAutomodEscalation } from "./automodEscalation";
import { checkAutoEscalation } from "./escalation";
import { sendYamlLog } from "./yamlLogging";
import { logger } from "../../lib/logger";
import { buildVars } from "./yamlFormatter";

// Duration parsing
const DURATION_RE = /^(\d+)(s|m|h|d)$/i;
const DISCORD_TIMEOUT_MAX_MS = 28 * 24 * 60 * 60 * 1000; // 28 days

function parseDurationMs(input: string): number | null {
  const m = input.match(DURATION_RE);
  if (!m) return null;
  const value = parseInt(m[1]!, 10);
  const unit = m[2]!.toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * (multipliers[unit] ?? 1_000);
}

// Phishing domains
const PHISHING_DOMAINS = new Set([
  "discordnitro.gift", "discord-nitro.gift", "discordgift.site", "discordgift.io",
  "dlscordapp.com", "discordapp.io", "discord-gift.com", "nitro-discord.xyz",
  "free-nitro.ru", "steamcommunity.ru", "steamgift.com", "freeboost.club",
  "discord-verify.com", "discordapp.org", "nitrogift.pro", "discordnito.com",
  "steamcommuntiy.com", "nitropremium.ru", "discordfree.gift",
  "discord-app.gift", "discordapp.gift", "steam-gift.pro", "gift-nitro.ru",
  "discordnitro.pro", "discord-nitro.org", "steamauthenticate.com",
  "epicgift.io", "discord-promo.com", "freegift.gg", "discordgive.com",
]);

// Rate-limit sliding-window cache
// Key: `ruleName:triggerId:guildId:userId[:channelId]` → sorted timestamps

const rateCacheMap = new Map<string, number[]>();

// Repeated text cache
// Key: `ruleKey:triggerIdx:guildId:userId` → [{text, time}]
const repeatedTextMap = new Map<string, Array<{ text: string; time: number }>>();

// Ghost ping cache
const GHOST_PING_TTL_MS = 5 * 60 * 1_000; // 5 minutes

interface GhostPingEntry {
  guildId: string;
  channelId: string;
  userId: string;
  userTag: string;
  mentionedUserIds: string[];
  mentionedRoleIds: string[];
}

const ghostPingCache = new Map<string, GhostPingEntry>(); // messageId → entry

function slidingWindowHit(
  key: string,
  windowMs: number,
  limit: number
): boolean {
  const now = Date.now();
  let times = (rateCacheMap.get(key) ?? []).filter((t) => t > now - windowMs);
  times.push(now);
  rateCacheMap.set(key, times);
  return times.length >= limit;
}

function clearSlidingWindow(key: string): void {
  rateCacheMap.delete(key);
}

// Text helpers
const INVITE_RE = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-zA-Z0-9-]+/i;
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
const ZALGO_RE = /[\u0300-\u036f\u0489\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]{3,}/;
const URL_RE = /https?:\/\/[^\s<>"]+/gi;

function normalizeText(text: string): string {
  let s = text.toLowerCase();
  s = s.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u00ad\uFEFF]/g, "");
  s = s
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
    .replace(/4/g, "a").replace(/5/g, "s").replace(/@/g, "a")
    .replace(/\$/g, "s").replace(/!/g, "i").replace(/\+/g, "t")
    .replace(/7/g, "t").replace(/8/g, "b").replace(/9/g, "g")
    .replace(/€/g, "e").replace(/£/g, "l").replace(/\|/g, "i");
  return s;
}

function extractUrls(text: string): string[] {
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, "gi");
  while ((m = re.exec(text)) !== null) matches.push(m[0]);
  return matches;
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^(?:https?:\/\/)?(?:www\.)?/, "").split("/")[0]!.toLowerCase();
  }
}

function countEmoji(text: string): number {
  return (text.match(EMOJI_RE) ?? []).length;
}

function capsRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (!letters.length) return 0;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length;
}

function maxConsecutiveRepeats(text: string): number {
  let max = 0, cur = 1;
  for (let i = 1; i < text.length; i++) {
    cur = text[i] === text[i - 1] ? cur + 1 : 1;
    if (cur > max) max = cur;
  }
  return max;
}

function wordMatches(
  word: string,
  normalizedContent: string,
  matchType: "word" | "substring" | "regex"
): boolean {
  if (matchType === "regex") {
    try {
      return new RegExp(word, "i").test(normalizedContent);
    } catch {
      return false;
    }
  }
  if (matchType === "substring") {
    return normalizedContent.includes(word.toLowerCase());
  }
  // word (whole-word boundary)
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "i").test(normalizedContent);
}

// Conditions check
function passesConditions(
  member: GuildMember | null,
  channelId: string | null,
  conditions: YamlAutomodConditions | undefined
): boolean {
  if (!conditions) return true;

  if (channelId) {
    if (conditions.ignore_channels?.includes(channelId)) return false;
    if (conditions.only_channels?.length && !conditions.only_channels.includes(channelId)) return false;
  }

  if (member) {
    const roleIds = [...member.roles.cache.keys()];
    if (conditions.ignore_roles?.some((r) => roleIds.includes(r))) return false;
    if (conditions.ignore_users?.includes(member.user.id)) return false;
    if (conditions.only_users?.length && !conditions.only_users.includes(member.user.id)) return false;
  }

  return true;
}

// Single trigger check
interface TriggerContext {
  message?: Message;
  member: GuildMember;
  guildId: string;
  ruleKey: string;
  triggerIdx: number;
}

/**
 * Check a single trigger. Returns the matched value (word, link, domain, etc.)
 * as a non-empty string if the trigger fires, or `false` if it does not.
 * The returned string is exposed as the `{trigger}` template variable in actions.
 */
function checkTrigger(trigger: YamlAutomodTrigger, ctx: TriggerContext): string | false {
  const { message, member, guildId, ruleKey, triggerIdx } = ctx;
  const userId = member.user.id;
  const channelId = message?.channelId ?? "";
  const cacheKey = `${ruleKey}:t${triggerIdx}:${guildId}:${userId}`;
  const perChannelKey = `${cacheKey}:${channelId}`;

  switch (trigger.type) {
    case "message_spam": {
      if (!message) return false;
      const limit = trigger.max_messages ?? trigger.limit ?? 5;
      const windowMs = trigger.within_seconds !== undefined
        ? trigger.within_seconds * 1_000
        : (parseDurationMs(trigger.window ?? "5s") ?? 5_000);
      const key = trigger.per_channel ? perChannelKey : cacheKey;
      const hit = slidingWindowHit(key, windowMs, limit);
      if (hit) clearSlidingWindow(key);
      return hit ? "rapid messages" : false;
    }

    case "word_filter": {
      if (!message) return false;
      const words = trigger.words ?? [];
      const matchType = trigger.match_type ?? "word";
      const content = trigger.case_sensitive
        ? message.content ?? ""
        : normalizeText(message.content ?? "");
      const hit = words.find((w) => wordMatches(
        trigger.case_sensitive ? w : normalizeText(w),
        content,
        matchType
      ));
      return hit !== undefined ? hit : false;
    }

    case "invite_link": {
      if (!message) return false;
      const content = message.content ?? "";
      if (!INVITE_RE.test(content)) return false;
      if (trigger.allow_own_server) {
        const guildVanity = member.guild.vanityURLCode;
        if (guildVanity) {
          const ownRe = new RegExp(
            `discord\\.gg\\/${guildVanity}|discord(?:app)?\\.com\\/invite\\/${guildVanity}`,
            "i"
          );
          if (ownRe.test(content)) return false;
        }
      }
      const match = INVITE_RE.exec(content);
      return match ? match[0] : "invite link";
    }

    case "link_filter": {
      if (!message) return false;
      const urls = extractUrls(message.content ?? "");
      if (!urls.length) return false;

      const blockAll = trigger.block_all ?? false;
      const allowedDomains = trigger.allowed_domains
        ?? (trigger.mode === "whitelist" ? (trigger.domains ?? []) : []);
      const blockedDomains = trigger.blocked_domains
        ?? (trigger.mode === "blacklist" || !trigger.mode ? (trigger.domains ?? []) : []);

      if (blockAll) {
        const blocked = urls.find((u) => !allowedDomains.includes(extractDomain(u)));
        return blocked ? extractDomain(blocked) : false;
      }
      if (allowedDomains.length > 0) {
        const blocked = urls.find((u) => !allowedDomains.includes(extractDomain(u)));
        return blocked ? extractDomain(blocked) : false;
      }
      if (blockedDomains.length > 0) {
        const blocked = urls.find((u) => blockedDomains.includes(extractDomain(u)));
        return blocked ? extractDomain(blocked) : false;
      }
      return false;
    }

    case "mention_spam": {
      if (!message) return false;
      const totalMentions = message.mentions.users.size + message.mentions.roles.size;
      const maxMentions = trigger.max_mentions ?? trigger.threshold ?? 5;
      if (totalMentions >= maxMentions) return `${totalMentions} mentions`;
      if (trigger.max_unique_mentions !== undefined) {
        if (message.mentions.users.size >= trigger.max_unique_mentions)
          return `${message.mentions.users.size} unique mentions`;
      }
      if (trigger.global_max_mentions !== undefined) {
        const windowMs = (trigger.within_seconds ?? 10) * 1_000;
        const key = `${cacheKey}:mentions`;
        for (let i = 0; i < totalMentions; i++) {
          slidingWindowHit(key, windowMs, 99999);
        }
        const now = Date.now();
        const times = rateCacheMap.get(key)?.filter((t) => t > now - windowMs) ?? [];
        if (times.length >= trigger.global_max_mentions) {
          clearSlidingWindow(key);
          return `${times.length} mentions`;
        }
      }
      return false;
    }

    case "caps_filter": {
      if (!message) return false;
      const content = message.content ?? "";
      const minLength = trigger.min_length ?? 10;
      if (content.length < minLength) return false;
      const threshold = ((trigger.percent ?? trigger.percentage ?? 70)) / 100;
      const ratio = capsRatio(content);
      return ratio >= threshold ? `${Math.round(ratio * 100)}% caps` : false;
    }

    case "emoji_spam": {
      if (!message) return false;
      const maxEmojis = trigger.max_emojis ?? 10;
      const count = countEmoji(message.content ?? "");
      return count >= maxEmojis ? `${count} emoji` : false;
    }

    case "attachment_filter": {
      if (!message) return false;
      const blocked = (trigger.blocked_extensions ?? []).map((e) =>
        e.toLowerCase().replace(/^\./, "")
      );
      if (!blocked.length) return false;
      for (const att of message.attachments.values()) {
        const ext = (att.name ?? "").split(".").pop()?.toLowerCase() ?? "";
        if (blocked.includes(ext)) return `.${ext}`;
      }
      return false;
    }

    case "member_join": {
      const ageStr = trigger.account_age_below ?? trigger.min_account_age;
      if (!ageStr) return "new account";
      const minAgeMs = parseDurationMs(ageStr) ?? 0;
      const accountAge = Date.now() - member.user.createdTimestamp;
      return accountAge < minAgeMs ? "new account" : false;
    }

    case "zalgo_filter": {
      if (!message) return false;
      return ZALGO_RE.test(message.content ?? "") ? "zalgo text" : false;
    }

    case "repeated_characters": {
      if (!message) return false;
      const maxRepeats = trigger.max_repeats ?? 10;
      const minLen = trigger.min_length ?? 0;
      const content = message.content ?? "";
      if (content.length < minLen) return false;
      return maxConsecutiveRepeats(content) >= maxRepeats ? "character flood" : false;
    }

    case "repeated_text": {
      if (!message) return false;
      const windowMs = (trigger.within_seconds ?? 60) * 1_000;
      const maxDupes = trigger.max_duplicates ?? 3;
      const shouldNormalize = trigger.normalize !== false;
      const raw = (message.content ?? "").trim();
      if (!raw) return false;
      const text = shouldNormalize ? raw.toLowerCase() : raw;
      const key = `${ruleKey}:t${triggerIdx}:${guildId}:${userId}:rtxt`;
      const now = Date.now();
      const existing = (repeatedTextMap.get(key) ?? []).filter((e) => e.time > now - windowMs);
      existing.push({ text, time: now });
      repeatedTextMap.set(key, existing);
      const matchCount = existing.filter((e) => e.text === text).length;
      if (matchCount >= maxDupes) {
        repeatedTextMap.delete(key);
        return raw.length > 60 ? raw.slice(0, 60) + "…" : raw;
      }
      return false;
    }

    case "newline_spam": {
      if (!message) return false;
      const maxNewlines = trigger.max_newlines ?? 10;
      const newlineCount = (message.content ?? "").split("\n").length - 1;
      return newlineCount >= maxNewlines ? `${newlineCount} newlines` : false;
    }

    case "phishing": {
      if (!message) return false;
      const urls = extractUrls(message.content ?? "");
      if (!urls.length) return false;
      const custom = new Set((trigger.custom_domains ?? []).map((d) => d.toLowerCase()));
      const hit = urls.find((u) => {
        const domain = extractDomain(u);
        return PHISHING_DOMAINS.has(domain) || custom.has(domain);
      });
      return hit ? extractDomain(hit) : false;
    }

    case "ghost_ping": {
      // Ghost pings are detected on messageDelete, not messageCreate.
      return false;
    }

    case "wall_text": {
      if (!message) return false;
      const maxLen = trigger.max_length ?? 1000;
      const len = (message.content ?? "").length;
      return len >= maxLen ? `${len} characters` : false;
    }

    default:
      return false;
  }
}

// Action execution
interface ActionContext {
  client: Client;
  message?: Message;
  member: GuildMember;
  guildId: string;
  ruleName: string;
  triggerReason: string;
  /** The specific word, link, domain, or value that caused the rule to fire. Exposed as {trigger}. */
  matchedWord: string;
  messageDeleted: boolean;
}

async function executeAction(
  action: YamlAutomodAction,
  ctx: ActionContext
): Promise<{ deleted: boolean }> {
  const { client, message, member, guildId, ruleName, triggerReason, matchedWord } = ctx;
  const botId = client.user?.id ?? "0";
  const botTag = client.user?.tag ?? "AutoMod";
  let deleted = ctx.messageDeleted;

  const reason = action.reason ?? `AutoMod rule "${ruleName}": ${triggerReason}`;

  try {
    switch (action.type) {
      case "delete_message": {
        if (message && !deleted) {
          await message.delete().catch(() => {});
          deleted = true;
        }
        break;
      }

      case "clean": {
        if (!message) break;
        const channel = message.channel as TextChannel;
        const count = Math.min(action.count ?? 10, 100);
        try {
          const msgs = await channel.messages.fetch({ limit: count });
          const toDelete = [...msgs.values()].filter(
            (m) => m.author.id === member.user.id
          );
          await channel.bulkDelete(toDelete, true).catch(() => {});
        } catch { /* ignore */ }
        break;
      }

      case "warn": {
        await addCase(guildId, {
          action: "warn",
          userId: member.user.id,
          userTag: member.user.tag,
          modId: botId,
          modTag: botTag,
          reason,
        }, { isAutomod: true });
        // Check plugins.escalation.auto thresholds (automod-only counter)
        await checkAutoEscalation(client, member.guild, member.user.id, member.user.tag, "warn").catch(() => {});
        break;
      }

      case "mute": {
        const durationMs = action.duration ? parseDurationMs(action.duration) : null;
        if (durationMs === null) break;
        const clampedMs = Math.min(durationMs, DISCORD_TIMEOUT_MAX_MS);

        const muteCfg = getMuteConfig(guildId);
        if (muteCfg.mode === "role" && muteCfg.muteRoleId) {
          const muteRole = member.guild.roles.cache.get(muteCfg.muteRoleId);
          if (muteRole) {
            let strippedRoles: string[] | undefined;
            if (muteCfg.stripRoles) {
              strippedRoles = member.roles.cache
                .filter((r) => r.id !== member.guild.id && r.id !== muteRole.id)
                .map((r) => r.id);
              await member.roles.set([muteRole.id], reason).catch(() => {});
            } else {
              await member.roles.add(muteRole, reason).catch(() => {});
            }
            const expiresAt = durationMs ? Date.now() + durationMs : undefined;
            await recordActiveMute(guildId, member.user.id, muteRole.id, expiresAt, strippedRoles).catch(() => {});
          } else {
            await member.timeout(clampedMs, reason).catch(() => {});
          }
        } else {
          await member.timeout(clampedMs, reason).catch(() => {});
        }
        await addCase(guildId, {
          action: durationMs ? `Mute (${action.duration})` : "Mute",
          userId: member.user.id,
          userTag: member.user.tag,
          modId: botId,
          modTag: botTag,
          reason,
          duration: action.duration,
        }, { isAutomod: true });
        await checkAutoEscalation(client, member.guild, member.user.id, member.user.tag, "mute").catch(() => {});
        break;
      }

      case "kick": {
        await addCase(guildId, {
          action: "kick",
          userId: member.user.id,
          userTag: member.user.tag,
          modId: botId,
          modTag: botTag,
          reason,
        }, { isAutomod: true });
        await member.kick(reason).catch(() => {});
        await checkAutoEscalation(client, member.guild, member.user.id, member.user.tag, "kick").catch(() => {});
        break;
      }

      case "ban": {
        const durationMs = action.duration ? parseDurationMs(action.duration) : null;
        await addCase(guildId, {
          action: durationMs ? "tempban" : "ban",
          userId: member.user.id,
          userTag: member.user.tag,
          modId: botId,
          modTag: botTag,
          reason,
          duration: action.duration,
        }, { isAutomod: true });
        await member.guild.members.ban(member.user.id, {
          reason,
          deleteMessageSeconds: 604_800,
        }).catch(() => {});
        await checkAutoEscalation(client, member.guild, member.user.id, member.user.tag, "ban").catch(() => {});
        break;
      }

      case "add_role": {
        if (!action.role) break;
        const role = member.guild.roles.cache.get(action.role);
        if (role) await member.roles.add(role, reason).catch(() => {});
        break;
      }

      case "remove_role": {
        if (!action.role) break;
        const role = member.guild.roles.cache.get(action.role);
        if (role) await member.roles.remove(role, reason).catch(() => {});
        break;
      }

      // send_message: post to a channel. If `channel` is omitted, replies in the
      // triggering channel. Field is `content` (preferred) or `message` (legacy).
      // Aliases: add_message_to_channel (old name), reply_in_channel (old name)
      case "send_message":
      case "add_message_to_channel":
      case "reply_in_channel": {
        const text = action.content ?? action.message;
        if (!text) break;

        const channelObj = message?.channel as TextChannel | undefined;
        const vars = buildVars({
          user: member.user.tag,
          "user.mention": `<@${member.user.id}>`,
          "user.id": member.user.id,
          channel: channelObj?.name ?? "",
          "channel.mention": channelObj ? `<#${channelObj.id}>` : "",
          server: member.guild.name,
          guild: member.guild.name,
          rule: ruleName,
          trigger: matchedWord,
          reason: triggerReason,
        });
        const resolved = text.replace(/\{([^{}]+)\}/g, (_, k) => vars[k as keyof typeof vars] ?? "");

        const autoDelete = (msg: { delete: () => Promise<unknown> }) =>
          setTimeout(() => msg.delete().catch(() => {}), 10_000);

        if (action.channel) {
          let ch: TextChannel | null = null;
          try { ch = (await client.channels.fetch(action.channel)) as TextChannel; } catch { break; }
          if (!ch || !("send" in ch)) break;
          const sent = await ch.send(resolved).catch(() => null);
          if (sent) autoDelete(sent);
        } else if (channelObj && "send" in channelObj) {
          const sent = await channelObj.send(resolved).catch(() => null);
          if (sent) autoDelete(sent);
        }
        break;
      }

      // dm_user: DM the offending user. Field is `content` (preferred) or `message` (legacy).
      // Alias: send_dm (old name)
      case "dm_user":
      case "send_dm": {
        const text = action.content ?? action.message;
        if (!text) break;
        const channelObj = message?.channel as TextChannel | undefined;
        const vars = buildVars({
          user: member.user.tag,
          "user.mention": `<@${member.user.id}>`,
          "user.id": member.user.id,
          channel: channelObj?.name ?? "",
          "channel.mention": channelObj ? `<#${channelObj.id}>` : "",
          server: member.guild.name,
          guild: member.guild.name,
          rule: ruleName,
          trigger: matchedWord,
          reason: triggerReason,
        });
        const resolved = text.replace(/\{([^{}]+)\}/g, (_, k) => vars[k as keyof typeof vars] ?? "");
        await member.user.send(resolved).catch(() => {});
        break;
      }

      case "log": {
        const channelObj = message?.channel as TextChannel | undefined;
        const vars = buildVars({
          user: member.user.tag,
          "user.mention": `<@${member.user.id}>`,
          "user.id": member.user.id,
          channel: channelObj?.name ?? "",
          "channel.mention": channelObj ? `<#${channelObj.id}>` : "",
          server: member.guild.name,
          guild: member.guild.name,
          rule: ruleName,
          trigger: matchedWord,
          reason: triggerReason,
        });

        // Send through YAML logging system
        await sendYamlLog(client, guildId, {
          eventKey: `automod_${ruleName.toLowerCase().replace(/\s+/g, "_")}`,
          vars,
        });

        // If an explicit channel + content is provided, post formatted message there
        if (action.channel) {
          const text = action.content ?? action.message;
          try {
            const ch = (await client.channels.fetch(action.channel)) as TextChannel;
            if (ch && "send" in ch) {
              if (text) {
                const resolved = text.replace(/\{([^{}]+)\}/g, (_, k) => vars[k as keyof typeof vars] ?? "");
                await ch.send(resolved.slice(0, 2000)).catch(() => {});
              } else {
                const lines = [
                  `**Rule:** ${ruleName}`,
                  `**User:** <@${member.user.id}> (${member.user.tag})`,
                  `**Trigger:** ${triggerReason}`,
                  channelObj ? `**Channel:** <#${channelObj.id}>` : "",
                ].filter(Boolean);
                await ch.send(lines.join("\n")).catch(() => {});
              }
            }
          } catch { /* ignore */ }
        }
        break;
      }

      case "set_nickname": {
        const nick = action.nickname ?? "";
        await member.setNickname(nick, reason).catch(() => {});
        break;
      }

      case "add_to_blacklist": {
        logger.info(
          { guildId, userId: member.user.id, rule: ruleName },
          "automod add_to_blacklist triggered (no-op — implement blacklist store if needed)"
        );
        break;
      }

      default:
        logger.warn({ type: action.type, ruleName, guildId }, "Unknown automod YAML action type");
    }
  } catch (err) {
    logger.error({ err, action: action.type, ruleName, guildId }, "YAML automod action failed");
  }

  return { deleted };
}

// Public API
/**
 * Cache a message so ghost-ping detection can fire if it is deleted shortly after.
 * Called for every non-bot message that contains mentions.
 */
export function cacheMessageForGhostPing(message: Message): void {
  if (!message.guild || message.author.bot) return;
  const hasMentions = message.mentions.users.size > 0 || message.mentions.roles.size > 0;
  if (!hasMentions) return;
  ghostPingCache.set(message.id, {
    guildId: message.guild.id,
    channelId: message.channelId,
    userId: message.author.id,
    userTag: message.author.tag,
    mentionedUserIds: [...message.mentions.users.keys()],
    mentionedRoleIds: [...message.mentions.roles.keys()],
  });
  setTimeout(() => ghostPingCache.delete(message.id), GHOST_PING_TTL_MS);
}

/**
 * Called from the messageDelete event handler.
 * If the deleted message was a ghost ping, find ghost_ping rules and execute their actions.
 */
export async function checkGhostPingDelete(
  client: Client,
  messageId: string,
  guildId: string,
): Promise<void> {
  const entry = ghostPingCache.get(messageId);
  if (!entry) return;
  ghostPingCache.delete(messageId);
  if (entry.mentionedUserIds.length === 0 && entry.mentionedRoleIds.length === 0) return;

  let cfg;
  try {
    cfg = await getGuildConfig(guildId);
  } catch {
    return;
  }
  const automodCfg = cfg.automod?.config;
  if (!automodCfg?.enabled || !automodCfg.rules) return;

  const ghostRules = Object.entries(automodCfg.rules).filter(
    ([, rule]) => rule.enabled !== false && rule.triggers.some((t) => t.type === "ghost_ping")
  );
  if (!ghostRules.length) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  let member: GuildMember | null = null;
  try {
    member = await guild.members.fetch(entry.userId);
  } catch {
    return;
  }
  if (!member) return;

  const mentionList = entry.mentionedUserIds.map((id) => `<@${id}>`).join(", ");
  const triggerReason = `Ghost ping — mentioned ${mentionList} then deleted message`;

  for (const [ruleName, rule] of ghostRules) {
    if (!passesConditions(member, entry.channelId, rule.conditions)) continue;
    const actCtx: ActionContext = {
      client,
      message: undefined,
      member,
      guildId,
      ruleName,
      triggerReason,
      matchedWord: mentionList,
      messageDeleted: true,
    };
    for (const action of rule.actions) {
      const res = await executeAction(action, actCtx);
      actCtx.messageDeleted = res.deleted;
    }
    logger.info({ guildId, userId: entry.userId, ruleName }, "YAML ghost_ping rule triggered");
    checkAutomodEscalation(client, guild, member.user.id, member.user.tag, ruleName).catch(() => {});
  }
}

export async function runYamlAutomodOnMessage(
  client: Client,
  message: Message
): Promise<boolean> {
  if (!message.guild || message.author.bot) return false;

  // Cache for ghost-ping detection (fires on messageDelete if message had mentions)
  cacheMessageForGhostPing(message);

  const guildId = message.guild.id;
  let cfg;
  try {
    cfg = await getGuildConfig(guildId);
  } catch {
    return false;
  }

  const automodCfg = cfg.automod?.config;
  if (!automodCfg?.enabled || !automodCfg.rules) return false;

  const member = message.member;
  if (!member) return false;

  // Global immunity: skip ALL automod for members holding an immunity role
  const immunityRoles: string[] = automodCfg.immunity_roles ?? [];
  if (immunityRoles.length > 0) {
    const memberRoleIds = [...member.roles.cache.keys()];
    if (immunityRoles.some((r) => memberRoleIds.includes(r))) return false;
  }

  let anyBlocked = false;

  for (const [ruleName, rule] of Object.entries(automodCfg.rules)) {
    if (rule.enabled === false) continue;

    // Skip member_join triggers on message events
    if (rule.triggers.some((t) => t.type === "member_join")) continue;

    if (!passesConditions(member, message.channelId, rule.conditions)) continue;

    // AND logic: all triggers must fire — collect matched values for {trigger}
    let allFired = true;
    const matchedValues: string[] = [];
    for (let idx = 0; idx < rule.triggers.length; idx++) {
      const result = checkTrigger(rule.triggers[idx]!, {
        message,
        member,
        guildId,
        ruleKey: ruleName,
        triggerIdx: idx,
      });
      if (result === false) { allFired = false; break; }
      if (result) matchedValues.push(result);
    }
    if (!allFired) continue;

    const triggerReason = describeTriggers(rule.triggers);
    const matchedWord = matchedValues.join(", ");
    const actCtx: ActionContext = {
      client,
      message,
      member,
      guildId,
      ruleName,
      triggerReason,
      matchedWord,
      messageDeleted: false,
    };

    for (const action of rule.actions) {
      const res = await executeAction(action, actCtx);
      actCtx.messageDeleted = res.deleted;
    }

    if (actCtx.messageDeleted) anyBlocked = true;
    logger.info({ guildId, userId: member.user.id, ruleName }, "YAML automod rule triggered");

    // Automod escalation: one check per rule that fires (group-based, not per action)
    checkAutomodEscalation(client, message.guild, member.user.id, member.user.tag, ruleName).catch(() => {});
  }

  return anyBlocked;
}

/**
 * Run YAML automod rules for member_join triggers.
 */
export async function runYamlAutomodOnMember(
  client: Client,
  member: GuildMember
): Promise<void> {
  const guildId = member.guild.id;
  let cfg;
  try {
    cfg = await getGuildConfig(guildId);
  } catch {
    return;
  }

  const automodCfg = cfg.automod?.config;
  if (!automodCfg?.enabled || !automodCfg.rules) return;

  for (const [ruleName, rule] of Object.entries(automodCfg.rules)) {
    if (rule.enabled === false) continue;
    if (!rule.triggers.some((t) => t.type === "member_join")) continue;
    if (!passesConditions(member, null, rule.conditions)) continue;

    let allFired = true;
    const matchedValues: string[] = [];
    for (let idx = 0; idx < rule.triggers.length; idx++) {
      const result = checkTrigger(rule.triggers[idx]!, {
        member,
        guildId,
        ruleKey: ruleName,
        triggerIdx: idx,
      });
      if (result === false) { allFired = false; break; }
      if (result) matchedValues.push(result);
    }
    if (!allFired) continue;

    const triggerReason = describeTriggers(rule.triggers);
    const matchedWord = matchedValues.join(", ");
    const actCtx: ActionContext = {
      client,
      member,
      guildId,
      ruleName,
      triggerReason,
      matchedWord,
      messageDeleted: false,
    };

    for (const action of rule.actions) {
      await executeAction(action, actCtx);
    }

    logger.info({ guildId, userId: member.user.id, ruleName }, "YAML automod member_join rule triggered");

    // Automod escalation: one check per rule that fires
    checkAutomodEscalation(client, member.guild, member.user.id, member.user.tag, ruleName).catch(() => {});
  }
}

// Helpers
function describeTriggers(triggers: YamlAutomodTrigger[]): string {
  return triggers.map((t) => t.type.replace(/_/g, " ")).join(" + ");
}

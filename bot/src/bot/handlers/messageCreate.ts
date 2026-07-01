import { Client, Message } from "discord.js";
import type { Command } from "../commands/types";
import { getGuildConfig, getCachedConfig } from "../store/guildConfig";
import { getRequiredLevel, getUserLevel, LEVEL_UNCONFIGURED } from "../lib/yamlLevels";
import { runAutomod } from "../lib/runAutomod";
import { logger } from "../../lib/logger";
import { recordSeen } from "../commands/mod/cleanup";
import { handleAutoreaction } from "../commands/util/autoreaction";
import { handleAutoreply } from "../commands/util/autoreply";
import { runModnick } from "../lib/modnick";
import { handleSlowmodeAuto } from "../lib/slowmodeAuto";

// Per-user cooldown for the messageCreate modnick fallback check.
// Key: `${guildId}:${userId}` → last-checked timestamp (ms)
const modnickMsgCooldown = new Map<string, number>();
const MODNICK_MSG_COOLDOWN_MS = 60_000;

// Moderation commands
import warnCmd, { forcewarnCmd } from "../commands/mod/warn";
import banCmd, { forcebanCmd, unbanCmd } from "../commands/mod/ban";
import { tempbanCmd, softbanCmd, baninfoCmd, banlistCmd } from "../commands/mod/banext";
import kickCmd from "../commands/mod/kick";
import muteCmd, { unmuteCmd, forceMuteCmd, forceUnmuteCmd } from "../commands/mod/mute";
import { tempmuteCmd, muteinfoCmd, mutelistCmd } from "../commands/mod/muteext";
import purgeCmd from "../commands/mod/purge";
import slowmodeCmd from "../commands/mod/slowmode";
import { slowmodeinfoCmd } from "../commands/mod/slowmodeext";
import { caseCmd, casesCmd, addcaseCmd, editcaseCmd, deletecaseCmd } from "../commands/mod/cases";
import { servercasesCmd, casecountCmd, exportcasesCmd } from "../commands/mod/casesext";
import { noteCmd, viewnotesCmd, deletenoteCmd } from "../commands/mod/note";
import { forcenoteCmd, viewnoteCmd, notesearchCmd, editnoteCmd } from "../commands/mod/noteext";
import { nickCmd, resetnickCmd, locknickCmd, unlocknickCmd } from "../commands/mod/nick";
import modnickCmd from "../commands/mod/modnick";
import { watchCmd, unwatchCmd, watchlistCmd } from "../commands/mod/watch";
import { rolebanCmd, unrolebanCmd, rolebannedCmd } from "../commands/mod/roleban";
import { lockCmd, unlockCmd, hideCmd, unhideCmd } from "../commands/mod/lock";
import { seenCmd, cleanupCmd } from "../commands/mod/cleanup";
import {
  masswarnCmd, massforcewarnCmd,
  massmuteCmd, massforcemuteCmd,
  massunmuteCmd,
  masskickCmd,
  massbanCmd, massforcebanCmd,
  massunbanCmd,
  massroleCmd, massremoveroleCmd, masstemproleCmd,
} from "../commands/mod/mass";
import { addroleCmd, removeroleCmd, temproleCmd, temprolesCmd } from "../commands/mod/role";
import rrCmd from "../commands/mod/rr";
import { raidmodeCmd } from "../commands/mod/raidmode";
import { levelCmd, levelsCmd } from "../commands/mod/level";
import escalationCmd from "../commands/mod/escalationCmd";
import automodEscalationCmd from "../commands/mod/automodEscalationCmd";

// Utility commands
import tagCmd, { sendTag, buildTagContext } from "../commands/util/tag";
import helpCmd from "../commands/util/help";
import {
  pingCmd,
  userinfoCmd, avatarCmd, bannerCmd, rolesCmd, joinedCmd, firstmsgCmd,
  casesearchCmd, warncountCmd, modstatsCmd,
  serverinfoCmd, channelinfoCmd, roleinfoCmd, membercountCmd,
  botstatsCmd, botinfoCmd, inviteinfoCmd, snowflakeCmd,
  inroleCmd, charcountCmd, embedCmd,
} from "../commands/util/info";
import timezoneCmd, { timeCmd, timeforCmd, timeconvertCmd } from "../commands/util/timezone";
import { remindCmd, remindersCmd, delreminderCmd } from "../commands/util/remind";

// Plugin commands
import ticketCmd from "../commands/util/ticket";
import autocleanCmd from "../commands/util/autoclean";
import autoreactionCmd from "../commands/util/autoreaction";
import autoreplyCmd from "../commands/util/autoreply";
import starboardCmd from "../commands/util/starboard";
import {
  welcomeCmd,
  goodbyeCmd,
  welcomedmCmd,
  invitesCmd,
  inviteleaderboardCmd,
  inviteresetCmd,
  welcomeInviteinfoCmd,
} from "../commands/util/welcomeCmd";

export const ALL_COMMANDS: Command[] = [
  // Core mod
  warnCmd, forcewarnCmd,
  banCmd, forcebanCmd, unbanCmd, tempbanCmd, softbanCmd, baninfoCmd, banlistCmd,
  kickCmd,
  muteCmd, unmuteCmd, forceMuteCmd, forceUnmuteCmd, tempmuteCmd, muteinfoCmd, mutelistCmd,
  purgeCmd,
  slowmodeCmd, slowmodeinfoCmd,

  // Cases
  caseCmd, casesCmd, addcaseCmd, editcaseCmd, deletecaseCmd,
  servercasesCmd, casecountCmd, exportcasesCmd,

  // Notes
  noteCmd, viewnotesCmd, deletenoteCmd,
  forcenoteCmd, viewnoteCmd, notesearchCmd, editnoteCmd,

  // Nickname
  nickCmd, resetnickCmd, locknickCmd, unlocknickCmd, modnickCmd,

  // Watch
  watchCmd, unwatchCmd, watchlistCmd,

  // Role ban
  rolebanCmd, unrolebanCmd, rolebannedCmd,

  // Channel lock/hide
  lockCmd, unlockCmd, hideCmd, unhideCmd,

  // Seen / cleanup
  seenCmd, cleanupCmd,

  // Mass actions
  masswarnCmd, massforcewarnCmd,
  massmuteCmd, massforcemuteCmd,
  massunmuteCmd,
  masskickCmd,
  massbanCmd, massforcebanCmd,
  massunbanCmd,
  massroleCmd, massremoveroleCmd, masstemproleCmd,

  // Roles
  addroleCmd, removeroleCmd, temproleCmd, temprolesCmd,

  // Reaction roles
  rrCmd,

  // Raid mode
  raidmodeCmd,

  // Levels
  levelCmd, levelsCmd,

  // Punishment Escalation
  escalationCmd,

  // Automod Escalation
  automodEscalationCmd,

  // Utility
  tagCmd, helpCmd, pingCmd,
  userinfoCmd, avatarCmd, bannerCmd, rolesCmd, joinedCmd, firstmsgCmd,
  casesearchCmd, warncountCmd, modstatsCmd,
  serverinfoCmd, channelinfoCmd, roleinfoCmd, membercountCmd,
  botstatsCmd, botinfoCmd, inviteinfoCmd, snowflakeCmd,
  inroleCmd, charcountCmd, embedCmd,

  // Timezone
  timezoneCmd, timeCmd, timeforCmd, timeconvertCmd,

  // Reminders
  remindCmd, remindersCmd, delreminderCmd,

  // Tickets
  ticketCmd,

  // Autoclean
  autocleanCmd,

  // Autoreaction
  autoreactionCmd,

  // Autoreply
  autoreplyCmd,

  // Starboard
  starboardCmd,

  // Welcome plugin
  welcomeCmd, goodbyeCmd, welcomedmCmd,
  invitesCmd, inviteleaderboardCmd, inviteresetCmd,
  welcomeInviteinfoCmd,
];

/** name/alias → Command (built-in aliases only; YAML aliases resolved at dispatch time) */
export const REGISTRY = new Map<string, Command>();
for (const cmd of ALL_COMMANDS) {
  REGISTRY.set(cmd.name, cmd);
  for (const alias of cmd.aliases ?? []) {
    REGISTRY.set(alias, cmd);
  }
}

// Alias resolver
function resolveCommand(guildId: string, rawName: string): Command | null {
  const lower = rawName.toLowerCase();

  // 1. Direct name/built-in alias
  if (REGISTRY.has(lower)) return REGISTRY.get(lower)!;

  // 2. YAML config aliases (plugins.command_aliases.config.aliases)
  const cfg = getCachedConfig(guildId);
  const yamlAliases = cfg.plugins.command_aliases?.config?.aliases ?? {};
  const resolved = yamlAliases[lower];
  if (resolved && REGISTRY.has(resolved)) return REGISTRY.get(resolved)!;

  return null;
}

const BOT_WEBSITE = "https://nightpigeon.xyz";

// Handler
export async function handleMessage(client: Client, message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) return;

  const guildId = message.guild.id;

  // Ensure config is loaded (TTL cache — cheap after first load)
  const cfg = await getGuildConfig(guildId);
  const prefix = cfg.prefix ?? "!";

  // Record "seen" for all guild messages
  recordSeen(
    message.author.id,
    guildId,
    message.channel.id,
    "name" in message.channel ? (message.channel as any).name : "unknown"
  ).catch(() => {});

  // Automod
  const blocked = await runAutomod(client, message).catch((err) => {
    logger.warn({ err, guildId }, "Automod error");
    return false;
  });
  if (blocked) return;

  // Modnick fallback: check display name on every message (with cooldown)
  // This fires even when guildMemberUpdate doesn't (e.g. Server Members Intent
  // not enabled in the Discord Developer Portal).
  if (message.member) {
    const ck = `${guildId}:${message.author.id}`;
    const last = modnickMsgCooldown.get(ck) ?? 0;
    if (Date.now() - last > MODNICK_MSG_COOLDOWN_MS) {
      modnickMsgCooldown.set(ck, Date.now());
      runModnick(client, message.member, "update").catch((err) =>
        logger.warn({ err }, "modnick messageCreate fallback error")
      );
    }
  }

  // Autoreaction (runs on all non-bot messages)
  handleAutoreaction(message).catch((err) =>
    logger.warn({ err }, "Autoreaction error")
  );

  // Autoreply (runs on all non-bot messages)
  handleAutoreply(message).catch((err) =>
    logger.warn({ err }, "Autoreply error")
  );

  // Auto slowmode (runs on all messages, bots included per config)
  handleSlowmodeAuto(client, message).catch((err) =>
    logger.warn({ err }, "slowmodeAuto error")
  );

  // Prefix check
  if (!message.content.startsWith(prefix)) return;

  const parts = message.content.slice(prefix.length).trim().split(/\s+/);
  const rawName = parts[0] ?? "";
  const args = parts.slice(1);

  if (!rawName) return;

  // Command dispatch
  const cmd = resolveCommand(guildId, rawName);

  if (cmd) {
    const required = getRequiredLevel(guildId, cmd.name);
    if (required >= LEVEL_UNCONFIGURED) {
      await message.reply(
        `⚙️ That command isn't enabled yet. Use \`${prefix}help\` to see what's available, or visit the dashboard to configure more commands: <${BOT_WEBSITE}>`
      ).catch(() => {});
      return;
    }

    logger.debug({ guildId, command: cmd.name, userId: message.author.id }, "Executing command");
    try {
      await cmd.execute(message, args, client);
    } catch (err: unknown) {
      logger.error({ err, command: cmd.name, guildId }, "Command execution error");
      await message.reply("❌ An error occurred while running that command.").catch(() => {});
    }
    return;
  }

  // Tag fallback: !tagname [args...] triggers a tag directly
  // Try the longest possible match first (e.g. "rule 1"), then fall back to
  // just the command word (e.g. "rule"), so tags with spaces work naturally.
  const tags = cfg.tags ?? {};
  const fullKey = [rawName, ...args].join(" ").toLowerCase();
  const shortKey = rawName.toLowerCase();
  const tag = tags[fullKey] ?? tags[shortKey];
  if (tag) {
    const tagKey = tags[fullKey] ? fullKey : shortKey;

    // Tag-level permission check
    // If the tag name appears in levels.commands, enforce that level.
    // Tags not listed there default to 0 (open to everyone).
    const tagRequiredLevel = cfg.levels.commands[tagKey] ?? 0;
    if (tagRequiredLevel > 0) {
      const userLevel = getUserLevel(message);
      if (userLevel < tagRequiredLevel) return;
    }

    await sendTag(message, tag, buildTagContext(message, tagKey))
      .catch((err: unknown) => logger.warn({ err }, "Failed to send tag response"));
  }
}

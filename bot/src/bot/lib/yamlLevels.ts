import type { GuildMember, Message } from "discord.js";
import { getCachedConfig, getGuildConfig } from "../store/guildConfig";

const BOT_OWNER_ID = process.env["BOT_OWNER_ID"];

/** Maximum level — always assigned to server owner and bot owner. */
export const OWNER_LEVEL = 9_999_999_999;

/**
 * Compute a user's effective level from a GuildMember directly.
 * Priority: bot owner → guild owner → user override → highest role level
 */
export function getMemberLevel(member: GuildMember): number {
  const userId = member.user.id;
  const guildId = member.guild.id;

  if (BOT_OWNER_ID && userId === BOT_OWNER_ID) return OWNER_LEVEL;
  if (userId === member.guild.ownerId) return OWNER_LEVEL;

  const cfg = getCachedConfig(guildId);
  const levels = cfg.levels;

  let level = 0;

  if (levels.users[userId] !== undefined) {
    level = Math.max(level, levels.users[userId]!);
  }

  for (const [roleId, roleLevel] of Object.entries(levels.roles)) {
    if (member.roles.cache.has(roleId)) {
      level = Math.max(level, roleLevel);
    }
  }

  return level;
}

/**
 * Compute a user's effective level from a Message (compat shim).
 * Priority: bot owner → guild owner → user override → highest role level
 */
export function getUserLevel(message: Message): number {
  if (!message.guild) return 0;
  if (!message.member) {
    // No member cached — fall back to author-only checks
    const userId = message.author.id;
    if (BOT_OWNER_ID && userId === BOT_OWNER_ID) return OWNER_LEVEL;
    if (userId === message.guild.ownerId) return OWNER_LEVEL;
    return 0;
  }
  return getMemberLevel(message.member);
}

/** Sentinel value — used only when a command is explicitly disabled. */
export const LEVEL_UNCONFIGURED = 999_999_999_999;

/**
 * Returns the required level for a command from YAML config.
 * Defaults to 0 (everyone) when the command is not listed in levels.commands.
 * Set a command to LEVEL_UNCONFIGURED in config to explicitly disable it.
 */
export function getRequiredLevel(guildId: string, commandName: string): number {
  const cfg = getCachedConfig(guildId);
  const required = cfg.levels.commands[commandName];
  return required ?? 0;
}

/**
 * Returns true if the user's level meets the requirement for the given command.
 */
export function checkYamlLevel(message: Message, commandName: string): boolean {
  if (!message.guild) return false;
  const userLevel = getUserLevel(message);
  const required = getRequiredLevel(message.guild.id, commandName);
  return userLevel >= required;
}

/**
 * Async variant that loads config from DB if not cached yet.
 */
export async function checkYamlLevelAsync(message: Message, commandName: string): Promise<boolean> {
  if (!message.guild) return false;
  const guildId = message.guild.id;
  await getGuildConfig(guildId);
  return checkYamlLevel(message, commandName);
}

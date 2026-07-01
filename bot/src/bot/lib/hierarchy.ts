import { GuildMember, Message } from "discord.js";

export async function getExecutorMember(message: Message): Promise<GuildMember | null> {
  if (!message.guild) return null;
  return message.guild.members.fetch(message.author.id).catch(() => null);
}

/**
 * Returns true if executor should NOT be able to act on target.
 *
 * Priority order:
 * 1. If both levels are provided: level difference is decisive.
 *    - executor level > target level → allowed (return false)
 *    - executor level < target level → blocked (return true)
 *    - equal levels → fall through to Discord role position
 * 2. Discord role position fallback (original behaviour).
 *
 * Pass getMemberLevel(executor) and getMemberLevel(target) from yamlLevels
 * to enable level-based checking.
 */
export function isHierarchyBlocked(
  executor: GuildMember,
  target: GuildMember,
  executorLevel?: number,
  targetLevel?: number,
): boolean {
  if (executorLevel !== undefined && targetLevel !== undefined) {
    if (executorLevel > targetLevel) return false;
    if (executorLevel < targetLevel) return true;
  }
  return target.roles.highest.position >= executor.roles.highest.position;
}

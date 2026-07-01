import { Message, User, GuildMember } from "discord.js";

export interface ResolvedTarget {
  user: User;
  member: GuildMember | null;
}

export async function resolveTarget(
  message: Message,
  args: string[]
): Promise<ResolvedTarget | null> {
  let user: User | null = message.mentions.users.first() ?? null;

  if (!user && args[0]) {
    const id = args[0].replace(/[<@!>]/g, "");
    if (/^\d{15,20}$/.test(id)) {
      user = await message.client.users.fetch(id).catch(() => null);
    }
  }

  // Fallback: search guild members by username or display name
  if (!user && args[0] && message.guild) {
    const query = args[0].toLowerCase().replace(/^@/, "");
    // Search cached members first, then fetch all if needed
    let members = message.guild.members.cache;
    if (members.size < 2) {
      await message.guild.members.fetch().catch(() => null);
      members = message.guild.members.cache;
    }
    const found = members.find(
      (m) =>
        m.user.username.toLowerCase() === query ||
        m.displayName.toLowerCase() === query ||
        m.user.globalName?.toLowerCase() === query
    );
    if (found) user = found.user;
  }

  if (!user) return null;

  const member = message.guild
    ? await message.guild.members.fetch(user.id).catch(() => null)
    : null;

  return { user, member };
}

export function getArgs(message: Message, args: string[]): string[] {
  // args[0] is always the user token (mention, ID, or name) when resolveTarget
  // succeeded, so we always strip exactly one token.
  if (message.mentions.users.size > 0) {
    return args.slice(1);
  }
  return args.slice(1);
}

const DISCORD_API = "https://discord.com/api/v10";

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string;
  avatar?: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string;
  owner: boolean;
  permissions: string;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  position?: number;
  parent_id?: string;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  permissions: string;
  managed: boolean;
}

export interface AuditLogEntry {
  id: string;
  action_type: number;
  user_id?: string;
  target_id?: string;
  changes?: Array<{ key: string; old_value?: unknown; new_value?: unknown }>;
  reason?: string;
}

export async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const clientId = process.env["DISCORD_CLIENT_ID"]!;
  const clientSecret = process.env["DISCORD_CLIENT_SECRET"]!;
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

export async function getMe(token: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json() as Promise<DiscordUser>;
}

export async function getMyGuilds(token: string): Promise<DiscordGuild[]> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch guilds");
  return res.json() as Promise<DiscordGuild[]>;
}

/** Fetch every guild the bot is currently in (uses bot token, not user OAuth). */
export async function getBotGuilds(botToken: string): Promise<DiscordGuild[]> {
  const guilds: DiscordGuild[] = [];
  let after = "0";

  while (true) {
    const url = `${DISCORD_API}/users/@me/guilds?limit=200&after=${after}`;
    const res = await fetch(url, { headers: { Authorization: `Bot ${botToken}` } });
    if (!res.ok) break;
    const page: DiscordGuild[] = await res.json() as DiscordGuild[];
    if (!page.length) break;
    guilds.push(...page);
    if (page.length < 200) break;
    after = page[page.length - 1]!.id;
  }

  return guilds;
}

export async function getGuildChannels(
  botToken: string,
  guildId: string
): Promise<DiscordChannel[]> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (!res.ok) return [];
  return res.json() as Promise<DiscordChannel[]>;
}

export async function getGuildRoles(
  botToken: string,
  guildId: string
): Promise<DiscordRole[]> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (!res.ok) return [];
  return res.json() as Promise<DiscordRole[]>;
}

export async function getGuildAuditLog(
  botToken: string,
  guildId: string,
  limit = 50
): Promise<{ audit_log_entries: AuditLogEntry[]; users: DiscordUser[] }> {
  const res = await fetch(
    `${DISCORD_API}/guilds/${guildId}/audit-logs?limit=${limit}`,
    { headers: { Authorization: `Bot ${botToken}` } }
  );
  if (!res.ok) return { audit_log_entries: [], users: [] };
  return res.json() as Promise<{ audit_log_entries: AuditLogEntry[]; users: DiscordUser[] }>;
}

export function hasManageGuild(permissions: string): boolean {
  const MANAGE_GUILD = 0x20n;
  const ADMINISTRATOR = 0x8n;
  const perms = BigInt(permissions);
  return (perms & MANAGE_GUILD) !== 0n || (perms & ADMINISTRATOR) !== 0n;
}

export function avatarUrl(user: DiscordUser): string {
  if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/0.png`;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
}

export function guildIconUrl(guild: DiscordGuild): string | null {
  if (!guild.icon) return null;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
}

export const AUDIT_LOG_ACTIONS: Record<number, string> = {
  1: "Server Update", 10: "Channel Create", 11: "Channel Update", 12: "Channel Delete",
  13: "Channel Permission Create", 14: "Channel Permission Update", 15: "Channel Permission Delete",
  20: "Member Kick", 21: "Member Prune", 22: "Member Ban", 23: "Member Unban",
  24: "Member Update", 25: "Member Role Update", 26: "Member Move", 27: "Member Disconnect",
  28: "Bot Add", 30: "Role Create", 31: "Role Update", 32: "Role Delete",
  40: "Invite Create", 41: "Invite Update", 42: "Invite Delete",
  50: "Webhook Create", 51: "Webhook Update", 52: "Webhook Delete",
  60: "Emoji Create", 61: "Emoji Update", 62: "Emoji Delete",
  72: "Message Delete", 73: "Message Bulk Delete", 74: "Message Pin", 75: "Message Unpin",
  80: "Integration Create", 81: "Integration Update", 82: "Integration Delete",
  90: "Stage Instance Create", 91: "Stage Instance Update", 92: "Stage Instance Delete",
  100: "Sticker Create", 101: "Sticker Update", 102: "Sticker Delete",
  110: "Thread Create", 111: "Thread Update", 112: "Thread Delete",
  121: "Command Permission Update", 140: "Auto Mod Rule Create", 141: "Auto Mod Rule Update",
  142: "Auto Mod Rule Delete", 143: "Auto Mod Block Message",
};

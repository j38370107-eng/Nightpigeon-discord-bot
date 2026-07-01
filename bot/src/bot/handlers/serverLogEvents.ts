import {
  AuditLogEvent,
  Channel,
  Client,
  Collection,
  Guild,
  GuildMember,
  GuildScheduledEvent,
  Message,
  OverwriteType,
  PartialGuildMember,
  PartialMessage,
  PartialUser,
  PermissionsBitField,
  Role,
  Snowflake,
  StageInstance,
  TextChannel,
  ThreadMember,
  User,
  VoiceState,
  Invite,
  ThreadChannel,
  GuildEmoji,
  Sticker,
  GuildBasedChannel,
  DMChannel,
  PartialDMChannel,
} from "discord.js";
import { sendServerLog } from "../lib/serverlog";
import {
  isChannelIgnored,
  isRoleIgnored,
  isUserIgnored,
  shouldLogBotActions,
} from "../store/serverlogging";
import { checkGhostPingDelete } from "../lib/yamlAutomodRules";
import { logger } from "../../lib/logger";

// Helpers
function userTag(u: User | PartialUser): string {
  return (u as User).tag ?? u.id;
}

function truncate(s: string, max = 1024): string {
  if (!s) return "(empty)";
  return s.length > max ? s.slice(0, max - 3) + "…" : s;
}

function channelMention(ch: GuildBasedChannel | DMChannel | PartialDMChannel | { id: string } | null): string {
  if (!ch) return "Unknown channel";
  return `<#${"id" in ch ? ch.id : "?"}>`;
}

function fmtTs(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:F>`;
}

function fmtRelative(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

/** Fetch the most-recent audit log executor for a given event type (< 4s old). */
async function fetchExecutor(
  guild: Guild,
  type: AuditLogEvent,
  targetId?: string | null
): Promise<string> {
  try {
    await new Promise((r) => setTimeout(r, 600));
    const logs = await guild.fetchAuditLogs({ type, limit: 3 });
    const entry = logs.entries.find(
      (e) => (!targetId || e.target?.id === targetId) && Date.now() - e.createdTimestamp < 4000
    );
    if (entry?.executor) return `<@${entry.executor.id}>`;
  } catch { /* audit log unavailable */ }
  return "Unknown";
}

// Message events
export async function onMessageDelete(client: Client, message: Message | PartialMessage): Promise<void> {
  if (!message.guild) return;
  const guildId = message.guild.id;

  // Ghost ping detection — runs before the bot-action filter so it fires even if server logging is off
  if (!message.author?.bot) {
    checkGhostPingDelete(client, message.id, guildId).catch(() => {});
  }

  if (!shouldLogBotActions(guildId) && message.author?.bot) return;
  if (isChannelIgnored(guildId, message.channelId)) return;
  if (message.author && isUserIgnored(guildId, message.author.id)) return;

  const userId  = message.author?.id ?? "";
  const content = message.content ? truncate(message.content) : "(no text content)";

  const fields: { name: string; value: string; inline?: boolean }[] = [];
  if (message.author) fields.push({ name: "Author",  value: `<@${userId}> (${userId})`, inline: true });
  fields.push(                      { name: "Channel", value: channelMention(message.channel), inline: true });
  if (message.content) fields.push( { name: "Content", value: truncate(message.content) });

  await sendServerLog(client, guildId, "messageDelete", {
    title:       "Message Deleted",
    description: `A message was deleted in <#${message.channelId}>`,
    color:       0xe74c3c,
    fields,
    footer:      `Message ID: ${message.id}`,
    vars: {
      userMention: userId ? `<@${userId}>` : "Unknown",
      userId,
      channel:     `<#${message.channelId}>`,
      channelId:   message.channelId,
      content,
    },
  });
}

export async function onMessageUpdate(
  client: Client,
  before: Message | PartialMessage,
  after: Message | PartialMessage
): Promise<void> {
  if (!after.guild) return;
  const guildId = after.guild.id;

  // Fetch the full message so we have content + author even for partials
  let fullAfter: Message | PartialMessage = after;
  try {
    if (after.partial) fullAfter = await after.fetch();
  } catch { /* stay with partial */ }

  if (fullAfter.author?.bot) return;
  if (isChannelIgnored(guildId, fullAfter.channelId)) return;
  if (fullAfter.author && isUserIgnored(guildId, fullAfter.author.id)) return;

  const beforeContent = before.content ?? "(not cached)";
  const afterContent  = fullAfter.content ?? "(unknown)";
  if (beforeContent === afterContent) return;

  const userId = fullAfter.author?.id ?? "";

  const fields: { name: string; value: string; inline?: boolean }[] = [];
  if (fullAfter.author) fields.push({ name: "Author",  value: `<@${userId}> (${userId})`, inline: true });
  fields.push(                        { name: "Channel", value: channelMention(fullAfter.channel), inline: true });
  fields.push(                        { name: "Before",  value: truncate(beforeContent) });
  fields.push(                        { name: "After",   value: truncate(afterContent) });

  await sendServerLog(client, guildId, "messageEdit", {
    title:       "Message Edited",
    description: `Message edited in <#${fullAfter.channelId}>\n[Jump to message](${fullAfter.url})`,
    color:       0xf39c12,
    fields,
    footer:      `Message ID: ${fullAfter.id}`,
    vars: {
      userMention: userId ? `<@${userId}>` : "Unknown",
      userId,
      channel:     `<#${fullAfter.channelId}>`,
      channelId:   fullAfter.channelId,
      oldValue:    truncate(beforeContent),
      newValue:    truncate(afterContent),
    },
  });
}

export async function onMessageDeleteBulk(
  client: Client,
  messages: { size: number; forEach: (cb: (m: Message | PartialMessage) => void) => void },
  channel: GuildBasedChannel | DMChannel | PartialDMChannel
): Promise<void> {
  const guildChannel = channel as GuildBasedChannel;
  if (!("guild" in guildChannel) || !guildChannel.guild) return;
  const guildId = guildChannel.guild.id;
  if (isChannelIgnored(guildId, guildChannel.id)) return;

  // Collect cached message lines, oldest first
  const lines: string[] = [];
  const collected: (Message | PartialMessage)[] = [];
  messages.forEach((m) => collected.push(m));
  collected.sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0));

  for (const m of collected) {
    const tag     = m.author?.tag ?? m.author?.username ?? "Unknown";
    const content = m.content?.trim() || (m.attachments?.size ? "[attachment]" : "[no content]");
    lines.push(`[${tag}]: ${content}`);
  }

  // Build a code block, truncating if it would exceed Discord's embed description limit
  let logBlock = "";
  if (lines.length > 0) {
    const MAX_CHARS = 3800; // leave room for the header line and code fence
    let body = lines.join("\n");
    if (body.length > MAX_CHARS) {
      body = body.slice(0, MAX_CHARS) + "\n… (truncated)";
    }
    logBlock = "\n```\n" + body + "\n```";
  }

  const withContent = lines.length;
  const headerLine  = `**${messages.size}** message${messages.size !== 1 ? "s" : ""} deleted in ${channelMention(guildChannel)}${withContent < messages.size ? ` (${withContent} cached)` : ""}`;

  await sendServerLog(client, guildId, "messageBulkDelete", {
    title:       "Bulk Message Delete",
    description: headerLine + logBlock,
    color:       0xe74c3c,
    vars: {
      channel:   channelMention(guildChannel),
      channelId: guildChannel.id,
      count:     String(messages.size),
    },
  });
}

// Member events
export async function onGuildMemberAdd(client: Client, member: GuildMember): Promise<void> {
  const guildId = member.guild.id;
  if (!shouldLogBotActions(guildId) && member.user.bot) return;
  if (isUserIgnored(guildId, member.user.id)) return;

  if (member.user.bot) {
    await sendServerLog(client, guildId, "botAdded", {
      title:       "Bot Added",
      description: `Bot **${member.user.tag}** was added to the server`,
      color:       0x3498db,
      thumbnail:   member.user.displayAvatarURL(),
      fields: [{ name: "Bot", value: `<@${member.user.id}> (${member.user.id})`, inline: true }],
      vars: {
        userMention: `<@${member.user.id}>`,
        userId:      member.user.id,
        newValue:    member.user.tag,
      },
    });
  } else {
    const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
    const accountCreated = fmtTs(member.user.createdTimestamp);
    await sendServerLog(client, guildId, "memberJoin", {
      title:       "Member Joined",
      description: `<@${member.user.id}> joined the server`,
      color:       0x2ecc71,
      thumbnail:   member.user.displayAvatarURL(),
      fields: [
        { name: "User",         value: `${member.user.tag} (${member.user.id})`, inline: true },
        { name: "Account Age",  value: `${accountAge} days`,                     inline: true },
        { name: "Member Count", value: `${member.guild.memberCount}`,             inline: true },
      ],
      footer: `User ID: ${member.user.id}`,
      vars: {
        userMention: `<@${member.user.id}>`,
        userId:      member.user.id,
        oldValue:    accountCreated,
        newValue:    `${accountAge} days`,
      },
    });
  }
}

export async function onGuildMemberRemove(client: Client, member: GuildMember | PartialGuildMember): Promise<void> {
  const guildId = member.guild.id;
  if (!shouldLogBotActions(guildId) && member.user?.bot) return;
  if (member.user && isUserIgnored(guildId, member.user.id)) return;

  let eventKey = member.user?.bot ? "botRemoved" : "memberLeave";
  let title    = member.user?.bot ? "Bot Removed"  : "Member Left";
  let executor: string | null = null;
  try {
    await new Promise((r) => setTimeout(r, 800));
    const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 3 });
    const entry = logs.entries.find((e) => e.target?.id === member.user?.id && Date.now() - e.createdTimestamp < 5000);
    if (entry) {
      eventKey = "memberKick";
      title    = "Member Kicked";
      executor = entry.executor ? `<@${entry.executor.id}>` : null;
    }
  } catch { /* audit log unavailable */ }

  const joinedAt   = member.joinedTimestamp ? fmtTs(member.joinedTimestamp) : "Unknown";
  const rolesList  = member.roles?.cache
    ? [...member.roles.cache.values()].filter((r) => r.id !== member.guild.id).map((r) => `<@&${r.id}>`).join(" ") || "(none)"
    : "(unknown)";

  const fields: { name: string; value: string; inline?: boolean }[] = [];
  if (member.user) fields.push({ name: "User",      value: `${member.user.tag} (${member.user.id})`, inline: true });
  if (executor)    fields.push({ name: "Kicked By", value: executor,                                   inline: true });

  await sendServerLog(client, guildId, eventKey, {
    title,
    description: member.user ? `<@${member.user.id}> left the server` : "A member left",
    color:       eventKey === "memberKick" ? 0xe74c3c : 0x95a5a6,
    thumbnail:   member.user?.displayAvatarURL(),
    fields,
    footer:      member.user ? `User ID: ${member.user.id}` : undefined,
    vars: {
      userMention: member.user ? `<@${member.user.id}>` : "Unknown",
      userId:      member.user?.id ?? "",
      oldValue:    joinedAt,
      newValue:    rolesList,
      moderator:   executor ?? undefined,
    },
  });
}

export async function onGuildBanAdd(client: Client, ban: { guild: Guild; user: User; reason?: string | null }): Promise<void> {
  const guildId = ban.guild.id;
  await sendServerLog(client, guildId, "memberBan", {
    title:       "Member Banned",
    description: `<@${ban.user.id}> was banned`,
    color:       0xe74c3c,
    thumbnail:   ban.user.displayAvatarURL(),
    fields: [
      { name: "User",   value: `${ban.user.tag} (${ban.user.id})`, inline: true },
      ...(ban.reason ? [{ name: "Reason", value: ban.reason, inline: false }] : []),
    ],
    footer: `User ID: ${ban.user.id}`,
    vars: {
      userMention: `<@${ban.user.id}>`,
      userId:      ban.user.id,
      newValue:    ban.reason ?? "(no reason)",
    },
  });
}

export async function onGuildBanRemove(client: Client, ban: { guild: Guild; user: User }): Promise<void> {
  const guildId = ban.guild.id;
  await sendServerLog(client, guildId, "memberUnban", {
    title:       "Member Unbanned",
    description: `<@${ban.user.id}> was unbanned`,
    color:       0x2ecc71,
    thumbnail:   ban.user.displayAvatarURL(),
    fields: [{ name: "User", value: `${ban.user.tag} (${ban.user.id})`, inline: true }],
    footer: `User ID: ${ban.user.id}`,
    vars: {
      userMention: `<@${ban.user.id}>`,
      userId:      ban.user.id,
    },
  });
}

export async function onGuildMemberUpdate(
  client: Client,
  before: GuildMember | PartialGuildMember,
  after: GuildMember
): Promise<void> {
  const guildId = after.guild.id;
  if (isUserIgnored(guildId, after.user.id)) return;

  const userId = after.user.id;

  // Nickname change
  if (before.nickname !== after.nickname) {
    const oldNick = before.nickname ?? "(none)";
    const newNick = after.nickname  ?? "(none)";
    await sendServerLog(client, guildId, "nicknameChange", {
      title:       "Nickname Changed",
      description: `<@${userId}>'s nickname was updated`,
      color:       0x9b59b6,
      fields: [
        { name: "Before", value: oldNick, inline: true },
        { name: "After",  value: newNick, inline: true },
      ],
      footer: `User ID: ${userId}`,
      vars: {
        userMention: `<@${userId}>`,
        userId,
        oldValue: oldNick,
        newValue: newNick,
      },
    });
  }

  // Role changes
  const beforeRoles = before.roles?.cache ?? new Map();
  const afterRoles  = after.roles.cache;
  const added   = [...afterRoles.values()].filter((r) => !beforeRoles.has(r.id) && r.id !== after.guild.id);
  const removed = [...beforeRoles.values()].filter((r) => !afterRoles.has(r.id)  && r.id !== after.guild.id);
  if (added.length > 0 || removed.length > 0) {
    const memberRoles = [...afterRoles.keys()];
    if (isRoleIgnored(guildId, memberRoles)) return;
    const addedStr   = added.length   ? added.map((r)   => `<@&${r.id}>`).join(" ")   : "(none)";
    const removedStr = removed.length ? removed.map((r) => `<@&${r.id}>`).join(" ") : "(none)";
    const fields: { name: string; value: string; inline?: boolean }[] = [];
    if (added.length)   fields.push({ name: "Roles Added",   value: addedStr,   inline: false });
    if (removed.length) fields.push({ name: "Roles Removed", value: removedStr, inline: false });
    await sendServerLog(client, guildId, "rolesChange", {
      title:       "Member Roles Updated",
      description: `<@${userId}>'s roles were updated`,
      color:       0x3498db,
      fields,
      footer: `User ID: ${userId}`,
      vars: {
        userMention: `<@${userId}>`,
        userId,
        newValue: addedStr,
        oldValue: removedStr,
      },
    });
  }

  // Timeout applied / removed
  const beforeTimeout = (before as GuildMember).communicationDisabledUntilTimestamp ?? null;
  const afterTimeout  = after.communicationDisabledUntilTimestamp ?? null;
  if (!beforeTimeout && afterTimeout && afterTimeout > Date.now()) {
    const durationMs = afterTimeout - Date.now();
    const durationStr = formatDuration(durationMs);
    const untilStr    = fmtTs(afterTimeout);
    await sendServerLog(client, guildId, "memberTimeout", {
      title:       "Member Timed Out",
      description: `<@${userId}> was timed out until ${untilStr}`,
      color:       0xe67e22,
      footer:      `User ID: ${userId}`,
      vars: {
        userMention: `<@${userId}>`,
        userId,
        duration: durationStr,
        newValue: untilStr,
      },
    });
  } else if (beforeTimeout && (!afterTimeout || afterTimeout <= Date.now())) {
    await sendServerLog(client, guildId, "timeoutRemoved", {
      title:       "Timeout Removed",
      description: `<@${userId}>'s timeout was removed`,
      color:       0x2ecc71,
      footer:      `User ID: ${userId}`,
      vars: {
        userMention: `<@${userId}>`,
        userId,
      },
    });
  }
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export async function onUserUpdate(client: Client, before: User | PartialUser, after: User): Promise<void> {
  const guilds = client.guilds.cache;
  for (const [, guild] of guilds) {
    const member = guild.members.cache.get(after.id);
    if (!member) continue;
    const guildId = guild.id;
    if (isUserIgnored(guildId, after.id)) continue;

    if ((before as User).username !== after.username || (before as User).discriminator !== after.discriminator) {
      const oldTag = userTag(before);
      const newTag = after.tag;
      await sendServerLog(client, guildId, "usernameChange", {
        title:       "Username Changed",
        description: `<@${after.id}>'s username was updated`,
        color:       0x9b59b6,
        fields: [
          { name: "Before", value: oldTag, inline: true },
          { name: "After",  value: newTag, inline: true },
        ],
        footer: `User ID: ${after.id}`,
        vars: {
          userMention: `<@${after.id}>`,
          userId:      after.id,
          oldValue:    oldTag,
          newValue:    newTag,
        },
      }).catch(() => {});
    }

    if ((before as User).avatar !== after.avatar) {
      await sendServerLog(client, guildId, "avatarChange", {
        title:       "Avatar Changed",
        description: `<@${after.id}> changed their avatar`,
        color:       0x9b59b6,
        thumbnail:   after.displayAvatarURL(),
        footer:      `User ID: ${after.id}`,
        vars: {
          userMention: `<@${after.id}>`,
          userId:      after.id,
        },
      }).catch(() => {});
    }
  }
}

// Role events
export async function onRoleCreate(client: Client, role: Role): Promise<void> {
  const moderator = await fetchExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
  await sendServerLog(client, role.guild.id, "roleCreate", {
    title:       "Role Created",
    description: `Role **${role.name}** was created`,
    color:       0x2ecc71,
    fields: [
      { name: "Role",       value: `<@&${role.id}> (${role.id})`, inline: true },
      { name: "Color",      value: role.hexColor,                  inline: true },
      { name: "Created By", value: moderator,                      inline: true },
    ],
    vars: {
      newValue:  `<@&${role.id}>`,
      moderator,
    },
  });
}

export async function onRoleDelete(client: Client, role: Role): Promise<void> {
  const moderator = await fetchExecutor(role.guild, AuditLogEvent.RoleDelete);
  await sendServerLog(client, role.guild.id, "roleDelete", {
    title:       "Role Deleted",
    description: `Role **${role.name}** was deleted`,
    color:       0xe74c3c,
    fields: [
      { name: "Role ID",    value: role.id,   inline: true },
      { name: "Deleted By", value: moderator, inline: true },
    ],
    vars: {
      oldValue:  role.name,
      moderator,
    },
  });
}

function fmtPermName(p: string): string {
  return p.replace(/([A-Z])/g, " $1").trim();
}

export async function onRoleUpdate(client: Client, before: Role, after: Role): Promise<void> {
  const changes: string[] = [];
  if (before.name !== after.name)               changes.push(`Name: \`${before.name}\` → \`${after.name}\``);
  if (before.color !== after.color)             changes.push(`Color: \`${before.hexColor}\` → \`${after.hexColor}\``);
  if (before.hoist !== after.hoist)             changes.push(`Hoisted: \`${before.hoist}\` → \`${after.hoist}\``);
  if (before.mentionable !== after.mentionable) changes.push(`Mentionable: \`${before.mentionable}\` → \`${after.mentionable}\``);

  // Permissions diff — show which specific permissions were granted/revoked
  if (before.permissions.bitfield !== after.permissions.bitfield) {
    const allPerms = Object.keys(PermissionsBitField.Flags) as (keyof typeof PermissionsBitField.Flags)[];
    const granted  = allPerms.filter(p => !before.permissions.has(p) && after.permissions.has(p));
    const revoked  = allPerms.filter(p =>  before.permissions.has(p) && !after.permissions.has(p));
    if (granted.length) changes.push(`Permissions granted: ${granted.map(p => `\`${fmtPermName(p)}\``).join(", ")}`);
    if (revoked.length) changes.push(`Permissions revoked: ${revoked.map(p => `\`${fmtPermName(p)}\``).join(", ")}`);
  }

  if (!changes.length) return;

  const moderator = await fetchExecutor(after.guild, AuditLogEvent.RoleUpdate, after.id);
  const changesStr = changes.join("\n");
  await sendServerLog(client, after.guild.id, "roleUpdate", {
    title:       "Role Updated",
    description: `Role <@&${after.id}> was updated`,
    color:       0xf39c12,
    fields: [
      ...changes.map((c) => ({ name: "\u200b", value: c })),
      { name: "Updated By", value: moderator, inline: true },
    ],
    vars: {
      oldValue:  `<@&${after.id}>`,
      newValue:  changesStr,
      moderator,
    },
  });
}

// Channel events
export async function onChannelCreate(client: Client, channel: Channel): Promise<void> {
  if (!("guild" in channel) || !channel.guild) return;
  const moderator = await fetchExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
  await sendServerLog(client, channel.guild.id, "channelCreate", {
    title:       "Channel Created",
    description: `Channel <#${channel.id}> was created`,
    color:       0x2ecc71,
    fields: [
      { name: "Name",       value: (channel as any).name ?? channel.id, inline: true },
      { name: "Created By", value: moderator,                            inline: true },
    ],
    vars: {
      newValue:  `<#${channel.id}>`,
      channel:   `<#${channel.id}>`,
      channelId: channel.id,
      moderator,
    },
  });
}

export async function onChannelDelete(client: Client, channel: Channel | { id: string; name?: string; guild?: Guild }): Promise<void> {
  if (!("guild" in channel) || !(channel as any).guild) return;
  const guildChannel = channel as GuildBasedChannel;
  const chName = (guildChannel as any).name ?? guildChannel.id;
  const moderator = await fetchExecutor(guildChannel.guild, AuditLogEvent.ChannelDelete);
  await sendServerLog(client, guildChannel.guild.id, "channelDelete", {
    title:       "Channel Deleted",
    description: `Channel **#${chName}** was deleted`,
    color:       0xe74c3c,
    fields: [
      { name: "Channel ID", value: guildChannel.id, inline: true },
      { name: "Deleted By", value: moderator,        inline: true },
    ],
    vars: {
      oldValue:  `#${chName}`,
      channel:   `#${chName}`,
      channelId: guildChannel.id,
      moderator,
    },
  });
}

export async function onChannelUpdate(client: Client, before: Channel, after: Channel): Promise<void> {
  if (!("guild" in after) || !(after as any).guild) return;
  const guildAfter  = after  as GuildBasedChannel & Record<string, any>;
  const guildBefore = before as GuildBasedChannel & Record<string, any>;

  const settingChanges: string[] = [];
  if (guildBefore.name !== guildAfter.name)
    settingChanges.push(`Name: \`${guildBefore.name}\` → \`${guildAfter.name}\``);
  if (guildBefore.topic !== undefined && guildBefore.topic !== guildAfter.topic)
    settingChanges.push(`Topic: \`${guildBefore.topic ?? "(none)"}\` → \`${guildAfter.topic ?? "(none)"}\``);
  if (guildBefore.nsfw !== undefined && guildBefore.nsfw !== guildAfter.nsfw)
    settingChanges.push(`NSFW: \`${guildBefore.nsfw}\` → \`${guildAfter.nsfw}\``);
  if (guildBefore.rateLimitPerUser !== undefined && guildBefore.rateLimitPerUser !== guildAfter.rateLimitPerUser)
    settingChanges.push(`Slowmode: \`${guildBefore.rateLimitPerUser}s\` → \`${guildAfter.rateLimitPerUser}s\``);
  if (guildBefore.bitrate !== undefined && guildBefore.bitrate !== guildAfter.bitrate)
    settingChanges.push(`Bitrate: \`${Math.round(guildBefore.bitrate / 1000)}kbps\` → \`${Math.round(guildAfter.bitrate / 1000)}kbps\``);
  if (guildBefore.userLimit !== undefined && guildBefore.userLimit !== guildAfter.userLimit)
    settingChanges.push(`User Limit: \`${guildBefore.userLimit || "unlimited"}\` → \`${guildAfter.userLimit || "unlimited"}\``);
  if (guildBefore.parentId !== guildAfter.parentId)
    settingChanges.push(`Category moved`);

  // Detect permission overwrite changes separately
  const beforeOwMap = guildBefore.permissionOverwrites?.cache;
  const afterOwMap  = guildAfter.permissionOverwrites?.cache;
  let permissionsChanged = false;
  if (beforeOwMap && afterOwMap) {
    const sig = (m: typeof beforeOwMap) =>
      [...m.values()]
        .map((o) => `${o.id}:${o.type}:${o.allow.bitfield}:${o.deny.bitfield}`)
        .sort()
        .join("|");
    permissionsChanged = sig(beforeOwMap) !== sig(afterOwMap);
  }

  if (settingChanges.length > 0) {
    const moderator  = await fetchExecutor(guildAfter.guild, AuditLogEvent.ChannelUpdate, guildAfter.id);
    const changesStr = settingChanges.join("\n");
    await sendServerLog(client, guildAfter.guild.id, "channelUpdate", {
      title:       "Channel Updated",
      description: `Channel <#${guildAfter.id}> was updated`,
      color:       0xf39c12,
      fields: [
        ...settingChanges.map((c) => ({ name: "\u200b", value: c })),
        { name: "Updated By", value: moderator, inline: true },
      ],
      vars: {
        channel:   `<#${guildAfter.id}>`,
        channelId: guildAfter.id,
        newValue:  changesStr,
        moderator,
      },
    });
  }

  if (permissionsChanged) {
    const moderator = await fetchExecutor(guildAfter.guild, AuditLogEvent.ChannelOverwriteUpdate, guildAfter.id);
    // Summarise which roles/users changed
    const affectedNames: string[] = [];
    if (afterOwMap) {
      for (const [, ow] of afterOwMap) {
        const label = ow.type === OverwriteType.Role ? `<@&${ow.id}>` : `<@${ow.id}>`;
        const prev  = beforeOwMap?.get(ow.id);
        if (!prev || prev.allow.bitfield !== ow.allow.bitfield || prev.deny.bitfield !== ow.deny.bitfield) {
          affectedNames.push(label);
        }
      }
      if (beforeOwMap) {
        for (const [id, ow] of beforeOwMap) {
          if (!afterOwMap.has(id)) {
            affectedNames.push(ow.type === OverwriteType.Role ? `<@&${id}>` : `<@${id}>`);
          }
        }
      }
    }
    const affected = affectedNames.length ? affectedNames.join(", ") : "Unknown";
    await sendServerLog(client, guildAfter.guild.id, "channelPermissionsUpdate", {
      title:       "Channel Permissions Updated",
      description: `Permission overrides on <#${guildAfter.id}> were changed`,
      color:       0xe67e22,
      fields: [
        { name: "Affected",    value: affected,   inline: true },
        { name: "Updated By",  value: moderator,  inline: true },
      ],
      vars: {
        channel:   `<#${guildAfter.id}>`,
        channelId: guildAfter.id,
        newValue:  affected,
        moderator,
      },
    });
  }
}

// Server events
export async function onGuildUpdate(client: Client, before: Guild, after: Guild): Promise<void> {
  const boostBefore = before.premiumSubscriptionCount ?? 0;
  const boostAfter  = after.premiumSubscriptionCount  ?? 0;
  if (boostBefore !== boostAfter) {
    await sendServerLog(client, after.id, "boostChange", {
      title:       boostAfter > boostBefore ? "Server Boosted" : "Boost Removed",
      description: `Boost count changed from **${boostBefore}** to **${boostAfter}** (Tier ${after.premiumTier})`,
      color:       boostAfter > boostBefore ? 0xff73fa : 0x95a5a6,
      vars: {
        oldValue: String(boostBefore),
        newValue: String(boostAfter),
      },
    });
    return;
  }

  const changes: { key: string; old: string; new: string }[] = [];
  if (before.name                    !== after.name)                    changes.push({ key: "name",              old: before.name,                    new: after.name });
  if (before.icon                    !== after.icon)                    changes.push({ key: "icon",              old: "old icon",                     new: "new icon" });
  if (before.banner                  !== after.banner)                  changes.push({ key: "banner",            old: "old banner",                   new: "new banner" });
  if (before.verificationLevel       !== after.verificationLevel)       changes.push({ key: "verificationLevel", old: String(before.verificationLevel), new: String(after.verificationLevel) });
  if (before.explicitContentFilter   !== after.explicitContentFilter)   changes.push({ key: "contentFilter",     old: String(before.explicitContentFilter), new: String(after.explicitContentFilter) });
  if (before.defaultMessageNotifications !== after.defaultMessageNotifications)
    changes.push({ key: "notifications", old: String(before.defaultMessageNotifications), new: String(after.defaultMessageNotifications) });
  if (before.afkChannelId            !== after.afkChannelId)            changes.push({ key: "afkChannel",        old: before.afkChannelId ?? "(none)", new: after.afkChannelId ?? "(none)" });
  if (before.systemChannelId         !== after.systemChannelId)         changes.push({ key: "systemChannel",     old: before.systemChannelId ?? "(none)", new: after.systemChannelId ?? "(none)" });
  if (before.vanityURLCode           !== after.vanityURLCode)           changes.push({ key: "vanityUrl",         old: before.vanityURLCode ?? "(none)", new: after.vanityURLCode ?? "(none)" });
  if (before.ownerId                 !== after.ownerId)                 changes.push({ key: "owner",             old: `<@${before.ownerId}>`,         new: `<@${after.ownerId}>` });

  if (!changes.length) return;

  const moderator = await fetchExecutor(after, AuditLogEvent.GuildUpdate);

  const titleMap: Record<string, string> = {
    name:              "Server Name Changed",
    icon:              "Server Icon Changed",
    banner:            "Server Banner Changed",
    verificationLevel: "Verification Level Changed",
    contentFilter:     "Content Filter Changed",
    notifications:     "Default Notifications Changed",
    afkChannel:        "AFK Channel Changed",
    systemChannel:     "System Channel Changed",
    vanityUrl:         "Vanity URL Changed",
    owner:             "Server Owner Changed",
  };

  for (const c of changes) {
    const title = titleMap[c.key] ?? "Server Updated";
    const isId  = c.key === "afkChannel" || c.key === "systemChannel";
    const oldFmt = isId && c.old !== "(none)" ? `<#${c.old}>` : c.old;
    const newFmt = isId && c.new !== "(none)" ? `<#${c.new}>` : c.new;
    await sendServerLog(client, after.id, "serverUpdate", {
      title,
      description: `Server ${c.key.replace(/([A-Z])/g, " $1").toLowerCase()} was updated`,
      color:       0xf39c12,
      fields: [
        ...(c.key !== "icon" && c.key !== "banner" ? [
          { name: "Before", value: oldFmt, inline: true },
          { name: "After",  value: newFmt, inline: true },
        ] : []),
        { name: "Updated By", value: moderator, inline: true },
      ],
      vars: {
        oldValue:  oldFmt,
        newValue:  newFmt,
        moderator,
      },
    });
  }
}

// Voice events
export async function onVoiceStateUpdate(client: Client, before: VoiceState, after: VoiceState): Promise<void> {
  if (!after.guild) return;
  const guildId = after.guild.id;
  const userId  = after.member?.user.id ?? after.id;
  if (!shouldLogBotActions(guildId) && after.member?.user.bot) return;
  if (isUserIgnored(guildId, userId)) return;

  if (!before.channelId && after.channelId) {
    await sendServerLog(client, guildId, "voiceJoin", {
      title:       "Voice Channel Joined",
      description: `<@${userId}> joined <#${after.channelId}>`,
      color:       0x2ecc71,
      vars: {
        userMention: `<@${userId}>`,
        userId,
        channel:   `<#${after.channelId}>`,
        channelId: after.channelId,
      },
    });
  } else if (before.channelId && !after.channelId) {
    await sendServerLog(client, guildId, "voiceLeave", {
      title:       "Voice Channel Left",
      description: `<@${userId}> left <#${before.channelId}>`,
      color:       0xe74c3c,
      vars: {
        userMention: `<@${userId}>`,
        userId,
        channel:   `<#${before.channelId}>`,
        channelId: before.channelId,
      },
    });
  } else if (before.channelId && after.channelId && before.channelId !== after.channelId) {
    await sendServerLog(client, guildId, "voiceMove", {
      title:       "Voice Channel Moved",
      description: `<@${userId}> moved from <#${before.channelId}> to <#${after.channelId}>`,
      color:       0xf39c12,
      vars: {
        userMention: `<@${userId}>`,
        userId,
        oldValue:  `<#${before.channelId}>`,
        newValue:  `<#${after.channelId}>`,
        channel:   `<#${after.channelId}>`,
        channelId: after.channelId,
      },
    });
  } else if (before.channelId) {
    const stateChanges: string[] = [];
    if (before.serverMute !== after.serverMute) stateChanges.push(`Server muted: ${after.serverMute}`);
    if (before.serverDeaf !== after.serverDeaf) stateChanges.push(`Server deafened: ${after.serverDeaf}`);

    if (stateChanges.length > 0) {
      await sendServerLog(client, guildId, "voiceMuteDeafen", {
        title:       "Voice State Changed",
        description: `<@${userId}> in <#${before.channelId}>: ${stateChanges.join(", ")}`,
        color:       0x95a5a6,
        vars: {
          userMention: `<@${userId}>`,
          userId,
          channel:   `<#${before.channelId}>`,
          channelId: before.channelId,
          newValue:  stateChanges.join(", "),
        },
      });
    }

    // Screen share / live stream started or stopped
    if (before.streaming !== after.streaming) {
      await sendServerLog(client, guildId, "voiceStream", {
        title:       after.streaming ? "🔴 Stream Started" : "⏹ Stream Ended",
        description: after.streaming
          ? `<@${userId}> started streaming in <#${after.channelId ?? before.channelId}>`
          : `<@${userId}> stopped streaming in <#${before.channelId}>`,
        color:       after.streaming ? 0x5865f2 : 0x95a5a6,
        vars: {
          userMention: `<@${userId}>`,
          userId,
          channel:   `<#${before.channelId}>`,
          channelId: before.channelId,
          newValue:  after.streaming ? "started" : "stopped",
        },
      });
    }
  }
}

// Invite events
export async function onInviteCreate(client: Client, invite: Invite): Promise<void> {
  if (!invite.guild) return;
  const expiresStr = invite.expiresTimestamp
    ? fmtRelative(invite.expiresTimestamp)
    : "Never";
  await sendServerLog(client, invite.guild.id, "inviteCreate", {
    title:       "Invite Created",
    description: `Invite \`${invite.code}\` was created`,
    color:       0x2ecc71,
    fields: [
      { name: "Inviter",   value: invite.inviter ? `<@${invite.inviter.id}>` : "Unknown",       inline: true },
      { name: "Channel",   value: invite.channel  ? `<#${invite.channel.id}>` : "Unknown",       inline: true },
      { name: "Max Uses",  value: invite.maxUses  ? String(invite.maxUses)   : "Unlimited",       inline: true },
      { name: "Expires",   value: expiresStr,                                                     inline: true },
    ],
    vars: {
      userMention: invite.inviter ? `<@${invite.inviter.id}>` : "Unknown",
      userId:      invite.inviter?.id ?? "",
      channel:     invite.channel ? `<#${invite.channel.id}>` : "Unknown",
      channelId:   invite.channel?.id ?? "",
      newValue:    invite.code,
      count:       invite.maxUses ? String(invite.maxUses) : "Unlimited",
      duration:    expiresStr,
    },
  });
}

export async function onInviteDelete(client: Client, invite: Invite): Promise<void> {
  if (!invite.guild) return;
  await sendServerLog(client, invite.guild.id, "inviteDelete", {
    title:       "Invite Deleted",
    description: `Invite \`${invite.code}\` was deleted`,
    color:       0xe74c3c,
    fields: [
      { name: "Channel", value: invite.channel ? `<#${invite.channel.id}>` : "Unknown", inline: true },
    ],
    vars: {
      oldValue:  invite.code,
      channel:   invite.channel ? `<#${invite.channel.id}>` : "Unknown",
      channelId: invite.channel?.id ?? "",
    },
  });
}

// Thread events
export async function onThreadCreate(client: Client, thread: ThreadChannel, newlyCreated: boolean): Promise<void> {
  if (!newlyCreated) return;
  const guildId = thread.guild.id;
  const creator = await fetchExecutor(thread.guild, AuditLogEvent.ThreadCreate, thread.id);
  await sendServerLog(client, guildId, "threadCreate", {
    title:       "Thread Created",
    description: `Thread **${thread.name}** was created in <#${thread.parentId ?? "?"}>`,
    color:       0x2ecc71,
    fields: [
      { name: "Thread",     value: `<#${thread.id}>`,                      inline: true },
      { name: "Parent",     value: thread.parentId ? `<#${thread.parentId}>` : "Unknown", inline: true },
      { name: "Created By", value: creator,                                 inline: true },
    ],
    vars: {
      newValue:    `<#${thread.id}>`,
      channel:     thread.parentId ? `<#${thread.parentId}>` : "Unknown",
      channelId:   thread.parentId ?? "",
      userMention: creator,
    },
  });
}

export async function onThreadDelete(client: Client, thread: ThreadChannel): Promise<void> {
  await sendServerLog(client, thread.guild.id, "threadDelete", {
    title:       "Thread Deleted",
    description: `Thread **${thread.name}** was deleted`,
    color:       0xe74c3c,
    vars: {
      oldValue:  thread.name,
      channel:   thread.parentId ? `<#${thread.parentId}>` : "Unknown",
      channelId: thread.parentId ?? "",
    },
  });
}

export async function onThreadUpdate(client: Client, before: ThreadChannel, after: ThreadChannel): Promise<void> {
  if (before.name === after.name && before.archived === after.archived && before.locked === after.locked) return;

  const changes: string[] = [];
  if (before.name !== after.name)         changes.push(`Name: \`${before.name}\` → \`${after.name}\``);
  if (before.archived !== after.archived) changes.push(`Archived: \`${after.archived}\``);
  if (before.locked !== after.locked)     changes.push(`Locked: \`${after.locked}\``);

  const isArchive   = !before.archived && after.archived;
  const isUnarchive = before.archived  && !after.archived;
  const eventKey    = isArchive ? "threadUpdate" : isUnarchive ? "threadUpdate" : "threadUpdate";

  await sendServerLog(client, after.guild.id, eventKey, {
    title:       isArchive ? "Thread Archived" : isUnarchive ? "Thread Unarchived" : "Thread Updated",
    description: `Thread <#${after.id}> was updated`,
    color:       0xf39c12,
    fields: changes.map((c) => ({ name: "\u200b", value: c })),
    vars: {
      channel:   `<#${after.id}>`,
      channelId: after.id,
      newValue:  changes.join("\n"),
    },
  });
}

// Emoji / sticker events
export async function onEmojiCreate(client: Client, emoji: GuildEmoji): Promise<void> {
  const moderator = await fetchExecutor(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
  await sendServerLog(client, emoji.guild.id, "emojiCreate", {
    title:       "Emoji Added",
    description: `Emoji **:${emoji.name}:** was added`,
    color:       0x2ecc71,
    thumbnail:   emoji.url,
    fields: [
      { name: "Emoji",    value: `<:${emoji.name}:${emoji.id}>`, inline: true },
      { name: "Added By", value: moderator,                      inline: true },
    ],
    vars: {
      newValue:  `:${emoji.name}:`,
      moderator,
    },
  });
}

export async function onEmojiDelete(client: Client, emoji: GuildEmoji): Promise<void> {
  const moderator = await fetchExecutor(emoji.guild, AuditLogEvent.EmojiDelete);
  await sendServerLog(client, emoji.guild.id, "emojiDelete", {
    title:       "Emoji Removed",
    description: `Emoji **:${emoji.name}:** was removed`,
    color:       0xe74c3c,
    fields: [
      { name: "Removed By", value: moderator, inline: true },
    ],
    vars: {
      oldValue:  `:${emoji.name}:`,
      moderator,
    },
  });
}

export async function onEmojiUpdate(client: Client, before: GuildEmoji, after: GuildEmoji): Promise<void> {
  if (before.name === after.name) return;
  await sendServerLog(client, after.guild.id, "emojiUpdate", {
    title:       "Emoji Renamed",
    description: `Emoji renamed: \`:${before.name}:\` → \`:${after.name}:\``,
    color:       0xf39c12,
    thumbnail:   after.url,
    vars: {
      oldValue: `:${before.name}:`,
      newValue: `:${after.name}:`,
    },
  });
}

export async function onStickerCreate(client: Client, sticker: Sticker): Promise<void> {
  if (!sticker.guildId) return;
  const guild = client.guilds.cache.get(sticker.guildId);
  const moderator = guild ? await fetchExecutor(guild, AuditLogEvent.StickerCreate) : "Unknown";
  await sendServerLog(client, sticker.guildId, "stickerCreate", {
    title:       "Sticker Added",
    description: `Sticker **${sticker.name}** was added`,
    color:       0x2ecc71,
    fields: [
      { name: "Added By", value: moderator, inline: true },
    ],
    vars: {
      newValue:  sticker.name,
      moderator,
    },
  });
}

export async function onStickerDelete(client: Client, sticker: Sticker): Promise<void> {
  if (!sticker.guildId) return;
  const guild = client.guilds.cache.get(sticker.guildId);
  const moderator = guild ? await fetchExecutor(guild, AuditLogEvent.StickerDelete) : "Unknown";
  await sendServerLog(client, sticker.guildId, "stickerDelete", {
    title:       "Sticker Removed",
    description: `Sticker **${sticker.name}** was removed`,
    color:       0xe74c3c,
    fields: [
      { name: "Removed By", value: moderator, inline: true },
    ],
    vars: {
      oldValue:  sticker.name,
      moderator,
    },
  });
}

// Webhook / integration events
export async function onWebhooksUpdate(client: Client, channel: TextChannel): Promise<void> {
  if (!channel.guild) return;
  try {
    await new Promise((r) => setTimeout(r, 500));

    const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 1 });
    const entry = logs.entries.first();
    if (entry && Date.now() - entry.createdTimestamp < 3000) {
      // Skip webhook creations made by the bot itself (e.g. the NightPigeon Logs webhook)
      if (entry.executor?.id === client.user?.id) return;

      const wh        = entry.target as { name?: string } | null;
      const whName    = wh?.name ?? "Unknown";
      const executor  = entry.executor ? `<@${entry.executor.id}>` : "Unknown";

      await sendServerLog(client, channel.guild.id, "webhookCreate", {
        title:       "Webhook Created",
        description: `A webhook was created in <#${channel.id}>`,
        color:       0x2ecc71,
        fields: [
          { name: "Name",       value: whName,              inline: true },
          { name: "Channel",    value: `<#${channel.id}>`, inline: true },
          { name: "Created By", value: executor,            inline: true },
        ],
        vars: {
          newValue:  whName,
          channel:   `<#${channel.id}>`,
          channelId: channel.id,
          moderator: executor,
        },
      });
      return;
    }

    const delLogs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookDelete, limit: 1 });
    const delEntry = delLogs.entries.first();
    if (delEntry && Date.now() - delEntry.createdTimestamp < 3000) {
      if (delEntry.executor?.id === client.user?.id) return;

      const wh       = delEntry.target as { name?: string } | null;
      const whName   = wh?.name ?? "Unknown";
      const executor = delEntry.executor ? `<@${delEntry.executor.id}>` : "Unknown";

      await sendServerLog(client, channel.guild.id, "webhookDelete", {
        title:       "Webhook Deleted",
        description: `A webhook was deleted in <#${channel.id}>`,
        color:       0xe74c3c,
        fields: [
          { name: "Name",       value: whName,              inline: true },
          { name: "Channel",    value: `<#${channel.id}>`, inline: true },
          { name: "Deleted By", value: executor,            inline: true },
        ],
        vars: {
          oldValue:  whName,
          channel:   `<#${channel.id}>`,
          channelId: channel.id,
          moderator: executor,
        },
      });
    }
  } catch { /* audit log unavailable */ }
}

export async function onGuildIntegrationsUpdate(client: Client, guild: Guild): Promise<void> {
  await sendServerLog(client, guild.id, "integrationChange", {
    title:       "Integrations Updated",
    description: "A server integration was added, removed, or updated",
    color:       0x3498db,
    vars: {},
  });
}

// Message pin event
export async function onChannelPinsUpdate(
  client: Client,
  channel: GuildBasedChannel | DMChannel | PartialDMChannel,
  _time: Date | null
): Promise<void> {
  if (!("guild" in channel) || !channel.guild) return;
  const guildId = channel.guild.id;
  if (isChannelIgnored(guildId, channel.id)) return;

  const executor = await fetchExecutor(channel.guild, AuditLogEvent.MessagePin);
  await sendServerLog(client, guildId, "messagePinned", {
    title:       "📌 Message Pinned",
    description: `A message was pinned in <#${channel.id}>`,
    color:       0xf1c40f,
    fields: [
      { name: "Channel",  value: `<#${channel.id}>`, inline: true },
      { name: "Pinned By", value: executor,          inline: true },
    ],
    vars: {
      channel:   `<#${channel.id}>`,
      channelId: channel.id,
      moderator: executor,
    },
  });
}

// Thread member events
export async function onThreadMembersUpdate(
  client: Client,
  addedMembers: Collection<Snowflake, ThreadMember>,
  removedMembers: Collection<Snowflake, ThreadMember>,
  thread: ThreadChannel
): Promise<void> {
  const guildId = thread.guild.id;

  for (const [, member] of addedMembers) {
    if (!shouldLogBotActions(guildId) && member.user?.bot) continue;
    await sendServerLog(client, guildId, "threadMemberAdd", {
      title:       "Thread Member Joined",
      description: `<@${member.id}> joined thread <#${thread.id}>`,
      color:       0x2ecc71,
      fields: [
        { name: "Thread", value: `<#${thread.id}>`,     inline: true },
        { name: "User",   value: `<@${member.id}>`,     inline: true },
      ],
      vars: {
        userMention: `<@${member.id}>`,
        userId:      member.id,
        channel:     `<#${thread.id}>`,
        channelId:   thread.id,
      },
    });
  }

  for (const [, member] of removedMembers) {
    if (!shouldLogBotActions(guildId) && member.user?.bot) continue;
    await sendServerLog(client, guildId, "threadMemberRemove", {
      title:       "Thread Member Left",
      description: `<@${member.id}> left thread <#${thread.id}>`,
      color:       0xe74c3c,
      fields: [
        { name: "Thread", value: `<#${thread.id}>`, inline: true },
        { name: "User",   value: `<@${member.id}>`, inline: true },
      ],
      vars: {
        userMention: `<@${member.id}>`,
        userId:      member.id,
        channel:     `<#${thread.id}>`,
        channelId:   thread.id,
      },
    });
  }
}

// Sticker update
export async function onStickerUpdate(client: Client, before: Sticker, after: Sticker): Promise<void> {
  if (!after.guildId) return;
  if (before.name === after.name) return;
  await sendServerLog(client, after.guildId, "stickerUpdate", {
    title:       "Sticker Renamed",
    description: `Sticker renamed: **${before.name}** → **${after.name}**`,
    color:       0xf39c12,
    vars: {
      oldValue: before.name,
      newValue: after.name,
    },
  });
}

// Stage instance events
export async function onStageInstanceCreate(client: Client, stage: StageInstance): Promise<void> {
  const guildId = stage.guildId;
  await sendServerLog(client, guildId, "stageCreate", {
    title:       "🎤 Stage Started",
    description: `Stage **${stage.topic}** started in <#${stage.channelId}>`,
    color:       0x5865f2,
    fields: [
      { name: "Topic",   value: stage.topic,               inline: true },
      { name: "Channel", value: `<#${stage.channelId}>`,  inline: true },
    ],
    vars: {
      newValue:  stage.topic,
      channel:   `<#${stage.channelId}>`,
      channelId: stage.channelId,
    },
  });
}

export async function onStageInstanceDelete(client: Client, stage: StageInstance): Promise<void> {
  const guildId = stage.guildId;
  await sendServerLog(client, guildId, "stageDelete", {
    title:       "🎤 Stage Ended",
    description: `Stage **${stage.topic}** ended in <#${stage.channelId}>`,
    color:       0x95a5a6,
    fields: [
      { name: "Topic",   value: stage.topic,              inline: true },
      { name: "Channel", value: `<#${stage.channelId}>`, inline: true },
    ],
    vars: {
      oldValue:  stage.topic,
      channel:   `<#${stage.channelId}>`,
      channelId: stage.channelId,
    },
  });
}

export async function onStageInstanceUpdate(
  client: Client,
  before: StageInstance,
  after: StageInstance
): Promise<void> {
  if (before.topic === after.topic) return;
  await sendServerLog(client, after.guildId, "stageUpdate", {
    title:       "🎤 Stage Topic Updated",
    description: `Stage topic changed in <#${after.channelId}>`,
    color:       0xf39c12,
    fields: [
      { name: "Before", value: before.topic ?? "(none)", inline: true },
      { name: "After",  value: after.topic  ?? "(none)", inline: true },
    ],
    vars: {
      oldValue:  before.topic ?? "(none)",
      newValue:  after.topic  ?? "(none)",
      channel:   `<#${after.channelId}>`,
      channelId: after.channelId,
    },
  });
}

// Scheduled event handlers
export async function onScheduledEventCreate(
  client: Client,
  event: GuildScheduledEvent
): Promise<void> {
  const guildId = event.guildId;
  const start   = event.scheduledStartTimestamp ? fmtTs(event.scheduledStartTimestamp) : "TBD";
  const channel = event.channelId ? `<#${event.channelId}>` : (event.entityMetadata?.location ?? "External");
  await sendServerLog(client, guildId, "scheduledEventCreate", {
    title:       "📅 Scheduled Event Created",
    description: `**${event.name}** was scheduled`,
    color:       0x2ecc71,
    fields: [
      { name: "Name",       value: event.name,                                   inline: true },
      { name: "Location",   value: channel,                                      inline: true },
      { name: "Starts",     value: start,                                        inline: true },
      { name: "Created By", value: event.creatorId ? `<@${event.creatorId}>` : "Unknown", inline: true },
      ...(event.description ? [{ name: "Description", value: truncate(event.description, 200) }] : []),
    ],
    vars: {
      newValue:  event.name,
      channel,
      moderator: event.creatorId ? `<@${event.creatorId}>` : "Unknown",
      duration:  start,
    },
  });
}

export async function onScheduledEventDelete(
  client: Client,
  event: GuildScheduledEvent
): Promise<void> {
  await sendServerLog(client, event.guildId, "scheduledEventDelete", {
    title:       "📅 Scheduled Event Cancelled",
    description: `**${event.name}** was cancelled`,
    color:       0xe74c3c,
    fields: [
      { name: "Name", value: event.name, inline: true },
    ],
    vars: {
      oldValue: event.name,
    },
  });
}

export async function onScheduledEventUpdate(
  client: Client,
  before: GuildScheduledEvent | null,
  after: GuildScheduledEvent
): Promise<void> {
  if (!before) return;
  const changes: string[] = [];
  if (before.name        !== after.name)        changes.push(`Name: \`${before.name}\` → \`${after.name}\``);
  if (before.description !== after.description) changes.push(`Description updated`);
  if (before.channelId   !== after.channelId)   changes.push(`Location changed`);
  if (before.scheduledStartTimestamp !== after.scheduledStartTimestamp)
    changes.push(`Start time: ${after.scheduledStartTimestamp ? fmtTs(after.scheduledStartTimestamp) : "TBD"}`);
  if (before.status !== after.status)
    changes.push(`Status: \`${before.status}\` → \`${after.status}\``);
  if (!changes.length) return;

  await sendServerLog(client, after.guildId, "scheduledEventUpdate", {
    title:       "📅 Scheduled Event Updated",
    description: `**${after.name}** was updated`,
    color:       0xf39c12,
    fields: changes.map((c) => ({ name: "\u200b", value: c })),
    vars: {
      oldValue: before.name,
      newValue: changes.join("\n"),
    },
  });
}

// Auto-moderation action
export async function onAutoModerationAction(
  client: Client,
  execution: {
    guild: Guild;
    action: { type: number; metadata?: Record<string, unknown> };
    ruleTriggerType: number;
    userId: string;
    channelId?: string | null;
    content?: string;
    matchedKeyword?: string | null;
    matchedContent?: string | null;
  }
): Promise<void> {
  const guildId = execution.guild.id;
  if (isUserIgnored(guildId, execution.userId)) return;

  const actionTypeMap: Record<number, string> = {
    1: "Block Message",
    2: "Send Alert",
    3: "Timeout Member",
  };
  const triggerTypeMap: Record<number, string> = {
    1: "Keyword",
    2: "Harmful Link",
    3: "Spam",
    4: "Keyword Preset",
    5: "Mention Spam",
  };

  const actionLabel  = actionTypeMap[execution.action.type]  ?? `Type ${execution.action.type}`;
  const triggerLabel = triggerTypeMap[execution.ruleTriggerType] ?? `Type ${execution.ruleTriggerType}`;
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "User",    value: `<@${execution.userId}> (${execution.userId})`, inline: true },
    { name: "Action",  value: actionLabel,  inline: true },
    { name: "Trigger", value: triggerLabel, inline: true },
  ];
  if (execution.channelId) fields.push({ name: "Channel", value: `<#${execution.channelId}>`, inline: true });
  if (execution.matchedKeyword) fields.push({ name: "Matched", value: `\`${execution.matchedKeyword}\``, inline: true });
  if (execution.content)       fields.push({ name: "Content", value: truncate(execution.content, 512) });

  await sendServerLog(client, guildId, "automodAction", {
    title:       "🛡️ AutoMod Action Triggered",
    description: `Discord AutoMod took action on <@${execution.userId}>`,
    color:       0xe74c3c,
    fields,
    vars: {
      userMention: `<@${execution.userId}>`,
      userId:      execution.userId,
      newValue:    actionLabel,
      oldValue:    triggerLabel,
      channel:     execution.channelId ? `<#${execution.channelId}>` : "Unknown",
      channelId:   execution.channelId ?? "",
    },
  });
}

// Register all handlers on the client
export function registerServerLogEvents(client: Client): void {
  const wrap = (name: string, fn: () => Promise<void>) =>
    fn().catch((err) => logger.warn({ err }, `ServerLog event error: ${name}`));

  // Messages
  client.on("messageDelete",       (m)          => wrap("messageDelete",       () => onMessageDelete(client, m)));
  client.on("messageUpdate",       (b, a)       => wrap("messageUpdate",       () => onMessageUpdate(client, b, a)));
  client.on("messageDeleteBulk",   (msgs, ch)   => wrap("messageDeleteBulk",   () => onMessageDeleteBulk(client, msgs as any, ch)));
  client.on("channelPinsUpdate",   (ch, time)   => wrap("channelPinsUpdate",   () => onChannelPinsUpdate(client, ch as any, time)));

  // Members
  client.on("guildMemberAdd",      (m)          => wrap("guildMemberAdd",      () => onGuildMemberAdd(client, m)));
  client.on("guildMemberRemove",   (m)          => wrap("guildMemberRemove",   () => onGuildMemberRemove(client, m)));
  client.on("guildBanAdd",         (ban)        => wrap("guildBanAdd",         () => onGuildBanAdd(client, ban)));
  client.on("guildBanRemove",      (ban)        => wrap("guildBanRemove",      () => onGuildBanRemove(client, ban)));
  client.on("guildMemberUpdate",   (b, a)       => wrap("guildMemberUpdate",   () => onGuildMemberUpdate(client, b, a)));
  client.on("userUpdate",          (b, a)       => wrap("userUpdate",          () => onUserUpdate(client, b, a)));

  // Roles
  client.on("roleCreate",          (r)          => wrap("roleCreate",          () => onRoleCreate(client, r)));
  client.on("roleDelete",          (r)          => wrap("roleDelete",          () => onRoleDelete(client, r)));
  client.on("roleUpdate",          (b, a)       => wrap("roleUpdate",          () => onRoleUpdate(client, b, a)));

  // Channels
  client.on("channelCreate",       (c)          => wrap("channelCreate",       () => onChannelCreate(client, c)));
  client.on("channelDelete",       (c)          => wrap("channelDelete",       () => onChannelDelete(client, c)));
  client.on("channelUpdate",       (b, a)       => wrap("channelUpdate",       () => onChannelUpdate(client, b, a)));

  // Threads
  client.on("threadCreate",        (t, n)       => wrap("threadCreate",        () => onThreadCreate(client, t, n)));
  client.on("threadDelete",        (t)          => wrap("threadDelete",        () => onThreadDelete(client, t)));
  client.on("threadUpdate",        (b, a)       => wrap("threadUpdate",        () => onThreadUpdate(client, b, a)));
  // ReadonlyCollection cast — threadMembersUpdate provides ReadonlyCollection in discord.js v14
  client.on("threadMembersUpdate", (added, removed, thread) => wrap("threadMembersUpdate", () => onThreadMembersUpdate(client, added as any, removed as any, thread)));

  // Server
  client.on("guildUpdate",         (b, a)       => wrap("guildUpdate",         () => onGuildUpdate(client, b, a)));

  // Voice & Stage
  client.on("voiceStateUpdate",    (b, a)       => wrap("voiceStateUpdate",    () => onVoiceStateUpdate(client, b, a)));
  client.on("stageInstanceCreate", (s)          => wrap("stageInstanceCreate", () => onStageInstanceCreate(client, s)));
  client.on("stageInstanceDelete", (s)          => wrap("stageInstanceDelete", () => onStageInstanceDelete(client, s)));
  // stageInstanceUpdate: before may be null
  client.on("stageInstanceUpdate", (b, a)       => wrap("stageInstanceUpdate", () => b ? onStageInstanceUpdate(client, b, a) : Promise.resolve()));

  // Invites
  client.on("inviteCreate",        (inv)        => wrap("inviteCreate",        () => onInviteCreate(client, inv)));
  client.on("inviteDelete",        (inv)        => wrap("inviteDelete",        () => onInviteDelete(client, inv)));

  // Emoji & Stickers
  client.on("emojiCreate",         (e)          => wrap("emojiCreate",         () => onEmojiCreate(client, e)));
  client.on("emojiDelete",         (e)          => wrap("emojiDelete",         () => onEmojiDelete(client, e)));
  client.on("emojiUpdate",         (b, a)       => wrap("emojiUpdate",         () => onEmojiUpdate(client, b, a)));
  client.on("stickerCreate",       (s)          => wrap("stickerCreate",       () => onStickerCreate(client, s)));
  client.on("stickerDelete",       (s)          => wrap("stickerDelete",       () => onStickerDelete(client, s)));
  client.on("stickerUpdate",       (b, a)       => wrap("stickerUpdate",       () => onStickerUpdate(client, b, a)));

  // Webhooks & Integrations & AutoMod
  client.on("webhooksUpdate",          (ch)     => wrap("webhooksUpdate",          () => onWebhooksUpdate(client, ch as TextChannel)));
  client.on("guildIntegrationsUpdate", (g)      => wrap("guildIntegrationsUpdate", () => onGuildIntegrationsUpdate(client, g)));
  client.on("autoModerationActionExecution", (exec) => wrap("autoModerationActionExecution", () => onAutoModerationAction(client, exec as any)));

  // Scheduled events — may arrive as PartialGuildScheduledEvent; skip partials for create/delete
  client.on("guildScheduledEventCreate", (e)    => wrap("guildScheduledEventCreate", () => e.partial ? Promise.resolve() : onScheduledEventCreate(client, e as GuildScheduledEvent)));
  client.on("guildScheduledEventDelete", (e)    => wrap("guildScheduledEventDelete", () => e.partial ? Promise.resolve() : onScheduledEventDelete(client, e as GuildScheduledEvent)));
  client.on("guildScheduledEventUpdate", (b, a) => wrap("guildScheduledEventUpdate", () => onScheduledEventUpdate(client, b as GuildScheduledEvent | null, a as GuildScheduledEvent)));

  logger.info("Server log event listeners registered");
}

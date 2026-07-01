import {
  Client,
  EmbedBuilder,
  Message,
  TextChannel,
  Guild,
  Role,
  ChannelType,
  MessageCreateOptions,
} from "discord.js";
import type { Command } from "../types";
import type { YamlMessage, GuildConfig } from "../../store/guildConfig";
import { resolveTarget } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getCasesForUser, getAllCases } from "../../lib/cases";
import { getGuildConfig } from "../../store/guildConfig";
import { sendYamlMessage, buildVars } from "../../lib/yamlFormatter";

// Helpers
function ts(date: Date | number | null | undefined): string {
  if (!date) return "Unknown";
  const d = typeof date === "number" ? new Date(date) : date;
  const unix = Math.floor(d.getTime() / 1000);
  return `<t:${unix}:F> (<t:${unix}:R>)`;
}

function tsShort(date: Date | number | null | undefined): string {
  if (!date) return "Unknown";
  const d = typeof date === "number" ? new Date(date) : date;
  const unix = Math.floor(d.getTime() / 1000);
  return `<t:${unix}:f>`;
}

function uptimeStr(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length || s) parts.push(`${s}s`);
  return parts.join(" ");
}

function resolveRole(guild: Guild, input: string): Role | null {
  const id = input.replace(/[<@&>]/g, "");
  return (
    guild.roles.cache.get(id) ??
    guild.roles.cache.find((r) => r.name.toLowerCase() === input.toLowerCase()) ??
    null
  );
}

/** Get utility plugin messages config. */
function utilMsgs(cfg: GuildConfig): Record<string, YamlMessage> {
  return ((cfg.plugins?.utility as any)?.messages ?? {}) as Record<string, YamlMessage>;
}

/**
 * Send a utility message. If the guild has a YAML template for the given key,
 * use it with variable substitution. Otherwise send the fallback payload.
 */
async function utilSend(
  message: Message,
  cfg: GuildConfig,
  key: string,
  vars: Record<string, string | undefined>,
  fallback: MessageCreateOptions,
): Promise<void> {
  const msgs = utilMsgs(cfg);
  const template = msgs[key];
  if (template) {
    await sendYamlMessage(message.channel as TextChannel, template, buildVars(vars));
  } else {
    await message.channel.send(fallback);
  }
}

// ping
export const pingCmd: Command = {
  name: "ping",
  aliases: [],
  usage: "",
  description: "Check the bot's WebSocket and API latency.",
  async execute(message: Message, _args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "ping"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const msgs = utilMsgs(cfg);

    const wsPing = client.ws.ping;
    const start = Date.now();
    const sent = await message.channel.send("🏓 Pinging…");
    const apiPing = Date.now() - start;

    const vars = buildVars({
      trigger: String(wsPing),
      reason: String(apiPing),
    });

    const template = msgs["ping_result"];
    if (template) {
      await sent.edit({ content: null, embeds: [] });
      await sendYamlMessage(message.channel as TextChannel, template, vars);
      await sent.delete().catch(() => {});
    } else {
      await sent.edit(`🏓 Pong! | Websocket: **${wsPing}ms** | API: **${apiPing}ms**`);
    }
  },
};

// userinfo
export const userinfoCmd: Command = {
  name: "userinfo",
  aliases: ["whois", "ui"],
  usage: "[@user]",
  description: "Show detailed information about a user.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "userinfo"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const target = args.length
      ? await resolveTarget(message, args)
      : { user: message.author, member: message.member };

    if (!target) {
      const v = buildVars({ trigger: args.join(" ") });
      const t = utilMsgs(cfg)["userinfo_not_found"];
      if (t) return void sendYamlMessage(message.channel as TextChannel, t, v);
      return void message.reply("❌ Could not find that user.");
    }

    const { user, member } = target;
    const createdAt = Math.floor(user.createdTimestamp / 1000);
    const joinedAt = member?.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
    const topRole = member?.roles.cache
      .filter((r) => r.id !== message.guild!.id)
      .sort((a, b) => b.position - a.position)
      .first();
    const roleCount = member ? member.roles.cache.size - 1 : 0;
    const roleList = member?.roles.cache
      .filter((r) => r.id !== message.guild!.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => `<@&${r.id}>`)
      .slice(0, 15)
      .join(", ") || "None";

    const vars: Record<string, string | undefined> = {
      user: user.username,
      "user.mention": `<@${user.id}>`,
      "user.id": user.id,
      "user.avatar": user.displayAvatarURL({ size: 256 }),
      "user.created_at": `<t:${createdAt}:R>`,
      "user.joined_at": joinedAt ? `<t:${joinedAt}:R>` : "Not in server",
      trigger: user.bot ? "Yes" : "No",
      reason: topRole?.name ?? "None",
      count: String(roleCount),
      mod: message.author.username,
    };

    await utilSend(message, cfg, "userinfo_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(member?.displayHexColor !== "#000000" ? (member?.displayHexColor ?? 0x5865f2) : 0x5865f2)
          .setTitle(`👤 ${user.username}`)
          .setThumbnail(user.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: "User ID", value: user.id, inline: true },
            { name: "Account Created", value: `<t:${createdAt}:R>`, inline: true },
            ...(joinedAt ? [{ name: "Joined Server", value: `<t:${joinedAt}:R>`, inline: true }] : []),
            { name: "Bot", value: user.bot ? "Yes" : "No", inline: true },
            { name: "Top Role", value: topRole?.toString() ?? "None", inline: true },
            ...(member ? [{ name: `Roles (${roleCount})`, value: roleList }] : []),
          )
          .setFooter({ text: `Requested by ${message.author.username}` })
          .setTimestamp(),
      ],
    });
  },
};

// avatar
export const avatarCmd: Command = {
  name: "avatar",
  aliases: ["av", "pfp"],
  usage: "[@user]",
  description: "Show a user's avatar.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "avatar"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const target = args.length ? await resolveTarget(message, args) : { user: message.author, member: message.member };
    if (!target) return void message.reply("❌ Could not find that user.");

    const url = target.user.displayAvatarURL({ size: 1024, extension: "png" });
    const vars: Record<string, string | undefined> = {
      user: target.user.username,
      "user.mention": `<@${target.user.id}>`,
      "user.id": target.user.id,
      trigger: url,
      mod: message.author.username,
    };

    await utilSend(message, cfg, "avatar_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🖼️ ${target.user.username}'s Avatar`)
          .setImage(url)
          .setURL(url),
      ],
    });
  },
};

// banner
export const bannerCmd: Command = {
  name: "banner",
  aliases: [],
  usage: "[@user]",
  description: "Show a user's profile banner.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "banner"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const target = args.length ? await resolveTarget(message, args) : null;
    const userId = target ? target.user.id : message.author.id;
    const fetched = await message.client.users.fetch(userId, { force: true }).catch(() => null);
    if (!fetched) return void message.reply("❌ Could not fetch that user.");

    const bannerUrl = fetched.bannerURL({ size: 1024, extension: "png" });
    const vars: Record<string, string | undefined> = {
      user: fetched.username,
      "user.mention": `<@${fetched.id}>`,
      "user.id": fetched.id,
      trigger: bannerUrl ?? "",
      mod: message.author.username,
    };

    if (!bannerUrl) {
      const noneVars = { ...vars };
      const t = utilMsgs(cfg)["banner_none"];
      if (t) return void sendYamlMessage(message.channel as TextChannel, t, buildVars(noneVars));
      return void message.reply(`❌ **${fetched.username}** does not have a banner.`);
    }

    await utilSend(message, cfg, "banner_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🎨 ${fetched.username}'s Banner`)
          .setImage(bannerUrl)
          .setURL(bannerUrl),
      ],
    });
  },
};

// roles
export const rolesCmd: Command = {
  name: "roles",
  aliases: [],
  usage: "[@user]",
  description: "List all roles a user has, or all server roles if no user given.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "roles"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);

    if (args.length > 0) {
      const target = await resolveTarget(message, args);
      if (!target) return void message.reply("❌ Could not find that user.");
      if (!target.member) return void message.reply("❌ That user is not in this server.");

      const memberRoles = [...target.member.roles.cache.values()]
        .filter((r) => r.id !== message.guild!.id)
        .sort((a, b) => b.position - a.position);

      if (memberRoles.length === 0) {
        const t = utilMsgs(cfg)["roles_none"];
        if (t) return void sendYamlMessage(message.channel as TextChannel, t, buildVars({ user: target.user.username }));
        return void message.reply(`**${target.user.username}** has no roles.`);
      }

      const roleList = memberRoles.map((r) => `<@&${r.id}>`).join(" ");
      const topRole = memberRoles[0];
      const vars: Record<string, string | undefined> = {
        user: target.user.username,
        "user.mention": `<@${target.user.id}>`,
        "user.id": target.user.id,
        "user.avatar": target.user.displayAvatarURL({ size: 64 }),
        trigger: roleList,
        count: String(memberRoles.length),
        reason: topRole?.name ?? "None",
        mod: message.author.username,
      };

      await utilSend(message, cfg, "roles_result", vars, {
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🎭 Roles for ${target.user.username} (${memberRoles.length})`)
            .setDescription(roleList.slice(0, 4096) || "No roles.")
            .setTimestamp(),
        ],
      });
    } else {
      const allRoles = [...message.guild.roles.cache.values()]
        .filter((r) => r.id !== message.guild!.id)
        .sort((a, b) => b.position - a.position);
      const lines = allRoles.map((r) => `<@&${r.id}> — ${r.members.size} member${r.members.size !== 1 ? "s" : ""}`);
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🎭 Server Roles (${allRoles.length})`)
            .setDescription(lines.join("\n").slice(0, 4096) || "No roles."),
        ],
      });
    }
  },
};

// joined
export const joinedCmd: Command = {
  name: "joined",
  aliases: [],
  usage: "[@user]",
  description: "Show when a user joined the server.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "joined"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const target = args.length ? await resolveTarget(message, args) : { user: message.author, member: message.member };
    if (!target?.member) return void message.reply("❌ That user is not in this server.");

    const joinedDate = target.member.joinedAt;
    const joinedUnix = joinedDate ? Math.floor(joinedDate.getTime() / 1000) : null;

    // Calculate join position
    await message.guild.members.fetch().catch(() => {});
    const sorted = [...message.guild.members.cache.values()]
      .filter((m) => m.joinedTimestamp != null)
      .sort((a, b) => (a.joinedTimestamp ?? 0) - (b.joinedTimestamp ?? 0));
    const pos = sorted.findIndex((m) => m.id === target.member!.id) + 1;

    const vars: Record<string, string | undefined> = {
      user: target.user.username,
      "user.mention": `<@${target.user.id}>`,
      "user.id": target.user.id,
      "user.avatar": target.user.displayAvatarURL({ size: 64 }),
      server: message.guild.name,
      trigger: joinedUnix ? `<t:${joinedUnix}:F>` : "Unknown",
      reason: joinedUnix ? `<t:${joinedUnix}:R>` : "Unknown",
      count: pos > 0 ? String(pos) : "?",
      mod: message.author.username,
    };

    await utilSend(message, cfg, "joined_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📅 Join Date — ${target.user.username}`)
          .setThumbnail(target.user.displayAvatarURL({ size: 64 }))
          .addFields(
            { name: "Joined", value: joinedDate ? ts(joinedDate) : "Unknown", inline: true },
            { name: "Join Position", value: pos > 0 ? `#${pos}` : "?", inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
};

// firstmsg
export const firstmsgCmd: Command = {
  name: "firstmsg",
  aliases: [],
  usage: "[@user] [#channel]",
  description: "Find a user's first message in a channel.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "firstmsg"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);

    // Resolve optional user and channel from args/mentions
    const mentionedChannel = message.mentions.channels.first() as TextChannel | undefined;
    const mentionedUser = message.mentions.users.first();
    const targetUser = mentionedUser ?? message.author;
    const ch = mentionedChannel ?? (message.channel as TextChannel);

    // Fetch oldest messages until we find one from this user
    const msgs = await ch.messages.fetch({ limit: 1, after: "0" }).catch(() => null);
    const first = msgs?.first();

    if (!first) {
      const t = utilMsgs(cfg)["firstmsg_none"];
      const v = buildVars({ user: targetUser.username, channel: `<#${ch.id}>` });
      if (t) return void sendYamlMessage(message.channel as TextChannel, t, v);
      return void message.reply(`❌ No messages found in <#${ch.id}>.`);
    }

    const sentUnix = Math.floor(first.createdTimestamp / 1000);
    const vars: Record<string, string | undefined> = {
      user: targetUser.username,
      "user.mention": `<@${targetUser.id}>`,
      "user.id": targetUser.id,
      channel: `<#${ch.id}>`,
      "channel.id": ch.id,
      trigger: first.url,
      reason: first.content.slice(0, 100) || "(no text content)",
      count: `<t:${sentUnix}:F>`,
      mod: message.author.username,
    };

    await utilSend(message, cfg, "firstmsg_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📜 First Message in #${ch.name}`)
          .setDescription(first.content.slice(0, 400) || "*(no text content)*")
          .addFields(
            { name: "Sent", value: `<t:${sentUnix}:F>`, inline: true },
            { name: "Author", value: `<@${first.author.id}>`, inline: true },
            { name: "Jump Link", value: `[Click here](${first.url})`, inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
};

// casesearch
export const casesearchCmd: Command = {
  name: "casesearch",
  aliases: [],
  usage: "<keyword>",
  description: "Search all mod cases by keyword, user tag, or user ID.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "casesearch"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const query = args.join(" ").toLowerCase();
    if (!query) return void message.reply("❌ Please provide a search keyword.");

    const all = await getAllCases(message.guild.id);
    const matches = all.filter(
      (c) =>
        c.reason.toLowerCase().includes(query) ||
        c.userTag.toLowerCase().includes(query) ||
        c.userId.includes(query)
    );

    if (matches.length === 0) {
      const t = utilMsgs(cfg)["casesearch_none"];
      if (t) return void sendYamlMessage(message.channel as TextChannel, t, buildVars({ trigger: query }));
      return void message.reply(`❌ No cases matching **${query}**.`);
    }

    const lines = matches.slice(0, 20).map(
      (c) => `**#${c.id}** — ${c.action} · ${c.userTag} · ${c.reason.slice(0, 60)}`
    );

    const vars: Record<string, string | undefined> = {
      trigger: query,
      count: String(matches.length),
      reason: lines.join("\n"),
      mod: message.author.username,
    };

    await utilSend(message, cfg, "casesearch_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🔍 Case Search: "${query}" (${matches.length})`)
          .setDescription(lines.join("\n").slice(0, 4096)),
      ],
    });
  },
};

// warncount
export const warncountCmd: Command = {
  name: "warncount",
  aliases: [],
  usage: "[@user]",
  description: "Show how many warnings a user has.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "warncount"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const target = args.length
      ? await resolveTarget(message, args)
      : { user: message.author, member: message.member };
    if (!target) return void message.reply("❌ Could not find that user.");

    const cases = await getCasesForUser(message.guild.id, target.user.id);
    const warns = cases.filter((c) => c.action === "Warn");

    const vars: Record<string, string | undefined> = {
      user: target.user.username,
      "user.mention": `<@${target.user.id}>`,
      "user.id": target.user.id,
      "user.avatar": target.user.displayAvatarURL({ size: 64 }),
      count: String(warns.length),
      mod: message.author.username,
    };

    if (warns.length === 0) {
      const t = utilMsgs(cfg)["warncount_zero"];
      if (t) return void sendYamlMessage(message.channel as TextChannel, t, buildVars(vars));
      return void message.reply(`✅ **${target.user.username}** has no warnings.`);
    }

    await utilSend(message, cfg, "warncount_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle("⚠️ Warning Count")
          .setThumbnail(target.user.displayAvatarURL({ size: 64 }))
          .addFields(
            { name: "User", value: `<@${target.user.id}>`, inline: true },
            { name: "Warnings", value: String(warns.length), inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
};

// modstats
export const modstatsCmd: Command = {
  name: "modstats",
  aliases: [],
  usage: "[@mod]",
  description: "Show moderation statistics for a moderator.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "modstats"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const target = args.length ? await resolveTarget(message, args) : { user: message.author };
    if (!target) return void message.reply("❌ Could not find that user.");

    const all = await getAllCases(message.guild.id);
    const modCases = all.filter((c) => c.modId === target.user.id);

    if (modCases.length === 0) {
      const t = utilMsgs(cfg)["modstats_none"];
      if (t) return void sendYamlMessage(message.channel as TextChannel, t, buildVars({ mod: target.user.username }));
      return void message.reply(`**${target.user.username}** has not issued any cases.`);
    }

    const counts: Record<string, number> = {};
    for (const c of modCases) {
      const key = c.action.split(" ")[0]!;
      counts[key] = (counts[key] ?? 0) + 1;
    }

    const bans = counts["Ban"] ?? 0;
    const kicks = counts["Kick"] ?? 0;
    const mutes = counts["Mute"] ?? 0;
    const warns = counts["Warn"] ?? 0;

    const vars: Record<string, string | undefined> = {
      mod: target.user.username,
      "user.avatar": target.user.displayAvatarURL({ size: 64 }),
      trigger: String(bans),
      reason: String(kicks),
      count: String(mutes),
      expires_at: String(warns),
      success_count: String(modCases.length),
    };

    const lines = Object.entries(counts).map(([k, v]) => `• **${k}:** ${v}`);
    await utilSend(message, cfg, "modstats_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📊 Mod Stats — ${target.user.username}`)
          .setThumbnail(target.user.displayAvatarURL({ size: 64 }))
          .setDescription(`${lines.join("\n")}\n\n**Total actions:** ${modCases.length}`),
      ],
    });
  },
};

// serverinfo
export const serverinfoCmd: Command = {
  name: "serverinfo",
  aliases: ["si", "guildinfo"],
  usage: "",
  description: "Show detailed information about the server.",
  async execute(message: Message, _args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "serverinfo"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const g = message.guild;
    await g.fetch();

    const channels = g.channels.cache;
    const textCount = channels.filter((c) => c.type === ChannelType.GuildText).size;
    const voiceCount = channels.filter((c) => c.type === ChannelType.GuildVoice).size;
    await g.members.fetch().catch(() => {});
    const humans = g.members.cache.filter((m) => !m.user.bot).size;
    const bots = g.members.cache.filter((m) => m.user.bot).size;

    const vars: Record<string, string | undefined> = {
      server: g.name,
      "server.id": g.id,
      "server.icon": g.iconURL({ size: 256 }) ?? "",
      "server.owner": g.ownerId,
      "server.member_count": String(g.memberCount),
      trigger: tsShort(g.createdAt),
      reason: `Owner: <@${g.ownerId}>, Roles: ${g.roles.cache.size}`,
      count: String(humans),
      new_reason: String(bots),
      expires_at: String(textCount),
      success_count: String(voiceCount),
      fail_count: String(g.roles.cache.size),
      new_duration: String(g.premiumTier),
      ordinal: String(g.premiumSubscriptionCount ?? 0),
      reminder_message: g.verificationLevel.toString(),
      mod: message.author.username,
    };

    await utilSend(message, cfg, "serverinfo_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🏠 ${g.name}`)
          .setThumbnail(g.iconURL({ size: 256 }) ?? null)
          .setImage(g.bannerURL({ size: 1024 }) ?? null)
          .addFields(
            { name: "Server ID", value: g.id, inline: true },
            { name: "Owner", value: `<@${g.ownerId}>`, inline: true },
            { name: "Created", value: ts(g.createdAt), inline: true },
            { name: "Members", value: `${g.memberCount}`, inline: true },
            { name: "Humans", value: String(humans), inline: true },
            { name: "Bots", value: String(bots), inline: true },
            { name: "Text Channels", value: String(textCount), inline: true },
            { name: "Voice Channels", value: String(voiceCount), inline: true },
            { name: "Roles", value: `${g.roles.cache.size}`, inline: true },
            { name: "Boost Level", value: `Level ${g.premiumTier}`, inline: true },
            { name: "Boosts", value: `${g.premiumSubscriptionCount ?? 0}`, inline: true },
            { name: "Verification", value: g.verificationLevel.toString(), inline: true },
          )
          .setFooter({ text: `ID: ${g.id}` })
          .setTimestamp(),
      ],
    });
  },
};

// channelinfo
export const channelinfoCmd: Command = {
  name: "channelinfo",
  aliases: ["ci"],
  usage: "[#channel]",
  description: "Show information about a channel.",
  async execute(message: Message, _args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "channelinfo"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const ch = (message.mentions.channels.first() as TextChannel | undefined) ?? (message.channel as TextChannel);
    const slowmode = (ch as TextChannel).rateLimitPerUser ?? 0;
    const nsfw = (ch as TextChannel).nsfw ?? false;
    const topic = (ch as TextChannel).topic ?? "None";
    const category = (ch as TextChannel).parent?.name ?? "None";
    const typeStr = ChannelType[ch.type] ?? "Unknown";

    const vars: Record<string, string | undefined> = {
      channel: ch.name,
      "channel.id": ch.id,
      trigger: typeStr,
      reason: tsShort(ch.createdAt),
      count: topic.slice(0, 100),
      expires_at: slowmode > 0 ? String(slowmode) : "0",
      new_reason: nsfw ? "Yes" : "No",
      success_count: category,
      mod: message.author.username,
    };

    await utilSend(message, cfg, "channelinfo_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📋 Channel Info — #${ch.name}`)
          .addFields(
            { name: "ID", value: ch.id, inline: true },
            { name: "Type", value: typeStr, inline: true },
            { name: "Created", value: ts(ch.createdAt), inline: true },
            { name: "Category", value: category, inline: true },
            { name: "Slowmode", value: slowmode > 0 ? `${slowmode}s` : "Off", inline: true },
            { name: "NSFW", value: nsfw ? "Yes" : "No", inline: true },
            { name: "Topic", value: topic.slice(0, 200), inline: false },
          )
          .setTimestamp(),
      ],
    });
  },
};

// roleinfo
export const roleinfoCmd: Command = {
  name: "roleinfo",
  aliases: ["ri"],
  usage: "<@role>",
  description: "Show information about a role.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "roleinfo"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const input = args.join(" ");
    if (!input) return void message.reply("❌ Please mention or name a role.");

    const role = message.mentions.roles.first() ?? resolveRole(message.guild, input);
    if (!role) {
      const t = utilMsgs(cfg)["roleinfo_not_found"];
      if (t) return void sendYamlMessage(message.channel as TextChannel, t, buildVars({ trigger: input }));
      return void message.reply("❌ Could not find that role.");
    }

    const vars: Record<string, string | undefined> = {
      trigger: role.name,
      reason: role.id,
      count: String(role.members.size),
      expires_at: role.hexColor,
      new_reason: role.mentionable ? "Yes" : "No",
      success_count: role.hoist ? "Yes" : "No",
      fail_count: role.managed ? "Yes (integration)" : "No",
      new_duration: tsShort(role.createdAt),
      mod: message.author.username,
    };

    await utilSend(message, cfg, "roleinfo_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(role.color || 0x5865f2)
          .setTitle(`🎭 Role Info — ${role.name}`)
          .addFields(
            { name: "ID", value: role.id, inline: true },
            { name: "Color", value: role.hexColor, inline: true },
            { name: "Members", value: `${role.members.size}`, inline: true },
            { name: "Position", value: `${role.position}`, inline: true },
            { name: "Mentionable", value: role.mentionable ? "Yes" : "No", inline: true },
            { name: "Hoisted", value: role.hoist ? "Yes" : "No", inline: true },
            { name: "Managed", value: role.managed ? "Yes (integration)" : "No", inline: true },
            { name: "Created", value: ts(role.createdAt), inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
};

// membercount
export const membercountCmd: Command = {
  name: "membercount",
  aliases: ["mc"],
  usage: "",
  description: "Show the server member count.",
  async execute(message: Message, _args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "membercount"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const g = message.guild;
    await g.members.fetch().catch(() => {});
    const total = g.memberCount;
    const bots = g.members.cache.filter((m) => m.user.bot).size;
    const humans = total - bots;

    const vars: Record<string, string | undefined> = {
      server: g.name,
      "server.id": g.id,
      "server.icon": g.iconURL({ size: 64 }) ?? "",

      "server.member_count": String(total),
      trigger: String(humans),
      reason: String(bots),
    };

    await utilSend(message, cfg, "membercount_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`👥 ${g.name} — Member Count`)
          .addFields(
            { name: "Total", value: String(total), inline: true },
            { name: "Humans", value: String(humans), inline: true },
            { name: "Bots", value: String(bots), inline: true },
          )
          .setThumbnail(g.iconURL({ size: 64 }) ?? null)
          .setTimestamp(),
      ],
    });
  },
};

// botstats
export const botstatsCmd: Command = {
  name: "botstats",
  aliases: [],
  usage: "",
  description: "Show bot statistics (uptime, guilds, memory, ping).",
  async execute(message: Message, _args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "botstats"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const upSec = process.uptime();
    const mem = process.memoryUsage();
    const memMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const ping = client.ws.ping;
    const guilds = client.guilds.cache.size;
    const users = client.users.cache.size;

    const vars: Record<string, string | undefined> = {
      trigger: uptimeStr(upSec),
      reason: String(ping),
      count: String(guilds),
      expires_at: String(users),
      new_reason: memMb,
    };

    await utilSend(message, cfg, "botstats_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🤖 Bot Stats — ${client.user?.tag ?? "NightPigeon"}`)
          .setThumbnail(client.user?.displayAvatarURL({ size: 128 }) ?? null)
          .addFields(
            { name: "⏰ Uptime", value: uptimeStr(upSec), inline: true },
            { name: "📡 Ping", value: `${ping}ms`, inline: true },
            { name: "🏠 Servers", value: String(guilds), inline: true },
            { name: "👥 Cached Users", value: String(users), inline: true },
            { name: "💾 Memory", value: `${memMb} MB`, inline: true },
            { name: "🟢 Node.js", value: process.version, inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
};

// botinfo
export const botinfoCmd: Command = {
  name: "botinfo",
  aliases: [],
  usage: "",
  description: "Show information about the bot.",
  async execute(message: Message, _args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "botinfo"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const BOT_WEBSITE = "https://nightpigeon.xyz";

    const vars: Record<string, string | undefined> = {
      trigger: "1.0.0",
      reason: "discord.js v14",
      count: String(client.guilds.cache.size),
      expires_at: BOT_WEBSITE,
    };

    await utilSend(message, cfg, "botinfo_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🤖 NightPigeon")
          .setThumbnail(client.user?.displayAvatarURL({ size: 256 }) ?? null)
          .setDescription(
            "NightPigeon is a powerful Discord moderation and utility bot.\n\n" +
            `[Website](${BOT_WEBSITE}) · [Dashboard](${BOT_WEBSITE})`
          )
          .addFields(
            { name: "Version", value: "1.0.0", inline: true },
            { name: "Library", value: "discord.js v14", inline: true },
            { name: "Servers", value: `${client.guilds.cache.size}`, inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
};

// inviteinfo
export const inviteinfoCmd: Command = {
  name: "inviteinfo",
  aliases: [],
  usage: "<invite_code>",
  description: "Show information about a Discord invite code.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "inviteinfo"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const raw = args[0];
    if (!raw) return void message.reply("❌ Please provide an invite code or URL.");
    const code = raw
      .replace(/https?:\/\/discord\.gg\//i, "")
      .replace(/https?:\/\/discord\.com\/invite\//i, "")
      .trim();

    const invite = await client.fetchInvite(code).catch(() => null);
    if (!invite) return void message.reply("❌ Could not find that invite. It may be invalid or expired.");

    const vars: Record<string, string | undefined> = {
      trigger: invite.code,
      reason: invite.guild?.name ?? "Unknown",
      count: invite.channel?.name ?? "Unknown",
      expires_at: invite.inviter?.username ?? "Unknown",
      new_reason: `${invite.uses ?? "?"}${invite.maxUses ? `/${invite.maxUses}` : ""}`,
      success_count: invite.expiresAt ? tsShort(invite.expiresAt) : "Never",
      fail_count: String(invite.memberCount ?? "?"),
    };

    await utilSend(message, cfg, "inviteinfo_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📨 Invite: ${invite.code}`)
          .addFields(
            { name: "Guild", value: invite.guild?.name ?? "Unknown", inline: true },
            { name: "Channel", value: invite.channel?.name ?? "Unknown", inline: true },
            { name: "Inviter", value: invite.inviter?.username ?? "Unknown", inline: true },
            { name: "Uses", value: `${invite.uses ?? "?"}${invite.maxUses ? `/${invite.maxUses}` : ""}`, inline: true },
            { name: "Expires", value: invite.expiresAt ? ts(invite.expiresAt) : "Never", inline: true },
            { name: "Members Online", value: `${invite.memberCount ?? "?"}`, inline: true },
          ),
      ],
    });
  },
};

// snowflake
export const snowflakeCmd: Command = {
  name: "snowflake",
  aliases: [],
  usage: "<id>",
  description: "Decode a Discord snowflake ID to show its creation date.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "snowflake"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const id = args[0]?.trim() ?? "";
    if (!id || !/^\d{15,20}$/.test(id)) return void message.reply("❌ Please provide a valid snowflake ID (15–20 digits).");

    const DISCORD_EPOCH = 1420070400000n;
    const timestamp = (BigInt(id) >> 22n) + DISCORD_EPOCH;
    const created = new Date(Number(timestamp));
    const unix = Math.floor(created.getTime() / 1000);

    const vars: Record<string, string | undefined> = {
      trigger: id,
      reason: `<t:${unix}:F>`,
      count: String(timestamp),
    };

    await utilSend(message, cfg, "snowflake_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`❄️ Snowflake — ${id}`)
          .addFields(
            { name: "Created", value: `<t:${unix}:F> (<t:${unix}:R>)`, inline: false },
            { name: "Unix Timestamp", value: String(timestamp), inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
};

// inrole
export const inroleCmd: Command = {
  name: "inrole",
  aliases: [],
  usage: "<@role>",
  description: "List all members who have a specific role.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "inrole"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const input = args.join(" ");
    if (!input) return void message.reply("❌ Please mention or name a role.");

    const role = message.mentions.roles.first() ?? resolveRole(message.guild, input);
    if (!role) return void message.reply("❌ Could not find that role.");

    await message.guild.members.fetch().catch(() => {});
    const members = role.members;

    if (members.size === 0) {
      const t = utilMsgs(cfg)["inrole_empty"];
      if (t) return void sendYamlMessage(message.channel as TextChannel, t, buildVars({ trigger: role.name, reason: role.id }));
      return void message.reply(`❌ No members have the **${role.name}** role.`);
    }

    const list = [...members.values()];
    const shown = list.slice(0, 50);
    const lines = shown.map((m) => `• <@${m.id}> (${m.user.username})`);
    const overflow = members.size > 50 ? `\n…and ${members.size - 50} more.` : "";

    const vars: Record<string, string | undefined> = {
      trigger: lines.join("\n"),
      reason: role.name,
      count: String(members.size),
    };

    await utilSend(message, cfg, "inrole_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(role.color || 0x5865f2)
          .setTitle(`🎭 Members with @${role.name} (${members.size})`)
          .setDescription((lines.join("\n") + overflow).slice(0, 4096)),
      ],
    });
  },
};

// charcount
export const charcountCmd: Command = {
  name: "charcount",
  aliases: ["cc"],
  usage: "<text>",
  description: "Count characters, words, and lines in text.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "charcount"))) return void message.reply("❌ No permission.");

    const cfg = await getGuildConfig(message.guild.id);
    const text = args.join(" ");
    if (!text) return void message.reply("❌ Please provide some text to count.");

    const chars = text.length;
    const words = text.split(/\s+/).filter(Boolean).length;
    const lines = text.split("\n").length;

    const vars: Record<string, string | undefined> = {
      trigger: String(chars),
      reason: String(words),
      count: String(lines),
    };

    await utilSend(message, cfg, "charcount_result", vars, {
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("📊 Character Count")
          .addFields(
            { name: "Characters", value: String(chars), inline: true },
            { name: "Words", value: String(words), inline: true },
            { name: "Lines", value: String(lines), inline: true },
          ),
      ],
    });
  },
};

// embed
export const embedCmd: Command = {
  name: "embed",
  aliases: [],
  usage: "<json>",
  description: "Send a custom embed by passing a JSON object.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "embed"))) return void message.reply("❌ No permission.");

    const raw = args.join(" ").trim();
    if (!raw) return void message.reply("❌ Usage: `!embed {\"title\":\"...\",\"description\":\"...\"}`");

    let data: Record<string, any>;
    try {
      data = JSON.parse(raw);
    } catch {
      return void message.reply("❌ Invalid JSON. Example: `!embed {\"title\":\"Hello\",\"description\":\"World\",\"color\":\"#5865F2\"}`");
    }

    if (typeof data !== "object" || Array.isArray(data)) {
      return void message.reply("❌ JSON must be an object, e.g. `{\"title\":\"...\",\"description\":\"...\"}`");
    }

    const embed = new EmbedBuilder().setColor(0x5865f2);
    if (typeof data.title === "string" && data.title) embed.setTitle(data.title.slice(0, 256));
    if (typeof data.description === "string" && data.description) embed.setDescription(data.description.slice(0, 4096));
    if (typeof data.color === "string") {
      const hex = parseInt(data.color.replace("#", ""), 16);
      if (!isNaN(hex)) embed.setColor(hex);
    }
    if (typeof data.thumbnail === "string") embed.setThumbnail(data.thumbnail);
    if (typeof data.image === "string") embed.setImage(data.image);
    if (typeof data.footer === "string") embed.setFooter({ text: data.footer.slice(0, 2048) });
    if (typeof data.url === "string") embed.setURL(data.url);
    if (Array.isArray(data.fields)) {
      const fields = (data.fields as any[])
        .slice(0, 25)
        .filter((f) => typeof f?.name === "string" && typeof f?.value === "string")
        .map((f) => ({ name: f.name.slice(0, 256), value: f.value.slice(0, 1024), inline: !!f.inline }));
      if (fields.length) embed.addFields(fields);
    }

    await message.delete().catch(() => {});
    await message.channel.send({ embeds: [embed] });
  },
};

/**
 * Welcome plugin commands:
 *   !welcome test          — preview the welcome message in the configured channel
 *   !goodbye test          — preview the goodbye message
 *   !welcomedm test        — preview the join DM (sent to command author)
 *   !invites [@user]       — show invite count for self or another user
 *   !inviteleaderboard     — top inviters embed
 *   !invitereset @user     — reset a user's invite count (level 100)
 *   !inviteinfo <code>     — show details about an invite code + tracking data
 */

import { Client, EmbedBuilder, Message, TextChannel } from "discord.js";
import type { Command } from "../types";
import { getCachedConfig, getGuildConfig } from "../../store/guildConfig";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import {
  getInviteCount,
  getInviteLeaderboard,
  getInviteByCode,
  resetInviteCount,
} from "../../lib/inviteTracker";
import {
  sendWelcomePreview,
  sendGoodbyePreview,
  sendJoinDmPreview,
} from "../../handlers/welcomeHandler";

// Helper: resolve a mentioned user ID
function parseUserId(raw: string): string | null {
  const mentionMatch = raw.match(/^<@!?(\d{17,20})>$/);
  if (mentionMatch) return mentionMatch[1]!;
  if (/^\d{17,20}$/.test(raw)) return raw;
  return null;
}

// !welcome
export const welcomeCmd: Command = {
  name: "welcome",
  aliases: [],
  usage: "test",
  description: "Preview the welcome message. Use `test` to send a preview to the configured channel.",

  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild || !message.member) return;
    if (!(await checkYamlLevelAsync(message, "welcome"))) {
      return void message.reply("❌ No permission.");
    }

    const sub = args[0]?.toLowerCase();
    if (sub !== "test") {
      return void message.reply(`Usage: \`${getCachedConfig(message.guild.id).prefix}welcome test\``);
    }

    const cfg = await getGuildConfig(message.guild.id);
    const wp = (cfg.plugins?.welcome as any);
    const channelId: string | null = wp?.welcome?.channel ?? null;

    if (!channelId) {
      return void message.reply(
        "❌ No welcome channel configured. Set `plugins.welcome.welcome.channel` in your config."
      );
    }

    const ok = await sendWelcomePreview(client, message.member, channelId);
    if (!ok) {
      return void message.reply("❌ Failed to send welcome preview. Check that the channel exists and the bot has permission to send messages there.");
    }

    const successMsg: string = wp?.messages?.welcome_test_sent
      ?? "✅ Welcome test message sent to <#{channel}>.";
    await message.reply(successMsg.replaceAll("{channel}", channelId));
  },
};

// !goodbye
export const goodbyeCmd: Command = {
  name: "goodbye",
  aliases: [],
  usage: "test",
  description: "Preview the goodbye message in the configured goodbye channel.",

  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild || !message.member) return;
    if (!(await checkYamlLevelAsync(message, "goodbye"))) {
      return void message.reply("❌ No permission.");
    }

    const sub = args[0]?.toLowerCase();
    if (sub !== "test") {
      return void message.reply(`Usage: \`${getCachedConfig(message.guild.id).prefix}goodbye test\``);
    }

    const cfg = await getGuildConfig(message.guild.id);
    const wp = (cfg.plugins?.welcome as any);
    const channelId: string | null = wp?.goodbye?.channel ?? null;

    if (!channelId) {
      return void message.reply(
        "❌ No goodbye channel configured. Set `plugins.welcome.goodbye.channel` in your config."
      );
    }

    const ok = await sendGoodbyePreview(client, message.member, channelId);
    if (!ok) {
      return void message.reply("❌ Failed to send goodbye preview. Check channel permissions.");
    }

    const successMsg: string = wp?.messages?.goodbye_test_sent
      ?? "✅ Goodbye test message sent to <#{channel}>.";
    await message.reply(successMsg.replaceAll("{channel}", channelId));
  },
};

// !welcomedm
export const welcomedmCmd: Command = {
  name: "welcomedm",
  aliases: [],
  usage: "test",
  description: "Preview the join DM — sends it to your own DMs.",

  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild || !message.member) return;
    if (!(await checkYamlLevelAsync(message, "welcomedm"))) {
      return void message.reply("❌ No permission.");
    }

    const sub = args[0]?.toLowerCase();
    if (sub !== "test") {
      return void message.reply(`Usage: \`${getCachedConfig(message.guild.id).prefix}welcomedm test\``);
    }

    const ok = await sendJoinDmPreview(client, message.member);

    const cfg = await getGuildConfig(message.guild.id);
    const wp = (cfg.plugins?.welcome as any);

    if (!ok) {
      const failMsg: string = wp?.messages?.test_failed
        ?? "❌ Failed to send DM preview. The join DM may not be configured, or your DMs are closed.";
      return void message.reply(failMsg.replaceAll("{reason}", "DMs closed or join_dm not configured"));
    }

    const successMsg: string = wp?.messages?.welcomedm_test_sent
      ?? "✅ Welcome DM test sent to {user.mention}.";
    await message.reply(successMsg.replaceAll("{user.mention}", `<@${message.author.id}>`));
  },
};

// !invites
export const invitesCmd: Command = {
  name: "invites",
  aliases: [],
  usage: "[@user]",
  description: "Show the invite count for yourself or another user.",

  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "invites"))) {
      return void message.reply("❌ No permission.");
    }

    let targetId = message.author.id;
    let targetName = message.author.username;

    if (args[0]) {
      const parsed = parseUserId(args[0]);
      if (!parsed) return void message.reply("❌ Could not parse user. Mention them or provide their ID.");
      targetId = parsed;
      const member = message.guild.members.cache.get(parsed);
      targetName = member?.user.username ?? parsed;
    }

    const stats = await getInviteCount(message.guild.id, targetId);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📨 Invites — ${targetName}`)
      .addFields(
        { name: "Net Invites",  value: String(stats.net),    inline: true },
        { name: "Total Joined", value: String(stats.total),  inline: true },
        { name: "Left",         value: String(stats.left),   inline: true },
        { name: "Banned",       value: String(stats.banned), inline: true }
      )
      .setFooter({ text: `Net = Total − Left − Banned` });

    await (message.channel as TextChannel).send({ embeds: [embed] });
  },
};

// !inviteleaderboard
export const inviteleaderboardCmd: Command = {
  name: "inviteleaderboard",
  aliases: [],
  usage: "",
  description: "Show the top 15 inviters in this server.",

  async execute(message: Message, _args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "inviteleaderboard"))) {
      return void message.reply("❌ No permission.");
    }

    const board = await getInviteLeaderboard(message.guild.id);

    if (board.length === 0) {
      return void message.reply("📭 No invite data recorded yet.");
    }

    const lines = board.map((entry, i) => {
      const member = message.guild!.members.cache.get(entry.userId);
      const name = member?.user.username ?? entry.userId;
      return `**${i + 1}.** ${name} — **${entry.net}** net (${entry.total} total, ${entry.left} left, ${entry.banned} banned)`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`🏆 Invite Leaderboard — ${message.guild.name}`)
      .setDescription(lines.join("\n"))
      .setFooter({ text: `Net = Total − Left − Banned` });

    await (message.channel as TextChannel).send({ embeds: [embed] });
  },
};

// !invitereset
export const inviteresetCmd: Command = {
  name: "invitereset",
  aliases: [],
  usage: "@user",
  description: "Reset a user's invite count to zero (requires level 100).",

  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "invitereset"))) {
      return void message.reply("❌ No permission.");
    }

    if (!args[0]) {
      return void message.reply("❌ Please specify a user: `!invitereset @user`");
    }

    const targetId = parseUserId(args[0]);
    if (!targetId) return void message.reply("❌ Could not parse user.");

    await resetInviteCount(message.guild.id, targetId);

    const member = message.guild.members.cache.get(targetId);
    const name = member?.user.username ?? targetId;

    await message.reply(`✅ Invite count for **${name}** has been reset to 0.`);
  },
};

// !inviteinfo
export const welcomeInviteinfoCmd: Command = {
  name: "inviteinfo",
  aliases: [],
  usage: "<code>",
  description: "Show info about a Discord invite code, including tracking data.",

  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "inviteinfo"))) {
      return void message.reply("❌ No permission.");
    }

    const code = args[0]?.replace(/^https?:\/\/discord\.(gg|com\/invite)\//i, "").trim();
    if (!code) {
      return void message.reply("❌ Please provide an invite code: `!inviteinfo <code>`");
    }

    const invite = await getInviteByCode(message.guild, code);
    if (!invite) {
      return void message.reply(`❌ Could not find invite \`${code}\` in this server. Make sure it's a valid code and the bot has Manage Server permission.`);
    }

    // Also pull tracking data for the inviter
    let trackingField = "N/A";
    if (invite.inviter) {
      const stats = await getInviteCount(message.guild.id, invite.inviter.id);
      trackingField = `Net: **${stats.net}** (Total: ${stats.total} | Left: ${stats.left} | Banned: ${stats.banned})`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📨 Invite Info — \`${code}\``)
      .addFields(
        { name: "Code",       value: `\`${invite.code}\``,                                                         inline: true },
        { name: "URL",        value: `discord.gg/${invite.code}`,                                                  inline: true },
        { name: "Uses",       value: `${invite.uses ?? 0}${invite.maxUses ? ` / ${invite.maxUses}` : " / ∞"}`,    inline: true },
        { name: "Inviter",    value: invite.inviter ? `${invite.inviter.username} (${invite.inviter.id})` : "N/A", inline: true },
        { name: "Channel",    value: invite.channel && "name" in invite.channel ? `#${(invite.channel as any).name}` : "N/A", inline: true },
        { name: "Temporary",  value: invite.temporary ? "Yes" : "No",                                             inline: true },
        { name: "Created",    value: invite.createdAt ? invite.createdAt.toLocaleDateString("en-US") : "N/A",     inline: true },
        { name: "Expires",    value: invite.expiresAt ? invite.expiresAt.toLocaleDateString("en-US") : "Never",   inline: true },
        { name: "Inviter Stats (Tracked)", value: trackingField, inline: false }
      );

    await (message.channel as TextChannel).send({ embeds: [embed] });
  },
};

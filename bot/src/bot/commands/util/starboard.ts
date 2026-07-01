import {
  Client, Message, EmbedBuilder, TextChannel,
  MessageReaction, User, ColorResolvable,
} from "discord.js";
import type { Command } from "../types";
import {
  getStarboardEntry, saveStarboardEntry, deleteStarboardEntry,
  getTopStarboardEntries, removeStarboardEntriesByUser,
  getStarboardEntriesForUser, getStarboardGivenCount,
  getStarboardRuntime,
  setStarboardLocked,
  addIgnoredUser, removeIgnoredUser,
  addIgnoredChannel, removeIgnoredChannel,
  type StarboardPluginConfig, type PostFormat, type StarboardEntry,
} from "../../store/starboard";
import { getGuildConfig } from "../../store/guildConfig";
import { getUserLevel } from "../../lib/yamlLevels";
import { logger } from "../../../lib/logger";

// Embed / formatting helpers
const DEFAULT_COLOR_TIERS = [
  { min_stars: 1,  color: "#FFD700" },
  { min_stars: 5,  color: "#FFA500" },
  { min_stars: 10, color: "#FF6600" },
  { min_stars: 20, color: "#FF0000" },
  { min_stars: 50, color: "#FF00FF" },
];

function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

function getEmbedColor(starCount: number, fmt: PostFormat): number {
  if (!fmt.embed_color_by_count) {
    return hexToInt(fmt.embed_color ?? "#FFD700");
  }
  const tiers = [...(fmt.color_tiers ?? DEFAULT_COLOR_TIERS)].sort((a, b) => b.min_stars - a.min_stars);
  for (const tier of tiers) {
    if (starCount >= tier.min_stars) return hexToInt(tier.color);
  }
  return hexToInt("#FFD700");
}

function formatStarCount(starCount: number, fmt: PostFormat, emoji: string): string {
  const superThreshold = fmt.super_star_threshold ?? 0;
  const displayEmoji =
    superThreshold > 0 && starCount >= superThreshold
      ? (fmt.super_star_emoji ?? "🌟")
      : emoji;
  return (fmt.star_count_format ?? "{count} {emoji}")
    .replace("{count}", String(starCount))
    .replace("{emoji}", displayEmoji);
}

function buildStarboardEmbed(
  msg: Message,
  starCount: number,
  emoji: string,
  fmt: PostFormat,
  channelId: string,
): { content: string; embed: EmbedBuilder } {
  const starDisplay = formatStarCount(starCount, fmt, emoji);
  const showChannel = fmt.show_channel !== false;

  const content = showChannel
    ? `${starDisplay} | <#${channelId}>`
    : starDisplay;

  const embed = new EmbedBuilder().setColor(getEmbedColor(starCount, fmt) as ColorResolvable);

  if (fmt.show_author !== false && msg.author) {
    embed.setAuthor({
      name: msg.member?.displayName ?? msg.author.globalName ?? msg.author.username,
      iconURL: msg.author.displayAvatarURL(),
    });
  }

  if (msg.content) embed.setDescription(msg.content);

  if (fmt.show_timestamp !== false) embed.setTimestamp(msg.createdAt);

  if (fmt.show_attachment !== false && msg.attachments.size > 0) {
    const img = msg.attachments.find((a) => a.contentType?.startsWith("image/"));
    if (img) embed.setImage(img.url);
  }

  if (fmt.show_jump_link !== false) {
    embed.addFields({ name: "\u200b", value: `[Jump to Message](${msg.url})` });
  }

  return { content, embed };
}

// Filtering helpers
async function passesFilters(
  msg: Message,
  reactor: User,
  added: boolean,
  cfg: StarboardPluginConfig,
  boardCfg: { emoji: string; self_star?: boolean; ignore_channels?: string[]; ignore_roles?: string[]; nsfw_allowed?: boolean; bots_allowed?: boolean; only_roles?: string[] },
  runtime: { ignoredUsers: string[]; ignoredChannels: string[] },
): Promise<boolean> {
  if (!msg.guild) return false;

  // Bot filter
  if (!boardCfg.bots_allowed && msg.author?.bot) return false;

  // Author is ignored
  if (cfg.ignored_users?.includes(msg.author?.id ?? "")) return false;
  if (runtime.ignoredUsers.includes(msg.author?.id ?? "")) return false;

  // Self-star
  if (!boardCfg.self_star && reactor.id === msg.author?.id) return false;

  // Ignore channels (YAML config + dynamic runtime)
  const ignoredCh = [...(boardCfg.ignore_channels ?? []), ...runtime.ignoredChannels];
  if (ignoredCh.includes(msg.channel.id)) return false;

  // NSFW
  const ch = msg.channel as TextChannel;
  if (!boardCfg.nsfw_allowed && "nsfw" in ch && ch.nsfw) return false;

  // Ignore roles (reactor's roles)
  if ((boardCfg.ignore_roles ?? []).length > 0) {
    const member = await msg.guild.members.fetch(reactor.id).catch(() => null);
    if (member) {
      const hasIgnoredRole = (boardCfg.ignore_roles ?? []).some((r) => member.roles.cache.has(r));
      if (hasIgnoredRole) return false;
    }
  }

  // only_roles (for extra boards)
  if ("only_roles" in boardCfg && (boardCfg.only_roles ?? []).length > 0) {
    const member = await msg.guild.members.fetch(reactor.id).catch(() => null);
    if (!member) return false;
    const hasRole = (boardCfg.only_roles ?? []).some((r) => member.roles.cache.has(r));
    if (!hasRole) return false;
  }

  // Max age
  const maxAge = cfg.max_age_days ?? 7;
  if (maxAge > 0) {
    const ageMs = Date.now() - msg.createdTimestamp;
    if (ageMs > maxAge * 24 * 60 * 60 * 1000) return false;
  }

  // Min message length (only if no attachments)
  const minLen = cfg.min_message_length ?? 0;
  if (minLen > 0 && msg.attachments.size === 0 && (msg.content?.length ?? 0) < minLen) return false;

  return true;
}

// Core board processor
async function processBoardReaction(
  msg: Message,
  reactor: User,
  reaction: MessageReaction,
  added: boolean,
  cfg: StarboardPluginConfig,
  boardName: string,
  boardEmoji: string,
  boardChannelId: string,
  boardThreshold: number,
  boardOptions: {
    self_star?: boolean;
    ignore_channels?: string[];
    ignore_roles?: string[];
    nsfw_allowed?: boolean;
    bots_allowed?: boolean;
    only_roles?: string[];
    update_on_new_stars?: boolean;
    lock_after_post?: boolean;
    remove_on_unstar?: boolean;
  },
  fmt: PostFormat,
  runtime: { locked: boolean; ignoredUsers: string[]; ignoredChannels: string[] },
): Promise<void> {
  if (!msg.guild) return;

  // Check board emoji matches
  const reactionName = reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : (reaction.emoji.name ?? "");
  if (reactionName !== boardEmoji) return;

  // Locked
  if (runtime.locked) return;

  // Don't star messages from the starboard channel itself
  if (msg.channel.id === boardChannelId) return;

  const passes = await passesFilters(msg, reactor, added, cfg, { emoji: boardEmoji, ...boardOptions }, runtime);
  if (!passes) return;

  const sbChannel = msg.guild.channels.cache.get(boardChannelId) as TextChannel | undefined;
  if (!sbChannel) return;

  // Count qualifying reactions (exclude bot reactor if self_star is off, etc.)
  // Discord gives us the raw count; we trust it as the authoritative count
  const starCount = reaction.count ?? 0;

  const existing = getStarboardEntry(msg.id, boardName);

  const removeOnUnstar = boardOptions.remove_on_unstar ?? cfg.remove_on_unstar ?? false;
  if (!added && removeOnUnstar && existing && starCount < boardThreshold) {
    if (existing.starboardMessageId) {
      await sbChannel.messages.delete(existing.starboardMessageId).catch(() => {});
    }
    await deleteStarboardEntry(msg.id, boardName);
    return;
  }

  if (starCount < boardThreshold) {
    // Update star count on existing entry even if below threshold (for stats)
    if (existing) {
      const starredBy = added
        ? [...new Set([...existing.starredBy, reactor.id])]
        : existing.starredBy.filter((id) => id !== reactor.id);
      await saveStarboardEntry({ ...existing, starCount, starredBy });
    }
    return;
  }

  const { content, embed } = buildStarboardEmbed(msg, starCount, boardEmoji, fmt, msg.channel.id);

  const updateOnNew   = boardOptions.update_on_new_stars ?? cfg.update_on_new_stars ?? true;
  const lockAfterPost = boardOptions.lock_after_post     ?? cfg.lock_after_post     ?? false;

  if (existing?.starboardMessageId) {
    // Track starredBy
    const starredBy = added
      ? [...new Set([...existing.starredBy, reactor.id])]
      : existing.starredBy.filter((id) => id !== reactor.id);

    if (updateOnNew && !lockAfterPost) {
      const sbMsg = await sbChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
      if (sbMsg) await sbMsg.edit({ content, embeds: [embed] }).catch(() => {});
    }
    await saveStarboardEntry({ ...existing, starCount, starredBy });
    return;
  }

  // New post
  const posted = await sbChannel.send({ content, embeds: [embed] }).catch(() => null);
  if (!posted) return;

  const starredBy = [reactor.id];
  await saveStarboardEntry({
    originalMessageId: msg.id,
    starboardMessageId: posted.id,
    authorId: msg.author?.id ?? "",
    channelId: msg.channel.id,
    guildId: msg.guild.id,
    starCount,
    starredBy,
    boardName,
  });
}

// Public reaction handler (called from bot/index.ts)
export async function handleStarboardReaction(
  reaction: MessageReaction,
  user: User,
  added: boolean,
): Promise<void> {
  try {
    if (user.bot) return;
    if (!reaction.message.guild) return;

    const guildId = reaction.message.guild.id;

    // Load guild config (async, uses TTL cache internally)
    const guildCfg = await getGuildConfig(guildId);
    const cfg = (guildCfg?.plugins as Record<string, unknown>)?.["starboard"] as StarboardPluginConfig | undefined;
    if (!cfg?.enabled) return;

    const msg = reaction.partial ? await reaction.message.fetch() : reaction.message as Message;
    if (!msg.guild) return;

    const runtime = getStarboardRuntime(guildId);
    const fmt: PostFormat = cfg.post_format ?? {};

    // Main board
    if (cfg.channel) {
      await processBoardReaction(
        msg, user, reaction, added, cfg,
        "main",
        cfg.emoji ?? "⭐",
        cfg.channel,
        cfg.threshold ?? 3,
        {
          self_star:          cfg.self_star,
          ignore_channels:    cfg.ignore_channels,
          ignore_roles:       cfg.ignore_roles,
          nsfw_allowed:       cfg.nsfw_allowed,
          bots_allowed:       cfg.bots_allowed,
          update_on_new_stars: cfg.update_on_new_stars,
          lock_after_post:    cfg.lock_after_post,
          remove_on_unstar:   cfg.remove_on_unstar,
        },
        fmt,
        runtime,
      );
    }

    // Extra boards
    for (const board of cfg.extra_boards ?? []) {
      if (!board.channel || !board.emoji || !board.name) continue;
      const boardFmt: PostFormat = { embed_color: board.embed_color };
      await processBoardReaction(
        msg, user, reaction, added, cfg,
        board.name,
        board.emoji,
        board.channel,
        board.threshold ?? 3,
        {
          self_star:       board.self_star,
          ignore_channels: board.ignore_channels,
          ignore_roles:    board.ignore_roles,
          nsfw_allowed:    board.nsfw_allowed,
          bots_allowed:    board.bots_allowed,
          only_roles:      board.only_roles,
        },
        boardFmt,
        runtime,
      );
    }
  } catch (err) {
    logger.warn({ err }, "Starboard reaction handler error");
  }
}

// Command
const starboardCmd: Command = {
  name: "starboard",
  aliases: [],
  usage: "<subcommand> [args]",
  description: "Manage the starboard — top, stats, clear, ignore, lock, force, info, and more.",

  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    const sub = args[0]?.toLowerCase();
    const userLevel = getUserLevel(message);
    const guildId = message.guild.id;

    const guildCfg = await getGuildConfig(guildId);
    const cfg = (guildCfg?.plugins as Record<string, unknown>)?.["starboard"] as StarboardPluginConfig | undefined;
    const msgs = cfg?.messages ?? {};
    const runtime = getStarboardRuntime(guildId);

    // top
    if (!sub || sub === "top") {
      const count = Math.min(Number(args[1]) || 10, 20);
      const entries = await getTopStarboardEntries(guildId, count, "main");
      if (entries.length === 0) {
        const emptyMsg = msgs.starboard_empty ?? "No starred messages found";
        const embed = new EmbedBuilder().setColor(0xffd700).setDescription(emptyMsg);
        return void message.channel.send({ embeds: [embed] });
      }
      const emoji = cfg?.emoji ?? "⭐";
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`${emoji} Starboard Top ${count}`)
        .setDescription(
          entries.map((e, i) =>
            `**${i + 1}.** <@${e.authorId}> — ${emoji} ${e.starCount} — <#${e.channelId}>`
          ).join("\n")
        );
      return void message.channel.send({ embeds: [embed] });
    }

    // stats
    if (sub === "stats") {
      const target = message.mentions.users.first() ?? message.author;
      const userEntries = getStarboardEntriesForUser(guildId, target.id);
      if (userEntries.length === 0) {
        const none = (msgs.stats_none ?? "No star data found for {user}").replace("{user}", `<@${target.id}>`);
        return void message.reply(none);
      }
      const received = userEntries.reduce((s, e) => s + e.starCount, 0);
      const given    = getStarboardGivenCount(guildId, target.id);
      const emoji = cfg?.emoji ?? "⭐";
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`${emoji} Star Stats — ${target.globalName ?? target.username}`)
        .addFields(
          { name: "Messages Starred", value: String(userEntries.length), inline: true },
          { name: "Stars Received",   value: String(received),           inline: true },
          { name: "Stars Given",      value: String(given),              inline: true },
        );
      return void message.channel.send({ embeds: [embed] });
    }

    // info
    if (sub === "info") {
      if (userLevel < 25) return void message.reply("❌ You need level 25+ for `!starboard info`.");
      const msgId = args[1];
      if (!msgId) return void message.reply("❌ Usage: `!starboard info <message_id>`");
      const entry = getStarboardEntry(msgId, "main");
      if (!entry) {
        return void message.reply(msgs.message_not_found ?? "Message not found");
      }
      const emoji = cfg?.emoji ?? "⭐";
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`${emoji} Starboard Info`)
        .addFields(
          { name: "Original Message", value: `<#${entry.channelId}>`, inline: true },
          { name: "Author",           value: `<@${entry.authorId}>`,  inline: true },
          { name: "Star Count",       value: String(entry.starCount),  inline: true },
          { name: "Board",            value: entry.boardName,          inline: true },
        );
      return void message.channel.send({ embeds: [embed] });
    }

    // Admin commands — level 75+
    // force
    if (sub === "force") {
      if (userLevel < 75) return void message.reply("❌ You need level 75+ for `!starboard force`.");
      if (!cfg?.enabled || !cfg.channel) return void message.reply("❌ Starboard is not configured.");
      const msgId = args[1];
      if (!msgId) return void message.reply("❌ Usage: `!starboard force <message_id>`");

      const existing = getStarboardEntry(msgId, "main");
      if (existing?.starboardMessageId) return void message.reply(msgs.already_posted ?? "This message is already on the starboard.");

      const fetched = await (message.channel as TextChannel).messages.fetch(msgId).catch(() => null);
      if (!fetched) return void message.reply(msgs.message_not_found ?? "Message not found");

      const sbChannel = message.guild.channels.cache.get(cfg.channel) as TextChannel | undefined;
      if (!sbChannel) return void message.reply("❌ Starboard channel not found.");

      const fmt: PostFormat = cfg.post_format ?? {};
      const starCount = fetched.reactions.cache
        .get(cfg.emoji ?? "⭐")?.count ?? 0;
      const { content, embed } = buildStarboardEmbed(fetched, starCount, cfg.emoji ?? "⭐", fmt, fetched.channel.id);
      const posted = await sbChannel.send({ content, embeds: [embed] }).catch(() => null);
      if (!posted) return void message.reply("❌ Failed to post to starboard.");

      await saveStarboardEntry({
        originalMessageId: fetched.id,
        starboardMessageId: posted.id,
        authorId: fetched.author?.id ?? "",
        channelId: fetched.channel.id,
        guildId,
        starCount,
        starredBy: [],
        boardName: "main",
      });
      return void message.reply(msgs.force_posted ?? "Message has been force-posted to the starboard.");
    }

    // ignore
    if (sub === "ignore") {
      if (userLevel < 75) return void message.reply("❌ You need level 75+ for `!starboard ignore`.");
      const target = message.mentions.users.first();
      if (!target) return void message.reply("❌ Usage: `!starboard ignore @user`");
      const added = await addIgnoredUser(guildId, target.id);
      if (!added) {
        return void message.reply(
          (msgs.already_ignored ?? "{user} is already on the starboard ignore list").replace("{user}", `<@${target.id}>`)
        );
      }
      return void message.reply(
        (msgs.starboard_ignored ?? "{user} has been added to the starboard ignore list").replace("{user}", `<@${target.id}>`)
      );
    }

    // unignore
    if (sub === "unignore") {
      if (userLevel < 75) return void message.reply("❌ You need level 75+ for `!starboard unignore`.");
      const target = message.mentions.users.first();
      if (!target) return void message.reply("❌ Usage: `!starboard unignore @user`");
      const removed = await removeIgnoredUser(guildId, target.id);
      if (!removed) {
        return void message.reply(
          (msgs.not_ignored ?? "{user} is not on the starboard ignore list").replace("{user}", `<@${target.id}>`)
        );
      }
      return void message.reply(
        (msgs.starboard_unignored ?? "{user} has been removed from the starboard ignore list").replace("{user}", `<@${target.id}>`)
      );
    }

    // ignorechannel
    if (sub === "ignorechannel") {
      if (userLevel < 75) return void message.reply("❌ You need level 75+ for `!starboard ignorechannel`.");
      const ch = message.mentions.channels.first();
      if (!ch) return void message.reply("❌ Usage: `!starboard ignorechannel #channel`");
      await addIgnoredChannel(guildId, ch.id);
      return void message.reply(
        (msgs.channel_ignored ?? "{channel} has been added to the starboard channel ignore list").replace("{channel}", `<#${ch.id}>`)
      );
    }

    // unignorechannel
    if (sub === "unignorechannel") {
      if (userLevel < 75) return void message.reply("❌ You need level 75+ for `!starboard unignorechannel`.");
      const ch = message.mentions.channels.first();
      if (!ch) return void message.reply("❌ Usage: `!starboard unignorechannel #channel`");
      await removeIgnoredChannel(guildId, ch.id);
      return void message.reply(
        (msgs.channel_unignored ?? "{channel} has been removed from the starboard channel ignore list").replace("{channel}", `<#${ch.id}>`)
      );
    }

    // Level 100 commands
    // clear
    if (sub === "clear") {
      if (userLevel < 100) return void message.reply("❌ You need level 100 for `!starboard clear`.");
      const target = message.mentions.users.first();
      if (!target) return void message.reply("❌ Usage: `!starboard clear @user`");
      const removed = await removeStarboardEntriesByUser(guildId, target.id);
      return void message.reply(
        (msgs.starboard_cleared ?? "Starboard entries cleared for {user}")
          .replace("{user}", `<@${target.id}>`)
          + ` (${removed} removed)`
      );
    }

    // lock
    if (sub === "lock") {
      if (userLevel < 100) return void message.reply("❌ You need level 100 for `!starboard lock`.");
      await setStarboardLocked(guildId, true);
      return void message.reply(msgs.lock_success ?? "Starboard locked — no new messages will be posted.");
    }

    // unlock
    if (sub === "unlock") {
      if (userLevel < 100) return void message.reply("❌ You need level 100 for `!starboard unlock`.");
      await setStarboardLocked(guildId, false);
      return void message.reply(msgs.unlock_success ?? "Starboard unlocked — messages will be posted normally.");
    }

    return void message.reply(
      "❌ Subcommands: `top [count]`, `stats [@user]`, `info <id>`, `force <id>`, `ignore @user`, `unignore @user`, `ignorechannel #ch`, `unignorechannel #ch`, `clear @user`, `lock`, `unlock`"
    );
  },
};

export default starboardCmd;

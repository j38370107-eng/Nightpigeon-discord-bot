import { Client, EmbedBuilder, Message } from "discord.js";
import type { Command } from "../types";
import { resolveTarget, getArgs } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { dbGet, dbSet } from "../../store/db";
import { sendYamlLogCached } from "../../lib/yamlLogging";

const STORE = "watchlist";

interface WatchEntry {
  userId: string;
  userTag: string;
  reason: string;
  modId: string;
  modTag: string;
  addedAt: number;
}

type GuildWatchlist = Record<string, WatchEntry>;

async function loadWatchlist(guildId: string): Promise<GuildWatchlist> {
  return (await dbGet<GuildWatchlist>(STORE, guildId)) ?? {};
}

async function saveWatchlist(guildId: string, list: GuildWatchlist): Promise<void> {
  await dbSet(STORE, guildId, list);
}

// !watch @user [reason] — add to watchlist
export const watchCmd: Command = {
  name: "watch",
  aliases: [],
  usage: "@user [reason]",
  description: "Add a user to the watchlist for monitoring.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "watch"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply("❌ Could not find that user.");

    const reason = getArgs(message, args).join(" ") || "No reason provided";

    const list = await loadWatchlist(message.guild.id);
    if (list[target.user.id]) {
      return void message.reply(`⚠️ **${target.user.tag}** is already on the watchlist.`);
    }

    list[target.user.id] = {
      userId: target.user.id,
      userTag: target.user.tag,
      reason,
      modId: message.author.id,
      modTag: message.author.tag,
      addedAt: Date.now(),
    };
    await saveWatchlist(message.guild.id, list);

    await message.reply(`👁️ **${target.user.tag}** has been added to the watchlist.\n**Reason:** ${reason}`);
  },
};

// !unwatch @user — remove from watchlist
export const unwatchCmd: Command = {
  name: "unwatch",
  aliases: [],
  usage: "@user",
  description: "Remove a user from the watchlist.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "unwatch"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply("❌ Could not find that user.");

    const list = await loadWatchlist(message.guild.id);
    if (!list[target.user.id]) {
      return void message.reply(`❌ **${target.user.tag}** is not on the watchlist.`);
    }

    delete list[target.user.id];
    await saveWatchlist(message.guild.id, list);

    await message.reply(`✅ **${target.user.tag}** has been removed from the watchlist.`);
  },
};

// !watchlist — show all watched users
export const watchlistCmd: Command = {
  name: "watchlist",
  aliases: [],
  usage: "",
  description: "Show all users currently on the watchlist.",
  async execute(message: Message, _args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "watchlist"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const list = await loadWatchlist(message.guild.id);
    const entries = Object.values(list);

    if (entries.length === 0) return void message.reply("✅ Watchlist is empty.");

    const lines = entries.map(
      (e) =>
        `• **${e.userTag}** (${e.userId})\n  Reason: ${e.reason}\n  Added by ${e.modTag} · <t:${Math.floor(e.addedAt / 1000)}:R>`
    );

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf39c12)
          .setTitle(`👁️ Watchlist (${entries.length})`)
          .setDescription(lines.join("\n\n").slice(0, 4096)),
      ],
    });
  },
};

/**
 * If the author of this message is on the guild's watchlist, forward the
 * message (content + attachments) to the configured logging channel via the
 * "watched_user_message" server-log event. Silently does nothing if the
 * user isn't watched or logging isn't configured for that event.
 */
export async function logWatchedUserMessage(client: Client, message: Message): Promise<void> {
  if (!message.guild) return;

  const list = await loadWatchlist(message.guild.id);
  const entry = list[message.author.id];
  if (!entry) return;

  // In-channel flag: react with 🚩 so staff scrolling the channel can
  // instantly spot messages from a watched user without checking the log.
  message.react("🚩").catch(() => {});

  const channelName =
    "name" in message.channel ? (message.channel as any).name : "unknown";

  const attachmentUrls = message.attachments.map((a) => a.url).join("\n") || undefined;

  await sendYamlLogCached(client, message.guild.id, {
    eventKey: "watched_user_message",
    category: "server",
    vars: {
      user: `${message.author.tag} (${message.author.id})`,
      channel: `#${channelName}`,
      content: message.content || "*(no text content)*",
      attachments: attachmentUrls,
      watch_reason: entry.reason,
      jump_url: message.url,
    },
  });
}

export { loadWatchlist };

import { Client, EmbedBuilder, Message } from "discord.js";
import type { Command } from "../types";
import { resolveTarget, getArgs } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { dbGet, dbSet } from "../../store/db";

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

export { loadWatchlist };

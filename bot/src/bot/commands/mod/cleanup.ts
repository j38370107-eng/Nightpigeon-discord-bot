import { Client, EmbedBuilder, Message, TextChannel } from "discord.js";
import type { Command } from "../types";
import { resolveTarget, getArgs } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getCachedConfig } from "../../store/guildConfig";
import { buildPayload } from "../../lib/msgTemplate";
import { dbGet, dbSet } from "../../store/db";

const SEEN_STORE = "user_seen";

interface SeenEntry {
  lastSeen: number;
  channelId: string;
  channelName: string;
  guildId: string;
}

type SeenData = Record<string, SeenEntry>;

export async function recordSeen(userId: string, guildId: string, channelId: string, channelName: string): Promise<void> {
  const data = (await dbGet<SeenData>(SEEN_STORE, guildId)) ?? {};
  data[userId] = { lastSeen: Date.now(), channelId, channelName, guildId };
  await dbSet(SEEN_STORE, guildId, data);
}

// !seen @user — when was a user last seen sending a message
export const seenCmd: Command = {
  name: "seen",
  aliases: [],
  usage: "@user",
  description: "Show when a user was last seen sending a message.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};
    if (!(await checkYamlLevelAsync(message, "seen"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));

    const data = (await dbGet<SeenData>(SEEN_STORE, message.guild.id)) ?? {};
    const entry = data[target.user.id];

    if (!entry) {
      const modCfg = getCachedConfig(message.guild.id);
      const modMsgs = (modCfg.plugins.moderation as any)?.messages ?? {};
      return void message.reply(buildPayload(modMsgs.seen_no_data, { user: target.user.tag, "user.id": target.user.id }, `❌ No data for **${target.user.tag}** — they may not have sent a message since the bot was added.`));
    }

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`👁️ Last Seen — ${target.user.tag}`)
          .setThumbnail(target.user.displayAvatarURL({ size: 64 }))
          .setDescription(
            `**Last seen:** <t:${Math.floor(entry.lastSeen / 1000)}:R>\n` +
            `**Channel:** <#${entry.channelId}> (${entry.channelName})\n` +
            `**Timestamp:** <t:${Math.floor(entry.lastSeen / 1000)}:F>`
          ),
      ],
    });
  },
};

// !cleanup @user <amount> — delete messages from a specific user in the current channel
export const cleanupCmd: Command = {
  name: "cleanup",
  aliases: [],
  usage: "@user <amount>",
  description: "Delete up to 100 messages from a specific user in the current channel.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "cleanup"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));

    const amountStr = getArgs(message, args)[0];
    const amount = parseInt(amountStr ?? "0", 10);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return void message.reply(buildPayload(msgs.err_cleanup_invalid, {}, "❌ Please provide a number between 1 and 100."));
    }

    const channel = message.channel as TextChannel;
    await message.delete().catch(() => {});

    const fetched = await channel.messages.fetch({ limit: 100 });
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const toDelete = [...fetched.values()]
      .filter((m) => m.author.id === target.user.id && m.createdTimestamp > cutoff)
      .slice(0, amount);

    if (toDelete.length === 0) {
      const n = await channel.send(buildPayload(msgs.err_cleanup_no_messages, {}, "❌ No recent messages found for that user (messages may be older than 14 days)."));
      setTimeout(() => n.delete().catch(() => {}), 5000);
      return;
    }

    let deleted = 0;
    if (toDelete.length === 1) {
      await toDelete[0]!.delete().catch(() => {});
      deleted = 1;
    } else {
      const bulk = await channel.bulkDelete(toDelete, true);
      deleted = bulk.size;
    }

    const vars = {
      user: target.user.tag,
      "user.mention": `<@${target.user.id}>`,
      "user.id": target.user.id,
      count: deleted,
      mod: message.author.tag,
    };

    const notice = await channel.send(buildPayload(msgs.cleanup_success, vars, `🗑️ Deleted **${deleted}** message${deleted !== 1 ? "s" : ""} from **${target.user.tag}**.`));
    setTimeout(() => notice.delete().catch(() => {}), 5000);
  },
};

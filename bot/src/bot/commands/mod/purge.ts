import { Client, Message, TextChannel } from "discord.js";
import type { Command } from "../types";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getCachedConfig } from "../../store/guildConfig";
import { buildPayload } from "../../lib/msgTemplate";
import { resolveTarget } from "../../lib/resolveUser";

const MAX_PURGE = 100;
const CUTOFF_MS = 14 * 24 * 60 * 60 * 1000;

function isRecentEnough(m: Message): boolean {
  return Date.now() - m.createdTimestamp < CUTOFF_MS;
}

async function doBulkDelete(channel: TextChannel, messages: Message[], amount: number): Promise<number> {
  const toDelete = messages.filter(isRecentEnough).slice(0, amount);
  if (toDelete.length === 0) return 0;
  if (toDelete.length === 1) {
    await toDelete[0]!.delete().catch(() => {});
    return 1;
  }
  const result = await channel.bulkDelete(toDelete, true);
  return result.size;
}

async function sendNotice(channel: TextChannel, text: string): Promise<void> {
  const msg = await channel.send(text).catch(() => null);
  if (msg) setTimeout(() => msg.delete().catch(() => {}), 5000);
}

const purgeCmd: Command = {
  name: "purge",
  aliases: [],
  usage: "[user|bots|embeds|images|links|contains|before|after|between|pins|reactions] <amount|id>",
  description: "Delete messages with various filters.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "purge"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const channel = message.channel as TextChannel;
    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    await message.delete().catch(() => {});

    const sub = args[0]?.toLowerCase() ?? "";

    // !purge <number> [user_id] — basic or filtered by user ID
    if (!isNaN(parseInt(sub, 10))) {
      const amount = Math.min(parseInt(sub, 10), MAX_PURGE);
      if (amount < 1) return void sendNotice(channel, "❌ Please provide a number between 1 and 100.");
      const rawUserId = args[1];
      const isUserId = rawUserId && /^\d{15,20}$/.test(rawUserId);
      const fetched = await channel.messages.fetch({ limit: MAX_PURGE });
      let pool = [...fetched.values()];
      if (isUserId) pool = pool.filter((m) => m.author.id === rawUserId);
      const deleted = await doBulkDelete(channel, pool, amount);
      const label = isUserId ? ` from <@${rawUserId}>` : "";
      const payload = buildPayload(msgs.purge_success, { count: deleted }, `🗑️ Deleted **${deleted}** message${deleted !== 1 ? "s" : ""}${label}.`);
      const m = await channel.send(payload).catch(() => null);
      if (m) setTimeout(() => m.delete().catch(() => {}), 5000);
      return;
    }

    // !purge @user <amount>
    if (message.mentions.users.size > 0) {
      const user = message.mentions.users.first()!;
      const amount = Math.min(parseInt(args[1] ?? "100", 10) || 100, MAX_PURGE);
      const fetched = await channel.messages.fetch({ limit: MAX_PURGE });
      const filtered = [...fetched.values()].filter((m) => m.author.id === user.id);
      const deleted = await doBulkDelete(channel, filtered, amount);
      return void sendNotice(channel, `🗑️ Deleted **${deleted}** message${deleted !== 1 ? "s" : ""} from **${user.tag}**.`);
    }

    switch (sub) {
      // !purge bots <amount>
      case "bots": {
        const amount = Math.min(parseInt(args[1] ?? "100", 10) || 100, MAX_PURGE);
        const fetched = await channel.messages.fetch({ limit: MAX_PURGE });
        const filtered = [...fetched.values()].filter((m) => m.author.bot);
        const deleted = await doBulkDelete(channel, filtered, amount);
        return void sendNotice(channel, `🗑️ Deleted **${deleted}** bot message${deleted !== 1 ? "s" : ""}.`);
      }

      // !purge embeds <amount>
      case "embeds": {
        const amount = Math.min(parseInt(args[1] ?? "100", 10) || 100, MAX_PURGE);
        const fetched = await channel.messages.fetch({ limit: MAX_PURGE });
        const filtered = [...fetched.values()].filter((m) => m.embeds.length > 0);
        const deleted = await doBulkDelete(channel, filtered, amount);
        return void sendNotice(channel, `🗑️ Deleted **${deleted}** message${deleted !== 1 ? "s" : ""} with embeds.`);
      }

      // !purge images <amount>
      case "images": {
        const amount = Math.min(parseInt(args[1] ?? "100", 10) || 100, MAX_PURGE);
        const fetched = await channel.messages.fetch({ limit: MAX_PURGE });
        const filtered = [...fetched.values()].filter(
          (m) => m.attachments.some((a) => a.contentType?.startsWith("image/")) || m.embeds.some((e) => e.image || e.thumbnail)
        );
        const deleted = await doBulkDelete(channel, filtered, amount);
        return void sendNotice(channel, `🗑️ Deleted **${deleted}** message${deleted !== 1 ? "s" : ""} with images.`);
      }

      // !purge links <amount>
      case "links": {
        const amount = Math.min(parseInt(args[1] ?? "100", 10) || 100, MAX_PURGE);
        const linkRe = /https?:\/\//i;
        const fetched = await channel.messages.fetch({ limit: MAX_PURGE });
        const filtered = [...fetched.values()].filter((m) => linkRe.test(m.content));
        const deleted = await doBulkDelete(channel, filtered, amount);
        return void sendNotice(channel, `🗑️ Deleted **${deleted}** message${deleted !== 1 ? "s" : ""} with links.`);
      }

      // !purge contains <text> <amount>
      case "contains": {
        const text = args[1];
        if (!text) return void sendNotice(channel, "❌ Usage: `!purge contains <text> [amount]`");
        const amount = Math.min(parseInt(args[2] ?? "100", 10) || 100, MAX_PURGE);
        const fetched = await channel.messages.fetch({ limit: MAX_PURGE });
        const filtered = [...fetched.values()].filter((m) => m.content.toLowerCase().includes(text.toLowerCase()));
        const deleted = await doBulkDelete(channel, filtered, amount);
        return void sendNotice(channel, `🗑️ Deleted **${deleted}** message${deleted !== 1 ? "s" : ""} containing "${text}".`);
      }

      // !purge before <message_id> [amount]
      case "before": {
        const beforeId = args[1];
        if (!beforeId || !/^\d{15,20}$/.test(beforeId)) return void sendNotice(channel, "❌ Please provide a valid message ID.");
        const amount = Math.min(parseInt(args[2] ?? "100", 10) || 100, MAX_PURGE);
        const fetched = await channel.messages.fetch({ limit: MAX_PURGE, before: beforeId });
        const deleted = await doBulkDelete(channel, [...fetched.values()], amount);
        return void sendNotice(channel, `🗑️ Deleted **${deleted}** message${deleted !== 1 ? "s" : ""}.`);
      }

      // !purge after <message_id> [amount]
      case "after": {
        const afterId = args[1];
        if (!afterId || !/^\d{15,20}$/.test(afterId)) return void sendNotice(channel, "❌ Please provide a valid message ID.");
        const amount = Math.min(parseInt(args[2] ?? "100", 10) || 100, MAX_PURGE);
        const fetched = await channel.messages.fetch({ limit: MAX_PURGE, after: afterId });
        const deleted = await doBulkDelete(channel, [...fetched.values()].reverse(), amount);
        return void sendNotice(channel, `🗑️ Deleted **${deleted}** message${deleted !== 1 ? "s" : ""}.`);
      }

      // !purge between <id1> <id2>
      case "between": {
        const id1 = args[1];
        const id2 = args[2];
        if (!id1 || !id2) return void sendNotice(channel, "❌ Usage: `!purge between <message_id_1> <message_id_2>`");
        const smaller = BigInt(id1) < BigInt(id2) ? id1 : id2;
        const larger = BigInt(id1) < BigInt(id2) ? id2 : id1;
        const fetched = await channel.messages.fetch({ limit: MAX_PURGE, after: smaller, before: larger });
        const deleted = await doBulkDelete(channel, [...fetched.values()], MAX_PURGE);
        return void sendNotice(channel, `🗑️ Deleted **${deleted}** message${deleted !== 1 ? "s" : ""}.`);
      }

      // !purge pins — delete pinned messages
      case "pins": {
        const pinned = await channel.messages.fetchPinned();
        let count = 0;
        for (const msg of pinned.values()) {
          await msg.unpin().catch(() => {});
          await msg.delete().catch(() => {});
          count++;
        }
        return void sendNotice(channel, `🗑️ Deleted **${count}** pinned message${count !== 1 ? "s" : ""}.`);
      }

      // !purge reactions <message_id> — clear all reactions from a message
      case "reactions": {
        const msgId = args[1];
        if (!msgId || !/^\d{15,20}$/.test(msgId)) return void sendNotice(channel, "❌ Please provide a valid message ID.");
        const targetMsg = await channel.messages.fetch(msgId).catch(() => null);
        if (!targetMsg) return void sendNotice(channel, "❌ Message not found.");
        await targetMsg.reactions.removeAll();
        return void sendNotice(channel, `✅ Cleared all reactions from that message.`);
      }

      default: {
        return void sendNotice(
          channel,
          "❌ Usage:\n" +
          "`!purge <amount>` — delete messages\n" +
          "`!purge @user <amount>` — by user\n" +
          "`!purge bots|embeds|images|links <amount>` — by type\n" +
          "`!purge contains <text> [amount]` — containing text\n" +
          "`!purge before|after <message_id> [amount]` — relative to message\n" +
          "`!purge between <id1> <id2>` — between two messages\n" +
          "`!purge pins` — pinned messages\n" +
          "`!purge reactions <message_id>` — clear reactions"
        );
      }
    }
  },
};

export default purgeCmd;

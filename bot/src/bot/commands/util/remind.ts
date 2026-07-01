import { Client, EmbedBuilder, Message, TextChannel } from "discord.js";
import type { Command } from "../types";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { dbGet, dbSet } from "../../store/db";
import { parseDuration, formatDuration } from "../../lib/parseDuration";

const STORE = "reminders";

export interface ReminderEntry {
  id: number;
  userId: string;
  guildId: string;
  channelId: string;
  message: string;
  createdAt: number;
  expiresAt: number;
}

type AllReminders = ReminderEntry[];

async function loadReminders(): Promise<AllReminders> {
  return (await dbGet<AllReminders>(STORE, "global")) ?? [];
}

async function saveReminders(reminders: AllReminders): Promise<void> {
  await dbSet(STORE, "global", reminders);
}

async function nextId(): Promise<number> {
  const all = await loadReminders();
  return (all.reduce((max, r) => (r.id > max ? r.id : max), 0)) + 1;
}

// Background scheduler — call this on startup
export function startReminderScheduler(client: Client): void {
  setInterval(async () => {
    const all = await loadReminders();
    const now = Date.now();
    const due = all.filter((r) => r.expiresAt <= now);
    if (due.length === 0) return;

    const remaining = all.filter((r) => r.expiresAt > now);
    await saveReminders(remaining);

    for (const reminder of due) {
      try {
        const guildName = client.guilds.cache.get(reminder.guildId)?.name ?? "Unknown Server";
        const channel = client.channels.cache.get(reminder.channelId) as TextChannel | undefined;
        if (channel) {
          await channel.send(`⏰ <@${reminder.userId}> **Reminder:** ${reminder.message}`).catch(() => {});
        } else {
          const user = await client.users.fetch(reminder.userId).catch(() => null);
          if (user) await user.send(`⏰ **Reminder from ${guildName}:** ${reminder.message}`).catch(() => {});
        }
      } catch { /* ok */ }
    }
  }, 15_000);
}

// !remind <duration> <message>
export const remindCmd: Command = {
  name: "remind",
  aliases: [],
  usage: "<duration> <message>",
  description: "Set a reminder. You'll be pinged when the time is up.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "remind"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    if (!args[0] || !args[1]) return void message.reply("❌ Usage: `!remind <duration> <message>` e.g. `!remind 30m Meeting`");

    const durationMs = parseDuration(args[0]!);
    if (!durationMs) return void message.reply("❌ Invalid duration. Examples: `5m`, `2h`, `1d`.");
    if (durationMs < 10_000) return void message.reply("❌ Minimum reminder time is 10 seconds.");
    if (durationMs > 365 * 24 * 60 * 60 * 1000) return void message.reply("❌ Maximum reminder time is 1 year.");

    const reminderText = args.slice(1).join(" ");
    const expiresAt = Date.now() + durationMs;
    const id = await nextId();

    const all = await loadReminders();
    all.push({
      id,
      userId: message.author.id,
      guildId: message.guild.id,
      channelId: message.channel.id,
      message: reminderText,
      createdAt: Date.now(),
      expiresAt,
    });
    await saveReminders(all);

    await message.reply(
      `⏰ Reminder **#${id}** set! I'll remind you in **${formatDuration(durationMs)}**.\n` +
      `**Message:** ${reminderText}\n` +
      `**Fires at:** <t:${Math.floor(expiresAt / 1000)}:F>`
    );
  },
};

// !reminders — list your active reminders
export const remindersCmd: Command = {
  name: "reminders",
  aliases: [],
  usage: "",
  description: "List all your active reminders.",
  async execute(message: Message, _args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "reminders"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const all = await loadReminders();
    const mine = all.filter((r) => r.userId === message.author.id);

    if (mine.length === 0) return void message.reply("✅ You have no active reminders.");

    const lines = mine.map(
      (r) => `**#${r.id}** — ${r.message.slice(0, 60)}${r.message.length > 60 ? "…" : ""}\n> fires <t:${Math.floor(r.expiresAt / 1000)}:R>`
    );

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`⏰ Your Reminders (${mine.length})`)
          .setDescription(lines.join("\n\n").slice(0, 4096)),
      ],
    });
  },
};

// !delreminder <id> — delete a reminder
export const delreminderCmd: Command = {
  name: "delreminder",
  aliases: [],
  usage: "<reminder_id>",
  description: "Delete one of your active reminders.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "delreminder"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const id = parseInt(args[0] ?? "", 10);
    if (isNaN(id)) return void message.reply("❌ Please provide a valid reminder ID.");

    const all = await loadReminders();
    const idx = all.findIndex((r) => r.id === id && r.userId === message.author.id);

    if (idx === -1) {
      return void message.reply(`❌ Reminder #${id} not found (or it belongs to someone else).`);
    }

    all.splice(idx, 1);
    await saveReminders(all);
    await message.reply(`🗑️ Reminder **#${id}** deleted.`);
  },
};

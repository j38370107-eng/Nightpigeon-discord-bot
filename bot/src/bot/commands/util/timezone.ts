import { Client, EmbedBuilder, Message } from "discord.js";
import type { Command } from "../types";
import { resolveTarget } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { dbGet, dbSet } from "../../store/db";

const STORE = "user_timezones";

type GuildTimezones = Record<string, string>;

async function loadTimezones(guildId: string): Promise<GuildTimezones> {
  return (await dbGet<GuildTimezones>(STORE, guildId)) ?? {};
}

async function saveTimezones(guildId: string, data: GuildTimezones): Promise<void> {
  await dbSet(STORE, guildId, data);
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function formatTime(tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour12: true,
  }).format(new Date());
}

const timezoneCmd: Command = {
  name: "timezone",
  aliases: [],
  usage: "set|get|list|clear [timezone|@user]",
  description: "Manage your timezone preference.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "timezone"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const sub = (args[0] ?? "get").toLowerCase();
    const timezones = await loadTimezones(message.guild.id);

    switch (sub) {
      case "set": {
        const tz = args[1];
        if (!tz) return void message.reply("❌ Usage: `!timezone set <timezone>` e.g. `America/New_York`");
        if (!isValidTimezone(tz)) {
          return void message.reply(
            `❌ Invalid timezone. Use an IANA timezone identifier, e.g. \`America/New_York\`, \`Europe/London\`, \`Asia/Tokyo\`.`
          );
        }
        timezones[message.author.id] = tz;
        await saveTimezones(message.guild.id, timezones);
        await message.reply(`✅ Your timezone has been set to **${tz}**.\nCurrent time: ${formatTime(tz)}`);
        break;
      }

      case "get": {
        const target = args[1] ? await resolveTarget(message, args.slice(1)) : null;
        const userId = target ? target.user.id : message.author.id;
        const userTag = target ? target.user.tag : message.author.tag;
        const tz = timezones[userId];
        if (!tz) {
          return void message.reply(
            userId === message.author.id
              ? "❌ You have not set a timezone. Use `!timezone set <timezone>`."
              : `❌ **${userTag}** has not set a timezone.`
          );
        }
        await message.reply(`🕐 **${userTag}**'s timezone: **${tz}**\nCurrent time: ${formatTime(tz)}`);
        break;
      }

      case "list": {
        const entries = Object.entries(timezones);
        if (entries.length === 0) return void message.reply("✅ No members have set timezones yet.");
        const lines = entries.map(([id, tz]) => `• <@${id}> — **${tz}** (${formatTime(tz)})`);
        await message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle(`🌍 Member Timezones (${entries.length})`)
              .setDescription(lines.join("\n").slice(0, 4096)),
          ],
        });
        break;
      }

      case "clear": {
        if (!timezones[message.author.id]) {
          return void message.reply("❌ You don't have a timezone set.");
        }
        delete timezones[message.author.id];
        await saveTimezones(message.guild.id, timezones);
        await message.reply("✅ Your timezone has been cleared.");
        break;
      }

      default:
        await message.reply("❌ Usage: `!timezone set|get|list|clear [timezone|@user]`");
    }
  },
};

// !time [@user] — show current time for a user
export const timeCmd: Command = {
  name: "time",
  aliases: [],
  usage: "[@user]",
  description: "Show the current time for a user based on their saved timezone.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "time"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const timezones = await loadTimezones(message.guild.id);

    const target = args.length > 0 ? await resolveTarget(message, args) : null;
    const userId = target ? target.user.id : message.author.id;
    const userTag = target ? target.user.tag : message.author.tag;
    const tz = timezones[userId];

    if (!tz) {
      return void message.reply(
        userId === message.author.id
          ? "❌ You have not set a timezone. Use `!timezone set <timezone>`."
          : `❌ **${userTag}** has not set a timezone.`
      );
    }

    await message.reply(`🕐 Current time for **${userTag}** (${tz}): **${formatTime(tz)}**`);
  },
};

// !timefor <timezone> — show current time in any timezone
export const timeforCmd: Command = {
  name: "timefor",
  aliases: [],
  usage: "<timezone>",
  description: "Show the current time in any timezone.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "timefor"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const tz = args[0];
    if (!tz) return void message.reply("❌ Usage: `!timefor <timezone>` e.g. `!timefor Europe/Berlin`");
    if (!isValidTimezone(tz)) {
      return void message.reply("❌ Invalid timezone identifier. Use IANA format e.g. `America/New_York`.");
    }

    await message.reply(`🕐 Current time in **${tz}**: **${formatTime(tz)}**`);
  },
};

// !timeconvert <time> <from_tz> to <to_tz>
export const timeconvertCmd: Command = {
  name: "timeconvert",
  aliases: [],
  usage: "<time> <from_tz> <to_tz>",
  description: "Convert a time between two timezones.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "timeconvert"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    if (args.length < 3) {
      return void message.reply("❌ Usage: `!timeconvert <time> <from_tz> <to_tz>` e.g. `!timeconvert 3:00pm America/New_York Europe/London`");
    }

    const timeStr = args[0]!;
    const fromTz = args[1]!;
    const toTz = args[2]!;

    if (!isValidTimezone(fromTz)) return void message.reply(`❌ Invalid source timezone: **${fromTz}**`);
    if (!isValidTimezone(toTz)) return void message.reply(`❌ Invalid target timezone: **${toTz}**`);

    const timeMatch = timeStr.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i);
    if (!timeMatch) return void message.reply("❌ Please provide a time like `3:00pm` or `15:30`.");

    let hours = parseInt(timeMatch[1]!, 10);
    const minutes = parseInt(timeMatch[2] ?? "0", 10);
    const ampm = (timeMatch[3] ?? "").toLowerCase();

    if (ampm === "pm" && hours !== 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const fromFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: fromTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const inputStr = `${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
    const date = new Date(inputStr);

    const toTime = new Intl.DateTimeFormat("en-US", {
      timeZone: toTz,
      hour: "numeric",
      minute: "2-digit",
      weekday: "short",
      hour12: true,
    }).format(date);

    await message.reply(
      `🕐 **${timeStr}** in **${fromTz}** = **${toTime}** in **${toTz}**`
    );
  },
};

export default timezoneCmd;

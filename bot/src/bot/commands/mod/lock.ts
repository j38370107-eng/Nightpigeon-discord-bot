import { Client, Message, NewsChannel, TextChannel } from "discord.js";
import type { Command } from "../types";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getCachedConfig } from "../../store/guildConfig";
import { buildPayload } from "../../lib/msgTemplate";
import { dbGet, dbSet } from "../../store/db";

type LockableChannel = TextChannel | NewsChannel;

const STORE = "channel_locks";

interface LockState {
  channelId: string;
  lockedAt: number;
  modId: string;
  reason: string;
}

type GuildLocks = Record<string, LockState>;

async function loadLocks(guildId: string): Promise<GuildLocks> {
  return (await dbGet<GuildLocks>(STORE, guildId)) ?? {};
}

async function saveLocks(guildId: string, locks: GuildLocks): Promise<void> {
  await dbSet(STORE, guildId, locks);
}

function getEveryoneRole(guild: import("discord.js").Guild) {
  return guild.roles.everyone;
}

// !lock [#channel] [reason]
export const lockCmd: Command = {
  name: "lock",
  aliases: [],
  usage: "[#channel] [reason]",
  description: "Lock a channel so @everyone cannot send messages.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "lock"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const targetChannel = (message.mentions.channels.first() as LockableChannel | undefined) ??
      (message.channel as LockableChannel);
    const reason = args.filter((a) => !a.startsWith("<#")).join(" ") || "No reason provided";

    const everyone = getEveryoneRole(message.guild);
    await targetChannel.permissionOverwrites.edit(everyone, {
      SendMessages: false,
    }, { reason: `Locked by ${message.author.tag} — ${reason}` });

    const locks = await loadLocks(message.guild.id);
    locks[targetChannel.id] = {
      channelId: targetChannel.id,
      lockedAt: Date.now(),
      modId: message.author.id,
      reason,
    };
    await saveLocks(message.guild.id, locks);

    const vars = {
      channel: `<#${targetChannel.id}>`,
      "channel.mention": `<#${targetChannel.id}>`,
      reason,
      mod: message.author.tag,
      "mod.mention": `<@${message.author.id}>`,
    };
    const payload = buildPayload(msgs.lock_success, vars, `🔒 <#${targetChannel.id}> has been locked. **Reason:** ${reason}`);

    await message.channel.send(payload);

    if (targetChannel.id !== message.channel.id) {
      await targetChannel.send(
        buildPayload(msgs.lock_channel_notice ?? msgs.lock_success, vars, `🔒 This channel has been locked. **Reason:** ${reason}`)
      ).catch(() => {});
    }
  },
};

// !unlock [#channel] [reason]
export const unlockCmd: Command = {
  name: "unlock",
  aliases: [],
  usage: "[#channel] [reason]",
  description: "Unlock a previously locked channel.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "unlock"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const targetChannel = (message.mentions.channels.first() as LockableChannel | undefined) ??
      (message.channel as LockableChannel);
    const reason = args.filter((a) => !a.startsWith("<#")).join(" ") || "No reason provided";

    const everyone = getEveryoneRole(message.guild);
    await targetChannel.permissionOverwrites.edit(everyone, {
      SendMessages: null,
    }, { reason: `Unlocked by ${message.author.tag} — ${reason}` });

    const locks = await loadLocks(message.guild.id);
    delete locks[targetChannel.id];
    await saveLocks(message.guild.id, locks);

    const vars = {
      channel: `<#${targetChannel.id}>`,
      "channel.mention": `<#${targetChannel.id}>`,
      reason,
      mod: message.author.tag,
      "mod.mention": `<@${message.author.id}>`,
    };

    await message.channel.send(buildPayload(msgs.unlock_success, vars, `🔓 <#${targetChannel.id}> has been unlocked.`));
    if (targetChannel.id !== message.channel.id) {
      await targetChannel.send(
        buildPayload(msgs.unlock_channel_notice ?? msgs.unlock_success, vars, `🔓 This channel has been unlocked.`)
      ).catch(() => {});
    }
  },
};

// !hide [#channel] [reason] — hide channel from @everyone
export const hideCmd: Command = {
  name: "hide",
  aliases: [],
  usage: "[#channel] [reason]",
  description: "Hide a channel from @everyone.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "hide"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const targetChannel = (message.mentions.channels.first() as LockableChannel | undefined) ??
      (message.channel as LockableChannel);
    const reason = args.filter((a) => !a.startsWith("<#")).join(" ") || "No reason provided";

    const everyone = getEveryoneRole(message.guild);
    await targetChannel.permissionOverwrites.edit(everyone, {
      ViewChannel: false,
    }, { reason: `Hidden by ${message.author.tag} — ${reason}` });

    const vars = {
      channel: `<#${targetChannel.id}>`,
      "channel.mention": `<#${targetChannel.id}>`,
      reason,
      mod: message.author.tag,
    };

    await message.reply(buildPayload(msgs.hide_success, vars, `🙈 <#${targetChannel.id}> is now hidden from @everyone.`));
  },
};

// !unhide [#channel] — make channel visible again
export const unhideCmd: Command = {
  name: "unhide",
  aliases: [],
  usage: "[#channel]",
  description: "Make a hidden channel visible again for @everyone.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "unhide"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const targetChannel = (message.mentions.channels.first() as LockableChannel | undefined) ??
      (message.channel as LockableChannel);

    const everyone = getEveryoneRole(message.guild);
    await targetChannel.permissionOverwrites.edit(everyone, {
      ViewChannel: null,
    }, { reason: `Unhidden by ${message.author.tag}` });

    const vars = {
      channel: `<#${targetChannel.id}>`,
      "channel.mention": `<#${targetChannel.id}>`,
      mod: message.author.tag,
    };

    await message.reply(buildPayload(msgs.unhide_success, vars, `👁️ <#${targetChannel.id}> is now visible to @everyone.`));
  },
};

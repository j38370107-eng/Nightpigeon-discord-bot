import { Client, Message } from "discord.js";
import type { Command } from "../types";
import { resolveTarget, getArgs } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getCachedConfig } from "../../store/guildConfig";
import { buildPayload } from "../../lib/msgTemplate";
import { dbGet, dbSet } from "../../store/db";
import { addCase } from "../../lib/cases";
import { sendModLog } from "../../lib/modlog";

const STORE = "nick_locks";

interface NickLockEntry {
  lockedNick: string;
  modId: string;
  lockedAt: number;
}

type GuildNickLocks = Record<string, NickLockEntry>;

async function loadLocks(guildId: string): Promise<GuildNickLocks> {
  return (await dbGet<GuildNickLocks>(STORE, guildId)) ?? {};
}

async function saveLocks(guildId: string, locks: GuildNickLocks): Promise<void> {
  await dbSet(STORE, guildId, locks);
}

// !nick @user <new nickname> — set nickname
export const nickCmd: Command = {
  name: "nick",
  aliases: [],
  usage: "@user <nickname>",
  description: "Set a member's nickname.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "nick"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));
    if (!target.member) return void message.reply(buildPayload(msgs.err_not_in_server, {}, "❌ That user is not in this server."));
    if (!target.member.manageable) return void message.reply(buildPayload(msgs.err_nick_cannot_manage, {}, "❌ I cannot manage that member's nickname."));

    const newNick = getArgs(message, args).join(" ").slice(0, 32);
    if (!newNick) return void message.reply(buildPayload(msgs.err_nick_required, {}, "❌ Please provide a nickname."));

    await target.member.setNickname(newNick, `Changed by ${message.author.tag}`);

    const caseRecord = await addCase(message.guild.id, {
      action: "Nick Change",
      userId: target.user.id,
      userTag: target.user.tag,
      modId: message.author.id,
      modTag: message.author.tag,
      reason: `Nickname set to: ${newNick}`,
    });

    await sendModLog(client, message.guild.id, {
      action: "Nick Change",
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason: `Set to: ${newNick}`,
      color: 0x3498db,
      caseId: String(caseRecord.id),
    });

    const vars = {
      user: target.user.tag,
      "user.mention": `<@${target.user.id}>`,
      "user.id": target.user.id,
      mod: message.author.tag,
      nickname: newNick,
      case_id: caseRecord.id,
    };

    await message.reply(buildPayload(msgs.nick_success, vars, `✅ Nickname for **${target.user.tag}** set to **${newNick}**.`));
  },
};

// !resetnick @user — reset nickname to username
export const resetnickCmd: Command = {
  name: "resetnick",
  aliases: [],
  usage: "@user",
  description: "Reset a member's nickname to their username.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "resetnick"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));
    if (!target.member) return void message.reply(buildPayload(msgs.err_not_in_server, {}, "❌ That user is not in this server."));
    if (!target.member.manageable) return void message.reply(buildPayload(msgs.err_nick_cannot_manage, {}, "❌ I cannot manage that member's nickname."));

    await target.member.setNickname(null, `Reset by ${message.author.tag}`);

    await sendModLog(client, message.guild.id, {
      action: "Nick Reset",
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason: "Nickname reset to username",
      color: 0x3498db,
    });

    const vars = {
      user: target.user.tag,
      "user.mention": `<@${target.user.id}>`,
      "user.id": target.user.id,
      mod: message.author.tag,
    };

    await message.reply(buildPayload(msgs.resetnick_success, vars, `✅ Nickname for **${target.user.tag}** has been reset.`));
  },
};

// !locknick @user [nickname] — lock a user's nickname
export const locknickCmd: Command = {
  name: "locknick",
  aliases: [],
  usage: "@user [nickname]",
  description: "Lock a member's nickname so they cannot change it.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "locknick"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));
    if (!target.member) return void message.reply(buildPayload(msgs.err_not_in_server, {}, "❌ That user is not in this server."));
    if (!target.member.manageable) return void message.reply(buildPayload(msgs.err_nick_cannot_manage, {}, "❌ I cannot manage that member's nickname."));

    const remainingArgs = getArgs(message, args);
    const lockedNick = remainingArgs.join(" ").slice(0, 32) || (target.member.nickname ?? target.user.username);

    if (lockedNick !== target.member.nickname) {
      await target.member.setNickname(lockedNick, `Nick locked by ${message.author.tag}`);
    }

    const locks = await loadLocks(message.guild.id);
    locks[target.user.id] = {
      lockedNick,
      modId: message.author.id,
      lockedAt: Date.now(),
    };
    await saveLocks(message.guild.id, locks);

    const vars = {
      user: target.user.tag,
      "user.mention": `<@${target.user.id}>`,
      "user.id": target.user.id,
      mod: message.author.tag,
      nickname: lockedNick,
    };

    await message.reply(buildPayload(msgs.locknick_success, vars, `🔒 Nickname for **${target.user.tag}** locked to **${lockedNick}**.`));
  },
};

// !unlocknick @user — remove nickname lock
export const unlocknickCmd: Command = {
  name: "unlocknick",
  aliases: [],
  usage: "@user",
  description: "Remove a nickname lock from a member.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "unlocknick"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));

    const locks = await loadLocks(message.guild.id);
    if (!locks[target.user.id]) {
      return void message.reply(
        buildPayload(msgs.err_nick_no_lock, { user: target.user.tag, "user.id": target.user.id }, `❌ **${target.user.tag}** does not have a locked nickname.`)
      );
    }

    delete locks[target.user.id];
    await saveLocks(message.guild.id, locks);

    const vars = {
      user: target.user.tag,
      "user.mention": `<@${target.user.id}>`,
      "user.id": target.user.id,
      mod: message.author.tag,
    };

    await message.reply(buildPayload(msgs.unlocknick_success, vars, `🔓 Nickname lock removed for **${target.user.tag}**.`));
  },
};

// Export nickname lock check utility for use in other modules (e.g. guildMemberUpdate)
export { loadLocks };

import { Client, EmbedBuilder, Message, TextChannel } from "discord.js";
import type { Command } from "../types";
import { resolveTarget, getArgs } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getCachedConfig } from "../../store/guildConfig";
import { addCase } from "../../lib/cases";
import { buildPayload } from "../../lib/msgTemplate";
import { sendDmNotification } from "../../lib/dmNotify";
import { sendModLog } from "../../lib/modlog";
import { getExecutorMember, isHierarchyBlocked } from "../../lib/hierarchy";
import { getMemberLevel } from "../../lib/yamlLevels";
import { parseDuration, formatDuration } from "../../lib/parseDuration";

function resolveReason(guildId: string, rawReason: string): string {
  if (!rawReason) return "No reason provided";
  const presets = getCachedConfig(guildId).plugins.preset_reasons?.config?.presets ?? {};
  return presets[rawReason] ?? rawReason;
}

// !tempban @user <duration> [reason] — ban requiring a duration
export const tempbanCmd: Command = {
  name: "tempban",
  aliases: [],
  usage: "@user <duration> [reason]",
  description: "Temporarily ban a member. Duration is required (e.g. 7d).",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "tempban"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply("❌ Could not find that user.");
    if (target.user.id === message.author.id) return void message.reply("❌ You cannot ban yourself.");

    if (target.member) {
      if (!target.member.bannable) return void message.reply("❌ I cannot ban that member.");
      const executor = await getExecutorMember(message);
      if (executor && isHierarchyBlocked(executor, target.member, getMemberLevel(executor), getMemberLevel(target.member))) {
        return void message.reply("❌ You cannot ban someone with an equal or higher level.");
      }
    }

    const remaining = getArgs(message, args);
    const durationMs = remaining[0] ? parseDuration(remaining[0]!) : null;
    if (!durationMs) return void message.reply("❌ Please provide a valid duration (e.g. `1d`, `12h`).");

    const durationLabel = formatDuration(durationMs);
    remaining.shift();
    const reason = resolveReason(message.guild.id, remaining.join(" "));
    const expiresAt = Date.now() + durationMs;

    const caseRecord = await addCase(message.guild.id, {
      action: `Temp Ban (${durationLabel})`,
      userId: target.user.id,
      userTag: target.user.tag,
      modId: message.author.id,
      modTag: message.author.tag,
      reason,
      duration: durationLabel,
      expiresAt,
    });

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    const vars = {
      user: target.user.tag,
      "user.mention": `<@${target.user.id}>`,
      "user.id": target.user.id,
      mod: message.author.tag,
      reason,
      duration: durationLabel,
      case_id: caseRecord.id,
      expires_at: `<t:${Math.floor(expiresAt / 1000)}:F>`,
      server: message.guild.name,
    };

    if ((cfg.plugins.moderation as any)?.dm_on_action !== false) {
      await sendDmNotification(
        target.user,
        { action: "Banned", guildName: message.guild.name, reason, caseId: String(caseRecord.id), duration: durationLabel, expiresAt },
        msgs.tempban_dm ?? msgs.ban_dm,
        vars
      );
    }

    const banDayDeleteTmp = (cfg.plugins.moderation as any)?.ban_day_delete;
    const deleteMessageSecondsTmp =
      typeof banDayDeleteTmp === "number" && banDayDeleteTmp > 0
        ? Math.min(Math.floor(banDayDeleteTmp), 7) * 86400
        : 0;
    await message.guild.members.ban(target.user.id, {
      reason: `[Case #${caseRecord.id}] ${reason}`,
      ...(deleteMessageSecondsTmp > 0 ? { deleteMessageSeconds: deleteMessageSecondsTmp } : {}),
    });

    setTimeout(async () => {
      await message.guild!.members.unban(target.user.id, "Temp ban expired").catch(() => {});
    }, durationMs);

    await sendModLog(client, message.guild.id, {
      action: `Temp Ban (${durationLabel})`,
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason,
      color: 0xe74c3c,
      caseId: String(caseRecord.id),
    });

    await message.channel.send(
      buildPayload(
        msgs.tempban_success ?? msgs.ban_success,
        vars,
        `🔨 **${target.user.tag}** has been temp banned for **${durationLabel}**. Case: #${caseRecord.id}`
      )
    );
  },
};

// !softban @user [reason] — ban + immediate unban to clear messages
export const softbanCmd: Command = {
  name: "softban",
  aliases: [],
  usage: "@user [reason]",
  description: "Softban a member (ban + immediate unban to delete recent messages).",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "softban"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply("❌ Could not find that user.");
    if (target.user.id === message.author.id) return void message.reply("❌ You cannot softban yourself.");

    if (target.member) {
      if (!target.member.bannable) return void message.reply("❌ I cannot ban that member.");
      const executor = await getExecutorMember(message);
      if (executor && isHierarchyBlocked(executor, target.member, getMemberLevel(executor), getMemberLevel(target.member))) {
        return void message.reply("❌ You cannot softban someone with an equal or higher level.");
      }
    }

    const reason = resolveReason(message.guild.id, getArgs(message, args).join(" "));

    const caseRecord = await addCase(message.guild.id, {
      action: "Softban",
      userId: target.user.id,
      userTag: target.user.tag,
      modId: message.author.id,
      modTag: message.author.tag,
      reason,
    });

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};
    const vars = {
      user: target.user.tag,
      "user.mention": `<@${target.user.id}>`,
      "user.id": target.user.id,
      mod: message.author.tag,
      reason,
      case_id: caseRecord.id,
      server: message.guild.name,
    };

    if ((cfg.plugins.moderation as any)?.dm_on_action !== false) {
      await sendDmNotification(
        target.user,
        { action: "Banned", guildName: message.guild.name, reason, caseId: String(caseRecord.id) },
        msgs.softban_dm ?? msgs.ban_dm,
        vars
      );
    }

    await message.guild.members.ban(target.user.id, {
      deleteMessageSeconds: 7 * 24 * 60 * 60,
      reason: `[Softban — Case #${caseRecord.id}] ${reason}`,
    });
    await message.guild.members.unban(target.user.id, "Softban — immediate unban").catch(() => {});

    await sendModLog(client, message.guild.id, {
      action: "Softban",
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason,
      color: 0xe67e22,
      caseId: String(caseRecord.id),
    });

    await message.channel.send(
      buildPayload(
        msgs.softban_success,
        vars,
        `🧹 **${target.user.tag}** has been softbanned (messages cleared). Case: #${caseRecord.id}`
      )
    );
  },
};

// !baninfo <user_id> — look up an active ban
export const baninfoCmd: Command = {
  name: "baninfo",
  aliases: [],
  usage: "<user_id>",
  description: "Show ban information for a user.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "baninfo"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const rawId = (args[0] ?? "").replace(/[<@!>]/g, "");
    if (!/^\d{15,20}$/.test(rawId)) return void message.reply("❌ Please provide a valid user ID.");

    try {
      const ban = await message.guild.bans.fetch(rawId);

      await (message.channel as TextChannel).send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("🔨 Ban Info")
            .setDescription(
              `**User:** ${ban.user.tag} (${ban.user.id})\n` +
              `**Reason:** ${ban.reason ?? "No reason provided"}`
            )
            .setTimestamp(),
        ],
      });
    } catch {
      return void message.reply("❌ That user is not banned in this server.");
    }
  },
};

// !banlist — list all bans
export const banlistCmd: Command = {
  name: "banlist",
  aliases: [],
  usage: "[page]",
  description: "List all banned users in this server.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "banlist"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const bans = await message.guild.bans.fetch();
    if (bans.size === 0) return void message.reply("✅ No bans in this server.");

    const page = Math.max(1, parseInt(args[0] ?? "1", 10) || 1);
    const perPage = 20;
    const banArr = [...bans.values()];
    const total = banArr.length;
    const totalPages = Math.ceil(total / perPage);
    const slice = banArr.slice((page - 1) * perPage, page * perPage);

    const lines = slice.map((b) => `• **${b.user.tag}** (${b.user.id}) — ${b.reason ?? "No reason"}`);

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle(`🔨 Ban List — ${total} bans (Page ${page}/${totalPages})`)
          .setDescription(lines.join("\n").slice(0, 4096) || "No bans.")
          .setFooter({ text: `Page ${page} of ${totalPages}` }),
      ],
    });
  },
};

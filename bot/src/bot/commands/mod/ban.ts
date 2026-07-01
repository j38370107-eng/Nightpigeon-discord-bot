import { Client, Message } from "discord.js";
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
import { checkEscalation } from "../../lib/escalation";

function resolveReason(guildId: string, rawReason: string): string {
  if (!rawReason) return "No reason provided";
  const presets = getCachedConfig(guildId).plugins.preset_reasons?.config?.presets ?? {};
  return presets[rawReason] ?? rawReason;
}

const banCmd: Command = {
  name: "ban",
  aliases: [],
  usage: "@user [duration] [reason]",
  description: "Ban a member. Include a duration (e.g. 7d) for a temp ban.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "ban"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply("❌ Could not find that user.");
    if (target.user.id === message.author.id) return void message.reply("❌ You cannot ban yourself.");
    if (target.user.id === client.user?.id) return void message.reply("❌ I cannot ban myself.");

    if (target.member) {
      if (!target.member.bannable) return void message.reply("❌ I cannot ban that member — they may have a higher role than me.");
      const executor = await getExecutorMember(message);
      if (executor && isHierarchyBlocked(executor, target.member, getMemberLevel(executor), getMemberLevel(target.member))) {
        return void message.reply("❌ You cannot ban someone with an equal or higher level.");
      }
    }

    const remaining = getArgs(message, args);
    let durationMs: number | null = null;
    let durationLabel = "Permanent";

    if (remaining[0]) {
      const parsed = parseDuration(remaining[0]!);
      if (parsed !== null) {
        durationMs = parsed;
        durationLabel = formatDuration(parsed);
        remaining.shift();
      }
    }

    const rawReason = remaining.join(" ");
    const reason = resolveReason(message.guild.id, rawReason);
    const expiresAt = durationMs ? Date.now() + durationMs : undefined;

    const caseRecord = await addCase(message.guild.id, {
      action: durationMs ? `Temp Ban (${durationLabel})` : "Ban",
      userId: target.user.id,
      userTag: target.user.tag,
      modId: message.author.id,
      modTag: message.author.tag,
      reason,
      duration: durationMs ? durationLabel : undefined,
      expiresAt,
    });

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    const vars = {
      user: target.user.tag,
      "user.mention": `<@${target.user.id}>`,
      "user.id": target.user.id,
      "user.name": target.user.username,
      mod: message.author.tag,
      "mod.mention": `<@${message.author.id}>`,
      reason,
      duration: durationLabel,
      case_id: caseRecord.id,
      expires_at: expiresAt ? `<t:${Math.floor(expiresAt / 1000)}:F>` : "Never",
      timestamp: new Date().toLocaleString(),
      server: message.guild.name,
    };

    if ((cfg.plugins.moderation as any)?.dm_on_action !== false) {
      await sendDmNotification(
        target.user,
        { action: "Banned", guildName: message.guild.name, reason, caseId: String(caseRecord.id), duration: durationLabel, expiresAt },
        durationMs ? msgs.tempban_dm ?? msgs.ban_dm : msgs.ban_dm,
        vars
      );
    }

    const banDayDelete = (cfg.plugins.moderation as any)?.ban_day_delete;
    const deleteMessageSeconds =
      typeof banDayDelete === "number" && banDayDelete > 0
        ? Math.min(Math.floor(banDayDelete), 7) * 86400
        : 0;
    await message.guild.members.ban(target.user.id, {
      reason: `[Case #${caseRecord.id}] ${reason}`,
      ...(deleteMessageSeconds > 0 ? { deleteMessageSeconds } : {}),
    });

    if (durationMs) {
      setTimeout(async () => {
        await message.guild!.members.unban(target.user.id, "Temp ban expired").catch(() => {});
      }, durationMs);
    }

    await sendModLog(client, message.guild.id, {
      action: durationMs ? `Temp Ban (${durationLabel})` : "Ban",
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason,
      color: 0xe74c3c,
      caseId: String(caseRecord.id),
    });

    await message.channel.send(
      buildPayload(
        msgs.ban_success,
        vars,
        `🔨 **${target.user.tag}** has been banned${durationMs ? ` for ${durationLabel}` : ""}. Case: #${caseRecord.id}`
      )
    );

    await checkEscalation(client, message.guild, target.user.id, target.user.tag, "ban", message.channel);
  },
};

export const forcebanCmd: Command = {
  name: "forceban",
  aliases: [],
  usage: "<user_id> [duration] [reason]",
  description: "Ban a user by ID — works even if they are not in the server.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "forceban"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }
    await banCmd.execute(message, args, client);
  },
};

export const unbanCmd: Command = {
  name: "unban",
  aliases: [],
  usage: "<user_id> [reason]",
  description: "Unban a user by ID.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "unban"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const rawId = (args[0] ?? "").replace(/[<@!>]/g, "");
    if (!/^\d{15,20}$/.test(rawId)) return void message.reply("❌ Please provide a valid user ID.");

    const reason = args.slice(1).join(" ") || "No reason provided";

    let userTag = rawId;
    try {
      const u = await message.client.users.fetch(rawId);
      userTag = u.tag;
    } catch { /* unknown user */ }

    await message.guild.members.unban(rawId, reason).catch(() => {
      throw new Error("Could not unban — user may not be banned.");
    });

    const caseRecord = await addCase(message.guild.id, {
      action: "Unban",
      userId: rawId,
      userTag,
      modId: message.author.id,
      modTag: message.author.tag,
      reason,
    });

    await sendModLog(client, message.guild.id, {
      action: "Unban",
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: userTag, id: rawId },
      reason,
      color: 0x2ecc71,
      caseId: String(caseRecord.id),
    });

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};
    const vars = {
      user: userTag,
      "user.mention": `<@${rawId}>`,
      "user.id": rawId,
      mod: message.author.tag,
      reason,
      case_id: caseRecord.id,
    };

    await message.channel.send(
      buildPayload(msgs.unban_success, vars, `✅ **${userTag}** has been unbanned. Case: #${caseRecord.id}`)
    );
  },
};

export default banCmd;

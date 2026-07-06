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
import { checkPunishmentEscalation } from "../../lib/punishmentEscalation";
import { checkEscalation } from "../../lib/escalation";

function resolveReason(guildId: string, rawReason: string): string {
  if (!rawReason) return "No reason provided";
  const presets = getCachedConfig(guildId).plugins.preset_reasons?.config?.presets ?? {};
  return presets[rawReason] ?? rawReason;
}

const warnCmd: Command = {
  name: "warn",
  aliases: [],
  usage: "@user [reason]",
  description: "Warn a member.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "warn"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));
    if (target.user.id === message.author.id) return void message.reply(buildPayload(msgs.err_cannot_warn_self, {}, "❌ You cannot warn yourself."));
    if (target.user.bot) return void message.reply(buildPayload(msgs.err_cannot_warn_bot, {}, "❌ You cannot warn a bot."));

    if (target.member) {
      const executor = await getExecutorMember(message);
      if (executor && isHierarchyBlocked(executor, target.member, getMemberLevel(executor), getMemberLevel(target.member))) {
        return void message.reply(buildPayload(msgs.err_hierarchy, {}, "❌ You cannot warn someone with an equal or higher role."));
      }
    }

    const rawReason = getArgs(message, args).join(" ");
    const reason = resolveReason(message.guild.id, rawReason);

    const caseRecord = await addCase(message.guild.id, {
      action: "Warn",
      userId: target.user.id,
      userTag: target.user.tag,
      modId: message.author.id,
      modTag: message.author.tag,
      reason,
    });

    const vars = {
      user: target.user.tag,
      "user.mention": `<@${target.user.id}>`,
      "user.id": target.user.id,
      "user.name": target.user.username,
      mod: message.author.tag,
      "mod.mention": `<@${message.author.id}>`,
      reason,
      case_id: caseRecord.id,
      timestamp: new Date().toLocaleString(),
      server: message.guild.name,
    };

    if ((cfg.plugins.moderation as any)?.dm_on_action !== false) {
      await sendDmNotification(
        target.user,
        { action: "Warned", guildName: message.guild.name, reason, caseId: String(caseRecord.id) },
        msgs.warn_dm,
        vars
      );
    }

    await sendModLog(client, message.guild.id, {
      action: "Warn",
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason,
      color: 0xf1c40f,
      caseId: String(caseRecord.id),
    });

    await message.channel.send(
      buildPayload(msgs.warn_success, vars, `⚠️ **${target.user.tag}** has been warned. Case: #${caseRecord.id}`)
    );

    await checkPunishmentEscalation(client, message.guild, target.user.id, target.user.tag, caseRecord.id, message.author.id);
    await checkEscalation(client, message.guild, target.user.id, target.user.tag, "warn", message.channel as any);
  },
};

export const forcewarnCmd: Command = {
  name: "forcewarn",
  aliases: [],
  usage: "<user_id> [reason]",
  description: "Warn a user by ID (works even if not in server).",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};
    if (!(await checkYamlLevelAsync(message, "forcewarn"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }
    await warnCmd.execute(message, args, client);
  },
};

export default warnCmd;

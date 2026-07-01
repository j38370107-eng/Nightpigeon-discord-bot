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
import { checkEscalation } from "../../lib/escalation";

function resolveReason(guildId: string, rawReason: string): string {
  if (!rawReason) return "No reason provided";
  const presets = getCachedConfig(guildId).plugins.preset_reasons?.config?.presets ?? {};
  return presets[rawReason] ?? rawReason;
}

const kickCmd: Command = {
  name: "kick",
  aliases: [],
  usage: "@user [reason]",
  description: "Kick a member from the server.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "kick"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply("❌ Could not find that user.");
    if (!target.member) return void message.reply("❌ That user is not in this server.");
    if (!target.member.kickable) return void message.reply("❌ I cannot kick that member — they may have a higher role than me.");
    if (target.user.id === message.author.id) return void message.reply("❌ You cannot kick yourself.");

    const executor = await getExecutorMember(message);
    if (executor && isHierarchyBlocked(executor, target.member, getMemberLevel(executor), getMemberLevel(target.member))) {
      return void message.reply("❌ You cannot kick someone with an equal or higher role.");
    }

    const rawReason = getArgs(message, args).join(" ");
    const reason = resolveReason(message.guild.id, rawReason);

    const caseRecord = await addCase(message.guild.id, {
      action: "Kick",
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
        { action: "Kicked", guildName: message.guild.name, reason, caseId: String(caseRecord.id) },
        msgs.kick_dm,
        vars
      );
    }

    await target.member.kick(reason);

    await sendModLog(client, message.guild.id, {
      action: "Kick",
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason,
      color: 0xe67e22,
      caseId: String(caseRecord.id),
    });

    await message.channel.send(
      buildPayload(msgs.kick_success, vars, `👢 **${target.user.tag}** has been kicked. Case: #${caseRecord.id}`)
    );

    await checkEscalation(client, message.guild, target.user.id, target.user.tag, "kick", message.channel);
  },
};

export default kickCmd;

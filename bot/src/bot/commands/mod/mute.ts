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
import { recordActiveMute, clearActiveMute, getActiveMute, restoreStrippedRoles } from "../../store/activeMuteRoles";
import { getMuteConfig } from "../../store/muteConfig";

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function resolveReason(guildId: string, rawReason: string): string {
  if (!rawReason) return "No reason provided";
  const presets = getCachedConfig(guildId).plugins.preset_reasons?.config?.presets ?? {};
  return presets[rawReason] ?? rawReason;
}

const muteCmd: Command = {
  name: "mute",
  aliases: [],
  usage: "@user [duration] [reason]",
  description: "Mute a member. Uses mute_role if configured, otherwise Discord timeout.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "mute"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));
    if (!target.member) return void message.reply(buildPayload(msgs.err_not_in_server, {}, "❌ That user is not in this server."));
    if (target.user.id === message.author.id) return void message.reply(buildPayload(msgs.err_cannot_mute_self, {}, "❌ You cannot mute yourself."));
    if (!target.member.moderatable) return void message.reply(buildPayload(msgs.err_bot_cannot_mute, {}, "❌ I cannot mute that member — they may have a higher role than me."));

    const executor = await getExecutorMember(message);
    if (executor && isHierarchyBlocked(executor, target.member, getMemberLevel(executor), getMemberLevel(target.member))) {
      return void message.reply(buildPayload(msgs.err_hierarchy, {}, "❌ You cannot mute someone with an equal or higher role."));
    }

    const remaining = getArgs(message, args);
    let durationMs: number | null = null;
    let durationLabel = "Indefinite";

    if (remaining[0]) {
      const parsed = parseDuration(remaining[0]!);
      if (parsed !== null) {
        durationMs = Math.min(parsed, MAX_TIMEOUT_MS);
        durationLabel = formatDuration(durationMs);
        remaining.shift();
      }
    }

    const rawReason = remaining.join(" ");
    const reason = resolveReason(message.guild.id, rawReason);
    const expiresAt = durationMs ? Date.now() + durationMs : undefined;

    const muteCfg = getMuteConfig(message.guild.id);

    if (muteCfg.mode === "role" && muteCfg.muteRoleId) {
      const muteRole = message.guild.roles.cache.get(muteCfg.muteRoleId);
      if (muteRole) {
        let strippedRoles: string[] | undefined;
        if (muteCfg.stripRoles) {
          strippedRoles = target.member.roles.cache
            .filter((r) => r.id !== message.guild!.id && r.id !== muteRole.id)
            .map((r) => r.id);
          await target.member.roles.set([muteRole.id], reason);
        } else {
          await target.member.roles.add(muteRole, reason);
        }
        await recordActiveMute(message.guild.id, target.user.id, muteRole.id, expiresAt, strippedRoles).catch(() => {});
      } else {
        await target.member.timeout(durationMs ?? MAX_TIMEOUT_MS, reason);
      }
    } else {
      await target.member.timeout(durationMs ?? MAX_TIMEOUT_MS, reason);
    }

    const caseRecord = await addCase(message.guild.id, {
      action: `Mute${durationMs ? ` (${durationLabel})` : ""}`,
      userId: target.user.id,
      userTag: target.user.tag,
      modId: message.author.id,
      modTag: message.author.tag,
      reason,
      duration: durationMs ? durationLabel : undefined,
      expiresAt,
    });

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
      server: message.guild.name,
    };

    if ((cfg.plugins.moderation as any)?.dm_on_action !== false) {
      await sendDmNotification(
        target.user,
        { action: "Muted", guildName: message.guild.name, reason, caseId: String(caseRecord.id), duration: durationLabel, expiresAt },
        msgs.mute_dm,
        vars
      );
    }

    await sendModLog(client, message.guild.id, {
      action: `Mute${durationMs ? ` (${durationLabel})` : ""}`,
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason,
      color: 0xf39c12,
      caseId: String(caseRecord.id),
    });

    await message.channel.send(
      buildPayload(
        msgs.mute_success,
        vars,
        `🔇 **${target.user.tag}** has been muted${durationMs ? ` for ${durationLabel}` : ""}. Case: #${caseRecord.id}`
      )
    );

    await checkEscalation(client, message.guild, target.user.id, target.user.tag, "mute", message.channel);
  },
};

export const unmuteCmd: Command = {
  name: "unmute",
  aliases: [],
  usage: "@user [reason]",
  description: "Unmute a member.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "unmute"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));
    if (!target.member) return void message.reply(buildPayload(msgs.err_not_in_server, {}, "❌ That user is not in this server."));

    const rawReason = getArgs(message, args).join(" ");
    const reason = rawReason || "No reason provided";

    const muteCfg = getMuteConfig(message.guild.id);

    if (muteCfg.mode === "role" && muteCfg.muteRoleId) {
      const activeMute = getActiveMute(message.guild.id, target.user.id);
      await target.member.roles.remove(muteCfg.muteRoleId, reason).catch(() => {});
      if (activeMute) {
        await restoreStrippedRoles(target.member, activeMute);
      }
      await clearActiveMute(message.guild.id, target.user.id).catch(() => {});
    } else {
      await target.member.timeout(null, reason);
    }

    const caseRecord = await addCase(message.guild.id, {
      action: "Unmute",
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
      mod: message.author.tag,
      "mod.mention": `<@${message.author.id}>`,
      reason,
      case_id: caseRecord.id,
    };

    if ((cfg.plugins.moderation as any)?.dm_on_action !== false) {
      await sendDmNotification(
        target.user,
        { action: "Unmuted", guildName: message.guild.name, reason, caseId: String(caseRecord.id) },
        msgs.unmute_dm,
        vars
      );
    }

    await sendModLog(client, message.guild.id, {
      action: "Unmute",
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason,
      color: 0x2ecc71,
      caseId: String(caseRecord.id),
    });

    await message.channel.send(
      buildPayload(msgs.unmute_success, vars, `🔊 **${target.user.tag}** has been unmuted. Case: #${caseRecord.id}`)
    );
  },
};

export const forceMuteCmd: Command = {
  name: "forcemute",
  aliases: [],
  usage: "<user_id> [duration] [reason]",
  description: "Mute a user by ID.",
  async execute(message: Message, args: string[], client: Client) {
    const cfg = getCachedConfig(message.guild?.id ?? "");
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};
    if (!(await checkYamlLevelAsync(message, "forcemute"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }
    await muteCmd.execute(message, args, client);
  },
};

export const forceUnmuteCmd: Command = {
  name: "forceunmute",
  aliases: [],
  usage: "<user_id> [reason]",
  description: "Unmute a user by ID.",
  async execute(message: Message, args: string[], client: Client) {
    const cfg = getCachedConfig(message.guild?.id ?? "");
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};
    if (!(await checkYamlLevelAsync(message, "forceunmute"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }
    await unmuteCmd.execute(message, args, client);
  },
};

export default muteCmd;

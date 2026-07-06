import { Client, EmbedBuilder, Message } from "discord.js";
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
import { recordActiveMute } from "../../store/activeMuteRoles";
import { getMuteConfig } from "../../store/muteConfig";

function resolveReason(guildId: string, rawReason: string): string {
  if (!rawReason) return "No reason provided";
  const presets = getCachedConfig(guildId).plugins.preset_reasons?.config?.presets ?? {};
  return presets[rawReason] ?? rawReason;
}

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

// !tempmute @user <duration> [reason] — mute requiring a duration
export const tempmuteCmd: Command = {
  name: "tempmute",
  aliases: [],
  usage: "@user <duration> [reason]",
  description: "Temporarily mute a member. Duration is required (e.g. 1h).",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "tempmute"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));
    if (!target.member) return void message.reply(buildPayload(msgs.err_not_in_server, {}, "❌ That user is not in this server."));
    if (target.user.id === message.author.id) return void message.reply(buildPayload(msgs.err_cannot_mute_self, {}, "❌ You cannot mute yourself."));
    if (!target.member.moderatable) return void message.reply(buildPayload(msgs.err_bot_cannot_mute, {}, "❌ I cannot mute that member."));

    const executor = await getExecutorMember(message);
    if (executor && isHierarchyBlocked(executor, target.member, getMemberLevel(executor), getMemberLevel(target.member))) {
      return void message.reply(buildPayload(msgs.err_hierarchy, {}, "❌ You cannot mute someone with an equal or higher role."));
    }

    const remaining = getArgs(message, args);
    const durationMs = remaining[0] ? parseDuration(remaining[0]!) : null;
    if (!durationMs) return void message.reply(buildPayload(msgs.err_invalid_duration, {}, "❌ Please provide a valid duration (e.g. `30m`, `2h`)."));

    const durationLabel = formatDuration(Math.min(durationMs, MAX_TIMEOUT_MS));
    remaining.shift();
    const reason = resolveReason(message.guild.id, remaining.join(" "));
    const expiresAt = Date.now() + durationMs;

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
        await target.member.timeout(Math.min(durationMs, MAX_TIMEOUT_MS), reason);
      }
    } else {
      await target.member.timeout(Math.min(durationMs, MAX_TIMEOUT_MS), reason);
    }

    const caseRecord = await addCase(message.guild.id, {
      action: `Mute (${durationLabel})`,
      userId: target.user.id,
      userTag: target.user.tag,
      modId: message.author.id,
      modTag: message.author.tag,
      reason,
      duration: durationLabel,
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
      expires_at: `<t:${Math.floor(expiresAt / 1000)}:F>`,
      server: message.guild.name,
    };

    if ((cfg.plugins.moderation as any)?.dm_on_action !== false) {
      await sendDmNotification(
        target.user,
        { action: "Muted", guildName: message.guild.name, reason, caseId: String(caseRecord.id), duration: durationLabel, expiresAt },
        msgs.tempmute_dm ?? msgs.mute_dm,
        vars
      );
    }

    await sendModLog(client, message.guild.id, {
      action: `Mute (${durationLabel})`,
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason,
      color: 0xf39c12,
      caseId: String(caseRecord.id),
    });

    await message.channel.send(
      buildPayload(
        msgs.tempmute_success ?? msgs.mute_success,
        vars,
        `🔇 **${target.user.tag}** has been muted for **${durationLabel}**. Case: #${caseRecord.id}`
      )
    );
  },
};

// !muteinfo @user — show mute status for a user
export const muteinfoCmd: Command = {
  name: "muteinfo",
  aliases: [],
  usage: "@user",
  description: "Show mute status for a member.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};
    if (!(await checkYamlLevelAsync(message, "muteinfo"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));
    if (!target.member) return void message.reply(buildPayload(msgs.err_not_in_server, {}, "❌ That user is not in this server."));

    const muteRole = (cfg.plugins.moderation as any)?.mute_role as string | null | undefined;

    let isMuted = false;
    let mutedUntil: string | null = null;

    if (muteRole) {
      isMuted = target.member.roles.cache.has(muteRole);
    } else {
      const timeout = target.member.communicationDisabledUntil;
      if (timeout && timeout > new Date()) {
        isMuted = true;
        mutedUntil = `<t:${Math.floor(timeout.getTime() / 1000)}:F>`;
      }
    }

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(isMuted ? 0xf39c12 : 0x2ecc71)
          .setTitle(`🔇 Mute Info — ${target.user.tag}`)
          .setThumbnail(target.user.displayAvatarURL({ size: 64 }))
          .setDescription(
            isMuted
              ? `**Status:** Currently muted\n${mutedUntil ? `**Until:** ${mutedUntil}` : "**Method:** Mute role"}`
              : "**Status:** Not muted"
          )
          .setTimestamp(),
      ],
    });
  },
};

// !mutelist — list all muted members
export const mutelistCmd: Command = {
  name: "mutelist",
  aliases: [],
  usage: "",
  description: "List all currently muted members.",
  async execute(message: Message, _args: string[], _client: Client) {
    if (!message.guild) return;
    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};
    if (!(await checkYamlLevelAsync(message, "mutelist"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const muteRole = (cfg.plugins.moderation as any)?.mute_role as string | null | undefined;

    await message.guild.members.fetch();
    const members = message.guild.members.cache;

    let muted: Array<{ tag: string; id: string; until?: string }> = [];

    if (muteRole) {
      members.forEach((m) => {
        if (m.roles.cache.has(muteRole!)) {
          muted.push({ tag: m.user.tag, id: m.id });
        }
      });
    } else {
      const now = new Date();
      members.forEach((m) => {
        const timeout = m.communicationDisabledUntil;
        if (timeout && timeout > now) {
          muted.push({
            tag: m.user.tag,
            id: m.id,
            until: `<t:${Math.floor(timeout.getTime() / 1000)}:R>`,
          });
        }
      });
    }

    const modCfg = getCachedConfig(message.guild.id);
    const modMsgs = (modCfg.plugins.moderation as any)?.messages ?? {};
    if (muted.length === 0) return void message.reply(buildPayload(modMsgs.mutelist_empty, {}, "✅ No muted members."));

    const lines = muted.map(
      (m) => `• **${m.tag}** (${m.id})${m.until ? ` — expires ${m.until}` : ""}`
    );

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf39c12)
          .setTitle(`🔇 Muted Members (${muted.length})`)
          .setDescription(lines.join("\n").slice(0, 4096)),
      ],
    });
  },
};

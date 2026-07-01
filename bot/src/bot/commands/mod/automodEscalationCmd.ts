/**
 * !automod-escalation — Automod Escalation management commands
 *
 * Subcommands:
 *   !automod-escalation check @user         — per-group violation count, step, next threshold, expiry
 *   !automod-escalation reset @user [group] [reason] — clear violations for one group or all
 *   !automod-escalation history @user       — paginated violation history
 */

import { Client, EmbedBuilder, Message } from "discord.js";
import type { Command } from "../types";
import { resolveTarget } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { sendModLog } from "../../lib/modlog";
import { getGuildConfig } from "../../store/guildConfig";
import {
  getAutomodViolationState,
  getAutomodViolationHistory,
  resetAutomodEscalation,
} from "../../lib/automodEscalation";

function formatMs(ms: number | null): string {
  if (!ms) return "Permanent";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m || 1}m`;
}

const automodEscalationCmd: Command = {
  name: "automod-escalation",
  aliases: [],
  usage: "check|reset|history @user [group] [reason]",
  description: "Manage automod escalation for a user.",

  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "automod-escalation"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const sub = (args[0] ?? "").toLowerCase();
    if (!["check", "reset", "history"].includes(sub)) {
      return void message.reply(
        `❌ Unknown subcommand. Usage: \`!automod-escalation check|reset|history @user\``,
      );
    }

    const targetArgs = args.slice(1);
    const target = await resolveTarget(message, targetArgs);
    if (!target) return void message.reply("❌ Could not find that user.");

    const guildId = message.guild.id;
    const userId = target.user.id;
    const userTag = target.user.tag;

    const cfg = await getGuildConfig(guildId);
    const escalCfg = (cfg as any).automod_escalation?.config;

    // check
    if (sub === "check") {
      const groups: Record<string, any> = escalCfg?.groups ?? {};
      const violationState = await getAutomodViolationState(guildId, userId);

      if (!escalCfg) {
        return void message.reply("⚠️ `automod_escalation` is not configured in this server's YAML.");
      }

      const lines: string[] = [`**User:** <@${userId}> (${userTag})`, ""];

      const groupNames = Object.keys(groups);
      if (!groupNames.length) {
        lines.push("_No groups configured._");
      } else {
        for (const [gn, gc] of Object.entries(groups)) {
          const state = violationState[gn];
          const count = state?.count ?? 0;
          const displayName = String(gc.name ?? gn);
          const steps: any[] = Array.isArray(gc.steps) ? gc.steps : [];

          // Current and next step
          const currentStep =
            [...steps].reverse().find((s: any) => Number(s.violations) <= count) ?? null;
          const nextStep =
            steps.find((s: any) => Number(s.violations) > count) ?? null;

          const expiryStr: string | undefined = gc.violation_expiry ?? escalCfg.global?.violation_expiry;

          lines.push(`**${displayName}** (\`${gn}\`)`);
          lines.push(`› Violations: **${count}** · Rules: \`${(gc.rules ?? []).join(", ")}\``);

          if (expiryStr) lines.push(`› Violation expiry: ${expiryStr}`);

          if (state?.oldestExpiresAt) {
            lines.push(`› Oldest violation expires: <t:${Math.floor(state.oldestExpiresAt / 1000)}:R>`);
          }

          lines.push(
            `› Current step: ${currentStep ? `${currentStep.violations} violations → \`${currentStep.action}\`` : "None"}`,
            `› Next threshold: ${nextStep ? `${nextStep.violations} violations → \`${nextStep.action}\`` : "None (max reached)"}`,
            "",
          );
        }
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📊 Automod Escalation — ${userTag}`)
        .setDescription(lines.join("\n").slice(0, 4_000))
        .setTimestamp();

      return void message.channel.send({ embeds: [embed] });
    }

    // reset
    if (sub === "reset") {
      // !automod-escalation reset @user [group] [reason]
      const restArgs = targetArgs.slice(message.mentions.users.size > 0 ? 1 : 1);

      // Try to match first arg to a known group name
      const groups: Record<string, any> = escalCfg?.groups ?? {};
      const knownGroups = Object.keys(groups);
      let groupArg: string | undefined;
      let reasonParts: string[];

      if (restArgs[0] && knownGroups.includes(restArgs[0])) {
        groupArg = restArgs[0];
        reasonParts = restArgs.slice(1);
      } else {
        groupArg = undefined;
        reasonParts = restArgs;
      }

      const reason = reasonParts.join(" ") || "Manual reset";
      const { violations, steps: stepsCleared } = await resetAutomodEscalation(
        guildId, userId, groupArg,
      );

      await sendModLog(client, guildId, {
        action: `⚡ AutoMod Escalation Reset${groupArg ? ` [${groupArg}]` : ""}`,
        executor: { tag: message.author.tag, id: message.author.id },
        target: { tag: userTag, id: userId },
        reason,
        color: 0x57f287,
      });

      const logChId = escalCfg?.logging?.channel ?? escalCfg?.global?.log_channel;
      if (logChId) {
        try {
          const ch = await client.channels.fetch(logChId) as any;
          if (ch && "send" in ch) {
            const logMsg = escalCfg?.logging?.messages?.escalation_reset ?? {};
            const embed = new EmbedBuilder()
              .setColor(parseInt(String(logMsg.color ?? "57F287"), 16))
              .setTitle(String(logMsg.title ?? "📉 Automod Escalation Reset"))
              .setDescription(
                logMsg.description
                  ? String(logMsg.description)
                      .replace(/\{userMention\}/g, `<@${userId}>`)
                      .replace(/\{userId\}/g, userId)
                      .replace(/\{moderator\}/g, message.author.tag)
                      .replace(/\{reason\}/g, reason)
                      .replace(/\{violations\}/g, String(violations))
                  : `**User:** <@${userId}> (\`${userId}\`)\n**Group:** ${groupArg ?? "all"}\n**Reset by:** ${message.author.tag}\n**Reason:** ${reason}\n**Violations cleared:** ${violations}`,
              )
              .setTimestamp();
            await ch.send({ embeds: [embed] }).catch(() => {});
          }
        } catch { /* ignore */ }
      }

      return void message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setDescription(
              `✅ Automod escalation reset for **${userTag}**${groupArg ? ` (group: \`${groupArg}\`)` : " (all groups)"}.\n` +
              `Violations cleared: **${violations}** · Steps cleared: **${stepsCleared}**\n**Reason:** ${reason}`,
            )
            .setTimestamp(),
        ],
      });
    }

    // history
    if (sub === "history") {
      const history = await getAutomodViolationHistory(guildId, userId);

      if (!history.length) {
        return void message.reply(`📋 No automod violations found for **${userTag}**.`);
      }

      const lines = history.map((v) => {
        const createdTs = Math.floor(v.created_at / 1000);
        const expiryTs = v.expires_at ? Math.floor(v.expires_at / 1000) : null;
        const status = v.active ? "✅" : "❌";
        const expiry = expiryTs
          ? v.active
            ? ` · expires <t:${expiryTs}:R>`
            : ` · expired <t:${expiryTs}:R>`
          : "";
        return `${status} **#${v.id}** · \`${v.group_name}\` · rule: \`${v.rule_name}\` · <t:${createdTs}:R>${expiry}`;
      });

      const chunks: string[][] = [];
      let cur: string[] = [];
      let len = 0;
      for (const line of lines) {
        if (len + line.length + 1 > 3_800) { chunks.push(cur); cur = []; len = 0; }
        cur.push(line); len += line.length + 1;
      }
      if (cur.length) chunks.push(cur);

      for (let i = 0; i < chunks.length; i++) {
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(
            i === 0
              ? `📋 Automod violation history — ${userTag} (${history.length})`
              : `📋 Automod violation history — ${userTag} (cont.)`,
          )
          .setDescription(chunks[i]!.join("\n"))
          .setTimestamp();
        await message.channel.send({ embeds: [embed] });
      }
    }
  },
};

export default automodEscalationCmd;

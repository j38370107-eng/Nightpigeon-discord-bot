/**
 * !escalation — Punishment Escalation management commands
 *
 * Subcommands:
 *   !escalation check @user    — warning count, active warnings list, step status, next threshold, time until next expires
 *   !escalation reset @user [reason] — force-expire all active warnings + clear step execution history
 *   !escalation history @user  — paginated list of all warn cases (active + expired) pulled from mod cases
 */

import { Client, EmbedBuilder, Message } from "discord.js";
import type { Command } from "../types";
import { resolveTarget } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getCasesForUser } from "../../lib/cases";
import { forceExpireWarnCases } from "../../lib/cases";
import { sendModLog } from "../../lib/modlog";
import { getGuildConfig } from "../../store/guildConfig";
import { parseDuration } from "../../lib/parseDuration";
import {
  countActiveWarnings,
  resetPunishmentEscalation,
  getEscalationExecutions,
} from "../../lib/punishmentEscalation";

function formatMs(ms: number | null): string {
  if (!ms) return "Permanent";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m || 1}m`;
}

const escalationCmd: Command = {
  name: "escalation",
  aliases: [],
  usage: "check|reset|history @user [args]",
  description: "Manage punishment escalation for a user.",

  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "escalation"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const sub = (args[0] ?? "").toLowerCase();
    if (!["check", "reset", "history"].includes(sub)) {
      return void message.reply(
        `❌ Unknown subcommand. Usage: \`!escalation check|reset|history @user\``,
      );
    }

    const targetArgs = args.slice(1);
    const target = await resolveTarget(message, targetArgs);
    if (!target) return void message.reply("❌ Could not find that user.");

    const guildId = message.guild.id;
    const userId = target.user.id;
    const userTag = target.user.tag;

    const cfg = await getGuildConfig(guildId);
    const escalCfg = (cfg as any).punishment_escalation?.config;

    // check
    if (sub === "check") {
      const global = escalCfg?.global ?? {};
      const steps: any[] = escalCfg?.steps ?? [];
      const warningExpiryMs = global.warning_expiry
        ? parseDuration(String(global.warning_expiry))
        : null;

      const warnCount = await countActiveWarnings(guildId, userId, warningExpiryMs);
      const executions = await getEscalationExecutions(guildId, userId);
      const allCases = await getCasesForUser(guildId, userId);
      const now = Date.now();

      const warnCases = allCases
        .filter((c) => c.action.toLowerCase().startsWith("warn"))
        .sort((a, b) => b.createdAt - a.createdAt);

      // Active warnings: not force-expired and not naturally expired
      const activeCases = warnCases.filter((c) => {
        if (c.expiresAt !== undefined && c.expiresAt <= now) return false;
        if (warningExpiryMs !== null && c.createdAt + warningExpiryMs <= now) return false;
        return true;
      });

      // Next / current step
      const nextStep = steps.find((s: any) => Number(s.warnings) > warnCount) ?? null;
      const currentStep =
        [...steps].reverse().find((s: any) => Number(s.warnings) <= warnCount) ?? null;

      // Oldest active warning expiry
      const oldestActive = activeCases[activeCases.length - 1];
      const oldestExpiryTs = oldestActive && warningExpiryMs && !oldestActive.expiresAt
        ? Math.floor((oldestActive.createdAt + warningExpiryMs) / 1000)
        : null;

      const lines: string[] = [
        `**User:** <@${userId}> (${userTag})`,
        `**Active warnings:** ${warnCount}${warningExpiryMs ? ` (expire after ${formatMs(warningExpiryMs)})` : " (never expire)"}`,
        `**Total warn cases:** ${warnCases.length}`,
        "",
        `**Current step:** ${currentStep ? `${currentStep.warnings} warns → \`${currentStep.action}\`` : "None"}`,
        `**Next threshold:** ${nextStep ? `${nextStep.warnings} warns → \`${nextStep.action}\`` : "None (max reached)"}`,
      ];

      if (oldestExpiryTs) {
        lines.push(`**Oldest active warning expires:** <t:${oldestExpiryTs}:R>`);
      }

      // Active warnings list
      if (activeCases.length > 0) {
        lines.push("", "**Active warnings:**");
        for (const c of activeCases.slice(0, 10)) {
          const expiryTs = warningExpiryMs && !c.expiresAt
            ? Math.floor((c.createdAt + warningExpiryMs) / 1000)
            : null;
          const expirySuffix = expiryTs ? ` · expires <t:${expiryTs}:R>` : "";
          lines.push(
            `• **#${c.id}** — ${c.reason.slice(0, 60)}${c.reason.length > 60 ? "…" : ""} · <@${c.modId}> · <t:${Math.floor(c.createdAt / 1000)}:R>${expirySuffix}`,
          );
        }
        if (activeCases.length > 10) {
          lines.push(`_…and ${activeCases.length - 10} more. Use \`!escalation history\` to see all._`);
        }
      } else {
        lines.push("", "_No active warnings._");
      }

      if (executions.length > 0) {
        lines.push("", "**Escalation steps fired:**");
        for (const ex of executions.slice(0, 5)) {
          lines.push(
            `• ${ex.warnings_at_execution} warns → \`${ex.action}\` — <t:${Math.floor(ex.executed_at / 1000)}:R>`,
          );
        }
      }

      if (!escalCfg) {
        lines.push("", "⚠️ `punishment_escalation` is not configured in this server's YAML.");
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📊 Escalation Status — ${userTag}`)
        .setDescription(lines.join("\n"))
        .setTimestamp();

      return void message.channel.send({ embeds: [embed] });
    }

    // reset
    if (sub === "reset") {
      const reasonParts = targetArgs.slice(
        message.mentions.users.size > 0 ? 1 : 1,
      );
      const reason = reasonParts.join(" ") || "Manual reset";

      // Force-expire all active warn cases so they no longer count
      const warningsCleared = await forceExpireWarnCases(guildId, userId);
      // Clear the escalation step execution history
      const stepsCleared = await resetPunishmentEscalation(guildId, userId);

      await sendModLog(client, guildId, {
        action: "⚡ Escalation Reset",
        executor: { tag: message.author.tag, id: message.author.id },
        target: { tag: userTag, id: userId },
        reason,
        color: 0x57f287,
      });

      const logCh = escalCfg?.logging?.channel ?? escalCfg?.global?.log_channel;
      if (logCh) {
        try {
          const ch = await client.channels.fetch(logCh) as any;
          if (ch && "send" in ch) {
            const logMsg = escalCfg?.logging?.messages?.escalation_reset ?? {};
            const vars: Record<string, string> = {
              userMention: `<@${userId}>`,
              userId,
              moderator: message.author.tag,
              reason,
              warnings: String(warningsCleared),
            };
            const embed = new EmbedBuilder()
              .setColor(parseInt(String(logMsg.color ?? "57F287"), 16))
              .setTitle(String(logMsg.title ?? "📉 Escalation Reset"))
              .setDescription(
                logMsg.description
                  ? String(logMsg.description)
                      .replace(/\{userMention\}/g, `<@${userId}>`)
                      .replace(/\{userId\}/g, userId)
                      .replace(/\{moderator\}/g, message.author.tag)
                      .replace(/\{reason\}/g, reason)
                      .replace(/\{warnings\}/g, String(warningsCleared))
                  : `**User:** <@${userId}> (\`${userId}\`)\n**Reset by:** ${message.author.tag}\n**Reason:** ${reason}\n**Warnings cleared:** ${warningsCleared}\n**Steps cleared:** ${stepsCleared}`,
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
              `✅ Escalation reset for **${userTag}**.\n` +
              `**Warnings cleared:** ${warningsCleared}\n` +
              `**Steps cleared:** ${stepsCleared}\n` +
              `**Reason:** ${reason}`,
            )
            .setTimestamp(),
        ],
      });
    }

    // history
    if (sub === "history") {
      const global = escalCfg?.global ?? {};
      const warningExpiryMs = global.warning_expiry
        ? parseDuration(String(global.warning_expiry))
        : null;

      const allCases = await getCasesForUser(guildId, userId);
      const warnCases = allCases
        .filter((c) => c.action.toLowerCase().startsWith("warn"))
        .sort((a, b) => b.createdAt - a.createdAt);

      if (!warnCases.length) {
        return void message.reply(`📋 No warn cases found for **${userTag}**.`);
      }

      const now = Date.now();
      const lines = warnCases.map((c) => {
        // Force-expired takes priority
        const forceExpired = c.expiresAt !== undefined && c.expiresAt <= now;
        const naturalExpired = warningExpiryMs !== null && c.createdAt + warningExpiryMs <= now;
        const active = !forceExpired && !naturalExpired;

        const expiresAt = warningExpiryMs && !c.expiresAt
          ? Math.floor((c.createdAt + warningExpiryMs) / 1000)
          : c.expiresAt
          ? Math.floor(c.expiresAt / 1000)
          : null;

        const status = forceExpired
          ? "🔄 reset"
          : active
          ? "✅ active"
          : "❌ expired";
        const expiry = expiresAt
          ? active
            ? ` · expires <t:${expiresAt}:R>`
            : ` · expired <t:${expiresAt}:R>`
          : "";
        return `**#${c.id}** — ${c.reason.slice(0, 50)}${c.reason.length > 50 ? "…" : ""} · <@${c.modId}> · <t:${Math.floor(c.createdAt / 1000)}:R> · ${status}${expiry}`;
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
          .setTitle(i === 0 ? `📋 Warn history — ${userTag} (${warnCases.length})` : `📋 Warn history — ${userTag} (cont.)`)
          .setDescription(chunks[i]!.join("\n"))
          .setTimestamp();
        await message.channel.send({ embeds: [embed] });
      }
    }
  },
};

export default escalationCmd;

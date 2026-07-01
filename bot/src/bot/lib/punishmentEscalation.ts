/**
 * Punishment Escalation System
 *
 * Reads `punishment_escalation.config` from guild YAML.
 * Only `!warn` feeds this system — automod does NOT.
 * Counts active (non-expired) warn cases from the mod_cases store.
 * Each step fires once per warning threshold; tracked in `escalation_executed`.
 *
 * YAML key: punishment_escalation.config
 * DB table:  escalation_executed
 */

import { Client, Guild, EmbedBuilder, TextChannel } from "discord.js";
import { pool } from "../store/db";
import { getGuildConfig } from "../store/guildConfig";
import { getCasesForUser, getAllCases } from "./cases";
import { sendModLog } from "./modlog";
import { parseDuration } from "./parseDuration";
import { requireServerName } from "./dmNotify";
import { logger } from "../../lib/logger";

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1_000;

// DB init
export async function initPunishmentEscalationTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS escalation_executed (
      guild_id               TEXT NOT NULL,
      user_id                TEXT NOT NULL,
      warnings_at_execution  INT  NOT NULL,
      action                 TEXT NOT NULL,
      executed_at            BIGINT NOT NULL,
      PRIMARY KEY (guild_id, user_id, warnings_at_execution)
    )
  `);
  logger.info("escalation_executed table ensured");
}

// Helpers
function interp(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

function formatMs(ms: number | null): string {
  if (!ms) return "Permanent";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m || 1}m`;
}

// Warning counting
/**
 * Count active (non-expired) warn cases for a user.
 * warningExpiryMs = null means warnings never expire.
 * Respects both natural time-based expiry and force-expired cases (expiresAt set).
 */
export async function countActiveWarnings(
  guildId: string,
  userId: string,
  warningExpiryMs: number | null,
): Promise<number> {
  const cases = await getCasesForUser(guildId, userId);
  const now = Date.now();
  return cases.filter((c) => {
    if (!c.action.toLowerCase().startsWith("warn")) return false;
    // Force-expired (e.g. via !escalation reset)
    if (c.expiresAt !== undefined && c.expiresAt <= now) return false;
    // Natural time-based expiry
    if (warningExpiryMs !== null && c.createdAt + warningExpiryMs <= now) return false;
    return true;
  }).length;
}

// Step execution tracking
async function wasStepExecuted(guildId: string, userId: string, warnCount: number): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM escalation_executed WHERE guild_id=$1 AND user_id=$2 AND warnings_at_execution=$3`,
    [guildId, userId, warnCount],
  );
  return (res.rowCount ?? 0) > 0;
}

async function recordStepExecution(
  guildId: string,
  userId: string,
  warnCount: number,
  action: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO escalation_executed(guild_id, user_id, warnings_at_execution, action, executed_at)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
    [guildId, userId, warnCount, action, Date.now()],
  );
}

async function getLastExecutionTime(guildId: string, userId: string): Promise<number | null> {
  const res = await pool.query(
    `SELECT MAX(executed_at) AS last_at FROM escalation_executed WHERE guild_id=$1 AND user_id=$2`,
    [guildId, userId],
  );
  const v = res.rows[0]?.last_at;
  return v ? Number(v) : null;
}

// Staff alert
async function sendStaffAlert(
  client: Client,
  guild: Guild,
  userId: string,
  warnCount: number,
  escalCfg: any,
): Promise<void> {
  const alertCfg = escalCfg.notifications?.staff_alert;
  if (!alertCfg?.enabled || !alertCfg.channel) return;

  const alertBeforeSteps: number[] = alertCfg.alert_before_steps ?? [];
  const nextCount = warnCount + 1;
  if (!alertBeforeSteps.includes(nextCount)) return;

  const steps: any[] = escalCfg.steps ?? [];
  const nextStep = steps.find((s: any) => Number(s.warnings) === nextCount);
  if (!nextStep) return;

  try {
    const ch = (await client.channels.fetch(alertCfg.channel)) as TextChannel;
    if (!ch || !("send" in ch)) return;

    const msgCfg = alertCfg.message ?? {};
    const vars: Record<string, string> = {
      userMention: `<@${userId}>`,
      userId,
      warnings: String(warnCount),
      nextStep: String(nextStep.warnings),
      nextAction: String(nextStep.action),
    };
    const embed = new EmbedBuilder()
      .setColor(parseInt(String(msgCfg.color ?? "FEE75C"), 16))
      .setTitle(String(msgCfg.title ?? "⚠️ Escalation Warning"))
      .setDescription(
        msgCfg.description
          ? interp(String(msgCfg.description), vars)
          : `**User:** <@${userId}>\n**Current warnings:** ${warnCount}\n**Next escalation at:** ${nextStep.warnings} warnings\n**Next action:** \`${nextStep.action}\``,
      )
      .setTimestamp();
    await ch.send({ embeds: [embed] }).catch(() => {});
  } catch { /* ignore — channel may not exist */ }
}

// Main check
/**
 * Call this immediately after a warn case is created via !warn.
 * Does nothing if punishment_escalation is not configured.
 */
export async function checkPunishmentEscalation(
  client: Client,
  guild: Guild,
  userId: string,
  userTag: string,
  caseNumber: number,
  moderatorId: string,
): Promise<void> {
  try {
    const cfg = await getGuildConfig(guild.id);
    const escalCfg = (cfg as any).punishment_escalation?.config;
    if (!escalCfg?.steps?.length) return;

    const global = escalCfg.global ?? {};
    const steps: any[] = escalCfg.steps;

    const warningExpiryMs = global.warning_expiry
      ? parseDuration(String(global.warning_expiry))
      : null;
    const resetAfterMs = global.escalation_reset_after
      ? parseDuration(String(global.escalation_reset_after))
      : null;

    // Immune roles
    const immuneRoles: string[] = Array.isArray(global.immune_roles) ? global.immune_roles : [];
    if (immuneRoles.length) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        const roleIds = [...member.roles.cache.keys()];
        if (immuneRoles.some((r) => roleIds.includes(r))) return;
      }
    }

    // Lazy escalation_reset_after
    // If the user had 0 active warnings before this new warn was saved,
    // and escalation_reset_after has elapsed since the last step fired, reset.
    if (resetAfterMs) {
      const currentCount = await countActiveWarnings(guild.id, userId, warningExpiryMs);
      if (currentCount - 1 <= 0) {
        const lastAt = await getLastExecutionTime(guild.id, userId);
        if (lastAt && Date.now() - lastAt > resetAfterMs) {
          await pool.query(
            `DELETE FROM escalation_executed WHERE guild_id=$1 AND user_id=$2`,
            [guild.id, userId],
          );
          logger.info({ guildId: guild.id, userId }, "Punishment escalation: history reset after inactivity");
        }
      }
    }

    // Count active warnings
    const warnCount = await countActiveWarnings(guild.id, userId, warningExpiryMs);

    // Staff alert (1-away check)
    await sendStaffAlert(client, guild, userId, warnCount, escalCfg).catch(() => {});

    // Find matching step
    const step = steps.find((s: any) => Number(s.warnings) === warnCount);
    if (!step) return;
    if (await wasStepExecuted(guild.id, userId, warnCount)) return;

    const action = String(step.action ?? "mute");
    if (!["mute", "kick", "ban"].includes(action)) return;

    const rawDuration: string | null = (step.duration === null || step.duration === undefined)
      ? null
      : String(step.duration);
    const durationMs = rawDuration && rawDuration !== "null"
      ? parseDuration(rawDuration)
      : null;
    const durationLabel = formatMs(durationMs);
    const reason = String(step.reason ?? `Reached ${warnCount} warnings`);

    // Apply action
    try {
      if (action === "mute") {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          await member.timeout(durationMs ?? MAX_TIMEOUT_MS, `[Escalation] ${reason}`).catch(() => {});
        }
      } else if (action === "kick") {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          await member.kick(`[Escalation] ${reason}`).catch(() => {});
        }
      } else if (action === "ban") {
        await guild.members.ban(userId, { reason: `[Escalation] ${reason}` }).catch(() => {});
        if (durationMs) {
          setTimeout(
            () => guild.members.unban(userId, "Escalation temp ban expired").catch(() => {}),
            durationMs,
          );
        }
      }
    } catch (err) {
      logger.error({ err, userId, action, guildId: guild.id }, "Punishment escalation: failed to apply action");
    }

    await recordStepExecution(guild.id, userId, warnCount, action);

    // Build placeholder vars
    const nextStep = steps.find((s: any) => Number(s.warnings) > warnCount) ?? null;
    const vars: Record<string, string> = {
      user:         userTag,
      userId,
      userMention:  `<@${userId}>`,
      guild:        guild.name,
      warnings:     String(warnCount),
      action,
      duration:     durationLabel,
      reason,
      moderator:    `<@${moderatorId}>`,
      caseNumber:   String(caseNumber),
      timestamp:    new Date().toLocaleString(),
      nextStep:     String(nextStep?.warnings ?? "—"),
      nextAction:   String(nextStep?.action ?? "—"),
    };

    // DM user
    if (global.dm_user !== false) {
      const rawDm = step.dm_message
        ? interp(String(step.dm_message), vars)
        : `You have been **${action}d** in **${guild.name}**.\n**Reason:** You have accumulated **${warnCount} warnings**.\n**Duration:** ${durationLabel}`;
      const dmText = requireServerName(rawDm, guild.name);
      try {
        const user = await client.users.fetch(userId);
        await user.send(dmText).catch(() => {});
      } catch { /* ignore */ }
    }

    // Dedicated log channel
    const logChId = escalCfg.logging?.channel ?? global.log_channel;
    if (logChId) {
      try {
        const ch = (await client.channels.fetch(logChId)) as TextChannel;
        if (ch && "send" in ch) {
          const logMsgCfg = escalCfg.logging?.messages?.escalation_triggered ?? {};
          const embed = new EmbedBuilder()
            .setColor(parseInt(String(logMsgCfg.color ?? "FEE75C"), 16))
            .setTitle(String(logMsgCfg.title ?? "📈 Escalation Triggered"))
            .setDescription(
              logMsgCfg.description
                ? interp(String(logMsgCfg.description), vars)
                : `**User:** <@${userId}> (\`${userId}\`)\n**Warning count:** ${warnCount}\n**Action taken:** \`${action}\`\n**Duration:** ${durationLabel}\n**Reason:** ${reason}\n**Triggered by warning:** Case #${caseNumber} by <@${moderatorId}>`,
            )
            .setTimestamp();
          await ch.send({ embeds: [embed] }).catch(() => {});
        }
      } catch { /* ignore */ }
    }

    // Mod log
    await sendModLog(client, guild.id, {
      action: `⚡ Escalation: ${action.charAt(0).toUpperCase() + action.slice(1)}${durationMs ? ` (${durationLabel})` : ""}`,
      executor: { tag: client.user?.username ?? "NightPigeon", id: client.user?.id ?? "0" },
      target:   { tag: userTag, id: userId },
      reason,
      color: action === "ban" ? 0xe74c3c : action === "kick" ? 0xe67e22 : 0xf39c12,
    });

    logger.info({ guildId: guild.id, userId, action, warnCount }, "Punishment escalation triggered");
  } catch (err) {
    logger.error({ err, userId, guildId: guild.id }, "Punishment escalation: unexpected error");
  }
}

// Background expiry scheduler
/**
 * Runs hourly. For each guild with punishment_escalation configured:
 * - Finds warn cases that naturally expired in the last hour
 * - Logs a warning_expired event to the configured channel
 * - If the user now has 0 active warnings and escalation_reset_after has elapsed,
 *   clears their escalation execution history
 */
export function startPunishmentEscalationScheduler(client: Client): void {
  const run = async () => {
    try {
      const res = await pool.query(
        `SELECT guild_id, config FROM guild_configs WHERE config LIKE '%punishment_escalation%'`,
      );

      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1_000;

      for (const row of res.rows) {
        const guildId: string = row.guild_id;
        try {
          const cfg = await getGuildConfig(guildId);
          const escalCfg = (cfg as any).punishment_escalation?.config;
          if (!escalCfg?.steps?.length) continue;

          const global = escalCfg.global ?? {};
          if (!global.warning_expiry) continue;

          const warningExpiryMs = parseDuration(String(global.warning_expiry));
          if (!warningExpiryMs) continue;

          const resetAfterMs = global.escalation_reset_after
            ? parseDuration(String(global.escalation_reset_after))
            : null;

          const logChId = escalCfg.logging?.channel ?? global.log_channel;
          const logMsgCfg = escalCfg.logging?.messages?.warning_expired ?? {};

          // Find warn cases that naturally expired within the last hour
          const allCases = await getAllCases(guildId);
          const justExpired = allCases.filter((c) => {
            if (!c.action.toLowerCase().startsWith("warn")) return false;
            // Skip force-expired cases — already handled at reset time
            if (c.expiresAt !== undefined) return false;
            const expireAt = c.createdAt + warningExpiryMs;
            return expireAt > oneHourAgo && expireAt <= now;
          });

          // Group by userId
          const byUser = new Map<string, typeof justExpired>();
          for (const c of justExpired) {
            const arr = byUser.get(c.userId) ?? [];
            arr.push(c);
            byUser.set(c.userId, arr);
          }

          for (const [userId] of byUser) {
            const activeCount = await countActiveWarnings(guildId, userId, warningExpiryMs);

            // Log warning_expired event
            if (logChId) {
              try {
                const ch = (await client.channels.fetch(logChId)) as TextChannel;
                if (ch && "send" in ch) {
                  const vars: Record<string, string> = {
                    userMention: `<@${userId}>`,
                    userId,
                    warnings: String(activeCount),
                  };
                  const embed = new EmbedBuilder()
                    .setColor(parseInt(String(logMsgCfg.color ?? "5865F2"), 16))
                    .setTitle(String(logMsgCfg.title ?? "⏰ Warning Expired"))
                    .setDescription(
                      logMsgCfg.description
                        ? interp(String(logMsgCfg.description), vars)
                        : `**User:** <@${userId}> (\`${userId}\`)\n**Warnings remaining:** ${activeCount}`,
                    )
                    .setTimestamp();
                  await ch.send({ embeds: [embed] }).catch(() => {});
                }
              } catch { /* ignore — channel may not exist */ }
            }

            // Auto-reset escalation history if 0 active warnings and reset_after elapsed
            if (activeCount === 0 && resetAfterMs) {
              const lastAt = await getLastExecutionTime(guildId, userId);
              if (lastAt && now - lastAt > resetAfterMs) {
                await pool.query(
                  `DELETE FROM escalation_executed WHERE guild_id=$1 AND user_id=$2`,
                  [guildId, userId],
                );
                logger.info({ guildId, userId }, "Punishment escalation: history reset after warning expiry");
              }
            }
          }
        } catch (err) {
          logger.error({ err, guildId }, "Punishment escalation expiry job: error for guild");
        }
      }
    } catch (err) {
      logger.error({ err }, "Punishment escalation expiry scheduler: top-level error");
    }
  };

  run();
  setInterval(run, 60 * 60 * 1_000);
}

// Management helpers (used by !escalation command)
export async function resetPunishmentEscalation(
  guildId: string,
  userId: string,
): Promise<number> {
  const res = await pool.query(
    `DELETE FROM escalation_executed WHERE guild_id=$1 AND user_id=$2`,
    [guildId, userId],
  );
  return res.rowCount ?? 0;
}

export interface EscalationExecRow {
  warnings_at_execution: number;
  action: string;
  executed_at: number;
}

export async function getEscalationExecutions(
  guildId: string,
  userId: string,
): Promise<EscalationExecRow[]> {
  const res = await pool.query(
    `SELECT warnings_at_execution, action, executed_at
     FROM escalation_executed
     WHERE guild_id=$1 AND user_id=$2
     ORDER BY executed_at DESC`,
    [guildId, userId],
  );
  return res.rows.map((r) => ({
    warnings_at_execution: Number(r.warnings_at_execution),
    action: String(r.action),
    executed_at: Number(r.executed_at),
  }));
}

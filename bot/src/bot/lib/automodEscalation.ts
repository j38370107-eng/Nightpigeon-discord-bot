/**
 * Automod Escalation System
 *
 * Reads `automod_escalation.config` from guild YAML.
 * Only YAML automod rules feed this system — manual mod commands do NOT.
 * Groups automod rules together; violations are counted per group, not per rule.
 * Each step fires once per violation threshold; tracked in `automod_escalation_executed`.
 *
 * YAML key:  automod_escalation.config
 * DB tables: automod_violations, automod_escalation_executed
 *
 * Integration: after any YAML automod rule fires, call
 *   checkAutomodEscalation(client, guild, userId, userTag, ruleName)
 */

import { Client, Guild, EmbedBuilder, TextChannel } from "discord.js";
import { pool } from "../store/db";
import { getGuildConfig } from "../store/guildConfig";
import { sendModLog } from "./modlog";
import { parseDuration } from "./parseDuration";
import { requireServerName } from "./dmNotify";
import { logger } from "../../lib/logger";

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1_000;

// DB init
export async function initAutomodEscalationTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automod_violations (
      id          SERIAL PRIMARY KEY,
      guild_id    TEXT    NOT NULL,
      user_id     TEXT    NOT NULL,
      group_name  TEXT    NOT NULL,
      rule_name   TEXT    NOT NULL,
      created_at  BIGINT  NOT NULL,
      expires_at  BIGINT,
      active      BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automod_escalation_executed (
      guild_id                TEXT NOT NULL,
      user_id                 TEXT NOT NULL,
      group_name              TEXT NOT NULL,
      violations_at_execution INT  NOT NULL,
      action                  TEXT NOT NULL,
      executed_at             BIGINT NOT NULL,
      PRIMARY KEY (guild_id, user_id, group_name, violations_at_execution)
    )
  `);
  logger.info("automod_violations + automod_escalation_executed tables ensured");
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

// DB queries
async function recordViolation(
  guildId: string,
  userId: string,
  groupName: string,
  ruleName: string,
  expiresAt: number | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO automod_violations(guild_id, user_id, group_name, rule_name, created_at, expires_at, active)
     VALUES($1,$2,$3,$4,$5,$6,TRUE)`,
    [guildId, userId, groupName, ruleName, Date.now(), expiresAt],
  );
}

async function countActiveViolations(
  guildId: string,
  userId: string,
  groupName: string,
): Promise<number> {
  const now = Date.now();
  const res = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM automod_violations
     WHERE guild_id=$1 AND user_id=$2 AND group_name=$3
       AND active=TRUE AND (expires_at IS NULL OR expires_at > $4)`,
    [guildId, userId, groupName, now],
  );
  return res.rows[0]?.cnt ?? 0;
}

async function wasStepExecuted(
  guildId: string,
  userId: string,
  groupName: string,
  violCount: number,
): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM automod_escalation_executed
     WHERE guild_id=$1 AND user_id=$2 AND group_name=$3 AND violations_at_execution=$4`,
    [guildId, userId, groupName, violCount],
  );
  return (res.rowCount ?? 0) > 0;
}

async function recordStepExecution(
  guildId: string,
  userId: string,
  groupName: string,
  violCount: number,
  action: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO automod_escalation_executed
       (guild_id, user_id, group_name, violations_at_execution, action, executed_at)
     VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [guildId, userId, groupName, violCount, action, Date.now()],
  );
}

// Step execution
async function executeStep(
  client: Client,
  guild: Guild,
  userId: string,
  userTag: string,
  groupName: string,
  groupDisplayName: string,
  violCount: number,
  step: any,
  ruleName: string,
  escalCfg: any,
): Promise<void> {
  const action = String(step.action ?? "mute");
  if (!["mute", "kick", "ban"].includes(action)) return;

  const rawDur: string | null =
    step.duration === null || step.duration === undefined ? null : String(step.duration);
  const durationMs = rawDur && rawDur !== "null" ? parseDuration(rawDur) : null;
  const durationLabel = formatMs(durationMs);
  const reason = String(step.reason ?? `AutoMod escalation: ${violCount} violations in group "${groupDisplayName}"`);
  const global = escalCfg.global ?? {};

  // Apply punishment
  try {
    if (action === "mute") {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        await member.timeout(durationMs ?? MAX_TIMEOUT_MS, `[AutoMod Escalation] ${reason}`).catch(() => {});
      }
    } else if (action === "kick") {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        await member.kick(`[AutoMod Escalation] ${reason}`).catch(() => {});
      }
    } else if (action === "ban") {
      await guild.members.ban(userId, { reason: `[AutoMod Escalation] ${reason}` }).catch(() => {});
      if (durationMs) {
        setTimeout(
          () => guild.members.unban(userId, "AutoMod escalation temp ban expired").catch(() => {}),
          durationMs,
        );
      }
    }
  } catch (err) {
    logger.error({ err, userId, action, groupName, guildId: guild.id }, "AutoMod escalation: failed to apply action");
  }

  await recordStepExecution(guild.id, userId, groupName, violCount, action);

  // Placeholder vars
  const vars: Record<string, string> = {
    user:         userTag,
    userId,
    userMention:  `<@${userId}>`,
    guild:        guild.name,
    group:        groupDisplayName,
    rule:         ruleName,
    violations:   String(violCount),
    action,
    duration:     durationLabel,
    reason,
    timestamp:    new Date().toLocaleString(),
  };

  // DM user
  if (global.dm_user !== false) {
    const rawDm = step.dm_message
      ? interp(String(step.dm_message), vars)
      : `You have been **${action}d** in **${guild.name}**.\n**Reason:** You have triggered automod violations **${violCount} times** in the **${groupDisplayName}** group.\n**Duration:** ${durationLabel}`;
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
          .setTitle(String(logMsgCfg.title ?? "📈 Automod Escalation Triggered"))
          .setDescription(
            logMsgCfg.description
              ? interp(String(logMsgCfg.description), vars)
              : `**User:** <@${userId}> (\`${userId}\`)\n**Group:** ${groupDisplayName}\n**Rule triggered:** \`${ruleName}\`\n**Violation count:** ${violCount}\n**Action taken:** \`${action}\`\n**Duration:** ${durationLabel}\n**Reason:** ${reason}`,
          )
          .setTimestamp();
        await ch.send({ embeds: [embed] }).catch(() => {});
      }
    } catch { /* ignore */ }
  }

  // Mod log
  await sendModLog(client, guild.id, {
    action: `⚡ AutoMod Escalation [${groupDisplayName}]: ${action.charAt(0).toUpperCase() + action.slice(1)}${durationMs ? ` (${durationLabel})` : ""}`,
    executor: { tag: client.user?.username ?? "NightPigeon", id: client.user?.id ?? "0" },
    target:   { tag: userTag, id: userId },
    reason,
    color: action === "ban" ? 0xe74c3c : action === "kick" ? 0xe67e22 : 0xf39c12,
  });

  logger.info({ guildId: guild.id, userId, action, groupName, violCount }, "AutoMod escalation triggered");
}

// Staff alert
async function sendStaffAlert(
  client: Client,
  guild: Guild,
  userId: string,
  groupName: string,
  groupDisplayName: string,
  violCount: number,
  steps: any[],
  escalCfg: any,
): Promise<void> {
  const alertCfg = escalCfg.notifications?.staff_alert;
  if (!alertCfg?.enabled || !alertCfg.channel) return;

  // alert_before_steps is a map: groupName → number[]
  const alertBefore: number[] = alertCfg.alert_before_steps?.[groupName] ?? [];
  const nextCount = violCount + 1;
  if (!alertBefore.includes(nextCount)) return;

  const nextStep = steps.find((s: any) => Number(s.violations) === nextCount);
  if (!nextStep) return;

  try {
    const ch = (await client.channels.fetch(alertCfg.channel)) as TextChannel;
    if (!ch || !("send" in ch)) return;

    const msgCfg = alertCfg.message ?? {};
    const vars: Record<string, string> = {
      userMention: `<@${userId}>`,
      userId,
      group: groupDisplayName,
      violations: String(violCount),
      nextStep: String(nextStep.violations),
      nextAction: String(nextStep.action),
      rule: groupName,
    };
    const embed = new EmbedBuilder()
      .setColor(parseInt(String(msgCfg.color ?? "FEE75C"), 16))
      .setTitle(String(msgCfg.title ?? "⚠️ Automod Escalation Alert"))
      .setDescription(
        msgCfg.description
          ? interp(String(msgCfg.description), vars)
          : `**User:** <@${userId}>\n**Group:** ${groupDisplayName}\n**Current violations:** ${violCount}\n**Next escalation at:** ${nextStep.violations} violations\n**Next action:** \`${nextStep.action}\``,
      )
      .setTimestamp();
    await ch.send({ embeds: [embed] }).catch(() => {});
  } catch { /* ignore */ }
}

// Main check
/**
 * Call this after any YAML automod rule fires.
 * Maps ruleName → group, records violation, checks ladder.
 */
export async function checkAutomodEscalation(
  client: Client,
  guild: Guild,
  userId: string,
  userTag: string,
  ruleName: string,
): Promise<void> {
  try {
    const cfg = await getGuildConfig(guild.id);
    const escalCfg = (cfg as any).automod_escalation?.config;
    if (!escalCfg?.groups) return;

    const global = escalCfg.global ?? {};
    const groups: Record<string, any> = escalCfg.groups;

    // Map rule → group
    let groupName: string | null = null;
    let groupCfg: any = null;
    for (const [gn, gc] of Object.entries(groups)) {
      const rules: string[] = Array.isArray(gc.rules) ? gc.rules : [];
      if (rules.includes(ruleName)) {
        groupName = gn;
        groupCfg = gc;
        break;
      }
    }
    if (!groupName || !groupCfg) return; // rule not in any group

    // Immune roles
    const immuneRoles: string[] = Array.isArray(global.immune_roles) ? global.immune_roles : [];
    if (immuneRoles.length) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        const roleIds = [...member.roles.cache.keys()];
        if (immuneRoles.some((r) => roleIds.includes(r))) return;
      }
    }

    // Compute expiry for this violation
    const expiryStr: string | undefined = groupCfg.violation_expiry ?? global.violation_expiry;
    const expiryMs = expiryStr ? parseDuration(String(expiryStr)) : null;
    const expiresAt = expiryMs ? Date.now() + expiryMs : null;

    // Record the violation
    await recordViolation(guild.id, userId, groupName, ruleName, expiresAt);

    // Count active violations for this group
    const violCount = await countActiveViolations(guild.id, userId, groupName);

    const steps: any[] = Array.isArray(groupCfg.steps) ? groupCfg.steps : [];
    const groupDisplayName = String(groupCfg.name ?? groupName);

    // Find matching step (exact count match)
    const matchingStep = steps.find((s: any) => Number(s.violations) === violCount);

    if (matchingStep) {
      if (!(await wasStepExecuted(guild.id, userId, groupName, violCount))) {
        await executeStep(client, guild, userId, userTag, groupName, groupDisplayName, violCount, matchingStep, ruleName, escalCfg);
      }
    } else {
      // Overflow: exceeds last step
      const lastStep = steps[steps.length - 1];
      if (lastStep && violCount > Number(lastStep.violations) && groupCfg.overflow === "ban") {
        if (!(await wasStepExecuted(guild.id, userId, groupName, violCount))) {
          const overflowStep = {
            violations: violCount,
            action: "ban",
            duration: null,
            reason: `Exceeded maximum escalation steps (${groupDisplayName})`,
          };
          await executeStep(client, guild, userId, userTag, groupName, groupDisplayName, violCount, overflowStep, ruleName, escalCfg);
        }
      }
    }

    // Staff alert
    await sendStaffAlert(client, guild, userId, groupName, groupDisplayName, violCount, steps, escalCfg).catch(() => {});
  } catch (err) {
    logger.error({ err, userId, ruleName, guildId: guild.id }, "AutoMod escalation: unexpected error");
  }
}

// Background scheduler
/**
 * Runs hourly. Marks expired violations as inactive.
 */
export function startAutomodEscalationScheduler(): void {
  const run = async () => {
    try {
      const now = Date.now();
      const res = await pool.query(
        `UPDATE automod_violations SET active=FALSE
         WHERE active=TRUE AND expires_at IS NOT NULL AND expires_at <= $1`,
        [now],
      );
      if ((res.rowCount ?? 0) > 0) {
        logger.debug({ expired: res.rowCount }, "AutoMod escalation: marked violations inactive");
      }
    } catch (err) {
      logger.error({ err }, "AutoMod escalation expiry job error");
    }
  };
  run();
  setInterval(run, 60 * 60 * 1_000);
}

// Management helpers (used by !automod-escalation command)
export async function resetAutomodEscalation(
  guildId: string,
  userId: string,
  groupName?: string,
): Promise<{ violations: number; steps: number }> {
  if (groupName) {
    const vRes = await pool.query(
      `UPDATE automod_violations SET active=FALSE
       WHERE guild_id=$1 AND user_id=$2 AND group_name=$3 AND active=TRUE`,
      [guildId, userId, groupName],
    );
    const eRes = await pool.query(
      `DELETE FROM automod_escalation_executed WHERE guild_id=$1 AND user_id=$2 AND group_name=$3`,
      [guildId, userId, groupName],
    );
    return { violations: vRes.rowCount ?? 0, steps: eRes.rowCount ?? 0 };
  } else {
    const vRes = await pool.query(
      `UPDATE automod_violations SET active=FALSE WHERE guild_id=$1 AND user_id=$2 AND active=TRUE`,
      [guildId, userId],
    );
    const eRes = await pool.query(
      `DELETE FROM automod_escalation_executed WHERE guild_id=$1 AND user_id=$2`,
      [guildId, userId],
    );
    return { violations: vRes.rowCount ?? 0, steps: eRes.rowCount ?? 0 };
  }
}

export interface ViolationStateEntry {
  count: number;
  oldestExpiresAt: number | null;
}

export async function getAutomodViolationState(
  guildId: string,
  userId: string,
): Promise<Record<string, ViolationStateEntry>> {
  const now = Date.now();
  const res = await pool.query(
    `SELECT group_name, COUNT(*)::int AS cnt, MIN(expires_at) AS oldest_expiry
     FROM automod_violations
     WHERE guild_id=$1 AND user_id=$2 AND active=TRUE
       AND (expires_at IS NULL OR expires_at > $3)
     GROUP BY group_name`,
    [guildId, userId, now],
  );
  const out: Record<string, ViolationStateEntry> = {};
  for (const row of res.rows) {
    out[String(row.group_name)] = {
      count: Number(row.cnt),
      oldestExpiresAt: row.oldest_expiry ? Number(row.oldest_expiry) : null,
    };
  }
  return out;
}

export interface ViolationHistoryRow {
  id: number;
  group_name: string;
  rule_name: string;
  created_at: number;
  expires_at: number | null;
  active: boolean;
}

export async function getAutomodViolationHistory(
  guildId: string,
  userId: string,
): Promise<ViolationHistoryRow[]> {
  const res = await pool.query(
    `SELECT id, group_name, rule_name, created_at, expires_at, active
     FROM automod_violations
     WHERE guild_id=$1 AND user_id=$2
     ORDER BY created_at DESC`,
    [guildId, userId],
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    group_name: String(r.group_name),
    rule_name: String(r.rule_name),
    created_at: Number(r.created_at),
    expires_at: r.expires_at ? Number(r.expires_at) : null,
    active: Boolean(r.active),
  }));
}

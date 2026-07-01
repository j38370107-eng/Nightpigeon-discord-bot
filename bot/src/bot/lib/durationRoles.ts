/**
 * Duration Roles Plugin
 *
 * Automatically expires roles after a configured time.
 * Tracks assignments in the `duration_role_assignments` DB table.
 *
 * Background scheduler runs every 60 seconds:
 *   Check 1 — Warning DMs: send a DM dm_warning_days before expiry (once)
 *   Check 2 — Expired Roles: remove/replace roles where expires_at <= NOW()
 *
 * YAML key: plugins.duration_roles
 * DB table: duration_role_assignments
 */

import { Client, GuildMember } from "discord.js";
import { pool } from "../store/db";
import { getGuildConfig } from "../store/guildConfig";
import type { YamlMessage } from "../store/guildConfig";
import { buildPayload } from "./msgTemplate";
import { sendYamlLog } from "./yamlLogging";
import { logger } from "../../lib/logger";

// Config types
export interface DurationRoleConfig {
  role: string;
  duration_days: number;
  dm_warning?: boolean;
  dm_warning_days?: number;
  dm_on_removal?: boolean;
  on_expiry?: "remove" | "replace";
  replace_with?: string | null;
  reset_on_reassign?: boolean;
  stack_on_reassign?: boolean;
  log_assignment?: boolean;
  log_expiry?: boolean;
}

export interface DurationRolesPluginConfig {
  enabled?: boolean;
  roles?: DurationRoleConfig[];
  messages?: {
    role_assigned_log?: YamlMessage;
    role_expired?: YamlMessage;
    role_replaced?: YamlMessage;
    role_expiry_warning_dm?: YamlMessage;
    role_expired_dm?: YamlMessage;
    role_replaced_dm?: YamlMessage;
    [key: string]: unknown;
  };
}

// DB init
export async function initDurationRolesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS duration_role_assignments (
      id               BIGSERIAL PRIMARY KEY,
      guild_id         TEXT      NOT NULL,
      user_id          TEXT      NOT NULL,
      role_id          TEXT      NOT NULL,
      assigned_at      BIGINT    NOT NULL,
      expires_at       BIGINT    NOT NULL,
      warning_sent     BOOLEAN   NOT NULL DEFAULT FALSE,
      UNIQUE (guild_id, user_id, role_id)
    )
  `);
  logger.info("duration_role_assignments table ensured");
}

// Helpers
function getDurationRolesConfig(guildId: string): DurationRolesPluginConfig | null {
  // Config is accessed via the cached guild config
  // We re-read it async in the scheduler; here we just define the accessor
  return null; // placeholder — real reads done in async context
}

function daysToMs(days: number): number {
  return Math.round(days * 24 * 60 * 60 * 1000);
}

function formatExpiry(expiresAt: number): string {
  return new Date(expiresAt).toUTCString();
}

// Role assignment tracking
/**
 * Called from guildMemberUpdate when a role is added to a member.
 * Records the assignment in the DB if the role is a configured duration role.
 */
export async function onDurationRoleAssigned(
  client: Client,
  member: GuildMember,
  roleId: string
): Promise<void> {
  try {
    const cfg = await getGuildConfig(member.guild.id);
    const plugin = cfg.plugins?.["duration_roles"] as DurationRolesPluginConfig | undefined;
    if (!plugin?.enabled || !plugin.roles?.length) return;

    const ruleDef = plugin.roles.find((r) => r.role === roleId);
    if (!ruleDef || !ruleDef.role || !(ruleDef.duration_days > 0)) return;

    const now = Date.now();
    const durationMs = daysToMs(ruleDef.duration_days);
    const expiresAt = now + durationMs;

    // Check for an existing assignment
    const existing = await pool.query(
      "SELECT id, expires_at FROM duration_role_assignments WHERE guild_id=$1 AND user_id=$2 AND role_id=$3",
      [member.guild.id, member.id, roleId]
    );

    const resetOnReassign = ruleDef.reset_on_reassign !== false; // default true
    const stackOnReassign = ruleDef.stack_on_reassign === true;  // default false

    if (existing.rows.length > 0) {
      const currentExpiry = Number(existing.rows[0].expires_at);

      if (resetOnReassign) {
        // Reset to fresh duration_days from now
        await pool.query(
          `UPDATE duration_role_assignments
             SET assigned_at=$1, expires_at=$2, warning_sent=FALSE
           WHERE guild_id=$3 AND user_id=$4 AND role_id=$5`,
          [now, expiresAt, member.guild.id, member.id, roleId]
        );
        logger.info({ guildId: member.guild.id, userId: member.id, roleId }, "Duration role timer reset (reassign)");
      } else if (stackOnReassign) {
        // Add duration_days to current remaining time
        const remaining = Math.max(currentExpiry - now, 0);
        const newExpiry = now + remaining + durationMs;
        await pool.query(
          `UPDATE duration_role_assignments
             SET expires_at=$1, warning_sent=FALSE
           WHERE guild_id=$2 AND user_id=$3 AND role_id=$4`,
          [newExpiry, member.guild.id, member.id, roleId]
        );
        logger.info({ guildId: member.guild.id, userId: member.id, roleId }, "Duration role timer stacked (reassign)");
      }
      // else: keep original expiry — do nothing
      return;
    }

    // New assignment
    await pool.query(
      `INSERT INTO duration_role_assignments (guild_id, user_id, role_id, assigned_at, expires_at, warning_sent)
       VALUES ($1, $2, $3, $4, $5, FALSE)`,
      [member.guild.id, member.id, roleId, now, expiresAt]
    );

    logger.info(
      { guildId: member.guild.id, userId: member.id, roleId, expiresAt: formatExpiry(expiresAt) },
      "Duration role assignment recorded"
    );

    // Log to channel if configured
    if (ruleDef.log_assignment !== false) {
      const role = member.guild.roles.cache.get(roleId);
      const roleName = role?.name ?? roleId;
      await sendYamlLog(client, member.guild.id, {
        eventKey: "duration_role_assigned",
        category: "server",
        vars: {
          user: member.user.tag,
          "user.mention": `<@${member.id}>`,
          "user.id": member.id,
          trigger: roleName,
          expires_at: formatExpiry(expiresAt),
          timestamp: new Date().toUTCString(),
        },
      });
    }
  } catch (err) {
    logger.error({ err, guildId: member.guild.id, userId: member.id, roleId }, "Error recording duration role assignment");
  }
}

/**
 * Called when a role is manually removed from a member (not by expiry).
 * Cleans up the DB row so we don't fire a spurious expiry DM later.
 */
export async function onDurationRoleRemoved(
  _client: Client,
  member: GuildMember,
  roleId: string
): Promise<void> {
  try {
    await pool.query(
      "DELETE FROM duration_role_assignments WHERE guild_id=$1 AND user_id=$2 AND role_id=$3",
      [member.guild.id, member.id, roleId]
    );
  } catch (err) {
    logger.warn({ err, guildId: member.guild.id, userId: member.id, roleId }, "Error cleaning up duration role on manual removal");
  }
}

// Scheduler
export function startDurationRolesScheduler(client: Client): void {
  const INTERVAL_MS = 60_000;

  const run = (): void => {
    runDurationRolesCheck(client).catch((err) =>
      logger.error({ err }, "Error in duration roles scheduler")
    );
  };

  // Run immediately on startup, then every 60 s
  setTimeout(run, 5_000);
  setInterval(run, INTERVAL_MS);

  logger.info("Duration roles scheduler started");
}

async function runDurationRolesCheck(client: Client): Promise<void> {
  const now = Date.now();

  // Check 1: Warning DMs
  // Fetch all rows where warning_sent=FALSE and we are within the warning window
  // We check per-guild config to determine dm_warning_days
  const warningRows = await pool.query<{
    id: string;
    guild_id: string;
    user_id: string;
    role_id: string;
    expires_at: string;
  }>(
    `SELECT id, guild_id, user_id, role_id, expires_at
       FROM duration_role_assignments
      WHERE warning_sent = FALSE`
  );

  for (const row of warningRows.rows) {
    try {
      const cfg = await getGuildConfig(row.guild_id);
      const plugin = cfg.plugins?.["duration_roles"] as DurationRolesPluginConfig | undefined;
      if (!plugin?.enabled) continue;

      const ruleDef = plugin.roles?.find((r) => r.role === row.role_id);
      if (!ruleDef) continue;
      if (!ruleDef.dm_warning) continue;

      const warningDays = ruleDef.dm_warning_days ?? 0;
      if (warningDays <= 0) continue;

      const expiresAt = Number(row.expires_at);
      const warningThreshold = expiresAt - daysToMs(warningDays);

      if (now < warningThreshold) continue; // Not yet time to warn
      if (now >= expiresAt) continue; // Already expired, skip warning

      // Mark warning sent first to prevent double-send
      await pool.query(
        "UPDATE duration_role_assignments SET warning_sent=TRUE WHERE id=$1",
        [row.id]
      );

      // Fetch the guild and member
      const guild = client.guilds.cache.get(row.guild_id);
      if (!guild) continue;

      let member: GuildMember | null = null;
      try {
        member = await guild.members.fetch(row.user_id);
      } catch {
        continue; // Member left
      }

      const role = guild.roles.cache.get(row.role_id);
      const roleName = role?.name ?? row.role_id;
      const daysRemaining = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));

      const msgs = plugin.messages;
      const warningMsg = msgs?.role_expiry_warning_dm;
      const vars = {
        trigger: roleName,
        server: guild.name,
        count: String(daysRemaining),
        expires_at: formatExpiry(expiresAt),
        "user.id": member.id,
      };

      const payload = buildPayload(
        warningMsg,
        vars,
        `Your **${roleName}** role in **${guild.name}** expires in **${daysRemaining}** day(s).`
      );

      await member.user.send(payload).catch(() => {});
      logger.info({ guildId: row.guild_id, userId: row.user_id, roleId: row.role_id }, "Duration role warning DM sent");
    } catch (err) {
      logger.warn({ err, row }, "Error sending duration role warning DM");
    }
  }

  // Check 2: Expired Roles
  const expiredRows = await pool.query<{
    id: string;
    guild_id: string;
    user_id: string;
    role_id: string;
    assigned_at: string;
    expires_at: string;
  }>(
    `SELECT id, guild_id, user_id, role_id, assigned_at, expires_at
       FROM duration_role_assignments
      WHERE expires_at <= $1`,
    [now]
  );

  for (const row of expiredRows.rows) {
    try {
      const cfg = await getGuildConfig(row.guild_id);
      const plugin = cfg.plugins?.["duration_roles"] as DurationRolesPluginConfig | undefined;

      // Delete the row first to prevent re-processing
      await pool.query("DELETE FROM duration_role_assignments WHERE id=$1", [row.id]);

      if (!plugin?.enabled) continue;

      const ruleDef = plugin.roles?.find((r) => r.role === row.role_id);
      if (!ruleDef) continue;

      const guild = client.guilds.cache.get(row.guild_id);
      if (!guild) continue;

      let member: GuildMember | null = null;
      try {
        member = await guild.members.fetch(row.user_id);
      } catch {
        continue; // Member left the guild
      }

      const role = guild.roles.cache.get(row.role_id);
      const roleName = role?.name ?? row.role_id;
      const expiresAt = Number(row.expires_at);

      const isReplace = ruleDef.on_expiry === "replace" && !!ruleDef.replace_with;
      const replaceRoleId = ruleDef.replace_with ?? null;
      const replaceRole = replaceRoleId ? guild.roles.cache.get(replaceRoleId) : null;
      const replaceRoleName = replaceRole?.name ?? replaceRoleId ?? "";

      // Remove the expired role
      if (member.roles.cache.has(row.role_id)) {
        await member.roles.remove(row.role_id, "Duration role expired").catch((err) =>
          logger.warn({ err, guildId: row.guild_id, userId: row.user_id, roleId: row.role_id }, "Failed to remove expired duration role")
        );
      }

      // Add replacement role if configured
      if (isReplace && replaceRoleId) {
        await member.roles.add(replaceRoleId, `Duration role ${roleName} expired — replacing`).catch((err) =>
          logger.warn({ err, guildId: row.guild_id, userId: row.user_id, replaceRoleId }, "Failed to add replacement duration role")
        );
      }

      const vars = {
        user: member.user.tag,
        "user.mention": `<@${member.id}>`,
        "user.id": member.id,
        trigger: roleName,
        reason: replaceRoleName,
        expires_at: formatExpiry(expiresAt),
        server: guild.name,
        timestamp: new Date().toUTCString(),
      };

      // Send DM to member if configured
      if (ruleDef.dm_on_removal !== false) {
        const msgs = plugin.messages;
        if (isReplace) {
          const payload = buildPayload(
            msgs?.role_replaced_dm,
            vars,
            `Your **${roleName}** role in **${guild.name}** has expired. You have been given **${replaceRoleName}** instead.`
          );
          await member.user.send(payload).catch(() => {});
        } else {
          const payload = buildPayload(
            msgs?.role_expired_dm,
            vars,
            `Your **${roleName}** role in **${guild.name}** has expired and been removed.`
          );
          await member.user.send(payload).catch(() => {});
        }
      }

      // Log to channel if configured
      if (ruleDef.log_expiry !== false) {
        const eventKey = isReplace ? "duration_role_replaced" : "duration_role_expired";
        await sendYamlLog(client, row.guild_id, {
          eventKey,
          category: "server",
          vars,
        });
      }

      logger.info(
        { guildId: row.guild_id, userId: row.user_id, roleId: row.role_id, action: isReplace ? "replace" : "remove" },
        "Duration role expired"
      );
    } catch (err) {
      logger.error({ err, row }, "Error processing expired duration role");
    }
  }
}

import { Client, Guild } from "discord.js";
import { getGuildConfig } from "../store/guildConfig";
import { getCasesForUser, addCase } from "./cases";
import { sendModLog } from "./modlog";
import { parseDuration, formatDuration } from "./parseDuration";
import { logger } from "../../lib/logger";

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function normalizeActionType(action: string): string {
  const lower = action.toLowerCase();
  if (lower.startsWith("warn")) return "warn";
  if (lower.startsWith("mute")) return "mute";
  if (lower.startsWith("kick")) return "kick";
  if (lower.startsWith("ban") || lower.startsWith("temp ban") || lower.startsWith("softban")) return "ban";
  return lower;
}

const ACTION_PAST: Record<string, string> = {
  mute: "muted",
  kick: "kicked",
  ban: "banned",
};

const ACTION_PREP: Record<string, string> = {
  mute: "in",
  kick: "from",
  ban: "from",
};

// Shared threshold executor
async function applyEscalationThresholds(
  client: Client,
  guild: Guild,
  userId: string,
  userTag: string,
  triggeredType: string,
  thresholds: any[],
  sectionCfg: any,
  counts: Record<string, number>,
  totalCount: number,
  logLabel: string,
  fullCfg: Awaited<ReturnType<typeof getGuildConfig>>,
): Promise<void> {
  const cfg = fullCfg;

  for (const threshold of thresholds) {
    const trackedType = String(threshold.tracked_type ?? "");
    const requiredCount = Number(threshold.count ?? 0);
    const escalAction = String(threshold.action ?? "");

    if (!["mute", "kick", "ban"].includes(escalAction)) continue;

    if (trackedType !== "any" && trackedType !== triggeredType) continue;

    const current = trackedType === "any" ? totalCount : (counts[trackedType] ?? 0);

    if (current !== requiredCount) continue;

    const reason = String(threshold.reason ?? `Escalation: ${requiredCount} ${trackedType} actions reached`);
    const durationStr = threshold.duration as string | undefined;
    const isPerm = !durationStr || durationStr === "perm" || durationStr === "permanent";
    const durationMs = !isPerm ? parseDuration(durationStr!) : null;
    const durationLabel = durationMs ? formatDuration(durationMs) : "Permanent";

    let fetchedUser: import("discord.js").User | null = null;
    try {
      fetchedUser = await client.users.fetch(userId);
    } catch {
      logger.warn({ userId, guildId: guild.id }, "Escalation: could not fetch user");
    }

    try {
      if (escalAction === "mute") {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          logger.warn({ userId }, "Escalation: mute — member not in guild, skipping");
          continue;
        }
        const muteRole = (cfg.plugins.moderation as any)?.mute_role as string | null | undefined;
        if (muteRole) {
          await member.roles.add(muteRole, reason);
        } else {
          await member.timeout(durationMs ?? MAX_TIMEOUT_MS, reason);
        }
      } else if (escalAction === "kick") {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          logger.warn({ userId }, "Escalation: kick — member not in guild, skipping");
          continue;
        }
        await member.kick(reason);
      } else if (escalAction === "ban") {
        await guild.members.ban(userId, { reason: `[Escalation] ${reason}` });
        if (durationMs) {
          setTimeout(() => {
            guild.members.unban(userId, "Escalation temp ban expired").catch(() => {});
          }, durationMs);
        }
      }

      const caseLabel =
        escalAction === "mute" ? `Mute${durationMs ? ` (${durationLabel})` : ""}` :
        escalAction === "kick" ? "Kick" :
        durationMs ? `Temp Ban (${durationLabel})` : "Ban";

      const caseRecord = await addCase(guild.id, {
        action: caseLabel,
        userId,
        userTag,
        modId:  client.user?.id ?? "0",
        modTag: `${client.user?.username ?? "NightPigeon"} (Auto-Escalation)`,
        reason,
        duration: durationMs ? durationLabel : (escalAction === "ban" ? "Permanent" : undefined),
        expiresAt: durationMs ? Date.now() + durationMs : undefined,
      });

      const vars: Record<string, string> = {
        user:           userTag,
        "user.mention": `<@${userId}>`,
        "user.id":      userId,
        action:         escalAction,
        action_past:    ACTION_PAST[escalAction] ?? `${escalAction}d`,
        reason,
        duration:       durationLabel,
        case_id:        String(caseRecord.id),
        server:         guild.name,
      };
      const interpolate = (tpl: string) =>
        tpl.replace(/\{([\w.]+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);

      const msgs = sectionCfg.messages ?? {};

      const channelTpl = msgs.escalation_triggered;
      const channelText = channelTpl && typeof channelTpl === "string"
        ? interpolate(channelTpl)
        : `⚡ **${userTag}** has been ${ACTION_PAST[escalAction] ?? escalAction} due to repeated infractions | Case: #${caseRecord.id}`;

      await sendModLog(client, guild.id, {
        action:   `⚡ ${logLabel}: ${caseLabel}`,
        executor: { tag: client.user?.username ?? "NightPigeon", id: client.user?.id ?? "0" },
        target:   { tag: userTag, id: userId },
        reason,
        color:    escalAction === "ban" ? 0xe74c3c : escalAction === "kick" ? 0xe67e22 : 0xf39c12,
        caseId:   String(caseRecord.id),
      });

      if (fetchedUser && (cfg.plugins.moderation as any)?.dm_on_action !== false) {
        const dmTpl = msgs.escalation_dm;
        const dmText = dmTpl && typeof dmTpl === "string"
          ? interpolate(dmTpl)
          : `You have been ${ACTION_PAST[escalAction] ?? escalAction} ${ACTION_PREP[escalAction] ?? "in"} ${guild.name} for ${reason}`;
        await fetchedUser.send(dmText).catch(() => {});
      }

      logger.info(
        { guildId: guild.id, userId, escalAction, requiredCount, trackedType, source: logLabel },
        "Escalation triggered",
      );
    } catch (err) {
      logger.error({ err, userId, escalAction, guildId: guild.id }, "Escalation: failed to apply action");
    }
  }
}

// Config reader — supports both `plugin:` and `plugins:` YAML keys
async function getEscalationCfg(guildId: string): Promise<{ escalCfg: any; fullCfg: Awaited<ReturnType<typeof getGuildConfig>> } | null> {
  const fullCfg = await getGuildConfig(guildId);
  // Support singular `plugin:` (as documented) AND plural `plugins:` (internal default)
  const escalCfg = (fullCfg as any)?.plugin?.escalation ?? (fullCfg.plugins as any)?.escalation ?? null;
  if (!escalCfg) return null;
  return { escalCfg, fullCfg };
}

// Manual escalation
// Triggered by human moderator commands (!warn, !mute, !kick, !ban).
// Only counts cases created by human moderators — automod cases are excluded.

export async function checkEscalation(
  client: Client,
  guild: Guild,
  userId: string,
  userTag: string,
  triggeredType: string,
  channel?: { send(content: string): Promise<unknown> },
): Promise<void> {
  try {
    const result = await getEscalationCfg(guild.id);
    if (!result) return;
    const { escalCfg, fullCfg } = result;
    if (!escalCfg?.enabled) return;

    const manual = escalCfg?.manual;
    if (!manual?.enabled) return;

    const thresholds: any[] = manual.thresholds ?? [];
    if (!thresholds.length) return;

    const botId = client.user?.id;
    const cases = await getCasesForUser(guild.id, userId);
    const counts: Record<string, number> = { warn: 0, mute: 0, kick: 0, ban: 0 };
    for (const c of cases) {
      if (botId && c.modId === botId) continue;
      const t = normalizeActionType(c.action);
      if (t in counts) counts[t]!++;
    }
    const totalCount = counts.warn + counts.mute + counts.kick + counts.ban;

    await applyEscalationThresholds(
      client, guild, userId, userTag, triggeredType,
      thresholds, manual, counts, totalCount,
      "Manual Escalation", fullCfg,
    );
  } catch (err) {
    logger.error({ err, userId, guildId: guild.id }, "Escalation (manual): unexpected error");
  }
}

// Auto escalation
// Triggered by automod rules (YAML automod warn action, legacy automod warn).
// Only counts cases created by the bot itself — human moderator cases are excluded.

export async function checkAutoEscalation(
  client: Client,
  guild: Guild,
  userId: string,
  userTag: string,
  triggeredType: string,
): Promise<void> {
  try {
    const result = await getEscalationCfg(guild.id);
    if (!result) return;
    const { escalCfg, fullCfg } = result;
    if (!escalCfg?.enabled) return;

    const auto = escalCfg?.auto;
    if (!auto?.enabled) return;

    const thresholds: any[] = auto.thresholds ?? [];
    if (!thresholds.length) return;

    const botId = client.user?.id;
    const cases = await getCasesForUser(guild.id, userId);
    const counts: Record<string, number> = { warn: 0, mute: 0, kick: 0, ban: 0 };
    for (const c of cases) {
      if (botId && c.modId !== botId) continue;
      const t = normalizeActionType(c.action);
      if (t in counts) counts[t]!++;
    }
    const totalCount = counts.warn + counts.mute + counts.kick + counts.ban;

    await applyEscalationThresholds(
      client, guild, userId, userTag, triggeredType,
      thresholds, auto, counts, totalCount,
      "Auto Escalation", fullCfg,
    );
  } catch (err) {
    logger.error({ err, userId, guildId: guild.id }, "Escalation (auto): unexpected error");
  }
}

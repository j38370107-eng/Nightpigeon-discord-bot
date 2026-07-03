/**
 * Case Expirations
 *
 * Lets staff configure how long each case type stays "active" before it
 * automatically expires — separately for manually-issued cases (real
 * moderators using commands) and automod-issued cases (YAML automod rules,
 * antinuke, antiraid).
 *
 * When a case expires, its `expiresAt` timestamp is reached and it is
 * automatically excluded from escalation / active-warning counts, exactly
 * like a case that was force-expired via `!escalation reset`. The case
 * itself is never deleted — it remains visible in `!cases` / `!case <id>`
 * history with an "Expired" indicator.
 *
 * YAML key: case_expirations.config
 *
 *   case_expirations:
 *     config:
 *       enabled: true
 *       manual:
 *         warn: 30d
 *         mute: null
 *         kick: null
 *         ban: null
 *         note: null
 *       automod:
 *         warn: 14d
 *         mute: null
 *         kick: null
 *         ban: null
 */

import { getGuildConfig } from "../store/guildConfig";
import { parseDuration } from "./parseDuration";

export type CaseExpiryDurations = Partial<Record<"warn" | "mute" | "kick" | "ban" | "note", string | null>>;

export interface CaseExpirationsConfig {
  enabled?: boolean;
  manual?: CaseExpiryDurations;
  automod?: CaseExpiryDurations;
}

/**
 * Collapse a specific case action string (e.g. "Mute (10m)", "tempban",
 * "Manual Case — Warn") down to one of the base buckets used in config.
 */
export function baseActionType(action: string): "warn" | "mute" | "kick" | "ban" | "note" | "other" {
  const lower = action.toLowerCase();
  if (lower.includes("warn")) return "warn";
  if (lower.includes("mute") || lower.includes("timeout")) return "mute";
  if (lower.includes("kick")) return "kick";
  if (lower.includes("ban")) return "ban";
  if (lower.includes("note")) return "note";
  return "other";
}

/**
 * Compute the expiresAt timestamp (ms epoch) a newly-created case should get
 * based on the guild's `case_expirations` config, or `undefined` if no
 * expiration applies (case never auto-expires from this system).
 *
 * Does nothing if the case already has a natural expiresAt (e.g. a timed
 * mute/ban whose case duration already implies an end time) — callers
 * should only invoke this when `data.expiresAt` is undefined.
 */
export async function computeCaseExpiresAt(
  guildId: string,
  action: string,
  isAutomod: boolean,
  createdAt: number,
): Promise<number | undefined> {
  try {
    const cfg = await getGuildConfig(guildId);
    const expCfg: CaseExpirationsConfig | undefined = (cfg as any).case_expirations?.config;
    if (!expCfg?.enabled) return undefined;

    const bucket = isAutomod ? expCfg.automod : expCfg.manual;
    if (!bucket) return undefined;

    const type = baseActionType(action);
    if (type === "other") return undefined;

    const raw = bucket[type];
    if (!raw) return undefined;

    const ms = parseDuration(String(raw));
    if (!ms) return undefined;

    return createdAt + ms;
  } catch {
    return undefined;
  }
}

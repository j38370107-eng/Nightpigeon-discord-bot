import { logger } from "../../lib/logger";
import { dbSet, dbGetAll, dbDelete } from "./db";

const STORE = "autoclean";

export type AutocleanMode = "interval" | "keepx" | "maxage";

export interface AutocleanRule {
  channelId: string;
  guildId: string;
  mode: AutocleanMode;
  value: number;          // interval_seconds | keep_count | max_age_seconds
  enabled: boolean;
  delaySeconds: number;   // delay between individual deletions
  ignorePinned: boolean;
  ignoreBots: boolean;    // never delete bot messages
  ignoreRoles: string[];  // never delete messages from users with these roles
  ignoreUsers: string[];  // never delete messages from these specific user IDs
  onlyBots: boolean;      // ONLY delete bot messages
  onlyImages: boolean;    // ONLY delete messages that have attachments
  onlyText: boolean;      // ONLY delete text-only messages (no attachments)
  minLength: number;      // skip messages shorter than this character count
  lastRun?: number;       // timestamp of last interval cycle (interval mode)
}

const cache = new Map<string, AutocleanRule>();

function key(guildId: string, channelId: string): string {
  return `${guildId}:${channelId}`;
}

function migrate(raw: any): AutocleanRule {
  return {
    channelId:    raw.channelId,
    guildId:      raw.guildId,
    mode:         raw.mode ?? "interval",
    value:        raw.value ?? 3600,
    enabled:      raw.enabled ?? true,
    // backward compat: old records stored delayMs in milliseconds
    delaySeconds: raw.delaySeconds ?? (raw.delayMs != null ? raw.delayMs / 1000 : 0),
    ignorePinned: raw.ignorePinned ?? true,
    ignoreBots:   raw.ignoreBots ?? false,
    ignoreRoles:  raw.ignoreRoles ?? [],
    ignoreUsers:  raw.ignoreUsers ?? [],
    onlyBots:     raw.onlyBots ?? false,
    onlyImages:   raw.onlyImages ?? false,
    onlyText:     raw.onlyText ?? false,
    minLength:    raw.minLength ?? 0,
    lastRun:      raw.lastRun,
  };
}

export async function initAutocleanStore(): Promise<void> {
  const rows = await dbGetAll<AutocleanRule>(STORE);
  for (const { key: k, data } of rows) cache.set(k, migrate(data));
  logger.info({ count: cache.size }, "Autoclean store loaded");
}

export function getAutocleanRule(guildId: string, channelId: string): AutocleanRule | undefined {
  return cache.get(key(guildId, channelId));
}

export function listAutocleanRules(guildId: string): AutocleanRule[] {
  return [...cache.values()].filter((r) => r.guildId === guildId);
}

export function allAutocleanRules(): AutocleanRule[] {
  return [...cache.values()];
}

export async function setAutocleanRule(rule: AutocleanRule): Promise<void> {
  const k = key(rule.guildId, rule.channelId);
  cache.set(k, rule);
  await dbSet(STORE, k, rule);
}

export async function removeAutocleanRule(guildId: string, channelId: string): Promise<boolean> {
  const k = key(guildId, channelId);
  if (!cache.has(k)) return false;
  cache.delete(k);
  await dbDelete(STORE, k);
  return true;
}

export async function updateAutocleanRule(
  guildId: string,
  channelId: string,
  patch: Partial<AutocleanRule>,
): Promise<boolean> {
  const k = key(guildId, channelId);
  const existing = cache.get(k);
  if (!existing) return false;
  const updated = { ...existing, ...patch };
  cache.set(k, updated);
  await dbSet(STORE, k, updated);
  return true;
}

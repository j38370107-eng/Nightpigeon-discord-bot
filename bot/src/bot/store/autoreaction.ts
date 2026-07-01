import { logger } from "../../lib/logger";
import { dbSet, dbGetAll, dbDelete } from "./db";

const STORE = "autoreaction";

export type AutoreactionTriggerType = "contains" | "exact" | "startswith" | "endswith" | "regex";

export interface AutoreactionRule {
  id: string;
  guildId: string;
  trigger_type: AutoreactionTriggerType;
  trigger: string;
  match_case: boolean;
  emojis: string[];
  cooldown_seconds: number;
  global_cooldown_seconds: number;
  only_channels: string[];
  ignore_channels: string[];
  only_roles: string[];
  ignore_roles: string[];
  ignore_users: string[];
  min_length: number;
  max_length: number;
  delete_after_reaction: boolean;
  enabled: boolean;
  source?: "db" | "yaml";
}

const cache = new Map<string, AutoreactionRule>();

const userCooldowns = new Map<string, number>();
const globalCooldowns = new Map<string, number>();

function cacheKey(guildId: string, id: string): string {
  return `${guildId}:${id}`;
}

export async function initAutoreactionStore(): Promise<void> {
  const rows = await dbGetAll<AutoreactionRule>(STORE);
  for (const { key: k, data } of rows) {
    cache.set(k, { ...data, source: "db" });
  }
  logger.info({ count: cache.size }, "Autoreaction store loaded");
}

export function listAutoreactionRules(guildId: string): AutoreactionRule[] {
  return [...cache.values()].filter((r) => r.guildId === guildId);
}

export function listDbRules(guildId: string): AutoreactionRule[] {
  return [...cache.values()].filter((r) => r.guildId === guildId && r.source !== "yaml");
}

export function getAutoreactionRule(guildId: string, id: string): AutoreactionRule | undefined {
  return cache.get(cacheKey(guildId, id));
}

export async function addAutoreactionRule(rule: AutoreactionRule): Promise<void> {
  const k = cacheKey(rule.guildId, rule.id);
  const withSource = { ...rule, source: "db" as const };
  cache.set(k, withSource);
  await dbSet(STORE, k, withSource);
}

export async function removeAutoreactionRule(guildId: string, id: string): Promise<boolean> {
  const k = cacheKey(guildId, id);
  const rule = cache.get(k);
  if (!rule || rule.source === "yaml") return false;
  cache.delete(k);
  await dbDelete(STORE, k);
  return true;
}

export async function updateAutoreactionRule(
  guildId: string,
  id: string,
  patch: Partial<AutoreactionRule>
): Promise<boolean> {
  const k = cacheKey(guildId, id);
  const existing = cache.get(k);
  if (!existing || existing.source === "yaml") return false;
  const updated = { ...existing, ...patch };
  cache.set(k, updated);
  await dbSet(STORE, k, updated);
  return true;
}

export function idExists(guildId: string, id: string): boolean {
  return cache.has(cacheKey(guildId, id));
}

export function generateRuleId(guildId: string): string {
  const existing = listAutoreactionRules(guildId);
  let n = existing.length + 1;
  while (existing.some((r) => r.id === String(n))) n++;
  return String(n);
}

export function loadYamlRules(guildId: string, yamlRules: any[]): void {
  for (const existing of [...cache.values()].filter((r) => r.guildId === guildId && r.source === "yaml")) {
    cache.delete(cacheKey(guildId, existing.id));
  }
  for (const raw of yamlRules) {
    if (!raw.id || !raw.emojis) continue;
    const rule: AutoreactionRule = {
      id: String(raw.id),
      guildId,
      trigger_type: raw.trigger_type ?? "contains",
      trigger: raw.trigger ?? "",
      match_case: raw.match_case ?? false,
      emojis: Array.isArray(raw.emojis) ? raw.emojis : [raw.emojis],
      cooldown_seconds: raw.cooldown_seconds ?? 0,
      global_cooldown_seconds: raw.global_cooldown_seconds ?? 0,
      only_channels: raw.only_channels?.map(String) ?? [],
      ignore_channels: raw.ignore_channels?.map(String) ?? [],
      only_roles: raw.only_roles?.map(String) ?? [],
      ignore_roles: raw.ignore_roles?.map(String) ?? [],
      ignore_users: raw.ignore_users?.map(String) ?? [],
      min_length: raw.min_length ?? 0,
      max_length: raw.max_length ?? 0,
      delete_after_reaction: raw.delete_after_reaction ?? false,
      enabled: raw.enabled ?? true,
      source: "yaml",
    };
    cache.set(cacheKey(guildId, rule.id), rule);
  }
}

export function checkAndSetUserCooldown(guildId: string, ruleId: string, userId: string, seconds: number): boolean {
  if (seconds <= 0) return true;
  const k = `${guildId}:${ruleId}:${userId}`;
  const expiry = userCooldowns.get(k) ?? 0;
  const now = Date.now();
  if (now < expiry) return false;
  userCooldowns.set(k, now + seconds * 1000);
  return true;
}

export function checkAndSetGlobalCooldown(guildId: string, ruleId: string, seconds: number): boolean {
  if (seconds <= 0) return true;
  const k = `${guildId}:${ruleId}`;
  const expiry = globalCooldowns.get(k) ?? 0;
  const now = Date.now();
  if (now < expiry) return false;
  globalCooldowns.set(k, now + seconds * 1000);
  return true;
}

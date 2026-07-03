import { getGuildSetting, setGuildSetting } from "./settings";

export const PERMANENT_MS = 0; // sentinel: warnings never expire

const DEFAULT_WARN_MS = 30 * 24 * 60 * 60 * 1000; // 1 month
const DEFAULT_AUTOMOD_WARN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getWarnExpiry(guildId: string): number {
  const ms = getGuildSetting(guildId, "warnExpiryMs");
  if (ms === 0) return PERMANENT_MS; // explicit permanent
  if (ms) return ms;
  const months = getGuildSetting(guildId, "warnExpiryMonths") ?? 1;
  return months * 30 * 24 * 60 * 60 * 1000;
}

export function isWarnPermanent(guildId: string): boolean {
  return getWarnExpiry(guildId) === PERMANENT_MS;
}

export function setWarnExpiry(guildId: string, ms: number): void {
  setGuildSetting(guildId, "warnExpiryMs", ms);
}

export function getWarnExpiryLabel(guildId: string): string {
  return msToLabel(getWarnExpiry(guildId));
}

export function getAutomodWarnExpiry(guildId: string): number {
  const ms = getGuildSetting(guildId, "automodWarnExpiryMs");
  if (ms === 0) return PERMANENT_MS;
  return ms ?? DEFAULT_AUTOMOD_WARN_MS;
}

export function isAutomodWarnPermanent(guildId: string): boolean {
  return getAutomodWarnExpiry(guildId) === PERMANENT_MS;
}

export function setAutomodWarnExpiry(guildId: string, ms: number): void {
  setGuildSetting(guildId, "automodWarnExpiryMs", ms);
}

export function getAutomodWarnExpiryLabel(guildId: string): string {
  return msToLabel(getAutomodWarnExpiry(guildId));
}

export function msToLabel(ms: number): string {
  if (ms === PERMANENT_MS) return "Never (Permanent)";
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days === 1) return "1 day";
  if (days < 7) return `${days} days`;
  if (days % 30 === 0) {
    const mo = days / 30;
    return `${mo} month${mo === 1 ? "" : "s"}`;
  }
  if (days % 7 === 0) {
    const wk = days / 7;
    return `${wk} week${wk === 1 ? "" : "s"}`;
  }
  return `${days} days`;
}

export function parseDurationMs(input: string): number | null {
  const match = input.match(/^(\d+)(d|w|mo|m)$/i);
  if (!match) return null;
  const value = parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  if (unit === "d") return value * 24 * 60 * 60 * 1000;
  if (unit === "w") return value * 7 * 24 * 60 * 60 * 1000;
  if (unit === "mo" || unit === "m") return value * 30 * 24 * 60 * 60 * 1000;
  return null;
}

// Kept for backward compat
export function getWarnExpiryMonths(guildId: string): number {
  return getGuildSetting(guildId, "warnExpiryMonths") ?? 1;
}

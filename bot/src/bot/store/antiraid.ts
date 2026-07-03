import { logger } from "../../lib/logger";
import { dbSet, dbGetAll, dbGet } from "./db";

const STORE = "antiraid";
const POLL_INTERVAL_MS = 30_000;

export type AntiRaidAction = "ban" | "kick" | "mute";
export type NewAccountAction = "flag" | "timeout" | "kick" | "ban";
export type BotGuardAdderAction = "flag" | "kick" | "ban" | "strip";

export interface AntiRaidConfig {
  enabled: boolean;

  // Mass join detection
  joinThreshold: number;
  joinWindowMs: number;

  // Join scope: track all joins or only suspicious ones
  // "all"        = count every join toward the raid threshold
  // "suspicious" = only count joins that have at least one suspicious signal
  joinScope: "all" | "suspicious";

  // Action level
  // 1 = alert only (log + DM owner)
  // 2 = timeout (1 hour) all raid joiners
  // 3 = kick all raid joiners
  // 4 = ban all raid joiners + auto-lockdown
  actionLevel: 1 | 2 | 3 | 4;

  // Legacy action / lockdown fields (still respected)
  action: AntiRaidAction;
  lockdown: boolean;

  // New-account detection
  newAccountEnabled: boolean;
  newAccountAgeDays: number;
  newAccountAction: NewAccountAction;

  // No-avatar filter
  noAvatarEnabled: boolean;
  noAvatarAction: NewAccountAction;

  // Default username filter
  // Matches Discord's default "User" pattern and auto-generated usernames
  defaultUsernameEnabled: boolean;
  defaultUsernameAction: NewAccountAction;

  // Custom username filter
  usernameFilterEnabled: boolean;
  usernameFilterPatterns: string[];         // substrings / regex patterns (case-insensitive)
  usernameFilterAction: NewAccountAction;

  // Suspicious account detection
  // Triggers when an account accumulates enough suspicious signals
  suspiciousEnabled: boolean;
  suspiciousThreshold: number;              // signals required to trigger (1–4)
  suspiciousAction: NewAccountAction;

  // Bot guard
  // Only users on the whitelist may add bots to the server
  botGuardEnabled: boolean;
  botGuardRemoveBot: boolean;               // kick the unauthorized bot itself
  botGuardPunishAdder: boolean;             // take action against the person who added it
  botGuardAdderAction: BotGuardAdderAction; // action taken on the adder
  botGuardAllowedBots: string[];            // bot user-IDs that are always allowed regardless

  // Whitelist
  whitelist: string[];
  whitelistRoles: string[];

  // Channels
  logChannel?: string;
  alertChannelId?: string;
}

const DEFAULT: AntiRaidConfig = {
  enabled: false,
  joinThreshold: 10,
  joinWindowMs: 10_000,
  joinScope: "all",
  actionLevel: 3,
  action: "kick",
  lockdown: false,
  newAccountEnabled: false,
  newAccountAgeDays: 7,
  newAccountAction: "flag",
  noAvatarEnabled: false,
  noAvatarAction: "flag",
  defaultUsernameEnabled: false,
  defaultUsernameAction: "flag",
  usernameFilterEnabled: false,
  usernameFilterPatterns: [],
  usernameFilterAction: "flag",
  suspiciousEnabled: false,
  suspiciousThreshold: 2,
  suspiciousAction: "kick",
  botGuardEnabled: false,
  botGuardRemoveBot: true,
  botGuardPunishAdder: true,
  botGuardAdderAction: "kick",
  botGuardAllowedBots: [],
  whitelist: [],
  whitelistRoles: [],
};

const cache = new Map<string, AntiRaidConfig>();

async function loadFromDb(): Promise<void> {
  const rows = await dbGetAll<AntiRaidConfig>(STORE);
  for (const { key, data } of rows) cache.set(key, data);
}

export async function initAntiraidStore(): Promise<void> {
  await loadFromDb();
  logger.info({ count: cache.size }, "Loaded antiraid store from DB");
  // Re-sync every 30 s so dashboard changes propagate to the bot without restart
  setInterval(() => {
    loadFromDb().catch((err) => logger.error({ err }, "Antiraid store poll failed"));
  }, POLL_INTERVAL_MS);
}

function save(guildId: string): void {
  dbSet(STORE, guildId, cache.get(guildId)!).catch((err) =>
    logger.error({ err }, "Failed to save antiraid config"),
  );
}

export function getAntiRaid(guildId: string): AntiRaidConfig {
  const base = cache.get(guildId);
  if (!base) return { ...DEFAULT, whitelist: [], whitelistRoles: [], botGuardAllowedBots: [], usernameFilterPatterns: [] };
  return {
    ...DEFAULT,
    ...base,
    whitelist: base.whitelist ?? [],
    whitelistRoles: base.whitelistRoles ?? [],
    botGuardAllowedBots: base.botGuardAllowedBots ?? [],
    usernameFilterPatterns: base.usernameFilterPatterns ?? [],
  };
}

export function resetAntiRaidConfig(guildId: string): void {
  const fresh: AntiRaidConfig = {
    ...DEFAULT,
    whitelist: [],
    whitelistRoles: [],
    botGuardAllowedBots: [],
    usernameFilterPatterns: [],
  };
  cache.set(guildId, fresh);
  dbSet(STORE, guildId, fresh).catch((err) =>
    logger.error({ err }, "Failed to reset antiraid config"),
  );
}

export function updateAntiRaid(guildId: string, partial: Partial<AntiRaidConfig>): AntiRaidConfig {
  if (partial.newAccountAgeDays !== undefined) {
    partial.newAccountAgeDays = Math.min(100, Math.max(1, partial.newAccountAgeDays));
  }
  const updated = { ...getAntiRaid(guildId), ...partial };
  cache.set(guildId, updated);
  save(guildId);
  return updated;
}

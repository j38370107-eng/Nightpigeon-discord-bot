import { logger } from "../../lib/logger";
import { dbSet, dbGetAll } from "./db";

const STORE = "antinuke";

export type AntiNukeAction = "ban" | "kick" | "strip";

export interface AntiNukeThresholds {
  channelDelete: number;
  channelCreate: number;
  roleDelete: number;
  roleCreate: number;
  ban: number;
  kick: number;
  webhookCreate: number;
  webhookDelete: number;
  massTimeout: number;
  channelRename: number;
  roleRename: number;
}

export interface AntiNukeConfig {
  enabled: boolean;
  action: AntiNukeAction;
  thresholds: AntiNukeThresholds;
  windowMs: number;
  whitelist: string[];
  whitelistRoles: string[];
  logChannel?: string;
  dmOwner: boolean;
  watchRolePerms: boolean;
  watchServerUpdate: boolean;
  restoreEnabled: boolean;

  // Role permission protection
  revertRolePerms: boolean;
  punishRolePerms: boolean;

  // @everyone protection
  watchEveryonePerms: boolean;

  // Advanced event protections
  antiPruneEnabled: boolean;
  antiVanityEnabled: boolean;
  antiServerRenameEnabled: boolean;
  antiServerIconEnabled: boolean;
  antiRoleRenameEnabled: boolean;
  antiChannelRenameEnabled: boolean;

  // Auto-revert renames
  revertServerRename: boolean;
  revertRoleRename: boolean;
  revertChannelRename: boolean;
}

// Recovery Caches (in-memory, cleared on bot restart)
export interface CachedChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
  topic: string | null;
  nsfw: boolean;
  permOverwrites: { id: string; type: number; allow: string; deny: string }[];
  deletedAt: number;
}

export interface CachedRole {
  id: string;
  name: string;
  color: number;
  permissions: string;
  mentionable: boolean;
  hoist: boolean;
  position: number;
  deletedAt: number;
}

const MAX_CACHE_AGE_MS = 30 * 60 * 1000;

export const channelRecoveryCache = new Map<string, CachedChannel[]>();
export const roleRecoveryCache = new Map<string, CachedRole[]>();

export function cacheDeletedChannel(guildId: string, ch: CachedChannel): void {
  const list = (channelRecoveryCache.get(guildId) ?? []).filter(
    (c) => Date.now() - c.deletedAt < MAX_CACHE_AGE_MS,
  );
  list.push(ch);
  channelRecoveryCache.set(guildId, list);
}

export function cacheDeletedRole(guildId: string, r: CachedRole): void {
  const list = (roleRecoveryCache.get(guildId) ?? []).filter(
    (c) => Date.now() - c.deletedAt < MAX_CACHE_AGE_MS,
  );
  list.push(r);
  roleRecoveryCache.set(guildId, list);
}

// Config Store
const DEFAULT: AntiNukeConfig = {
  enabled: false,
  action: "ban",
  thresholds: {
    channelDelete: 3,
    channelCreate: 5,
    roleDelete: 3,
    roleCreate: 5,
    ban: 3,
    kick: 5,
    webhookCreate: 3,
    webhookDelete: 3,
    massTimeout: 5,
    channelRename: 3,
    roleRename: 3,
  },
  windowMs: 10_000,
  whitelist: [],
  whitelistRoles: [],
  dmOwner: true,
  watchRolePerms: true,
  watchServerUpdate: true,
  restoreEnabled: false,
  revertRolePerms: false,
  punishRolePerms: false,
  watchEveryonePerms: true,
  antiPruneEnabled: false,
  antiVanityEnabled: false,
  antiServerRenameEnabled: false,
  antiServerIconEnabled: false,
  antiRoleRenameEnabled: false,
  antiChannelRenameEnabled: false,
  revertServerRename: true,
  revertRoleRename: true,
  revertChannelRename: true,
};

const cache = new Map<string, AntiNukeConfig>();

async function loadFromDb(): Promise<void> {
  const rows = await dbGetAll<AntiNukeConfig>(STORE);
  for (const { key, data } of rows) cache.set(key, data);
}

export async function initAntinukeStore(): Promise<void> {
  await loadFromDb();
  logger.info({ count: cache.size }, "Loaded antinuke store from DB");
  setInterval(() => {
    loadFromDb().catch((err) => logger.error({ err }, "Failed to refresh antinuke cache"));
  }, 5_000);
}

function save(guildId: string): void {
  dbSet(STORE, guildId, cache.get(guildId)!).catch((err) =>
    logger.error({ err }, "Failed to save antinuke config"),
  );
}

export function getAntiNuke(guildId: string): AntiNukeConfig {
  const base = cache.get(guildId);
  if (!base)
    return {
      ...DEFAULT,
      thresholds: { ...DEFAULT.thresholds },
      whitelist: [],
      whitelistRoles: [],
    };
  return {
    ...DEFAULT,
    ...base,
    thresholds: { ...DEFAULT.thresholds, ...base.thresholds },
    whitelist: base.whitelist ?? [],
    whitelistRoles: base.whitelistRoles ?? [],
  };
}

export function setAntiNuke(guildId: string, cfg: AntiNukeConfig): void {
  cache.set(guildId, cfg);
  save(guildId);
}

export function resetAntiNukeConfig(guildId: string): void {
  const fresh: AntiNukeConfig = {
    ...DEFAULT,
    thresholds: { ...DEFAULT.thresholds },
    whitelist: [],
    whitelistRoles: [],
  };
  cache.set(guildId, fresh);
  dbSet(STORE, guildId, fresh).catch((err) =>
    logger.error({ err }, "Failed to reset antinuke config"),
  );
}

export function updateAntiNuke(
  guildId: string,
  partial: Partial<AntiNukeConfig>,
): AntiNukeConfig {
  const updated = { ...getAntiNuke(guildId), ...partial };
  cache.set(guildId, updated);
  save(guildId);
  return updated;
}

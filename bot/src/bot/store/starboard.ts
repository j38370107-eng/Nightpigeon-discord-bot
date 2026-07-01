import { logger } from "../../lib/logger";
import { dbSet, dbGet, dbGetAll, dbDelete } from "./db";

const ENTRIES_STORE  = "starboardEntries";
const RUNTIME_STORE  = "starboardRuntime";

// YAML config types (read from plugins.starboard in guild YAML)
export interface ColorTier {
  min_stars: number;
  color: string;
}

export interface PostFormat {
  show_author?: boolean;
  show_jump_link?: boolean;
  show_attachment?: boolean;
  show_channel?: boolean;
  show_timestamp?: boolean;
  star_count_format?: string;
  embed_color?: string;
  embed_color_by_count?: boolean;
  color_tiers?: ColorTier[];
  super_star_threshold?: number;
  super_star_emoji?: string;
}

export interface ExtraBoardConfig {
  name: string;
  channel: string;
  emoji: string;
  threshold: number;
  self_star?: boolean;
  ignore_channels?: string[];
  ignore_roles?: string[];
  nsfw_allowed?: boolean;
  bots_allowed?: boolean;
  embed_color?: string;
  only_roles?: string[];
}

export interface StarboardMessages {
  starboard_empty?: string;
  stats_none?: string;
  starboard_cleared?: string;
  starboard_ignored?: string;
  starboard_unignored?: string;
  channel_ignored?: string;
  channel_unignored?: string;
  already_ignored?: string;
  not_ignored?: string;
  lock_success?: string;
  unlock_success?: string;
  force_posted?: string;
  already_posted?: string;
  message_not_found?: string;
  message_too_old?: string;
  self_star_blocked?: string;
}

export interface StarboardPluginConfig {
  enabled?: boolean;
  channel?: string | null;
  emoji?: string;
  threshold?: number;
  self_star?: boolean;
  remove_on_unstar?: boolean;
  update_on_new_stars?: boolean;
  lock_after_post?: boolean;
  repost_if_edited?: boolean;
  ignore_channels?: string[];
  ignore_roles?: string[];
  ignored_users?: string[];
  nsfw_allowed?: boolean;
  bots_allowed?: boolean;
  max_age_days?: number;
  min_message_length?: number;
  post_format?: PostFormat;
  extra_boards?: ExtraBoardConfig[];
  messages?: StarboardMessages;
}

// Runtime state (locked flag + dynamic ignore lists set via commands)
export interface StarboardRuntime {
  locked: boolean;
  ignoredUsers: string[];
  ignoredChannels: string[];
}

// Starboard entry
export interface StarboardEntry {
  originalMessageId: string;
  starboardMessageId: string;
  authorId: string;
  channelId: string;
  guildId: string;
  starCount: number;
  starredBy: string[];
  boardName: string;
}

// In-memory caches
const runtimeCache = new Map<string, StarboardRuntime>();
const entryCache   = new Map<string, StarboardEntry>();

function runtimeKey(guildId: string): string {
  return guildId;
}

function entryKey(messageId: string, boardName: string): string {
  return `${messageId}:${boardName}`;
}

// Init
export async function initStarboardStore(): Promise<void> {
  const runtimeRows = await dbGetAll<StarboardRuntime>(RUNTIME_STORE);
  for (const { key, data } of runtimeRows) runtimeCache.set(key, data);

  const entryRows = await dbGetAll<StarboardEntry>(ENTRIES_STORE);
  for (const { key, data } of entryRows) entryCache.set(key, data);

  logger.info({ runtimes: runtimeCache.size, entries: entryCache.size }, "Starboard store loaded");
}

// Runtime helpers
export function getStarboardRuntime(guildId: string): StarboardRuntime {
  return runtimeCache.get(runtimeKey(guildId)) ?? { locked: false, ignoredUsers: [], ignoredChannels: [] };
}

async function saveRuntime(guildId: string, runtime: StarboardRuntime): Promise<void> {
  runtimeCache.set(runtimeKey(guildId), runtime);
  await dbSet(RUNTIME_STORE, runtimeKey(guildId), runtime);
}

export async function setStarboardLocked(guildId: string, locked: boolean): Promise<void> {
  const rt = getStarboardRuntime(guildId);
  await saveRuntime(guildId, { ...rt, locked });
}

export async function addIgnoredUser(guildId: string, userId: string): Promise<boolean> {
  const rt = getStarboardRuntime(guildId);
  if (rt.ignoredUsers.includes(userId)) return false;
  await saveRuntime(guildId, { ...rt, ignoredUsers: [...rt.ignoredUsers, userId] });
  return true;
}

export async function removeIgnoredUser(guildId: string, userId: string): Promise<boolean> {
  const rt = getStarboardRuntime(guildId);
  if (!rt.ignoredUsers.includes(userId)) return false;
  await saveRuntime(guildId, { ...rt, ignoredUsers: rt.ignoredUsers.filter((id) => id !== userId) });
  return true;
}

export async function addIgnoredChannel(guildId: string, channelId: string): Promise<boolean> {
  const rt = getStarboardRuntime(guildId);
  if (rt.ignoredChannels.includes(channelId)) return false;
  await saveRuntime(guildId, { ...rt, ignoredChannels: [...rt.ignoredChannels, channelId] });
  return true;
}

export async function removeIgnoredChannel(guildId: string, channelId: string): Promise<boolean> {
  const rt = getStarboardRuntime(guildId);
  if (!rt.ignoredChannels.includes(channelId)) return false;
  await saveRuntime(guildId, { ...rt, ignoredChannels: rt.ignoredChannels.filter((id) => id !== channelId) });
  return true;
}

// Entry helpers
export function getStarboardEntry(originalMessageId: string, boardName = "main"): StarboardEntry | undefined {
  return entryCache.get(entryKey(originalMessageId, boardName));
}

export async function saveStarboardEntry(entry: StarboardEntry): Promise<void> {
  const k = entryKey(entry.originalMessageId, entry.boardName);
  entryCache.set(k, entry);
  await dbSet(ENTRIES_STORE, k, entry);
}

export async function deleteStarboardEntry(originalMessageId: string, boardName = "main"): Promise<void> {
  const k = entryKey(originalMessageId, boardName);
  entryCache.delete(k);
  await dbDelete(ENTRIES_STORE, k);
}

export async function getTopStarboardEntries(guildId: string, count: number, boardName = "main"): Promise<StarboardEntry[]> {
  return [...entryCache.values()]
    .filter((e) => e.guildId === guildId && e.boardName === boardName)
    .sort((a, b) => b.starCount - a.starCount)
    .slice(0, count);
}

export async function removeStarboardEntriesByUser(guildId: string, authorId: string): Promise<number> {
  const toRemove = [...entryCache.values()].filter((e) => e.guildId === guildId && e.authorId === authorId);
  for (const entry of toRemove) {
    const k = entryKey(entry.originalMessageId, entry.boardName);
    entryCache.delete(k);
    await dbDelete(ENTRIES_STORE, k);
  }
  return toRemove.length;
}

export function getStarboardEntriesForUser(guildId: string, userId: string): StarboardEntry[] {
  return [...entryCache.values()].filter((e) => e.guildId === guildId && e.authorId === userId);
}

export function getStarboardGivenCount(guildId: string, userId: string): number {
  return [...entryCache.values()]
    .filter((e) => e.guildId === guildId)
    .filter((e) => e.starredBy.includes(userId)).length;
}

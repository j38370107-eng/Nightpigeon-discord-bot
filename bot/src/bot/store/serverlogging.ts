import { logger } from "../../lib/logger";
import { dbSet, dbGetAll } from "./db";

const STORE = "serverlog";

export type LogCategory =
  | "messages"
  | "members"
  | "roles"
  | "channels"
  | "server"
  | "voice"
  | "invites"
  | "threads"
  | "emoji"
  | "bots";

export interface ServerLoggingConfig {
  enabled: boolean;
  splitChannels: boolean;
  combinedChannelId?: string;
  categoryChannels: Partial<Record<LogCategory, string>>;
  disabledEvents: string[];
  ignoredChannels: string[];
  ignoredRoles: string[];
  ignoredUsers: string[];
  logBotActions: boolean;
}

const DEFAULT_CONFIG: ServerLoggingConfig = {
  enabled: false,
  splitChannels: false,
  categoryChannels: {},
  disabledEvents: [],
  ignoredChannels: [],
  ignoredRoles: [],
  ignoredUsers: [],
  logBotActions: false,
};

const cache = new Map<string, ServerLoggingConfig>();

async function loadFromDb(): Promise<void> {
  const rows = await dbGetAll<ServerLoggingConfig>(STORE);
  for (const { key, data } of rows) cache.set(key, data);
}

export async function initServerLoggingStore(): Promise<void> {
  await loadFromDb();
  logger.info({ count: cache.size }, "Loaded server logging store from DB");
  setInterval(() => {
    loadFromDb().catch((err) =>
      logger.error({ err }, "Failed to refresh server logging cache")
    );
  }, 30_000);
}

export function getServerLoggingConfig(guildId: string): ServerLoggingConfig {
  return cache.get(guildId) ?? { ...DEFAULT_CONFIG };
}

export function setServerLoggingConfig(
  guildId: string,
  config: ServerLoggingConfig
): void {
  cache.set(guildId, config);
  dbSet(STORE, guildId, config).catch((err) =>
    logger.error({ err }, "Failed to save server logging config")
  );
}

export const EVENT_CATEGORY: Record<string, LogCategory> = {
  messageDelete: "messages",
  messageEdit: "messages",
  messageBulkDelete: "messages",
  messagePinned: "messages",
  memberJoin: "members",
  memberLeave: "members",
  memberKick: "members",
  memberBan: "members",
  memberUnban: "members",
  nicknameChange: "members",
  usernameChange: "members",
  avatarChange: "members",
  rolesChange: "members",
  memberTimeout: "members",
  timeoutRemoved: "members",
  roleCreate: "roles",
  roleDelete: "roles",
  roleUpdate: "roles",
  channelCreate: "channels",
  channelDelete: "channels",
  channelUpdate: "channels",
  serverUpdate: "server",
  boostChange: "server",
  voiceJoin: "voice",
  voiceLeave: "voice",
  voiceMove: "voice",
  voiceMuteDeafen: "voice",
  stageEvent: "voice",
  inviteCreate: "invites",
  inviteDelete: "invites",
  inviteUsed: "invites",
  threadCreate: "threads",
  threadDelete: "threads",
  threadUpdate: "threads",
  threadMemberAdd: "threads",
  threadMemberRemove: "threads",
  emojiCreate: "emoji",
  emojiDelete: "emoji",
  emojiUpdate: "emoji",
  stickerCreate: "emoji",
  stickerDelete: "emoji",
  stickerUpdate: "emoji",
  botAdded: "bots",
  botRemoved: "bots",
  webhookCreate: "bots",
  webhookDelete: "bots",
  integrationChange: "bots",
  automodAction: "bots",
  channelPermissionsUpdate: "channels",
  voiceStream: "voice",
  stageCreate: "voice",
  stageDelete: "voice",
  stageUpdate: "voice",
  scheduledEventCreate: "server",
  scheduledEventDelete: "server",
  scheduledEventUpdate: "server",
};

export function getLogChannel(
  guildId: string,
  eventKey: string
): string | null {
  const config = cache.get(guildId);
  if (!config || !config.enabled) return null;
  if (config.disabledEvents.includes(eventKey)) return null;

  const category = EVENT_CATEGORY[eventKey];
  if (!category) return null;

  if (config.splitChannels) {
    return (
      config.categoryChannels?.[category] ??
      config.combinedChannelId ??
      null
    );
  }
  return config.combinedChannelId ?? null;
}

export function isChannelIgnored(guildId: string, channelId: string): boolean {
  return cache.get(guildId)?.ignoredChannels?.includes(channelId) ?? false;
}

export function isRoleIgnored(guildId: string, roleIds: string[]): boolean {
  const ignored = cache.get(guildId)?.ignoredRoles ?? [];
  return roleIds.some((r) => ignored.includes(r));
}

export function isUserIgnored(guildId: string, userId: string): boolean {
  return cache.get(guildId)?.ignoredUsers?.includes(userId) ?? false;
}

export function shouldLogBotActions(guildId: string): boolean {
  return cache.get(guildId)?.logBotActions ?? false;
}

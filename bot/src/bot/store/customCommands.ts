import { logger } from "../../lib/logger";
import { dbSet, dbGetAll } from "./db";

const STORE = "customCommands";

export interface EmbedConfig {
  enabled: boolean;
  title?: string;
  description?: string;
  color?: string;
  footer?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  author?: string;
}

export interface CustomCommand {
  id: string;
  trigger: string;
  response: string;
  embed?: EmbedConfig;
  createdAt: number;
  allowedRoles: string[];
  allowedChannels: string[];
  blockedRoles: string[];
  blockedChannels: string[];
  cooldown: number;
  cooldownType: "user" | "channel" | "global";
}

const MAX_COMMANDS = 50;

const cache = new Map<string, CustomCommand[]>();

/**
 * Dashboard saves custom commands as Record<string, CustomCommand> (keyed by id).
 * Bot-side saves them as CustomCommand[].
 * This normaliser handles both so either format from the DB works correctly.
 */
function normalizeToArray(data: unknown): CustomCommand[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as CustomCommand[];
  return Object.values(data as Record<string, CustomCommand>);
}

export async function initCustomCommandsStore(): Promise<void> {
  const rows = await dbGetAll<unknown>(STORE);
  for (const { key, data } of rows) cache.set(key, normalizeToArray(data));
  logger.info({ count: cache.size }, "Loaded customCommands store from DB");
}

export async function refreshCustomCommandsFromDb(): Promise<void> {
  const rows = await dbGetAll<unknown>(STORE);
  for (const { key, data } of rows) cache.set(key, normalizeToArray(data));
}

function persist(guildId: string): void {
  dbSet(STORE, guildId, cache.get(guildId) ?? []).catch((err) =>
    logger.error({ err }, "Failed to save custom commands")
  );
}

export function getCustomCommands(guildId: string): CustomCommand[] {
  return cache.get(guildId) ?? [];
}

export function getCustomCommand(guildId: string, trigger: string): CustomCommand | undefined {
  return (cache.get(guildId) ?? []).find((c) => c.trigger.toLowerCase() === trigger.toLowerCase());
}

export function addCustomCommand(guildId: string, cmd: Omit<CustomCommand, "id" | "createdAt">): { ok: boolean; reason?: string } {
  const cmds = cache.get(guildId) ?? [];
  if (cmds.length >= MAX_COMMANDS) return { ok: false, reason: `Maximum of ${MAX_COMMANDS} custom commands reached.` };
  if (cmds.some((c) => c.trigger.toLowerCase() === cmd.trigger.toLowerCase())) {
    return { ok: false, reason: `A command with trigger \`${cmd.trigger}\` already exists.` };
  }
  const newCmd: CustomCommand = { id: Math.random().toString(36).slice(2, 9), createdAt: Date.now(), ...cmd };
  cmds.push(newCmd);
  cache.set(guildId, cmds);
  persist(guildId);
  return { ok: true };
}

export function updateCustomCommand(guildId: string, id: string, partial: Partial<Pick<CustomCommand, "trigger" | "response" | "allowedRoles" | "allowedChannels" | "blockedRoles" | "blockedChannels" | "cooldown" | "cooldownType">>): boolean {
  const cmds = cache.get(guildId) ?? [];
  const idx = cmds.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  if (partial.trigger) {
    const conflict = cmds.find((c) => c.trigger.toLowerCase() === partial.trigger!.toLowerCase() && c.id !== id);
    if (conflict) return false;
  }
  cmds[idx] = { ...cmds[idx]!, ...partial };
  cache.set(guildId, cmds);
  persist(guildId);
  return true;
}

export function deleteCustomCommand(guildId: string, id: string): boolean {
  const cmds = cache.get(guildId) ?? [];
  const next = cmds.filter((c) => c.id !== id);
  if (next.length === cmds.length) return false;
  cache.set(guildId, next);
  persist(guildId);
  return true;
}

export function setCustomCommands(guildId: string, cmds: CustomCommand[]): void {
  cache.set(guildId, cmds.slice(0, MAX_COMMANDS));
  persist(guildId);
}

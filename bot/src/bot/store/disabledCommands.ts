import { dbSet, dbGetAll } from "./db";
import { logger } from "../../lib/logger";

const STORE = "disabledCommands";

const cache = new Map<string, Set<string>>();

export async function initDisabledCommandsStore(): Promise<void> {
  const rows = await dbGetAll<string[]>(STORE);
  for (const { key, data } of rows) cache.set(key, new Set(data));
  logger.info({ count: rows.length }, "Loaded disabledCommands store");
}

function save(guildId: string): void {
  dbSet(STORE, guildId, Array.from(cache.get(guildId) ?? [])).catch((err) =>
    logger.error({ err }, "Failed to save disabledCommands")
  );
}

export function isCommandDisabled(guildId: string, commandName: string): boolean {
  return cache.get(guildId)?.has(commandName) ?? false;
}

export function getDisabledCommands(guildId: string): string[] {
  return Array.from(cache.get(guildId) ?? []);
}

export function setDisabledCommands(guildId: string, commands: string[]): void {
  cache.set(guildId, new Set(commands));
  save(guildId);
}

export function disableCommand(guildId: string, commandName: string): void {
  if (!cache.has(guildId)) cache.set(guildId, new Set());
  cache.get(guildId)!.add(commandName);
  save(guildId);
}

export function enableCommand(guildId: string, commandName: string): void {
  cache.get(guildId)?.delete(commandName);
  save(guildId);
}

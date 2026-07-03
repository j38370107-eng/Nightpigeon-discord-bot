import { getGuildSetting, setGuildSetting } from "./settings";

const DEFAULT_PREFIX = ">";

export function getPrefix(guildId: string): string {
  return getGuildSetting(guildId, "prefix") ?? DEFAULT_PREFIX;
}

export function setPrefix(guildId: string, prefix: string): void {
  setGuildSetting(guildId, "prefix", prefix);
}

import { getGuildSetting, setGuildSetting } from "./settings";

export function getServerLogChannel(guildId: string): string | null {
  return getGuildSetting(guildId, "serverLogChannelId") ?? null;
}

export function setServerLogChannel(guildId: string, channelId: string): void {
  setGuildSetting(guildId, "serverLogChannelId", channelId);
}

import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getGuildSetting } from "../store/settings";
import { logger } from "../../lib/logger";
import { sendViaWebhook } from "./webhookSender";

export interface SecurityLogEntry {
  title: string;
  fields: { name: string; value: string; inline?: boolean }[];
  color?: number;
}

export async function sendSecurityLog(
  client: Client,
  guildId: string,
  dedicatedChannelId: string | undefined,
  entry: SecurityLogEntry
): Promise<void> {
  const channelId = dedicatedChannelId ?? getGuildSetting(guildId, "logChannelId");
  if (!channelId) {
    logger.debug({ guildId }, "No security log channel set — skipping");
    return;
  }

  let channel: TextChannel | null = null;
  try {
    channel = (await client.channels.fetch(channelId)) as TextChannel;
  } catch (err) {
    logger.error({ err, channelId, guildId }, "Could not fetch security log channel");
    return;
  }

  if (!channel || !("send" in channel)) return;

  const embed = new EmbedBuilder()
    .setColor(entry.color ?? 0xe74c3c)
    .setTitle(entry.title)
    .addFields(entry.fields)
    .setTimestamp();

  await sendViaWebhook(client, channel, { embeds: [embed] });
}

import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getGuildSetting } from "../store/settings";
import { logger } from "../../lib/logger";
import { sendViaWebhook } from "./webhookSender";
import { sendYamlLog, suppressModDuplicate } from "./yamlLogging";
import { buildVars } from "./yamlFormatter";

export interface ModLogEntry {
  action: string;
  executor: { tag: string; id: string };
  target?: { tag: string; id: string };
  channel?: { name: string; id: string };
  reason?: string;
  color?: number;
  caseId?: string;
  /** Duration string for timed actions */
  duration?: string;
}

/**
 * Map from a human-readable action name to a YAML logging event key.
 * Keys match the moderation category event keys in the docs schema.
 */
function actionToEventKey(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes("unban"))                          return "unban";
  if (lower.includes("softban"))                        return "softban";
  if (lower.includes("tempban"))                        return "tempban";
  if (lower.includes("forceban"))                       return "forceban";
  if (lower.includes("ban"))                            return "ban";
  if (lower.includes("kick"))                           return "kick";
  if (lower.includes("unmute") || lower.includes("untimeout")) return "unmute";
  if (lower.includes("tempmute"))                       return "mute";
  if (lower.includes("mute"))                           return "mute";
  if (lower.includes("timeout_remove") || lower.includes("remove timeout")) return "timeout_remove";
  if (lower.includes("timeout"))                        return "timeout";
  if (lower.includes("warn"))                           return "warn";
  if (lower.includes("note"))                           return "note";
  if (lower.includes("nickname reset"))                 return "nickname_reset";
  if (lower.includes("nickname") || lower.includes("nick")) return "nickname_force";
  if (lower.includes("role add"))                       return "role_add";
  if (lower.includes("role remove"))                    return "role_remove";
  if (lower.includes("case edit"))                      return "case_edit";
  if (lower.includes("case delete"))                    return "case_delete";
  if (lower.includes("case hide"))                      return "case_hide";
  if (lower.includes("purge") || lower.includes("bulk")) return "message_bulk_delete";
  return "mod_action";
}

export async function sendModLog(client: Client, guildId: string, entry: ModLogEntry) {
  const eventKey = actionToEventKey(entry.action);

  // Suppress gateway duplicates for this action
  if (entry.target?.id) {
    suppressModDuplicate(guildId, entry.target.id, eventKey);
  }

  // YAML logging path
  const vars = buildVars({
    action: entry.action,
    moderator: `<@${entry.executor.id}>`,
    moderator_tag: entry.executor.tag,
    moderator_id: entry.executor.id,
    user: entry.target ? `<@${entry.target.id}>` : "",
    userId: entry.target?.id ?? "",
    userTag: entry.target?.tag ?? "",
    channel: entry.channel ? `<#${entry.channel.id}>` : "",
    channel_name: entry.channel?.name ?? "",
    reason: entry.reason ?? "",
    case_id: entry.caseId ?? "",
    duration: entry.duration ?? "",
  });

  sendYamlLog(client, guildId, {
    eventKey,
    vars,
  }).catch((err) => logger.warn({ err }, "YAML mod log failed"));

  // Legacy DB-backed logging path
  const channelId = getGuildSetting(guildId, "logChannelId");
  if (!channelId) {
    logger.debug({ guildId }, "No mod-log channel set for guild — skipping legacy log");
    return;
  }

  let channel: TextChannel | null = null;
  try {
    channel = (await client.channels.fetch(channelId)) as TextChannel;
  } catch (err) {
    logger.error({ err, channelId, guildId }, "Could not fetch mod-log channel");
    return;
  }

  if (!channel || !("send" in channel)) {
    logger.error({ channelId, guildId }, "Mod-log channel is not a text channel");
    return;
  }

  const lines: string[] = [];
  lines.push(`**Action**\n${entry.action}`);
  lines.push(`**Executor**\n<@${entry.executor.id}> (${entry.executor.id})`);
  if (entry.target)   lines.push(`**User**\n<@${entry.target.id}> (${entry.target.id})`);
  if (entry.channel)  lines.push(`**Channel**\n<#${entry.channel.id}>`);
  if (entry.reason)   lines.push(`**Reason**\n${entry.reason}`);
  if (entry.duration) lines.push(`**Duration**\n${entry.duration}`);
  if (entry.caseId)   lines.push(`**Case ID**\n${entry.caseId}`);

  const embed = new EmbedBuilder()
    .setColor(entry.color ?? 0x5865f2)
    .setDescription(lines.join("\n\n"))
    .setTimestamp();

  await sendViaWebhook(client, channel, { embeds: [embed] });
  logger.debug({ action: entry.action, guildId }, "Mod log sent");
}

import { AttachmentBuilder, Client, EmbedBuilder, TextChannel } from "discord.js";
import { getLogChannel } from "../store/serverlogging";
import { logger } from "../../lib/logger";
import { sendViaWebhook } from "./webhookSender";
import { sendYamlLogCached, isModDuplicateSuppressed } from "./yamlLogging";
import { buildVars } from "./yamlFormatter";

export interface ServerLogEntry {
  title: string;
  description: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string;
  thumbnail?: string;
  /** attachment:// reference or remote URL — shown as the large embed image */
  image?: string;
  files?: AttachmentBuilder[];
  /**
   * Explicit vars for the YAML template path.
   * These map directly to {placeholder} names in the user's YAML messages config.
   * If provided these are used for template substitution; otherwise field names
   * are converted to snake_case vars as a fallback.
   */
  vars?: Record<string, string | undefined>;
}

/**
 * Map from serverlog event keys (camelCase) to YAML logging event keys (snake_case).
 * If a key is absent the same name is used.
 */
const EVENT_KEY_MAP: Record<string, string> = {
  messageDelete: "message_delete",
  messageEdit: "message_edit",
  messageBulkDelete: "message_bulk_delete",
  messagePinned: "message_pinned",
  memberJoin: "member_join",
  memberLeave: "member_leave",
  memberKick: "member_kick",
  memberBan: "member_ban",
  memberUnban: "member_unban",
  nicknameChange: "nickname_change",
  usernameChange: "username_change",
  avatarChange: "avatar_change",
  rolesChange: "roles_change",
  memberTimeout: "member_timeout",
  timeoutRemoved: "timeout_removed",
  roleCreate: "role_create",
  roleDelete: "role_delete",
  roleUpdate: "role_update",
  channelCreate: "channel_create",
  channelDelete: "channel_delete",
  channelUpdate: "channel_update",
  serverUpdate: "server_update",
  boostChange: "boost_change",
  voiceJoin: "voice_join",
  voiceLeave: "voice_leave",
  voiceMove: "voice_move",
  voiceMuteDeafen: "voice_mute_deafen",
  stageEvent: "stage_event",
  inviteCreate: "invite_create",
  inviteDelete: "invite_delete",
  inviteUsed: "invite_used",
  threadCreate: "thread_create",
  threadDelete: "thread_delete",
  threadUpdate: "thread_update",
  threadMemberAdd: "thread_member_add",
  threadMemberRemove: "thread_member_remove",
  emojiCreate: "emoji_create",
  emojiDelete: "emoji_delete",
  emojiUpdate: "emoji_update",
  stickerCreate: "sticker_create",
  stickerDelete: "sticker_delete",
  stickerUpdate: "sticker_update",
  botAdded: "bot_added",
  botRemoved: "bot_removed",
  webhookCreate: "webhook_create",
  webhookDelete: "webhook_delete",
  integrationChange: "integration_change",
  automodAction: "automod_action",
  channelPermissionsUpdate: "channel_permissions_update",
  voiceStream: "voice_stream",
  stageCreate: "stage_create",
  stageDelete: "stage_delete",
  stageUpdate: "stage_update",
  scheduledEventCreate: "scheduled_event_create",
  scheduledEventDelete: "scheduled_event_delete",
  scheduledEventUpdate: "scheduled_event_update",
};

/**
 * Events that are moderation-related — gateway fires these when a mod command
 * already sent a moderation log, so we suppress the gateway duplicate.
 */
const MOD_EVENT_KEYS = new Set([
  "memberBan", "memberUnban", "memberKick", "memberTimeout", "timeoutRemoved",
]);

/** Extract a vars object from a ServerLogEntry for YAML template use.
 *  Prefers entry.vars (the documented {placeholders}) if supplied by the handler;
 *  falls back to converting field names to snake_case keys. */
function entryToVars(entry: ServerLogEntry): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {
    title:       entry.title,
    description: entry.description,
    footer:      entry.footer,
  };
  // Prefer explicit vars — these match the documented {placeholder} names
  if (entry.vars) {
    Object.assign(out, entry.vars);
  } else {
    for (const f of entry.fields ?? []) {
      const key = f.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      if (key) out[key] = f.value;
    }
  }
  return out;
}

export async function sendServerLog(
  client: Client,
  guildId: string,
  eventKey: string,
  entry: ServerLogEntry
): Promise<void> {
  // YAML logging path
  const yamlEventKey = EVENT_KEY_MAP[eventKey] ?? eventKey;
  const isMod = MOD_EVENT_KEYS.has(eventKey);

  // Extract userId for duplicate suppression (best-effort from fields)
  const userField = entry.fields?.find((f) =>
    f.name.toLowerCase().includes("user") || f.name.toLowerCase().includes("member")
  );
  const userIdMatch = userField?.value?.match(/\((\d{17,20})\)/);
  const userId = userIdMatch?.[1];

  const suppressYaml = isMod && userId
    ? isModDuplicateSuppressed(guildId, userId, yamlEventKey)
    : false;

  if (!suppressYaml) {
    const vars = buildVars(entryToVars(entry));
    sendYamlLogCached(client, guildId, {
      eventKey: yamlEventKey,
      vars,
      attachFile: eventKey === "messageBulkDelete",
    }).catch((err) => logger.warn({ err }, "YAML server log failed"));
  }

  // Legacy DB-backed logging path
  const channelId = getLogChannel(guildId, eventKey);
  if (!channelId) return;

  let channel: TextChannel | null = null;
  try {
    channel = (await client.channels.fetch(channelId)) as TextChannel;
  } catch {
    return;
  }

  if (!channel || !("send" in channel)) return;

  const embed = new EmbedBuilder()
    .setColor(entry.color)
    .setTitle(entry.title)
    .setDescription(entry.description)
    .setTimestamp();

  if (entry.fields?.length) embed.addFields(entry.fields);
  if (entry.footer) embed.setFooter({ text: entry.footer });
  if (entry.thumbnail) embed.setThumbnail(entry.thumbnail);
  if (entry.image) embed.setImage(entry.image);

  await sendViaWebhook(client, channel, { embeds: [embed], files: entry.files ?? [] });
}

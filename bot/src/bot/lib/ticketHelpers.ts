import {
  EmbedBuilder, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, TextChannel, Client,
  PermissionFlagsBits,
} from "discord.js";
import type { TicketEmbedConfig, TicketCategoryConfig } from "./ticketConfig";
import { getTicketConfig, formatDuration } from "./ticketConfig";

// Placeholder resolution
export interface TicketVars {
  user?: string;
  userId?: string;
  userTag?: string;
  userMention?: string;
  moderator?: string;
  number?: string;
  category?: string;
  channel?: string;
  guild?: string;
  reason?: string;
  timestamp?: string;
  duration?: string;
  count?: string;
  rating?: string;
  deleteAfter?: string;
}

export function resolvePlaceholders(template: string, vars: TicketVars): string {
  let out = template;
  for (const [key, val] of Object.entries(vars)) {
    if (val !== undefined) {
      out = out.replaceAll(`{${key}}`, val);
    }
  }
  return out;
}

function resolveEmbed(embed: TicketEmbedConfig, vars: TicketVars): TicketEmbedConfig {
  return {
    title:       embed.title       ? resolvePlaceholders(embed.title, vars)       : undefined,
    description: embed.description ? resolvePlaceholders(embed.description, vars) : undefined,
    color:       embed.color,
    footer:      embed.footer      ? resolvePlaceholders(embed.footer, vars)      : undefined,
    thumbnail:   embed.thumbnail,
    image:       embed.image,
  };
}

// Embed builder
export function buildEmbed(cfg: TicketEmbedConfig, vars: TicketVars = {}): EmbedBuilder {
  const resolved = resolveEmbed(cfg, vars);
  const builder = new EmbedBuilder();
  if (resolved.title)       builder.setTitle(resolved.title);
  if (resolved.description) builder.setDescription(resolved.description);
  if (resolved.footer)      builder.setFooter({ text: resolved.footer });
  if (resolved.thumbnail)   builder.setThumbnail(resolved.thumbnail);
  if (resolved.image)       builder.setImage(resolved.image);
  if (resolved.color) {
    const hex = parseInt(resolved.color.replace("#", ""), 16);
    if (!isNaN(hex)) builder.setColor(hex as any);
  }
  builder.setTimestamp();
  return builder;
}

// Button row builder
const STYLE_MAP: Record<string, ButtonStyle> = {
  PRIMARY:   ButtonStyle.Primary,
  SECONDARY: ButtonStyle.Secondary,
  SUCCESS:   ButtonStyle.Success,
  DANGER:    ButtonStyle.Danger,
};

function btnStyle(s?: string): ButtonStyle {
  return STYLE_MAP[s ?? ""] ?? ButtonStyle.Secondary;
}

export function buildTicketButtonRow(guildId: string, channelId: string): ActionRowBuilder<ButtonBuilder> {
  const cfg = getTicketConfig(guildId)?.buttons ?? {};
  const row = new ActionRowBuilder<ButtonBuilder>();

  const closeCfg  = cfg.close;
  const claimCfg  = cfg.claim;
  const unclaimCfg = cfg.unclaim;
  const addCfg    = cfg.add_user;
  const removeCfg = cfg.remove_user;
  const txCfg     = cfg.transcript;

  if (closeCfg?.enabled !== false) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:close_btn:${channelId}`)
      .setLabel(closeCfg?.label ?? "Close Ticket")
      .setStyle(btnStyle(closeCfg?.style ?? "DANGER"));
    if (closeCfg?.emoji) btn.setEmoji(closeCfg.emoji);
    row.addComponents(btn);
  }
  if (claimCfg?.enabled !== false) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:claim:${channelId}`)
      .setLabel(claimCfg?.label ?? "Claim Ticket")
      .setStyle(btnStyle(claimCfg?.style ?? "PRIMARY"));
    if (claimCfg?.emoji) btn.setEmoji(claimCfg.emoji);
    row.addComponents(btn);
  }
  if (unclaimCfg?.enabled !== false) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:unclaim:${channelId}`)
      .setLabel(unclaimCfg?.label ?? "Unclaim")
      .setStyle(btnStyle(unclaimCfg?.style ?? "SECONDARY"));
    if (unclaimCfg?.emoji) btn.setEmoji(unclaimCfg.emoji);
    row.addComponents(btn);
  }

  const row2 = new ActionRowBuilder<ButtonBuilder>();
  let hasRow2 = false;

  if (addCfg?.enabled !== false) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:adduser_btn:${channelId}`)
      .setLabel(addCfg?.label ?? "Add User")
      .setStyle(btnStyle(addCfg?.style ?? "SECONDARY"));
    if (addCfg?.emoji) btn.setEmoji(addCfg.emoji);
    row2.addComponents(btn);
    hasRow2 = true;
  }
  if (removeCfg?.enabled !== false) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:removeuser_btn:${channelId}`)
      .setLabel(removeCfg?.label ?? "Remove User")
      .setStyle(btnStyle(removeCfg?.style ?? "SECONDARY"));
    if (removeCfg?.emoji) btn.setEmoji(removeCfg.emoji);
    row2.addComponents(btn);
    hasRow2 = true;
  }
  if (txCfg?.enabled !== false) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:transcript:${channelId}`)
      .setLabel(txCfg?.label ?? "Save Transcript")
      .setStyle(btnStyle(txCfg?.style ?? "SECONDARY"));
    if (txCfg?.emoji) btn.setEmoji(txCfg.emoji);
    row2.addComponents(btn);
    hasRow2 = true;
  }

  // Return both rows if second has components, else just first
  return row; // caller handles both rows
}

export function buildTicketButtonRows(guildId: string, channelId: string): ActionRowBuilder<ButtonBuilder>[] {
  const cfg = getTicketConfig(guildId)?.buttons ?? {};
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  const row1 = new ActionRowBuilder<ButtonBuilder>();
  const row2 = new ActionRowBuilder<ButtonBuilder>();

  const closeCfg   = cfg.close;
  const claimCfg   = cfg.claim;
  const unclaimCfg = cfg.unclaim;
  const addCfg     = cfg.add_user;
  const removeCfg  = cfg.remove_user;
  const txCfg      = cfg.transcript;

  if (closeCfg?.enabled !== false) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:close_btn:${channelId}`)
      .setLabel(closeCfg?.label ?? "Close Ticket")
      .setStyle(btnStyle(closeCfg?.style ?? "DANGER"));
    if (closeCfg?.emoji) btn.setEmoji(closeCfg.emoji);
    row1.addComponents(btn);
  }
  if (claimCfg?.enabled !== false) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:claim:${channelId}`)
      .setLabel(claimCfg?.label ?? "Claim Ticket")
      .setStyle(btnStyle(claimCfg?.style ?? "PRIMARY"));
    if (claimCfg?.emoji) btn.setEmoji(claimCfg.emoji);
    row1.addComponents(btn);
  }
  if (unclaimCfg?.enabled !== false) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:unclaim:${channelId}`)
      .setLabel(unclaimCfg?.label ?? "Unclaim")
      .setStyle(btnStyle(unclaimCfg?.style ?? "SECONDARY"));
    if (unclaimCfg?.emoji) btn.setEmoji(unclaimCfg.emoji);
    row1.addComponents(btn);
  }

  if (addCfg?.enabled !== false) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:adduser_btn:${channelId}`)
      .setLabel(addCfg?.label ?? "Add User")
      .setStyle(btnStyle(addCfg?.style ?? "SECONDARY"));
    if (addCfg?.emoji) btn.setEmoji(addCfg.emoji);
    row2.addComponents(btn);
  }
  if (removeCfg?.enabled !== false) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:removeuser_btn:${channelId}`)
      .setLabel(removeCfg?.label ?? "Remove User")
      .setStyle(btnStyle(removeCfg?.style ?? "SECONDARY"));
    if (removeCfg?.emoji) btn.setEmoji(removeCfg.emoji);
    row2.addComponents(btn);
  }
  if (txCfg?.enabled !== false) {
    const btn = new ButtonBuilder()
      .setCustomId(`ticket:transcript:${channelId}`)
      .setLabel(txCfg?.label ?? "Save Transcript")
      .setStyle(btnStyle(txCfg?.style ?? "SECONDARY"));
    if (txCfg?.emoji) btn.setEmoji(txCfg.emoji);
    row2.addComponents(btn);
  }

  if (row1.components.length > 0) rows.push(row1);
  if (row2.components.length > 0) rows.push(row2);
  return rows;
}

// Channel name pattern
export function resolveChannelName(
  pattern: string,
  username: string,
  number: number,
  categoryName: string
): string {
  const paddedNum = String(number).padStart(4, "0");
  const safeUser  = username.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 20);
  const safeCat   = categoryName.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 15);
  const ts        = new Date().toISOString().slice(0, 10);
  return pattern
    .replaceAll("{username}", safeUser)
    .replaceAll("{number}",   paddedNum)
    .replaceAll("{category}", safeCat)
    .replaceAll("{timestamp}", ts)
    .toLowerCase()
    .slice(0, 100);
}

// Channel permission helpers
/** Discord snowflakes are 17-19 digit numeric strings. Filter out any
 *  placeholder values (e.g. "SUPPORT_ROLE_ID") that users may have copied
 *  from docs without substituting real IDs — passing them to the REST API
 *  causes a 400 error that prevents ticket channels from being created. */
function isSnowflake(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

export function buildTicketPermissionOverwrites(
  everyoneId: string,
  openerId: string,
  supportRoles: string[]
): any[] {
  const overwrites: any[] = [
    { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: openerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];
  for (const roleId of supportRoles.filter(isSnowflake)) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }
  return overwrites;
}

// Ticket logging helper
export async function logTicketEvent(
  client: Client,
  guildId: string,
  eventKey: string,
  vars: TicketVars
): Promise<void> {
  const cfg = getTicketConfig(guildId)?.logging;
  if (!cfg?.channel) return;
  if (cfg.events && cfg.events[eventKey] === false) return;

  const msgCfg = cfg.messages?.[eventKey];
  if (!msgCfg) return;

  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(cfg.channel) as TextChannel | undefined;
    if (!channel) return;
    const embed = buildEmbed(msgCfg, vars);
    await channel.send({ embeds: [embed] });
  } catch {
    // non-fatal
  }
}

// Format milliseconds as human duration
export function msToHuman(ms: number): string {
  if (ms < 60_000)          return `${Math.round(ms / 1000)} seconds`;
  if (ms < 3_600_000)       return `${Math.round(ms / 60_000)} minutes`;
  if (ms < 86_400_000)      return `${Math.round(ms / 3_600_000)} hours`;
  return `${Math.round(ms / 86_400_000)} days`;
}

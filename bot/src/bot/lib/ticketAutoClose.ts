import { Client, TextChannel } from "discord.js";
import { logger } from "../../lib/logger";
import { getTicketConfig, parseDuration } from "./ticketConfig";
import { getAllOpenTickets, updateTicket, getTicketByChannel } from "../store/tickets";
import { buildEmbed, logTicketEvent, msToHuman } from "./ticketHelpers";
import { generateTranscript } from "./transcript";

// Tracks which guilds have already received a warning for a given ticket channel
const warnedChannels = new Set<string>();

export function startAutoCloseScheduler(client: Client): void {
  // Run every 10 minutes
  setInterval(() => runAutoCloseCheck(client).catch((err) =>
    logger.error({ err }, "Error in auto-close scheduler")
  ), 10 * 60 * 1000);

  logger.info("Ticket auto-close scheduler started");
}

async function runAutoCloseCheck(client: Client): Promise<void> {
  const now = Date.now();

  // Collect all distinct guild IDs from open tickets
  for (const guild of client.guilds.cache.values()) {
    const cfg = getTicketConfig(guild.id);
    if (!cfg?.categories) continue;

    const openTickets = await getAllOpenTickets(guild.id);
    if (openTickets.length === 0) continue;

    for (const ticket of openTickets) {
      const catCfg = cfg.categories[ticket.categoryKey];
      if (!catCfg) continue;

      const autoCloseMs   = parseDuration(catCfg.auto_close_after);
      const warnMs        = parseDuration(catCfg.auto_close_warning);
      if (!autoCloseMs) continue;

      const inactiveMs = now - ticket.lastActivityAt;

      // Auto-close threshold reached
      if (inactiveMs >= autoCloseMs) {
        warnedChannels.delete(ticket.channelId);
        await executeAutoClose(client, ticket, guild.id, msToHuman(inactiveMs));
        continue;
      }

      // Warning threshold: within warnMs of auto-close and not yet warned
      if (warnMs && autoCloseMs - inactiveMs <= warnMs && !warnedChannels.has(ticket.channelId)) {
        warnedChannels.add(ticket.channelId);
        await sendAutoCloseWarning(client, ticket, guild.id, msToHuman(autoCloseMs - inactiveMs));
      }
    }
  }
}

async function sendAutoCloseWarning(
  client: Client,
  ticket: { channelId: string; number: number; categoryKey: string },
  guildId: string,
  timeLeft: string
): Promise<void> {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(ticket.channelId) as TextChannel | undefined;
    if (!channel) return;

    const embed = buildEmbed(
      {
        title: "⏰ Auto-Close Warning",
        description: `This ticket will be automatically closed in **${timeLeft}** due to inactivity.\n\nSend a message to reset the timer.`,
        color: "FEE75C",
      },
      { number: String(ticket.number).padStart(4, "0"), duration: timeLeft }
    );
    await channel.send({ embeds: [embed] });
  } catch {
    // non-fatal
  }
}

async function executeAutoClose(
  client: Client,
  ticket: { channelId: string; number: number; categoryKey: string; openerId: string; id: number; openAt: number },
  guildId: string,
  duration: string
): Promise<void> {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(ticket.channelId) as TextChannel | undefined;
    if (!channel) return;

    logger.info({ channelId: ticket.channelId, ticketNum: ticket.number }, "Auto-closing inactive ticket");

    const cfg = getTicketConfig(guildId);
    const closeCfg = cfg?.close;
    const txCfg    = cfg?.transcripts;
    const txFormat = txCfg?.format ?? "txt";

    const reason = `No activity for ${duration}`;
    const durationMs = Date.now() - ticket.openAt;
    const durationStr = msToHuman(durationMs);

    // Generate transcript
    let transcriptAttachment = null;
    if (txCfg?.enabled !== false) {
      transcriptAttachment = await generateTranscript(channel, await getTicketByChannel(ticket.channelId) as any, txFormat as "html" | "txt").catch(() => null);
    }

    // Post close message in channel
    const closeMsgCfg = closeCfg?.close_message ?? {
      title: "⏰ Ticket Auto-Closed",
      description: `This ticket was automatically closed due to inactivity (no activity for ${duration}).`,
      color: "FEE75C",
    };
    await channel.send({
      embeds: [buildEmbed(closeMsgCfg, { number: String(ticket.number).padStart(4, "0"), reason, duration: durationStr })],
      files: transcriptAttachment ? [transcriptAttachment] : [],
    });

    // Update DB
    await updateTicket(ticket.id, {
      status: "archived",
      closeAt: Date.now(),
      closeReason: reason,
    });

    // Send transcript to transcript channel
    if (txCfg?.enabled !== false && txCfg?.channel && transcriptAttachment) {
      try {
        const txChannel = guild.channels.cache.get(txCfg.channel) as TextChannel | undefined;
        if (txChannel) await txChannel.send({ files: [transcriptAttachment] });
      } catch { /* non-fatal */ }
    }

    // Archive or delete channel
    if (closeCfg?.action === "delete") {
      setTimeout(() => channel.delete("Ticket auto-closed").catch(() => {}), 5000);
    } else {
      // Archive: move to archive category, lock channel
      if (closeCfg?.archive_category) {
        await channel.setParent(closeCfg.archive_category, { lockPermissions: false }).catch(() => {});
      }
      await channel.permissionOverwrites.edit(ticket.openerId, { ViewChannel: false, SendMessages: false }).catch(() => {});
      await channel.setName(`archived-${channel.name.replace(/^ticket-|^[a-z]+-/, "")}`).catch(() => {});

      // Schedule deletion if configured
      const deleteAfterMs = parseDuration(closeCfg?.delete_after);
      if (deleteAfterMs) {
        setTimeout(() => channel.delete("Archived ticket deleted").catch(() => {}), deleteAfterMs);
      }
    }

    // Log the event
    await logTicketEvent(client, guildId, "ticket_auto_close", {
      number:   String(ticket.number).padStart(4, "0"),
      channel:  `<#${ticket.channelId}>`,
      duration: durationStr,
    });
  } catch (err) {
    logger.error({ err, channelId: ticket.channelId }, "Failed to auto-close ticket");
  }
}

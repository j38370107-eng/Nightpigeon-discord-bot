import {
  Client, Message, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelType, TextChannel, ModalBuilder, TextInputBuilder,
  TextInputStyle, ModalSubmitInteraction, ButtonInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import type { Command } from "../types";
import {
  createTicket, getTicketByChannel, updateTicket, deleteTicketRecord,
  nextTicketNumber,
  addTicketBlacklist, removeTicketBlacklist, isTicketBlacklisted, listTicketBlacklist,
  getAllOpenTickets, getAllTicketsForUser, getGuildStats, addParticipant, removeParticipant,
  savePanelMessageId, saveFeedback, getOpenTicketsByUserCategory,
  type Ticket,
} from "../../store/tickets";
import { generateTranscript } from "../../lib/transcript";
import {
  getTicketConfig, getCategoryConfig, parseDuration,
} from "../../lib/ticketConfig";
import {
  buildEmbed, buildTicketButtonRows, resolveChannelName,
  buildTicketPermissionOverwrites, logTicketEvent, msToHuman, resolvePlaceholders,
} from "../../lib/ticketHelpers";
import { getUserLevel } from "../../lib/yamlLevels";
import { logger } from "../../../lib/logger";

// Cooldown tracking (in-memory, per user per guild per category)
const cooldowns = new Map<string, number>(); // key: `guildId:userId:categoryKey`

function checkCooldown(guildId: string, userId: string, categoryKey: string, durationMs: number): number {
  if (!durationMs) return 0;
  const key  = `${guildId}:${userId}:${categoryKey}`;
  const last = cooldowns.get(key) ?? 0;
  const remaining = durationMs - (Date.now() - last);
  return remaining > 0 ? remaining : 0;
}

function setCooldown(guildId: string, userId: string, categoryKey: string): void {
  cooldowns.set(`${guildId}:${userId}:${categoryKey}`, Date.now());
}

// Open ticket channel
export async function openTicketChannel(
  client: Client,
  guild: NonNullable<Message["guild"]>,
  userId: string,
  userTag: string,
  categoryKey: string,
  formAnswers?: Record<string, string>
): Promise<TextChannel | null> {
  const catCfg = getCategoryConfig(guild.id, categoryKey);
  if (!catCfg) {
    logger.warn({ guildId: guild.id, categoryKey }, "Ticket category not found in config");
    return null;
  }

  const ticketNum    = await nextTicketNumber(guild.id);
  const channelName  = resolveChannelName(
    catCfg.channel_name ?? "ticket-{username}-{number}",
    userTag.split("#")[0] ?? userTag,
    ticketNum,
    catCfg.name
  );
  const supportRoles = catCfg.support_roles ?? [];
  const overwrites   = buildTicketPermissionOverwrites(
    guild.roles.everyone.id,
    userId,
    supportRoles
  );

  // Determine parent category
  const parentId = catCfg.channel_category ?? undefined;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: parentId,
    permissionOverwrites: overwrites,
    reason: `Ticket #${String(ticketNum).padStart(4, "0")} opened by ${userTag}`,
  });

  const ticket = await createTicket({
    guildId:            guild.id,
    number:             ticketNum,
    categoryKey,
    channelId:          channel.id,
    openerId:           userId,
    openerTag:          userTag,
    claimerId:          null,
    claimerTag:         null,
    status:             "open",
    openAt:             Date.now(),
    closeAt:            null,
    closeReason:        null,
    transcriptUrl:      null,
    lastActivityAt:     Date.now(),
    originalCategoryId: parentId ?? null,
  });

  await addParticipant(ticket.id, userId);

  const vars = {
    user:        userTag.split("#")[0] ?? userTag,
    userId,
    userTag,
    userMention: `<@${userId}>`,
    number:      String(ticketNum).padStart(4, "0"),
    category:    catCfg.name,
    channel:     `<#${channel.id}>`,
    guild:       guild.name,
    timestamp:   new Date().toUTCString(),
  };

  // Welcome embed
  const welcomeCfg = catCfg.welcome_message ?? {
    title: "🎫 Ticket Opened",
    description: `Welcome <@${userId}>! A member of our team will be with you shortly.\n\n**Category:** ${catCfg.name}`,
    color: "57F287",
    footer: `Ticket #${vars.number} | ${vars.timestamp}`,
  };

  const embed = buildEmbed(welcomeCfg, vars);

  // Attach form answers if any
  if (formAnswers && Object.keys(formAnswers).length > 0) {
    for (const [question, answer] of Object.entries(formAnswers)) {
      if (answer?.trim()) {
        embed.addFields({ name: question, value: answer.slice(0, 1024), inline: false });
      }
    }
  }

  // Build button rows
  const rows = buildTicketButtonRows(guild.id, channel.id);

  await channel.send({ embeds: [embed], components: rows });

  // Ping roles
  if (catCfg.ping_roles && catCfg.ping_roles.length > 0) {
    const pings = catCfg.ping_roles.map((r) => `<@&${r}>`).join(" ");
    await channel.send({ content: pings, allowedMentions: { roles: catCfg.ping_roles } });
  }

  // Log ticket open
  await logTicketEvent(client, guild.id, "ticket_open", {
    ...vars,
    channel: `<#${channel.id}>`,
  });

  setCooldown(guild.id, userId, categoryKey);
  return channel;
}

// Close ticket
export async function closeTicket(
  client: Client,
  guild: NonNullable<Message["guild"]>,
  channelId: string,
  closedById: string,
  closedByTag: string,
  reason: string
): Promise<void> {
  const ticket = await getTicketByChannel(channelId);
  if (!ticket) return;

  const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel) return;

  const cfg       = getTicketConfig(guild.id);
  const closeCfg  = cfg?.close;
  const txCfg     = cfg?.transcripts;
  const catCfg    = getCategoryConfig(guild.id, ticket.categoryKey);

  const durationMs  = Date.now() - ticket.openAt;
  const durationStr = msToHuman(durationMs);
  const txFormat    = (txCfg?.format ?? "txt") as "html" | "txt";

  const vars = {
    user:        ticket.openerTag,
    userId:      ticket.openerId,
    userTag:     ticket.openerTag,
    userMention: `<@${ticket.openerId}>`,
    moderator:   closedByTag,
    number:      String(ticket.number).padStart(4, "0"),
    category:    catCfg?.name ?? ticket.categoryKey,
    channel:     `<#${channelId}>`,
    guild:       guild.name,
    reason,
    timestamp:   new Date().toUTCString(),
    duration:    durationStr,
    deleteAfter: closeCfg?.delete_after ?? "never",
  };

  // Generate transcript
  let transcriptAttachment = null;
  if (txCfg?.enabled !== false) {
    transcriptAttachment = await generateTranscript(channel, ticket, txFormat).catch(() => null);
  }

  // Post close message in channel
  const closeMsgCfg = closeCfg?.close_message ?? {
    title: "🔒 Ticket Closed",
    description: `This ticket has been closed by ${closedByTag}.\n**Reason:** ${reason}`,
    color: "ED4245",
  };
  await channel.send({
    embeds: [buildEmbed(closeMsgCfg, vars)],
    files: transcriptAttachment ? [transcriptAttachment] : [],
  });

  // Update DB record
  await updateTicket(ticket.id, {
    status:      "archived",
    closeAt:     Date.now(),
    closeReason: reason,
  });

  // DM the opener on close
  if (closeCfg?.dm_on_close !== false) {
    try {
      const opener = await client.users.fetch(ticket.openerId);
      const dmMsgCfg = closeCfg?.dm_message ?? {
        title: "🔒 Ticket Closed",
        description: `Your ticket **#${vars.number}** in **${guild.name}** has been closed.\n\n**Closed by:** ${closedByTag}\n**Reason:** ${reason}`,
        color: "ED4245",
        footer: vars.timestamp,
      };
      const dmEmbed = buildEmbed(dmMsgCfg, vars);
      const dmFiles = (closeCfg?.send_transcript_on_close !== false && transcriptAttachment)
        ? [transcriptAttachment]
        : [];
      await opener.send({ embeds: [dmEmbed], files: dmFiles }).catch(() => {});
    } catch { /* user has DMs disabled */ }
  }

  // Send transcript to transcript channel
  if (txCfg?.enabled !== false && txCfg?.channel && transcriptAttachment) {
    try {
      const txChannel = guild.channels.cache.get(txCfg.channel) as TextChannel | undefined;
      if (txChannel) {
        const txMsgCfg = txCfg.message;
        if (txMsgCfg) {
          await txChannel.send({
            embeds: [buildEmbed(txMsgCfg, { ...vars, count: "?" })],
            files: [transcriptAttachment],
          });
        } else {
          await txChannel.send({ files: [transcriptAttachment] });
        }
      }
    } catch { /* non-fatal */ }
  }

  // Send feedback DM if configured
  const fbCfg = cfg?.feedback;
  if (fbCfg?.enabled && fbCfg.dm_user !== false) {
    try {
      const opener = await client.users.fetch(ticket.openerId);
      const fbDmCfg = fbCfg.dm_message ?? {
        title: "⭐ How was your support experience?",
        description: `Please rate your experience with ticket **#${vars.number}**.`,
        color: "FEE75C",
      };
      const ratings = fbCfg.ratings ?? [
        { emoji: "⭐",        label: "1 — Very Poor", value: 1 },
        { emoji: "⭐⭐",     label: "2 — Poor",      value: 2 },
        { emoji: "⭐⭐⭐",  label: "3 — Average",   value: 3 },
        { emoji: "⭐⭐⭐⭐",label: "4 — Good",       value: 4 },
        { emoji: "⭐⭐⭐⭐⭐", label: "5 — Excellent", value: 5 },
      ];
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`ticket:feedback:${ticket.id}`)
        .setPlaceholder("Select a rating…")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(ratings.map((r) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(r.label)
            .setValue(String(r.value))
            .setEmoji(r.emoji)
        ));
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
      await opener.send({
        embeds: [buildEmbed(fbDmCfg, vars)],
        components: [row],
      }).catch(() => {});
    } catch { /* DMs disabled */ }
  }

  // Archive or delete channel
  if (closeCfg?.action === "delete") {
    setTimeout(() => channel.delete("Ticket closed").catch(() => {}), 3000);
  } else {
    if (closeCfg?.archive_category) {
      await channel.setParent(closeCfg.archive_category, { lockPermissions: false }).catch(() => {});
    }
    await channel.permissionOverwrites.edit(ticket.openerId, { ViewChannel: false, SendMessages: false }).catch(() => {});
    await channel.setName(`closed-${channel.name.replace(/^ticket-/, "").replace(/^[a-z]+-/, "")}`).catch(() => {});

    const deleteAfterMs = parseDuration(closeCfg?.delete_after);
    if (deleteAfterMs) {
      setTimeout(() => channel.delete("Archived ticket deleted").catch(() => {}), deleteAfterMs);
    }
  }

  // Log close event
  await logTicketEvent(client, guild.id, "ticket_close", {
    ...vars,
    moderator: closedByTag,
  });
}

// Reopen ticket
async function reopenTicket(
  client: Client,
  guild: NonNullable<Message["guild"]>,
  ticket: Ticket,
  requestedBy: string
): Promise<void> {
  const channel = guild.channels.cache.get(ticket.channelId) as TextChannel | undefined;
  if (!channel) return;

  const catCfg    = getCategoryConfig(guild.id, ticket.categoryKey);
  const parentId  = ticket.originalCategoryId ?? catCfg?.channel_category ?? undefined;
  const supportRoles = catCfg?.support_roles ?? [];

  if (parentId) {
    await channel.setParent(parentId, { lockPermissions: false }).catch(() => {});
  }

  // Restore opener access
  await channel.permissionOverwrites.edit(ticket.openerId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
  }).catch(() => {});

  // Restore channel name
  const channelName = resolveChannelName(
    catCfg?.channel_name ?? "ticket-{username}-{number}",
    ticket.openerTag.split("#")[0] ?? ticket.openerTag,
    ticket.number,
    catCfg?.name ?? ticket.categoryKey
  );
  await channel.setName(channelName).catch(() => {});

  await updateTicket(ticket.id, { status: "open", closeAt: null, closeReason: null, lastActivityAt: Date.now() });

  await channel.send({
    embeds: [buildEmbed({
      title: "🔓 Ticket Reopened",
      description: `This ticket has been reopened by <@${requestedBy}>.`,
      color: "57F287",
    })],
  });
}

// Build panel message
async function postPanel(
  client: Client,
  guild: NonNullable<Message["guild"]>,
  panelName: string,
  channel: TextChannel
): Promise<void> {
  const cfg      = getTicketConfig(guild.id);
  const panelCfg = cfg?.panels?.[panelName];
  if (!panelCfg) throw new Error(`Panel \`${panelName}\` not found in YAML config.`);

  const embedCfg = panelCfg.message ?? {
    title:       "📬 Support Tickets",
    description: "Need help? Click the button below to open a ticket.",
    color:       "5865F2",
  };
  const embed = buildEmbed(embedCfg);

  let components: any[] = [];

  if (panelCfg.select_menu) {
    const sm = panelCfg.select_menu;
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`ticket:open_select:${panelName}`)
      .setPlaceholder(sm.placeholder ?? "Select a ticket category…")
      .addOptions(sm.options.map((opt) => {
        const o = new StringSelectMenuOptionBuilder()
          .setLabel(opt.label)
          .setValue(opt.value);
        if (opt.description) o.setDescription(opt.description);
        if (opt.emoji)       o.setEmoji(opt.emoji);
        return o;
      }));
    components = [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
  } else {
    // Button panel — one button per category key
    const cats = cfg?.categories ?? {};
    const btnCfg = panelCfg.button;
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const [catKey, catDef] of Object.entries(cats)) {
      const btn = new ButtonBuilder()
        .setCustomId(`ticket:open:${panelName}:${catKey}`)
        .setLabel(btnCfg?.label ?? catDef.name)
        .setStyle(
          btnCfg?.style === "PRIMARY"   ? ButtonStyle.Primary   :
          btnCfg?.style === "SUCCESS"   ? ButtonStyle.Success   :
          btnCfg?.style === "DANGER"    ? ButtonStyle.Danger    :
          ButtonStyle.Primary
        );
      if (btnCfg?.emoji) btn.setEmoji(btnCfg.emoji);
      row.addComponents(btn);
    }
    if (row.components.length === 0) throw new Error("No categories defined in YAML config.");
    components = [row];
  }

  const msg = await channel.send({ embeds: [embed], components });
  await savePanelMessageId(guild.id, panelName, msg.id);
}

// Handle opening via button or select (before or after modal)
export async function handleTicketOpen(
  client: Client,
  guild: NonNullable<Message["guild"]>,
  userId: string,
  userTag: string,
  panelName: string,
  categoryKey: string,
  replyFn: (msg: string) => Promise<void>,
  showModalFn: (modal: ModalBuilder) => Promise<void>,
  deferFn?: () => Promise<void>
): Promise<void> {
  const blacklist = await isTicketBlacklisted(guild.id, userId);
  if (blacklist) {
    return replyFn(`❌ You are blacklisted from opening tickets.${blacklist.reason ? ` Reason: ${blacklist.reason}` : ""}`);
  }

  const catCfg = getCategoryConfig(guild.id, categoryKey);
  if (!catCfg) return replyFn("❌ Ticket category not found. Please contact an admin.");

  // Max open tickets per user check
  const maxOpen = catCfg.max_open_per_user ?? 1;
  if (maxOpen > 0) {
    const existing = await getOpenTicketsByUserCategory(guild.id, userId, categoryKey);
    if (existing.length >= maxOpen) {
      const ch = existing[0]!;
      return replyFn(`❌ You already have an open ticket in this category: <#${ch.channelId}>`);
    }
  }

  // Cooldown check
  const cooldownMs = parseDuration(catCfg.cooldown);
  const remaining  = checkCooldown(guild.id, userId, categoryKey, cooldownMs);
  if (remaining > 0) {
    return replyFn(`❌ You must wait **${msToHuman(remaining)}** before opening another ticket.`);
  }

  // Show opening form modal if configured — must happen before any defer/reply
  if (catCfg.opening_form?.enabled && catCfg.opening_form.questions.length > 0) {
    const modal = new ModalBuilder()
      .setCustomId(`ticket:open_form:${panelName}:${categoryKey}`)
      .setTitle(catCfg.name.slice(0, 45));

    for (const q of catCfg.opening_form.questions.slice(0, 5)) {
      const input = new TextInputBuilder()
        .setCustomId(q.label.slice(0, 100))
        .setLabel(q.label.slice(0, 45))
        .setStyle(q.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(q.required ?? false);
      if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
      if (q.max_length)  input.setMaxLength(q.max_length);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    }

    return showModalFn(modal);
  }

  // No modal — defer NOW before the heavy channel-creation work so Discord
  // doesn't hit the 3-second interaction timeout and show "thinking…"
  if (deferFn) await deferFn();

  try {
    const channel = await openTicketChannel(client, guild, userId, userTag, categoryKey);
    if (!channel) return replyFn("❌ Failed to create ticket channel. Please contact an admin.");
    return replyFn(`✅ Your ticket has been created: <#${channel.id}>`);
  } catch (err) {
    logger.error({ err, guildId: guild.id, categoryKey }, "openTicketChannel threw");
    return replyFn("❌ Failed to create ticket channel. Please check your YAML config (role IDs, category IDs) and try again.");
  }
}

// Handle form modal submit
export async function handleTicketFormSubmit(
  client: Client,
  interaction: ModalSubmitInteraction
): Promise<void> {
  if (!interaction.guild) return;
  const parts = interaction.customId.split(":");
  // customId: ticket:open_form:panelName:categoryKey
  const categoryKey = parts[3];
  if (!categoryKey) return;

  await interaction.deferReply({ ephemeral: true });

  const catCfg = getCategoryConfig(interaction.guild.id, categoryKey);
  if (!catCfg) {
    return void interaction.editReply("❌ Ticket category not found.");
  }

  const formAnswers: Record<string, string> = {};
  if (catCfg.opening_form?.questions) {
    for (const q of catCfg.opening_form.questions) {
      const val = interaction.fields.getTextInputValue(q.label.slice(0, 100));
      if (val) formAnswers[q.label] = val;
    }
  }

  const channel = await openTicketChannel(
    client,
    interaction.guild,
    interaction.user.id,
    interaction.user.tag,
    categoryKey,
    formAnswers
  );

  if (!channel) return void interaction.editReply("❌ Failed to create ticket channel. Please contact an admin.");
  return void interaction.editReply(`✅ Your ticket has been created: <#${channel.id}>`);
}

// Handle close button
export async function handleCloseButton(
  client: Client,
  interaction: ButtonInteraction
): Promise<void> {
  if (!interaction.guild) return;
  const channelId = interaction.customId.split(":")[2]!;
  const ticket    = await getTicketByChannel(channelId);
  if (!ticket) return void interaction.reply({ content: "❌ Ticket not found.", ephemeral: true });

  const cfg      = getTicketConfig(interaction.guild.id);
  const closeCfg = cfg?.close;
  const btnCfg   = cfg?.buttons?.close;

  if (btnCfg?.require_reason) {
    const modal = new ModalBuilder()
      .setCustomId(`ticket:close_reason:${channelId}`)
      .setTitle("Close Ticket");
    const input = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Reason for closing")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    if (btnCfg.reason_placeholder) input.setPlaceholder(btnCfg.reason_placeholder);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    return void interaction.showModal(modal);
  }

  if (btnCfg?.confirm) {
    await interaction.reply({
      content: btnCfg.confirm_message ?? "Are you sure you want to close this ticket?",
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`ticket:close_confirm:${channelId}:No reason provided`).setLabel("✅ Close").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`ticket:close_cancel:${channelId}`).setLabel("✗ Cancel").setStyle(ButtonStyle.Secondary)
        )
      ],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await closeTicket(client, interaction.guild, channelId, interaction.user.id, interaction.user.tag, "No reason provided");
  await interaction.editReply("✅ Ticket closed.").catch(() => {});
}

// Handle close reason modal submit
export async function handleCloseReasonModal(
  client: Client,
  interaction: ModalSubmitInteraction
): Promise<void> {
  if (!interaction.guild) return;
  const channelId = interaction.customId.split(":")[2]!;
  const reason    = interaction.fields.getTextInputValue("reason") || "No reason provided";

  const cfg    = getTicketConfig(interaction.guild.id);
  const btnCfg = cfg?.buttons?.close;

  if (btnCfg?.confirm) {
    await interaction.reply({
      content: btnCfg.confirm_message ?? "Are you sure you want to close this ticket?",
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket:close_confirm:${channelId}:${encodeURIComponent(reason)}`)
            .setLabel("✅ Close")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`ticket:close_cancel:${channelId}`)
            .setLabel("✗ Cancel")
            .setStyle(ButtonStyle.Secondary)
        )
      ],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await closeTicket(client, interaction.guild, channelId, interaction.user.id, interaction.user.tag, reason);
  await interaction.editReply("✅ Ticket closed.").catch(() => {});
}

// Handle feedback select
export async function handleFeedbackSelect(
  client: Client,
  interaction: StringSelectMenuInteraction
): Promise<void> {
  const parts    = interaction.customId.split(":");
  const ticketId = parseInt(parts[2]!, 10);
  if (isNaN(ticketId)) return;

  const rating = parseInt(interaction.values[0]!, 10);
  await saveFeedback({ ticketId, userId: interaction.user.id, rating, comment: null });

  await interaction.update({
    content: `⭐ Thank you for your feedback! You rated this ticket **${rating}/5**.`,
    components: [],
    embeds: [],
  }).catch(() => {});

  // Post result to feedback channel if configured
  const guildId = interaction.guildId;
  if (guildId) {
    const cfg   = getTicketConfig(guildId);
    const fbCfg = cfg?.feedback;
    if (fbCfg?.channel) {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const fCh = guild.channels.cache.get(fbCfg.channel) as TextChannel | undefined;
        if (fCh && fbCfg.result_message) {
          const stars = "⭐".repeat(rating);
          await fCh.send({
            embeds: [buildEmbed(fbCfg.result_message, {
              number:      String(ticketId),
              userMention: `<@${interaction.user.id}>`,
              rating:      `${stars} ${rating}/5`,
              reason:      "",
            })]
          }).catch(() => {});
        }
      }
    }
  }
}

// Handle add/remove user modal
export async function handleAddUserBtn(interaction: ButtonInteraction): Promise<void> {
  const channelId = interaction.customId.split(":")[2]!;
  const modal = new ModalBuilder()
    .setCustomId(`ticket:adduser_modal:${channelId}`)
    .setTitle("Add User to Ticket");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("user_id")
        .setLabel("User ID or @mention")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. 123456789012345678")
        .setRequired(true)
    )
  );
  await interaction.showModal(modal);
}

export async function handleRemoveUserBtn(interaction: ButtonInteraction): Promise<void> {
  const channelId = interaction.customId.split(":")[2]!;
  const modal = new ModalBuilder()
    .setCustomId(`ticket:removeuser_modal:${channelId}`)
    .setTitle("Remove User from Ticket");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("user_id")
        .setLabel("User ID or @mention")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. 123456789012345678")
        .setRequired(true)
    )
  );
  await interaction.showModal(modal);
}

export async function handleAddUserModal(
  client: Client,
  interaction: ModalSubmitInteraction
): Promise<void> {
  if (!interaction.guild) return;
  const channelId = interaction.customId.split(":")[2]!;
  const rawId     = interaction.fields.getTextInputValue("user_id").replace(/[<@!>]/g, "");
  const ticket    = await getTicketByChannel(channelId);
  if (!ticket) return void interaction.reply({ content: "❌ Ticket not found.", ephemeral: true });

  const channel = interaction.guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel) return void interaction.reply({ content: "❌ Channel not found.", ephemeral: true });

  try {
    await channel.permissionOverwrites.edit(rawId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    await addParticipant(ticket.id, rawId);
    await interaction.reply({ content: `✅ <@${rawId}> added to the ticket.`, ephemeral: true });
    await channel.send({ content: `➕ <@${rawId}> was added to this ticket by <@${interaction.user.id}>.` });
    await logTicketEvent(client, interaction.guild.id, "ticket_add_user", {
      number:      String(ticket.number).padStart(4, "0"),
      moderator:   interaction.user.tag,
      userMention: `<@${rawId}>`,
      channel:     `<#${channelId}>`,
    });
  } catch {
    await interaction.reply({ content: "❌ Failed to add user. Make sure the ID is valid.", ephemeral: true });
  }
}

export async function handleRemoveUserModal(
  client: Client,
  interaction: ModalSubmitInteraction
): Promise<void> {
  if (!interaction.guild) return;
  const channelId = interaction.customId.split(":")[2]!;
  const rawId     = interaction.fields.getTextInputValue("user_id").replace(/[<@!>]/g, "");
  const ticket    = await getTicketByChannel(channelId);
  if (!ticket) return void interaction.reply({ content: "❌ Ticket not found.", ephemeral: true });

  const channel = interaction.guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel) return void interaction.reply({ content: "❌ Channel not found.", ephemeral: true });

  try {
    await channel.permissionOverwrites.delete(rawId);
    await removeParticipant(ticket.id, rawId);
    await interaction.reply({ content: `✅ <@${rawId}> removed from the ticket.`, ephemeral: true });
    await channel.send({ content: `➖ <@${rawId}> was removed from this ticket by <@${interaction.user.id}>.` });
    await logTicketEvent(client, interaction.guild.id, "ticket_remove_user", {
      number:      String(ticket.number).padStart(4, "0"),
      moderator:   interaction.user.tag,
      userMention: `<@${rawId}>`,
      channel:     `<#${channelId}>`,
    });
  } catch {
    await interaction.reply({ content: "❌ Failed to remove user.", ephemeral: true });
  }
}

// !ticket command
const ticketCmd: Command = {
  name: "ticket",
  aliases: [],
  usage: "<subcommand> [args]",
  description: "Manage the ticket system.",

  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    const sub      = args[0]?.toLowerCase();
    const userLevel = getUserLevel(message);

    // !ticket panel post <name>
    if (sub === "panel") {
      const panelSub = args[1]?.toLowerCase();

      if (panelSub === "post") {
        if (userLevel < 50) return void message.reply("❌ You need level 50+ to post ticket panels.");
        const panelName = args[2];
        if (!panelName) return void message.reply("❌ Usage: `!ticket panel post <name>`\nThe panel name must match a key under `tickets.config.panels` in your guild YAML config.");

        const cfg      = getTicketConfig(message.guild.id);
        const panelCfg = cfg?.panels?.[panelName];
        if (!panelCfg) return void message.reply(`❌ No panel named \`${panelName}\` found in YAML config. Check \`tickets.config.panels\` in your guild config.`);

        const targetChannel = message.guild.channels.cache.get(panelCfg.channel) as TextChannel | undefined;
        if (!targetChannel) return void message.reply(`❌ Panel channel \`${panelCfg.channel}\` not found. Update \`tickets.config.panels.${panelName}.channel\` in your YAML config.`);

        try {
          await postPanel(client, message.guild, panelName, targetChannel);
          return void message.reply(`✅ Panel \`${panelName}\` posted in <#${targetChannel.id}>.`);
        } catch (err: any) {
          return void message.reply(`❌ Failed to post panel: ${err.message}`);
        }
      }

      if (panelSub === "list") {
        const cfg    = getTicketConfig(message.guild.id);
        const panels = Object.keys(cfg?.panels ?? {});
        if (panels.length === 0) return void message.reply("No panels configured in YAML. Add them under `tickets.config.panels`.");
        const cats   = Object.keys(cfg?.categories ?? {});
        const embed  = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("📬 Configured Panels")
          .setDescription(panels.map((p) => {
            const pc = cfg!.panels![p]!;
            const type = pc.select_menu ? "select menu" : "button";
            return `**${p}** (${type}) — channel: <#${pc.channel}>`;
          }).join("\n"))
          .addFields({ name: "Defined Categories", value: cats.length > 0 ? cats.join(", ") : "None", inline: false });
        return void message.channel.send({ embeds: [embed] });
      }

      return void message.reply("❌ Usage: `!ticket panel post <name>` or `!ticket panel list`");
    }

    // !ticket close [reason]
    if (sub === "close") {
      const ticket = await getTicketByChannel(message.channel.id);
      if (!ticket) return void message.reply("❌ This is not an active ticket channel.");
      const reason = args.slice(1).join(" ") || "No reason provided";
      await closeTicket(client, message.guild, ticket.channelId, message.author.id, message.author.tag, reason);
      return;
    }

    // !ticket claim / unclaim
    if (sub === "claim" || sub === "unclaim") {
      const ticket = await getTicketByChannel(message.channel.id);
      if (!ticket) return void message.reply("❌ This is not an active ticket channel.");
      if (sub === "claim") {
        await updateTicket(ticket.id, { claimerId: message.author.id, claimerTag: message.author.tag });
        const cfg     = getTicketConfig(message.guild.id);
        const btnCfg  = cfg?.buttons?.claim;
        const embed   = buildEmbed({
          title:       "✋ Ticket Claimed",
          description: `This ticket has been claimed by <@${message.author.id}>.`,
          color:       "5865F2",
        });
        await message.channel.send({ embeds: [embed] });

        // restrict_on_claim: remove other support role access
        if (btnCfg?.restrict_on_claim) {
          const catCfg = getCategoryConfig(message.guild.id, ticket.categoryKey);
          const supportRoles = catCfg?.support_roles ?? [];
          const ch = message.channel as TextChannel;
          for (const roleId of supportRoles) {
            await ch.permissionOverwrites.delete(roleId).catch(() => {});
          }
          await ch.permissionOverwrites.edit(message.author.id, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageMessages: true,
          }).catch(() => {});
        }

        await logTicketEvent(client, message.guild.id, "ticket_claim", {
          number:   String(ticket.number).padStart(4, "0"),
          moderator: message.author.tag,
          channel:  `<#${ticket.channelId}>`,
        });
      } else {
        await updateTicket(ticket.id, { claimerId: null, claimerTag: null });
        await message.channel.send({ embeds: [buildEmbed({ title: "↩️ Ticket Unclaimed", description: `<@${message.author.id}> unclaimed this ticket.`, color: "FEE75C" })] });
        await logTicketEvent(client, message.guild.id, "ticket_unclaim", {
          number:   String(ticket.number).padStart(4, "0"),
          moderator: message.author.tag,
          channel:  `<#${ticket.channelId}>`,
        });
      }
      return;
    }

    // !ticket delete [reason]
    if (sub === "delete") {
      if (userLevel < 50) return void message.reply("❌ You need level 50+ to delete tickets.");
      const ticket = await getTicketByChannel(message.channel.id);
      if (!ticket) return void message.reply("❌ This is not an active ticket channel.");
      const reason = args.slice(1).join(" ") || "No reason provided";
      await message.channel.send({ embeds: [buildEmbed({ title: "🗑️ Ticket Deleted", description: `Deleted by <@${message.author.id}>. Reason: ${reason}`, color: "ED4245" })] });
      await logTicketEvent(client, message.guild.id, "ticket_delete", {
        number:   String(ticket.number).padStart(4, "0"),
        moderator: message.author.tag,
      });
      await deleteTicketRecord(ticket.id);
      await (message.channel as TextChannel).delete(reason).catch(() => {});
      return;
    }

    // !ticket adduser @mention / !ticket removeuser @mention
    if (sub === "adduser" || sub === "removeuser") {
      const ticket = await getTicketByChannel(message.channel.id);
      if (!ticket) return void message.reply("❌ This is not an active ticket channel.");
      const target = message.mentions.users.first();
      if (!target) return void message.reply(`❌ Usage: \`!ticket ${sub} @user\``);
      const ch = message.channel as TextChannel;
      if (sub === "adduser") {
        await ch.permissionOverwrites.edit(target.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
        await addParticipant(ticket.id, target.id);
        await message.reply(`✅ <@${target.id}> added to ticket.`);
        await logTicketEvent(client, message.guild.id, "ticket_add_user", {
          number: String(ticket.number).padStart(4, "0"), moderator: message.author.tag,
          userMention: `<@${target.id}>`, channel: `<#${ticket.channelId}>`,
        });
      } else {
        await ch.permissionOverwrites.delete(target.id);
        await removeParticipant(ticket.id, target.id);
        await message.reply(`✅ <@${target.id}> removed from ticket.`);
        await logTicketEvent(client, message.guild.id, "ticket_remove_user", {
          number: String(ticket.number).padStart(4, "0"), moderator: message.author.tag,
          userMention: `<@${target.id}>`, channel: `<#${ticket.channelId}>`,
        });
      }
      return;
    }

    // !ticket rename <name>
    if (sub === "rename") {
      const ticket = await getTicketByChannel(message.channel.id);
      if (!ticket) return void message.reply("❌ This is not an active ticket channel.");
      const newName = args[1];
      if (!newName) return void message.reply("❌ Usage: `!ticket rename <name>`");
      await (message.channel as TextChannel).setName(newName.toLowerCase().replace(/\s+/g, "-").slice(0, 100));
      return void message.reply("✅ Ticket channel renamed.");
    }

    // !ticket transcript
    if (sub === "transcript") {
      const ticket = await getTicketByChannel(message.channel.id);
      if (!ticket) return void message.reply("❌ This is not an active ticket channel.");
      const cfg    = getTicketConfig(message.guild.id);
      const format = (cfg?.transcripts?.format ?? "txt") as "html" | "txt";
      const att    = await generateTranscript(message.channel as TextChannel, ticket, format);
      await message.channel.send({ content: "📄 Transcript generated:", files: [att] });
      await logTicketEvent(client, message.guild.id, "ticket_transcript", {
        number: String(ticket.number).padStart(4, "0"), moderator: message.author.tag, channel: `<#${ticket.channelId}>`,
      });
      return;
    }

    // !ticket move <categoryId>
    if (sub === "move") {
      if (userLevel < 25) return void message.reply("❌ You need level 25+ to move tickets.");
      const ticket = await getTicketByChannel(message.channel.id);
      if (!ticket) return void message.reply("❌ This is not an active ticket channel.");
      const catId  = args[1];
      if (!catId) return void message.reply("❌ Usage: `!ticket move <categoryId>`");
      await (message.channel as TextChannel).setParent(catId, { lockPermissions: false }).catch(() => {});
      return void message.reply(`✅ Ticket moved to category \`${catId}\`.`);
    }

    // !ticket reopen
    if (sub === "reopen") {
      if (userLevel < 25) return void message.reply("❌ You need level 25+ to reopen tickets.");
      const ticket = await getTicketByChannel(message.channel.id);
      if (!ticket) return void message.reply("❌ No ticket record associated with this channel.");
      if (ticket.status === "open") return void message.reply("❌ This ticket is already open.");
      await reopenTicket(client, message.guild, ticket, message.author.id);
      return;
    }

    // !ticket list
    if (sub === "list") {
      if (userLevel < 25) return void message.reply("❌ You need level 25+ to list tickets.");
      const tickets = await getAllOpenTickets(message.guild.id);
      if (tickets.length === 0) return void message.reply("No open tickets.");
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🎫 Open Tickets (${tickets.length})`)
        .setDescription(
          tickets.slice(0, 20).map((t) =>
            `**#${String(t.number).padStart(4, "0")}** — <#${t.channelId}> — opened by \`${t.openerTag}\` — category: \`${t.categoryKey}\`${t.claimerId ? ` — claimed by \`${t.claimerTag}\`` : ""}`
          ).join("\n")
        );
      if (tickets.length > 20) embed.setFooter({ text: `…and ${tickets.length - 20} more` });
      return void message.channel.send({ embeds: [embed] });
    }

    // !ticket stats [@user]
    if (sub === "stats") {
      if (userLevel < 25) return void message.reply("❌ You need level 25+ to view ticket stats.");
      const targetUser = message.mentions.users.first();
      if (targetUser) {
        const tickets = await getAllTicketsForUser(message.guild.id, targetUser.id);
        const open    = tickets.filter((t) => t.status === "open").length;
        const closed  = tickets.filter((t) => t.status !== "open").length;
        const embed   = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📊 Ticket Stats — ${targetUser.tag}`)
          .addFields(
            { name: "Total Tickets Opened", value: String(tickets.length), inline: true },
            { name: "Currently Open",        value: String(open),           inline: true },
            { name: "Closed / Archived",     value: String(closed),         inline: true }
          );
        return void message.channel.send({ embeds: [embed] });
      } else {
        const stats = await getGuildStats(message.guild.id);
        const avgStr = stats.avgResponseMs != null ? msToHuman(stats.avgResponseMs) : "N/A";
        const embed  = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📊 Server Ticket Stats — ${message.guild.name}`)
          .addFields(
            { name: "Total Tickets",     value: String(stats.totalTickets),  inline: true },
            { name: "Currently Open",    value: String(stats.openTickets),   inline: true },
            { name: "Closed / Archived", value: String(stats.closedTickets), inline: true },
            { name: "Avg Close Time",    value: avgStr,                      inline: true },
            { name: "Busiest Category",  value: stats.busiestCategory ?? "N/A", inline: true },
          );
        return void message.channel.send({ embeds: [embed] });
      }
    }

    // !ticket blacklist
    if (sub === "blacklist") {
      const bSub = args[1]?.toLowerCase();
      if (userLevel < 25) return void message.reply("❌ You need level 25+ to manage the blacklist.");

      if (bSub === "list") {
        const list = await listTicketBlacklist(message.guild.id);
        if (list.length === 0) return void message.reply("No users are blacklisted from tickets.");
        return void message.channel.send({
          embeds: [new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("🚫 Ticket Blacklist")
            .setDescription(list.map((e) => `<@${e.userId}> (\`${e.userTag}\`) — ${e.reason ?? "No reason"} — added by \`${e.addedByTag}\``).join("\n"))
          ]
        });
      }

      const target = message.mentions.users.first();
      if (!target) return void message.reply("❌ Usage: `!ticket blacklist @user [reason]`");
      const reason = args.slice(2).join(" ") || undefined;
      await addTicketBlacklist(message.guild.id, {
        userId: target.id, userTag: target.tag, reason,
        addedBy: message.author.id, addedByTag: message.author.tag, addedAt: Date.now(),
      });
      return void message.reply(`✅ <@${target.id}> blacklisted from opening tickets.${reason ? ` Reason: ${reason}` : ""}`);
    }

    // !ticket unblacklist @user
    if (sub === "unblacklist") {
      if (userLevel < 25) return void message.reply("❌ You need level 25+ to manage the blacklist.");
      const target  = message.mentions.users.first();
      if (!target) return void message.reply("❌ Usage: `!ticket unblacklist @user`");
      const removed = await removeTicketBlacklist(message.guild.id, target.id);
      return void message.reply(removed ? `✅ <@${target.id}> removed from the ticket blacklist.` : `❌ <@${target.id}> is not blacklisted.`);
    }

    return void message.reply(
      "❌ Unknown subcommand.\n**Available subcommands:** `panel post`, `panel list`, `close`, `claim`, `unclaim`, `delete`, `adduser`, `removeuser`, `rename`, `transcript`, `move`, `reopen`, `list`, `stats`, `blacklist`, `unblacklist`"
    );
  },
};

export default ticketCmd;

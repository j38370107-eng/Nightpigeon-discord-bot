import {
  ButtonInteraction,
  Client,
  GatewayIntentBits,
  Interaction,
  MessageReaction,
  ModalSubmitInteraction,
  Partials,
  StringSelectMenuInteraction,
  User,
} from "discord.js";
import { logger } from "../lib/logger";
import { initDb } from "./store/db";
import { initGuildConfigStore } from "./store/guildConfig";
import { initSettingsStore } from "./store/settings";
import { initTicketStore, isTicketBlacklisted, getTicketByChannel, updateTicket, saveFeedback } from "./store/tickets";
import { initAutocleanStore } from "./store/autoclean";
import { initAutoreactionStore } from "./store/autoreaction";
import { initAutoreplyStore } from "./store/autoreply";
import { initStarboardStore } from "./store/starboard";
import { initServerLoggingStore } from "./store/serverlogging";
import { handleMessage } from "./handlers/messageCreate";
import { registerServerLogEvents } from "./handlers/serverLogEvents";
import { runYamlAutomodOnMember } from "./lib/yamlAutomodRules";
import {
  handleRRButtonInteraction,
  handleRRDropdownInteraction,
  handleRRReactionAdd,
  handleRRReactionRemove,
  restoreEmojiPanels,
} from "./commands/mod/rr";
import { startReminderScheduler } from "./commands/util/remind";
import { startAutocleanScheduler } from "./commands/util/autoclean";
import { initPunishmentEscalationTable, startPunishmentEscalationScheduler } from "./lib/punishmentEscalation";
import { initAutomodEscalationTables, startAutomodEscalationScheduler } from "./lib/automodEscalation";
import { handleStarboardReaction } from "./commands/util/starboard";
import { startAutoCloseScheduler } from "./lib/ticketAutoClose";
import {
  handleTicketOpen,
  handleTicketFormSubmit,
  handleCloseButton,
  handleCloseReasonModal,
  handleFeedbackSelect,
  handleAddUserBtn,
  handleRemoveUserBtn,
  handleAddUserModal,
  handleRemoveUserModal,
  closeTicket,
} from "./commands/util/ticket";
import { getTicketConfig, parseDuration } from "./lib/ticketConfig";
import { buildEmbed, logTicketEvent } from "./lib/ticketHelpers";
import { generateTranscript } from "./lib/transcript";
import { cacheAllGuildInvites, cacheGuildInvites, recordMemberBan } from "./lib/inviteTracker";
import { onWelcomeMemberAdd, onWelcomeMemberRemove } from "./handlers/welcomeHandler";
import { runModnick } from "./lib/modnick";
import { handleAntiraidMemberJoin } from "./handlers/antiraidHandler";
import {
  handleAntinukeChannelDelete,
  handleAntinukeChannelCreate,
  handleAntinukeChannelUpdate,
  handleAntinukeRoleDelete,
  handleAntinukeRoleCreate,
  handleAntinukeRoleUpdate,
  handleAntinukeBan,
  handleAntinukeMemberRemove,
  handleAntinukeMemberUpdate,
  handleAntinukeWebhookUpdate,
  handleAntinukeGuildUpdate,
  handleAntinukeEmojiDelete,
  handleAntinukeEmojiCreate,
  handleAntinukeStickerDelete,
  handleAntinukeIntegrationsUpdate,
  handleAntinukeBotAdd,
  cacheEveryonePerms,
} from "./handlers/antinukeHandler";
import {
  initDurationRolesTable,
  startDurationRolesScheduler,
  onDurationRoleAssigned,
  onDurationRoleRemoved,
} from "./lib/durationRoles";
import { startSlowmodeAutoScheduler } from "./lib/slowmodeAuto";
import { initActiveMuteRolesStore, getActiveMute, clearActiveMute, restoreStrippedRoles, startMuteExpiryScheduler } from "./store/activeMuteRoles";
import { runAutomod } from "./lib/runAutomod";
import { runYamlAutomodOnMessage } from "./lib/yamlAutomodRules";

/** Must be called at app startup regardless of whether the bot token is present. */
export async function initBotStores(): Promise<void> {
  await initDb();
  await initGuildConfigStore();
  await initSettingsStore();
  await initTicketStore();
  await initAutocleanStore();
  await initAutoreactionStore();
  await initAutoreplyStore();
  await initStarboardStore();
  await initServerLoggingStore();
  await initPunishmentEscalationTable();
  await initAutomodEscalationTables();
  await initDurationRolesTable();
  await initActiveMuteRolesStore();
  logger.info("Bot stores initialised");
}

export async function startBot(): Promise<Client | null> {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN not set — bot will not start");
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildEmojisAndStickers,
      GatewayIntentBits.GuildWebhooks,
      GatewayIntentBits.GuildScheduledEvents,
      GatewayIntentBits.AutoModerationConfiguration,
      GatewayIntentBits.AutoModerationExecution,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember, Partials.User],
    allowedMentions: { repliedUser: false },
  });

  registerServerLogEvents(client);

  client.once("ready", (c) => {
    logger.info({ tag: c.user.tag, guilds: c.guilds.cache.size }, "NightPigeon is online");
    startReminderScheduler(c);
    startAutocleanScheduler(c);
    startAutoCloseScheduler(c);
    startAutomodEscalationScheduler();
    startPunishmentEscalationScheduler(c);
    startDurationRolesScheduler(c);
    startSlowmodeAutoScheduler(c);
    startMuteExpiryScheduler(c);
    cacheAllGuildInvites(c).catch((err) =>
      logger.error({ err }, "Failed to cache guild invites on ready")
    );
    restoreEmojiPanels(c).catch((err) =>
      logger.error({ err }, "Failed to restore emoji reaction panels")
    );
    // Prime @everyone permission cache for antinuke restoration
    for (const guild of c.guilds.cache.values()) {
      cacheEveryonePerms(guild);
    }
  });

  client.on("guildCreate", (guild) => {
    cacheGuildInvites(guild).catch(() => {});
    cacheEveryonePerms(guild);
  });

  // Antinuke: channel events
  client.on("channelDelete", (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    handleAntinukeChannelDelete(client, channel as import("discord.js").GuildChannel).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke channelDelete")
    );
  });

  client.on("channelCreate", (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    handleAntinukeChannelCreate(client, channel as import("discord.js").GuildChannel).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke channelCreate")
    );
  });

  client.on("channelUpdate", (_old, newCh) => {
    if (!("guild" in newCh) || !newCh.guild) return;
    handleAntinukeChannelUpdate(client, newCh as import("discord.js").GuildChannel).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke channelUpdate")
    );
  });

  // Antinuke: role events
  client.on("roleDelete", (role) => {
    handleAntinukeRoleDelete(client, role).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke roleDelete")
    );
  });

  client.on("roleCreate", (role) => {
    handleAntinukeRoleCreate(client, role).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke roleCreate")
    );
  });

  client.on("roleUpdate", (oldRole, newRole) => {
    handleAntinukeRoleUpdate(client, oldRole, newRole).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke roleUpdate")
    );
  });

  // Antinuke: member ban/kick/update
  client.on("guildBanAdd", (ban) => {
    handleAntinukeBan(client, ban as import("discord.js").GuildBan).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke guildBanAdd")
    );
  });

  // Antinuke: webhook events
  client.on("webhookUpdate", (channel) => {
    handleAntinukeWebhookUpdate(client, channel as import("discord.js").TextChannel).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke webhookUpdate")
    );
  });

  // Antinuke: guild update
  client.on("guildUpdate", (oldGuild, newGuild) => {
    handleAntinukeGuildUpdate(client, oldGuild, newGuild).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke guildUpdate")
    );
  });

  // Antinuke: emoji events
  client.on("emojiDelete", (emoji) => {
    handleAntinukeEmojiDelete(client, emoji as import("discord.js").GuildEmoji).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke emojiDelete")
    );
  });

  client.on("emojiCreate", (emoji) => {
    handleAntinukeEmojiCreate(client, emoji as import("discord.js").GuildEmoji).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke emojiCreate")
    );
  });

  // Antinuke: sticker delete
  client.on("stickerDelete", (sticker) => {
    handleAntinukeStickerDelete(client, sticker as import("discord.js").Sticker).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke stickerDelete")
    );
  });

  // Antinuke: integration/bot events
  client.on("guildIntegrationsUpdate", (guild) => {
    handleAntinukeIntegrationsUpdate(client, guild).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke guildIntegrationsUpdate")
    );
  });

  client.on("messageCreate", (message) => {
    handleMessage(client, message).catch((err) =>
      logger.error({ err }, "Unhandled error in messageCreate")
    );
    // Update last-activity timestamp for open tickets
    if (!message.author.bot && message.channelId) {
      import("./store/tickets").then(({ touchTicketActivity }) =>
        touchTicketActivity(message.channelId).catch(() => {})
      );
    }
  });

  // Anti-bypass: run automod on message edits
  // Users sometimes edit messages to add filtered content after the original
  // passes automod. We re-run all automod checks on the new content.
  client.on("messageUpdate", (_oldMsg, newMsg) => {
    if (newMsg.partial) return;
    if (!newMsg.guild) return;
    if (newMsg.author?.bot) return;
    // Only act if the content actually changed
    if (_oldMsg.content === newMsg.content) return;

    Promise.all([
      runAutomod(client, newMsg as import("discord.js").Message).catch((err) =>
        logger.warn({ err }, "Automod error on messageUpdate (legacy)")
      ),
      runYamlAutomodOnMessage(client, newMsg as import("discord.js").Message).catch((err) =>
        logger.warn({ err }, "YAML automod error on messageUpdate")
      ),
    ]).catch(() => {});
  });

  client.on("guildMemberAdd", (member) => {
    handleAntiraidMemberJoin(client, member as import("discord.js").GuildMember).catch((err) =>
      logger.error({ err }, "Unhandled error in antiraid guildMemberAdd")
    );
    handleAntinukeBotAdd(client, member as import("discord.js").GuildMember).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke bot_add")
    );
    runYamlAutomodOnMember(client, member).catch((err) =>
      logger.error({ err }, "Unhandled error in YAML automod guildMemberAdd")
    );
    onWelcomeMemberAdd(client, member).catch((err) =>
      logger.error({ err }, "Unhandled error in welcome guildMemberAdd")
    );
    runModnick(client, member as import("discord.js").GuildMember, "join").catch((err) =>
      logger.error({ err }, "Unhandled error in modnick guildMemberAdd")
    );

    // Anti-bypass: re-apply mute role if user was muted and rejoined
    // Discord timeout persists across rejoins server-side, but a role-based mute
    // is lost the moment someone leaves. Check the active mute store and restore.
    (async () => {
      const m = member as import("discord.js").GuildMember;
      const activeMute = getActiveMute(m.guild.id, m.id);
      if (!activeMute) return;

      const role = m.guild.roles.cache.get(activeMute.roleId);
      if (!role) return;

      try {
        await m.roles.add(role, "Anti-bypass: restoring mute role after rejoin");
        logger.info(
          { guildId: m.guild.id, userId: m.id, roleId: activeMute.roleId },
          "Mute role re-applied on rejoin (bypass prevention)"
        );
      } catch (err) {
        logger.warn({ err, guildId: m.guild.id, userId: m.id }, "Failed to re-apply mute role on rejoin");
        // Clear the record if we truly can't apply it (e.g. role deleted)
        clearActiveMute(m.guild.id, m.id).catch(() => {});
      }
    })().catch((err) =>
      logger.error({ err }, "Unhandled error in mute-rejoin anti-bypass")
    );
  });

  client.on("guildMemberUpdate", (oldMember, newMember) => {
    const new_ = newMember as import("discord.js").GuildMember;
    const old_ = oldMember as import("discord.js").GuildMember;

    // Duration roles: detect added/removed roles
    if (!oldMember.partial) {
      const oldRoles = old_.roles.cache;
      const newRoles = new_.roles.cache;

      // Roles added this update
      for (const [roleId] of newRoles) {
        if (!oldRoles.has(roleId)) {
          onDurationRoleAssigned(client, new_, roleId).catch((err) =>
            logger.error({ err }, "Unhandled error in duration role assignment")
          );
        }
      }

      // Roles removed this update (manual removal — clean up DB)
      for (const [roleId] of oldRoles) {
        if (!newRoles.has(roleId)) {
          onDurationRoleRemoved(client, new_, roleId).catch((err) =>
            logger.error({ err }, "Unhandled error in duration role removal")
          );
        }
      }
    }

    // Antinuke: member_update (role changes)
    handleAntinukeMemberUpdate(client, oldMember, new_).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke guildMemberUpdate")
    );

    // Modnick: display name check
    const oldDisplay = oldMember.partial ? "(partial/unknown)" : old_.displayName;
    const newDisplay = new_.displayName;
    logger.info(
      { guildId: new_.guild.id, userId: new_.id, oldDisplay, newDisplay },
      "modnick: guildMemberUpdate fired — checking display name",
    );
    // If old member is fully cached and the displayed name hasn't changed, this is a
    // non-name update (role add/remove, boost, etc.) — skip it.
    if (!oldMember.partial && old_.displayName === new_.displayName) {
      logger.info({ guildId: new_.guild.id, userId: new_.id }, "modnick: display name unchanged — skipping (role/boost/etc update)");
      return;
    }
    runModnick(client, new_, "update").catch((err) =>
      logger.error({ err }, "Unhandled error in modnick guildMemberUpdate")
    );
  });

  // Also fire when a user changes their global display name or username account-wide.
  // We only check guilds where the member is already cached to avoid API spam.
  client.on("userUpdate", (oldUser, newUser) => {
    const oldDisplay = oldUser.globalName ?? oldUser.username;
    const newDisplay = newUser.globalName ?? newUser.username;
    if (oldDisplay === newDisplay) return;
    for (const guild of client.guilds.cache.values()) {
      const member = guild.members.cache.get(newUser.id);
      if (!member) continue;
      runModnick(client, member, "update").catch((err) =>
        logger.error({ err }, "Unhandled error in modnick userUpdate")
      );
    }
  });

  client.on("guildMemberRemove", (member) => {
    handleAntinukeMemberRemove(client, member as import("discord.js").GuildMember).catch((err) =>
      logger.error({ err }, "Unhandled error in antinuke guildMemberRemove (kick)")
    );
    onWelcomeMemberRemove(client, member as import("discord.js").GuildMember).catch((err) =>
      logger.error({ err }, "Unhandled error in welcome guildMemberRemove")
    );
  });

  client.on("guildBanAdd", (ban) => {
    recordMemberBan(ban.guild.id, ban.user.id).catch(() => {});
  });

  client.on("interactionCreate", (interaction: Interaction) => {
    if (interaction.isButton()) {
      handleButtonInteraction(client, interaction as ButtonInteraction).catch((err) =>
        logger.error({ err }, "Unhandled error in button interaction")
      );
    } else if (interaction.isStringSelectMenu()) {
      handleSelectMenuInteraction(client, interaction as StringSelectMenuInteraction).catch((err) =>
        logger.error({ err }, "Unhandled error in select menu interaction")
      );
    } else if (interaction.isModalSubmit()) {
      handleModalSubmit(client, interaction as ModalSubmitInteraction).catch((err) =>
        logger.error({ err }, "Unhandled error in modal submit")
      );
    }
  });

  client.on("messageReactionAdd", (reaction, user) => {
    handleStarboardReaction(reaction as MessageReaction, user as User, true).catch((err) =>
      logger.error({ err }, "Unhandled error in messageReactionAdd")
    );
    handleRRReactionAdd(reaction as MessageReaction, user as User, client).catch((err) =>
      logger.error({ err }, "Unhandled error in RR reactionAdd")
    );
  });

  client.on("messageReactionRemove", (reaction, user) => {
    handleStarboardReaction(reaction as MessageReaction, user as User, false).catch((err) =>
      logger.error({ err }, "Unhandled error in messageReactionRemove")
    );
    handleRRReactionRemove(reaction as MessageReaction, user as User, client).catch((err) =>
      logger.error({ err }, "Unhandled error in RR reactionRemove")
    );
  });

  await client.login(token);
  return client;
}

// Button interaction handler
async function handleButtonInteraction(client: Client, btn: ButtonInteraction): Promise<void> {
  const id = btn.customId;

  // Reaction roles (button panels)
  if (id.startsWith("rrb:")) {
    return handleRRButtonInteraction(btn).catch((err) =>
      logger.error({ err }, "Unhandled error in RR button interaction")
    );
  }

  // Ticket: open via single button (one category per panel)
  // customId: ticket:open:panelName:categoryKey
  if (id.startsWith("ticket:open:")) {
    const parts       = id.split(":");
    const panelName   = parts[2]!;
    const categoryKey = parts[3]!;
    if (!btn.guild) return;

    let deferred = false;
    return handleTicketOpen(
      client,
      btn.guild,
      btn.user.id,
      btn.user.tag,
      panelName,
      categoryKey,
      async (msg) => {
        if (deferred) {
          await btn.editReply({ content: msg });
        } else {
          await btn.reply({ content: msg, ephemeral: true });
        }
      },
      async (modal) => { await btn.showModal(modal); },
      async () => {
        deferred = true;
        await btn.deferReply({ ephemeral: true });
      }
    );
  }

  // Ticket: close button
  // customId: ticket:close_btn:channelId
  if (id.startsWith("ticket:close_btn:")) {
    return handleCloseButton(client, btn);
  }

  // Ticket: close confirm button
  // customId: ticket:close_confirm:channelId:encodedReason
  if (id.startsWith("ticket:close_confirm:")) {
    const parts     = id.split(":");
    const channelId = parts[2]!;
    const reason    = decodeURIComponent(parts.slice(3).join(":") || "No reason provided");
    if (!btn.guild) return;
    await btn.deferUpdate().catch(() => {});
    await closeTicket(client, btn.guild, channelId, btn.user.id, btn.user.tag, reason);
    return;
  }

  // Ticket: close cancel
  if (id.startsWith("ticket:close_cancel:")) {
    await btn.update({ content: "✗ Close cancelled.", components: [], embeds: [] }).catch(() => {});
    return;
  }

  // Ticket: claim
  // customId: ticket:claim:channelId
  if (id.startsWith("ticket:claim:")) {
    const channelId = id.split(":")[2]!;
    if (!btn.guild) return;
    const ticket = await getTicketByChannel(channelId);
    if (!ticket) return void btn.reply({ content: "❌ Ticket not found.", ephemeral: true });

    await updateTicket(ticket.id, { claimerId: btn.user.id, claimerTag: btn.user.tag });

    const cfg    = getTicketConfig(btn.guild.id);
    const btnCfg = cfg?.buttons?.claim;

    await btn.reply({
      embeds: [buildEmbed({ title: "✋ Ticket Claimed", description: `This ticket has been claimed by <@${btn.user.id}>.`, color: "5865F2" })],
    });

    if (btnCfg?.restrict_on_claim) {
      const { getCategoryConfig } = await import("./lib/ticketConfig");
      const catCfg = getCategoryConfig(btn.guild.id, ticket.categoryKey);
      const supportRoles = catCfg?.support_roles ?? [];
      const { TextChannel } = await import("discord.js");
      const ch = btn.guild.channels.cache.get(channelId) as InstanceType<typeof TextChannel> | undefined;
      if (ch) {
        for (const roleId of supportRoles) {
          await ch.permissionOverwrites.delete(roleId).catch(() => {});
        }
        await ch.permissionOverwrites.edit(btn.user.id, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageMessages: true,
        }).catch(() => {});
      }
    }

    await logTicketEvent(client, btn.guild.id, "ticket_claim", {
      number:   String(ticket.number).padStart(4, "0"),
      moderator: btn.user.tag,
      channel:  `<#${channelId}>`,
    });
    return;
  }

  // Ticket: unclaim
  // customId: ticket:unclaim:channelId
  if (id.startsWith("ticket:unclaim:")) {
    const channelId = id.split(":")[2]!;
    if (!btn.guild) return;
    const ticket = await getTicketByChannel(channelId);
    if (!ticket) return void btn.reply({ content: "❌ Ticket not found.", ephemeral: true });

    await updateTicket(ticket.id, { claimerId: null, claimerTag: null });
    await btn.reply({
      embeds: [buildEmbed({ title: "↩️ Ticket Unclaimed", description: `<@${btn.user.id}> unclaimed this ticket.`, color: "FEE75C" })],
    });
    await logTicketEvent(client, btn.guild.id, "ticket_unclaim", {
      number:   String(ticket.number).padStart(4, "0"),
      moderator: btn.user.tag,
      channel:  `<#${channelId}>`,
    });
    return;
  }

  // Ticket: transcript button
  // customId: ticket:transcript:channelId
  if (id.startsWith("ticket:transcript:")) {
    const channelId = id.split(":")[2]!;
    if (!btn.guild) return;
    const ticket = await getTicketByChannel(channelId);
    if (!ticket) return void btn.reply({ content: "❌ Ticket not found.", ephemeral: true });

    await btn.deferReply({ ephemeral: true });
    const cfg    = getTicketConfig(btn.guild.id);
    const format = (cfg?.transcripts?.format ?? "txt") as "html" | "txt";
    const { TextChannel } = await import("discord.js");
    const ch = btn.guild.channels.cache.get(channelId) as InstanceType<typeof TextChannel> | undefined;
    if (!ch) return void btn.editReply("❌ Channel not found.");

    const attachment = await generateTranscript(ch, ticket, format);
    await btn.editReply({ content: "📄 Transcript generated:", files: [attachment] });

    await logTicketEvent(client, btn.guild.id, "ticket_transcript", {
      number:   String(ticket.number).padStart(4, "0"),
      moderator: btn.user.tag,
      channel:  `<#${channelId}>`,
    });
    return;
  }

  // Ticket: add user button (shows modal)
  if (id.startsWith("ticket:adduser_btn:")) {
    return handleAddUserBtn(btn);
  }

  // Ticket: remove user button (shows modal)
  if (id.startsWith("ticket:removeuser_btn:")) {
    return handleRemoveUserBtn(btn);
  }
}

// Select menu interaction handler
async function handleSelectMenuInteraction(client: Client, interaction: StringSelectMenuInteraction): Promise<void> {
  const id = interaction.customId;

  // Reaction roles (dropdown panels)
  if (id.startsWith("rrd:")) {
    return handleRRDropdownInteraction(interaction).catch((err) =>
      logger.error({ err }, "Unhandled error in RR dropdown interaction")
    );
  }

  // Ticket: open from select menu panel
  // customId: ticket:open_select:panelName  |  value = categoryKey
  if (id.startsWith("ticket:open_select:")) {
    const panelName   = id.split(":")[2]!;
    const categoryKey = interaction.values[0]!;
    if (!interaction.guild) return;

    let deferred = false;
    return handleTicketOpen(
      client,
      interaction.guild,
      interaction.user.id,
      interaction.user.tag,
      panelName,
      categoryKey,
      async (msg) => {
        if (deferred) {
          await interaction.editReply({ content: msg });
        } else {
          await interaction.reply({ content: msg, ephemeral: true });
        }
      },
      async (modal) => { await interaction.showModal(modal); },
      async () => {
        deferred = true;
        await interaction.deferReply({ ephemeral: true });
      }
    );
  }

  // Ticket: feedback rating select (sent in DMs)
  // customId: ticket:feedback:ticketId
  if (id.startsWith("ticket:feedback:")) {
    return handleFeedbackSelect(client, interaction);
  }
}

// Modal submit handler
async function handleModalSubmit(client: Client, interaction: ModalSubmitInteraction): Promise<void> {
  const id = interaction.customId;

  // Ticket: opening form modal submit
  // customId: ticket:open_form:panelName:categoryKey
  if (id.startsWith("ticket:open_form:")) {
    return handleTicketFormSubmit(client, interaction);
  }

  // Ticket: close reason modal submit
  // customId: ticket:close_reason:channelId
  if (id.startsWith("ticket:close_reason:")) {
    return handleCloseReasonModal(client, interaction);
  }

  // Ticket: add user modal submit
  // customId: ticket:adduser_modal:channelId
  if (id.startsWith("ticket:adduser_modal:")) {
    return handleAddUserModal(client, interaction);
  }

  // Ticket: remove user modal submit
  // customId: ticket:removeuser_modal:channelId
  if (id.startsWith("ticket:removeuser_modal:")) {
    return handleRemoveUserModal(client, interaction);
  }
}

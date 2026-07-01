import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Message,
  MessageReaction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextChannel,
  User,
} from "discord.js";
import type { Command } from "../types";
import type { YamlMessage } from "../../store/guildConfig";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { dbGet, dbSet } from "../../store/db";
import { getGuildConfig } from "../../store/guildConfig";
import {
  applyVars,
  buildVars,
  buildYamlEmbed,
  type TemplateVars,
} from "../../lib/yamlFormatter";

// Types
export type PanelType = "emoji" | "button" | "dropdown";
export type ButtonStyleName = "Primary" | "Secondary" | "Success" | "Danger";

const BUTTON_STYLE_MAP: Record<string, ButtonStyle> = {
  primary:   ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success:   ButtonStyle.Success,
  danger:    ButtonStyle.Danger,
};

export interface RREntry {
  roleId: string;
  roleName: string;
  emoji: string;
  label: string;
  description: string;
  style: ButtonStyleName;
}

export interface RRPanel {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  type: PanelType;
  title: string;
  description: string;
  color: number;
  max: number;
  requiredRoleId: string | null;
  dmOnAssign: boolean;
  logAssignments: boolean;
  entries: RREntry[];
}

type GuildPanels = Record<string, RRPanel>;

// DB helpers
const STORE = "reaction_roles";

async function loadPanels(guildId: string): Promise<GuildPanels> {
  return (await dbGet<GuildPanels>(STORE, guildId)) ?? {};
}

async function savePanels(guildId: string, panels: GuildPanels): Promise<void> {
  await dbSet(STORE, guildId, panels);
}

// YAML message helpers
function rrMsgs(cfg: Awaited<ReturnType<typeof getGuildConfig>>): Record<string, YamlMessage> {
  return ((cfg.plugins?.reaction_roles as any)?.messages ?? {}) as Record<string, YamlMessage>;
}

/**
 * Build an interaction reply payload from a YAML template (or fallback string).
 * Returns { content?, embeds? } ready to spread into interaction.reply().
 */
function buildRRReply(
  template: YamlMessage | undefined,
  vars: TemplateVars,
  fallback: string,
): { content?: string; embeds?: EmbedBuilder[] } {
  if (!template) return { content: fallback };
  if (typeof template === "string") {
    const text = applyVars(template, vars);
    return { content: text || fallback };
  }
  if ("embed" in template) {
    const embed = buildYamlEmbed(template.embed, vars);
    const content =
      "content" in template && template.content
        ? applyVars(template.content, vars)
        : undefined;
    return { content, embeds: [embed] };
  }
  return { content: fallback };
}

// Panel builders
function buildPanelEmbed(panel: RRPanel): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(panel.color)
    .setTitle(panel.title)
    .setDescription(panel.description || "\u200b");

  if (panel.type === "emoji" && panel.entries.length) {
    const lines = panel.entries.map((e) => `${e.emoji} — <@&${e.roleId}>`);
    embed.setDescription(`${panel.description}\n\n${lines.join("\n")}`.trim());
  }

  const parts: string[] = [];
  if (panel.max > 0) parts.push(`Max ${panel.max} role${panel.max !== 1 ? "s" : ""}`);
  if (panel.requiredRoleId) parts.push("Restricted access");
  embed.setFooter({ text: parts.join(" · ") || "React/click to toggle a role" });

  return embed;
}

function buildButtonComponents(panel: RRPanel): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const PER_ROW = 5;
  for (let i = 0; i < panel.entries.length; i += PER_ROW) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const entry of panel.entries.slice(i, i + PER_ROW)) {
      const btn = new ButtonBuilder()
        .setCustomId(`rrb:${panel.id}:${entry.roleId}`)
        .setLabel(entry.label || entry.roleName)
        .setStyle(BUTTON_STYLE_MAP[entry.style.toLowerCase()] ?? ButtonStyle.Secondary);
      if (entry.emoji) {
        try { btn.setEmoji(entry.emoji); } catch { /* ignore invalid emoji */ }
      }
      row.addComponents(btn);
    }
    rows.push(row);
  }
  return rows;
}

function buildDropdownComponents(panel: RRPanel): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`rrd:${panel.id}`)
    .setPlaceholder("Select your roles…")
    .setMinValues(0)
    .setMaxValues(panel.max > 0 ? Math.min(panel.max, panel.entries.length) : panel.entries.length);

  for (const entry of panel.entries) {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(entry.label || entry.roleName)
      .setValue(entry.roleId);
    if (entry.description) opt.setDescription(entry.description.slice(0, 100));
    if (entry.emoji) {
      try { opt.setEmoji(entry.emoji); } catch { /* ignore */ }
    }
    menu.addOptions(opt);
  }

  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
}

// Post / Repost helpers
async function postPanel(
  panel: RRPanel,
  channel: TextChannel,
): Promise<{ id: string }> {
  const embed = buildPanelEmbed(panel);

  if (panel.type === "button") {
    const components = buildButtonComponents(panel);
    return channel.send({ embeds: [embed], components });
  }
  if (panel.type === "dropdown") {
    const components = buildDropdownComponents(panel);
    return channel.send({ embeds: [embed], components });
  }
  // emoji — post embed, then react
  const msg = await channel.send({ embeds: [embed] });
  for (const entry of panel.entries) {
    await msg.react(entry.emoji).catch(() => {});
  }
  return msg;
}

async function editPostedPanel(panel: RRPanel, client: Client): Promise<void> {
  if (!panel.messageId || !panel.channelId) return;
  const guild = client.guilds.cache.get(panel.guildId);
  if (!guild) return;
  const ch = guild.channels.cache.get(panel.channelId) as TextChannel | undefined;
  if (!ch) return;
  const msg = await ch.messages.fetch(panel.messageId).catch(() => null);
  if (!msg) return;

  const embed = buildPanelEmbed(panel);
  if (panel.type === "button") {
    await msg.edit({ embeds: [embed], components: buildButtonComponents(panel) }).catch(() => {});
  } else if (panel.type === "dropdown") {
    await msg.edit({ embeds: [embed], components: buildDropdownComponents(panel) }).catch(() => {});
  } else {
    await msg.edit({ embeds: [embed] }).catch(() => {});
  }
}

// Role assignment core
interface AssignResult {
  action: "added" | "removed" | "max_reached" | "missing_required" | "no_change" | "error";
  roleName: string;
  requiredRoleName?: string;
  max?: number;
}

async function toggleRole(
  guild: import("discord.js").Guild,
  userId: string,
  panel: RRPanel,
  roleId: string,
  forceAdd?: boolean,
  forceRemove?: boolean,
): Promise<AssignResult> {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { action: "error", roleName: "" };

  const role = guild.roles.cache.get(roleId);
  if (!role) return { action: "error", roleName: "" };

  if (panel.requiredRoleId && !member.roles.cache.has(panel.requiredRoleId)) {
    const reqRole = guild.roles.cache.get(panel.requiredRoleId);
    return { action: "missing_required", roleName: role.name, requiredRoleName: reqRole?.name ?? "Unknown" };
  }

  const hasRole = member.roles.cache.has(roleId);

  if (hasRole && !forceAdd) {
    if (forceRemove !== false) {
      await member.roles.remove(roleId).catch(() => {});
      return { action: "removed", roleName: role.name };
    }
    return { action: "no_change", roleName: role.name };
  }

  if (!hasRole) {
    if (panel.max > 0) {
      const panelRoleIds = panel.entries.map((e) => e.roleId);
      const currentCount = panelRoleIds.filter((id) => member.roles.cache.has(id)).length;

      if (panel.max === 1 && currentCount >= 1) {
        // Exclusive mode — remove all other panel roles first
        for (const pid of panelRoleIds) {
          if (pid !== roleId && member.roles.cache.has(pid)) {
            await member.roles.remove(pid).catch(() => {});
          }
        }
      } else if (panel.max > 1 && currentCount >= panel.max) {
        return { action: "max_reached", roleName: role.name, max: panel.max };
      }
    }
    await member.roles.add(roleId).catch(() => {});
    return { action: "added", roleName: role.name };
  }

  return { action: "no_change", roleName: role.name };
}

// Button interaction handler
export async function handleRRButtonInteraction(btn: ButtonInteraction): Promise<void> {
  if (!btn.customId.startsWith("rrb:")) return;
  const parts = btn.customId.split(":");
  const panelId = parts[1];
  const roleId = parts[2];
  if (!panelId || !roleId || !btn.guild) return;

  const panels = await loadPanels(btn.guild.id);
  const panel = panels[panelId];
  if (!panel) {
    return void btn.reply({ content: "❌ This panel no longer exists.", ephemeral: true });
  }

  const cfg = await getGuildConfig(btn.guild.id);
  const msgs = rrMsgs(cfg);
  const role = btn.guild.roles.cache.get(roleId);
  if (!role) {
    return void btn.reply({ content: "❌ That role no longer exists.", ephemeral: true });
  }

  const result = await toggleRole(btn.guild, btn.user.id, panel, roleId);
  const vars = buildVars({ trigger: role.name, count: String(panel.max), server: btn.guild.name });

  if (result.action === "added") {
    const payload = buildRRReply(msgs["rr_role_given"], vars, `✅ You have been given **${role.name}**`);
    await btn.reply({ ...payload, ephemeral: true });
    if (panel.dmOnAssign) {
      const payload2 = buildRRReply(msgs["rr_assign_dm"], buildVars({ trigger: role.name, server: btn.guild.name }), `You have been given the **${role.name}** role in **${btn.guild.name}**`);
      await btn.user.send(payload2).catch(() => {});
    }
  } else if (result.action === "removed") {
    const payload = buildRRReply(msgs["rr_role_removed"], vars, `❌ You no longer have **${role.name}**`);
    await btn.reply({ ...payload, ephemeral: true });
    if (panel.dmOnAssign) {
      const payload2 = buildRRReply(msgs["rr_remove_dm"], buildVars({ trigger: role.name, server: btn.guild.name }), `The **${role.name}** role has been removed in **${btn.guild.name}**`);
      await btn.user.send(payload2).catch(() => {});
    }
  } else if (result.action === "max_reached") {
    const payload = buildRRReply(msgs["rr_max_reached"], vars, `❌ You can only have **${panel.max}** role${panel.max !== 1 ? "s" : ""} from this panel`);
    await btn.reply({ ...payload, ephemeral: true });
  } else if (result.action === "missing_required") {
    const reqVars = buildVars({ trigger: result.requiredRoleName ?? "required" });
    const payload = buildRRReply(msgs["rr_missing_required"], reqVars, `❌ You need the **${result.requiredRoleName}** role to use this panel`);
    await btn.reply({ ...payload, ephemeral: true });
  } else if (result.action === "error") {
    await btn.reply({ content: "❌ An error occurred. Please try again.", ephemeral: true });
  } else {
    await btn.reply({ content: "✅ No changes made.", ephemeral: true });
  }
}

// Dropdown interaction handler
export async function handleRRDropdownInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.customId.startsWith("rrd:")) return;
  const panelId = interaction.customId.split(":")[1];
  if (!panelId || !interaction.guild) return;

  const panels = await loadPanels(interaction.guild.id);
  const panel = panels[panelId];
  if (!panel) {
    return void interaction.reply({ content: "❌ This panel no longer exists.", ephemeral: true });
  }

  const cfg = await getGuildConfig(interaction.guild.id);
  const msgs = rrMsgs(cfg);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return void interaction.reply({ content: "❌ Could not fetch your member data.", ephemeral: true });

  if (panel.requiredRoleId && !member.roles.cache.has(panel.requiredRoleId)) {
    const reqRole = interaction.guild.roles.cache.get(panel.requiredRoleId);
    const payload = buildRRReply(msgs["rr_missing_required"], buildVars({ trigger: reqRole?.name ?? "required" }), `❌ You need the **${reqRole?.name ?? "required"}** role to use this panel`);
    return void interaction.reply({ ...payload, ephemeral: true });
  }

  const selectedIds = new Set(interaction.values);
  const panelRoleIds = panel.entries.map((e) => e.roleId);
  const currentPanelRoleIds = new Set(panelRoleIds.filter((id) => member.roles.cache.has(id)));

  // Max check
  if (panel.max > 0 && selectedIds.size > panel.max) {
    const payload = buildRRReply(msgs["rr_max_reached"], buildVars({ count: String(panel.max), trigger: "" }), `❌ You can only select **${panel.max}** role${panel.max !== 1 ? "s" : ""} from this panel`);
    return void interaction.reply({ ...payload, ephemeral: true });
  }

  const toAdd = [...selectedIds].filter((id) => !currentPanelRoleIds.has(id));
  const toRemove = [...currentPanelRoleIds].filter((id) => !selectedIds.has(id));

  for (const rid of toRemove) { await member.roles.remove(rid).catch(() => {}); }
  for (const rid of toAdd)    { await member.roles.add(rid).catch(() => {}); }

  if (panel.dmOnAssign) {
    for (const rid of toAdd) {
      const entry = panel.entries.find((e) => e.roleId === rid);
      if (entry) await interaction.user.send(buildRRReply(msgs["rr_assign_dm"], buildVars({ trigger: entry.roleName, server: interaction.guild.name }), `You now have **${entry.roleName}** in **${interaction.guild.name}**`)).catch(() => {});
    }
    for (const rid of toRemove) {
      const entry = panel.entries.find((e) => e.roleId === rid);
      if (entry) await interaction.user.send(buildRRReply(msgs["rr_remove_dm"], buildVars({ trigger: entry.roleName, server: interaction.guild.name }), `**${entry.roleName}** removed in **${interaction.guild.name}**`)).catch(() => {});
    }
  }

  const addedNames   = toAdd.map((id)    => panel.entries.find((e) => e.roleId === id)?.roleName ?? id);
  const removedNames = toRemove.map((id) => panel.entries.find((e) => e.roleId === id)?.roleName ?? id);
  const lines: string[] = [];
  if (addedNames.length)   lines.push(`✅ Added: **${addedNames.join("**, **")}**`);
  if (removedNames.length) lines.push(`❌ Removed: **${removedNames.join("**, **")}**`);
  if (!lines.length) lines.push("✅ No changes made.");

  await interaction.reply({ content: lines.join("\n"), ephemeral: true });
}

// Emoji reaction handlers
export async function handleRRReactionAdd(
  reaction: MessageReaction,
  user: User,
  client: Client,
): Promise<void> {
  if (user.bot) return;
  if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }

  const guild = reaction.message.guild;
  if (!guild) return;
  if (reaction.message.author?.id !== client.user?.id) return;

  const panels = await loadPanels(guild.id);
  const panel = Object.values(panels).find(
    (p) => p.type === "emoji" && p.messageId === reaction.message.id,
  );
  if (!panel) return;

  const emojiKey = reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : (reaction.emoji.name ?? "");
  const entry = panel.entries.find((e) => e.emoji === emojiKey || e.emoji === reaction.emoji.name);
  if (!entry) return;

  const cfg = await getGuildConfig(guild.id);
  const msgs = rrMsgs(cfg);

  if (panel.requiredRoleId) {
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member || !member.roles.cache.has(panel.requiredRoleId)) {
      await reaction.users.remove(user.id).catch(() => {});
      const reqRole = guild.roles.cache.get(panel.requiredRoleId);
      const payload = buildRRReply(msgs["rr_missing_required"], buildVars({ trigger: reqRole?.name ?? "required", server: guild.name }), `❌ You need the **${reqRole?.name ?? "required"}** role to use this panel in **${guild.name}**`);
      await user.send(payload).catch(() => {});
      return;
    }
  }

  const result = await toggleRole(guild, user.id, panel, entry.roleId, true);

  if (result.action === "max_reached") {
    await reaction.users.remove(user.id).catch(() => {});
    const payload = buildRRReply(msgs["rr_max_reached"], buildVars({ count: String(panel.max), trigger: entry.roleName, server: guild.name }), `❌ You can only have **${panel.max}** role${panel.max !== 1 ? "s" : ""} from this panel in **${guild.name}**`);
    await user.send(payload).catch(() => {});
  } else if (result.action === "added" && panel.dmOnAssign) {
    const payload = buildRRReply(msgs["rr_assign_dm"], buildVars({ trigger: entry.roleName, server: guild.name }), `You have been given the **${entry.roleName}** role in **${guild.name}**`);
    await user.send(payload).catch(() => {});
  }
}

export async function handleRRReactionRemove(
  reaction: MessageReaction,
  user: User,
  client: Client,
): Promise<void> {
  if (user.bot) return;
  if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }

  const guild = reaction.message.guild;
  if (!guild) return;
  if (reaction.message.author?.id !== client.user?.id) return;

  const panels = await loadPanels(guild.id);
  const panel = Object.values(panels).find(
    (p) => p.type === "emoji" && p.messageId === reaction.message.id,
  );
  if (!panel) return;

  const emojiKey = reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : (reaction.emoji.name ?? "");
  const entry = panel.entries.find((e) => e.emoji === emojiKey || e.emoji === reaction.emoji.name);
  if (!entry) return;

  const cfg = await getGuildConfig(guild.id);
  const msgs = rrMsgs(cfg);

  const result = await toggleRole(guild, user.id, panel, entry.roleId, false, true);
  if (result.action === "removed" && panel.dmOnAssign) {
    const payload = buildRRReply(msgs["rr_remove_dm"], buildVars({ trigger: entry.roleName, server: guild.name }), `The **${entry.roleName}** role has been removed in **${guild.name}**`);
    await user.send(payload).catch(() => {});
  }
}

// Startup: restore emoji reactions
export async function restoreEmojiPanels(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    const panels = await loadPanels(guild.id).catch(() => ({} as GuildPanels));
    for (const panel of Object.values(panels)) {
      if (panel.type !== "emoji" || !panel.messageId || !panel.channelId) continue;
      const ch = guild.channels.cache.get(panel.channelId) as TextChannel | undefined;
      if (!ch) continue;
      const msg = await ch.messages.fetch(panel.messageId).catch(() => null);
      if (!msg) continue;
      for (const entry of panel.entries) {
        const alreadyReacted = msg.reactions.cache.get(entry.emoji)?.me;
        if (!alreadyReacted) await msg.react(entry.emoji).catch(() => {});
      }
    }
  }
}

// !rr command
const MAX_ENTRIES: Record<PanelType, number> = { emoji: 20, button: 25, dropdown: 25 };

const rrCmd: Command = {
  name: "rr",
  aliases: [],
  usage: "create|add|remove|post|repost|edit|setmax|setrequired|clearrequired|delete|list|info <name> [...]",
  description: "Manage reaction role panels.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "rr"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const sub = (args[0] ?? "").toLowerCase();
    const guildId = message.guild.id;

    // create
    if (sub === "create") {
      const name = args[1];
      const typeRaw = (args[2] ?? "button").toLowerCase() as PanelType;
      if (!name) return void message.reply("❌ Usage: `!rr create <name> <emoji|button|dropdown> [#channel]`");
      if (!["emoji", "button", "dropdown"].includes(typeRaw)) {
        return void message.reply("❌ Type must be `emoji`, `button`, or `dropdown`.");
      }

      const targetCh = (message.mentions.channels.first() as TextChannel | undefined) ?? (message.channel as TextChannel);
      const panels = await loadPanels(guildId);

      if (panels[name]) {
        const cfg = await getGuildConfig(guildId);
        const msgs = rrMsgs(cfg);
        const payload = buildRRReply(msgs["rr_already_exists"], buildVars({ trigger: name }), `❌ A panel named **${name}** already exists.`);
        return void message.reply(payload.content ?? "❌ Panel already exists.");
      }

      panels[name] = {
        id: name,
        guildId,
        channelId: targetCh.id,
        messageId: null,
        type: typeRaw,
        title: name,
        description: typeRaw === "emoji"
          ? "React below to get a role."
          : typeRaw === "button"
          ? "Click a button to toggle a role."
          : "Select your roles from the menu below.",
        color: 0x5865f2,
        max: 0,
        requiredRoleId: null,
        dmOnAssign: false,
        logAssignments: false,
        entries: [],
      };
      await savePanels(guildId, panels);

      const cfg = await getGuildConfig(guildId);
      const msgs = rrMsgs(cfg);
      const payload = buildRRReply(msgs["rr_created"], buildVars({ trigger: name }), `✅ Panel **${name}** created (type: **${typeRaw}**, channel: <#${targetCh.id}>).\nAdd roles with \`!rr add ${name} <@role> <label>\`, then post with \`!rr post ${name}\`.`);
      return void message.reply(payload.content ?? "✅ Panel created.");
    }

    // add
    if (sub === "add") {
      const name = args[1];
      const roleInput = args[2];
      if (!name || !roleInput) return void message.reply("❌ Usage: `!rr add <name> <@role> <emoji|label> [description] [style]`");

      const panels = await loadPanels(guildId);
      const panel = panels[name];
      if (!panel) return void message.reply(`❌ Panel **${name}** not found. Use \`!rr list\` to see all panels.`);

      const roleId = roleInput.replace(/[<@&>]/g, "");
      const role = message.guild.roles.cache.get(roleId);
      if (!role) return void message.reply("❌ Could not find that role.");

      const max = MAX_ENTRIES[panel.type];
      if (panel.entries.length >= max) {
        const cfg = await getGuildConfig(guildId);
        const payload = buildRRReply(
          rrMsgs(cfg)["rr_max_entries_reached"],
          buildVars({ trigger: name, count: String(max) }),
          `❌ Panel **${name}** is full (max ${max} entries for ${panel.type} panels).`,
        );
        return void message.reply(payload.content ?? "❌ Panel is full.");
      }

      if (panel.entries.find((e) => e.roleId === role.id)) {
        return void message.reply(`❌ <@&${role.id}> is already in panel **${name}**.`);
      }

      // Parse label, description, style from remaining args
      const label = args[3] ?? role.name;
      const description = args[4] ?? "";
      const styleRaw = args[5] ?? "Secondary";
      const style = (["Primary", "Secondary", "Success", "Danger"].includes(styleRaw)
        ? styleRaw
        : "Secondary") as ButtonStyleName;

      panel.entries.push({ roleId: role.id, roleName: role.name, emoji: label, label, description, style });
      await savePanels(guildId, panels);

      // If panel is posted and it's a button/dropdown, live-edit it
      if (panel.messageId && panel.type !== "emoji") {
        await editPostedPanel(panel, client);
      }

      const cfg = await getGuildConfig(guildId);
      const msgs = rrMsgs(cfg);
      const payload = buildRRReply(msgs["rr_entry_added"], buildVars({ trigger: role.name, reason: name }), `✅ <@&${role.id}> added to panel **${name}**.`);
      return void message.reply(payload.content ?? "✅ Entry added.");
    }

    // remove
    if (sub === "remove") {
      const name = args[1];
      const roleInput = args[2];
      if (!name || !roleInput) return void message.reply("❌ Usage: `!rr remove <name> <@role>`");

      const panels = await loadPanels(guildId);
      const panel = panels[name];
      if (!panel) return void message.reply(`❌ Panel **${name}** not found.`);

      const roleId = roleInput.replace(/[<@&>]/g, "");
      const removed = panel.entries.find((e) => e.roleId === roleId);
      if (!removed) {
        const cfg = await getGuildConfig(guildId);
        const payload = buildRRReply(rrMsgs(cfg)["rr_entry_not_found"], buildVars({ trigger: roleInput, reason: name }), `❌ That role is not in panel **${name}**.`);
        return void message.reply(payload.content ?? "❌ Entry not found.");
      }

      panel.entries = panel.entries.filter((e) => e.roleId !== roleId);
      await savePanels(guildId, panels);

      if (panel.messageId && panel.type !== "emoji") {
        await editPostedPanel(panel, client);
      }

      const cfg = await getGuildConfig(guildId);
      const msgs = rrMsgs(cfg);
      const payload = buildRRReply(msgs["rr_entry_removed"], buildVars({ trigger: removed.roleName, reason: name }), `✅ <@&${roleId}> removed from panel **${name}**.`);
      return void message.reply(payload.content ?? "✅ Entry removed.");
    }

    // post
    if (sub === "post") {
      const name = args[1];
      if (!name) return void message.reply("❌ Usage: `!rr post <name>`");

      const panels = await loadPanels(guildId);
      const panel = panels[name];
      if (!panel) return void message.reply(`❌ Panel **${name}** not found.`);

      if (panel.entries.length === 0) {
        const cfg = await getGuildConfig(guildId);
        const payload = buildRRReply(rrMsgs(cfg)["rr_no_entries"], buildVars({ trigger: name }), `❌ Panel **${name}** has no role entries. Use \`!rr add\` to add some.`);
        return void message.reply(payload.content ?? "❌ No entries.");
      }

      const ch = (message.guild.channels.cache.get(panel.channelId) as TextChannel | undefined)
        ?? (message.channel as TextChannel);
      const posted = await postPanel(panel, ch);
      panel.channelId = ch.id;
      panel.messageId = posted.id;
      await savePanels(guildId, panels);

      const cfg = await getGuildConfig(guildId);
      const msgs = rrMsgs(cfg);
      const payload = buildRRReply(msgs["rr_posted"], buildVars({ trigger: name, channel: `<#${ch.id}>` }), `✅ Panel **${name}** posted in <#${ch.id}>.`);
      return void message.reply(payload.content ?? "✅ Panel posted.");
    }

    // repost
    if (sub === "repost") {
      const name = args[1];
      if (!name) return void message.reply("❌ Usage: `!rr repost <name>`");

      const panels = await loadPanels(guildId);
      const panel = panels[name];
      if (!panel) return void message.reply(`❌ Panel **${name}** not found.`);
      if (panel.entries.length === 0) return void message.reply(`❌ Panel **${name}** has no entries.`);

      // Delete old message
      if (panel.messageId && panel.channelId) {
        const oldCh = message.guild.channels.cache.get(panel.channelId) as TextChannel | undefined;
        const oldMsg = oldCh ? await oldCh.messages.fetch(panel.messageId).catch(() => null) : null;
        if (oldMsg) await oldMsg.delete().catch(() => {});
      }

      const ch = (message.guild.channels.cache.get(panel.channelId) as TextChannel | undefined)
        ?? (message.channel as TextChannel);
      const posted = await postPanel(panel, ch);
      panel.channelId = ch.id;
      panel.messageId = posted.id;
      await savePanels(guildId, panels);

      return void message.reply(`✅ Panel **${name}** reposted in <#${ch.id}>.`);
    }

    // edit
    if (sub === "edit") {
      const name = args[1];
      const field = (args[2] ?? "").toLowerCase();
      const value = args.slice(3).join(" ").trim();
      if (!name || !field || !value) {
        return void message.reply("❌ Usage: `!rr edit <name> title|description|color <value>`");
      }

      const panels = await loadPanels(guildId);
      const panel = panels[name];
      if (!panel) return void message.reply(`❌ Panel **${name}** not found.`);

      if (field === "title") {
        panel.title = value.slice(0, 256);
      } else if (field === "description") {
        panel.description = value.slice(0, 4096);
      } else if (field === "color") {
        const hex = parseInt(value.replace("#", ""), 16);
        if (isNaN(hex)) return void message.reply("❌ Invalid hex color. Example: `#5865F2`");
        panel.color = hex;
      } else {
        return void message.reply("❌ Field must be `title`, `description`, or `color`.");
      }

      await savePanels(guildId, panels);
      if (panel.messageId) await editPostedPanel(panel, client);

      const cfg = await getGuildConfig(guildId);
      const msgs = rrMsgs(cfg);
      const payload = buildRRReply(msgs["rr_edited"], buildVars({ trigger: name }), `✅ Panel **${name}** updated.`);
      return void message.reply(payload.content ?? "✅ Updated.");
    }

    // setmax
    if (sub === "setmax") {
      const name = args[1];
      const numStr = args[2];
      if (!name || !numStr) return void message.reply("❌ Usage: `!rr setmax <name> <number>` (0 = unlimited)");

      const panels = await loadPanels(guildId);
      const panel = panels[name];
      if (!panel) return void message.reply(`❌ Panel **${name}** not found.`);

      const n = parseInt(numStr, 10);
      if (isNaN(n) || n < 0) return void message.reply("❌ Max must be a non-negative number (0 = unlimited).");
      panel.max = n;
      await savePanels(guildId, panels);
      if (panel.messageId && panel.type !== "emoji") await editPostedPanel(panel, client);

      const cfg = await getGuildConfig(guildId);
      const msgs = rrMsgs(cfg);
      const label = n === 0 ? "unlimited" : String(n);
      const payload = buildRRReply(msgs["rr_max_set"], buildVars({ trigger: name, count: label }), `✅ Panel **${name}** max set to **${label}**.`);
      return void message.reply(payload.content ?? "✅ Max set.");
    }

    // setrequired
    if (sub === "setrequired") {
      const name = args[1];
      const roleInput = args[2];
      if (!name || !roleInput) return void message.reply("❌ Usage: `!rr setrequired <name> <@role>`");

      const panels = await loadPanels(guildId);
      const panel = panels[name];
      if (!panel) return void message.reply(`❌ Panel **${name}** not found.`);

      const roleId = roleInput.replace(/[<@&>]/g, "");
      const role = message.guild.roles.cache.get(roleId);
      if (!role) return void message.reply("❌ Could not find that role.");

      panel.requiredRoleId = role.id;
      await savePanels(guildId, panels);

      const cfg = await getGuildConfig(guildId);
      const msgs = rrMsgs(cfg);
      const payload = buildRRReply(msgs["rr_required_set"], buildVars({ trigger: name, reason: role.name }), `✅ Panel **${name}** now requires **${role.name}** to use.`);
      return void message.reply(payload.content ?? "✅ Required role set.");
    }

    // clearrequired
    if (sub === "clearrequired") {
      const name = args[1];
      if (!name) return void message.reply("❌ Usage: `!rr clearrequired <name>`");

      const panels = await loadPanels(guildId);
      const panel = panels[name];
      if (!panel) return void message.reply(`❌ Panel **${name}** not found.`);

      panel.requiredRoleId = null;
      await savePanels(guildId, panels);

      const cfg = await getGuildConfig(guildId);
      const msgs = rrMsgs(cfg);
      const payload = buildRRReply(msgs["rr_required_cleared"], buildVars({ trigger: name }), `✅ Required role cleared for panel **${name}**.`);
      return void message.reply(payload.content ?? "✅ Cleared.");
    }

    // delete
    if (sub === "delete") {
      const name = args[1];
      if (!name) return void message.reply("❌ Usage: `!rr delete <name>`");

      const panels = await loadPanels(guildId);
      const panel = panels[name];
      if (!panel) return void message.reply(`❌ Panel **${name}** not found.`);

      if (panel.messageId && panel.channelId) {
        const ch = message.guild.channels.cache.get(panel.channelId) as TextChannel | undefined;
        const msg = ch ? await ch.messages.fetch(panel.messageId).catch(() => null) : null;
        if (msg) await msg.delete().catch(() => {});
      }

      delete panels[name];
      await savePanels(guildId, panels);

      const cfg = await getGuildConfig(guildId);
      const msgs = rrMsgs(cfg);
      const payload = buildRRReply(msgs["rr_deleted"], buildVars({ trigger: name }), `🗑️ Panel **${name}** deleted.`);
      return void message.reply(payload.content ?? "🗑️ Deleted.");
    }

    // list
    if (sub === "list") {
      const panels = await loadPanels(guildId);
      const list = Object.values(panels);
      if (list.length === 0) {
        const cfg = await getGuildConfig(guildId);
        const payload = buildRRReply(rrMsgs(cfg)["rr_list_empty"], buildVars({}), "✅ No reaction role panels. Use `!rr create` to make one.");
        return void message.reply(payload.content ?? "No panels.");
      }

      const lines = list.map((p) =>
        `• **${p.id}** [${p.type}] — ${p.entries.length} role(s)${p.messageId ? ` — posted in <#${p.channelId}>` : " — not posted"}${p.max > 0 ? ` — max ${p.max}` : ""}${p.requiredRoleId ? " — 🔒" : ""}`
      );
      return void message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🎭 Reaction Role Panels (${list.length})`)
            .setDescription(lines.join("\n")),
        ],
      });
    }

    // info
    if (sub === "info") {
      const name = args[1];
      if (!name) return void message.reply("❌ Usage: `!rr info <name>`");

      const panels = await loadPanels(guildId);
      const panel = panels[name];
      if (!panel) return void message.reply(`❌ Panel **${name}** not found.`);

      const roleLines = panel.entries.map((e) => {
        if (panel.type === "emoji") return `${e.emoji} — <@&${e.roleId}>`;
        if (panel.type === "button") return `[${e.style}] ${e.emoji ? e.emoji + " " : ""}**${e.label}** — <@&${e.roleId}>`;
        return `**${e.label}**${e.description ? ` — *${e.description}*` : ""} — <@&${e.roleId}>`;
      });

      return void message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(panel.color)
            .setTitle(`🎭 Panel: ${panel.title} (${name})`)
            .addFields(
              { name: "Type", value: panel.type, inline: true },
              { name: "Max Roles", value: panel.max === 0 ? "Unlimited" : String(panel.max), inline: true },
              { name: "Required Role", value: panel.requiredRoleId ? `<@&${panel.requiredRoleId}>` : "None", inline: true },
              { name: "Posted", value: panel.messageId ? `<#${panel.channelId}>` : "Not yet", inline: true },
              { name: "DM on Assign", value: panel.dmOnAssign ? "Yes" : "No", inline: true },
              { name: `Entries (${panel.entries.length})`, value: roleLines.join("\n") || "None" },
            ),
        ],
      });
    }

    // unknown subcommand
    await message.reply(
      "❌ Unknown subcommand. Available: `create` `add` `remove` `post` `repost` `edit` `setmax` `setrequired` `clearrequired` `delete` `list` `info`",
    );
  },
};

export default rrCmd;

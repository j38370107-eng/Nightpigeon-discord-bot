import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ComponentType,
  EmbedBuilder,
  Message,
} from "discord.js";
import type { Command } from "../types";
import { resolveTarget } from "../../lib/resolveUser";
import { checkYamlLevelAsync, getMemberLevel, getUserLevel, getRequiredLevel, LEVEL_UNCONFIGURED } from "../../lib/yamlLevels";
import { getCachedConfig } from "../../store/guildConfig";

// !level [@user] — show effective level
export const levelCmd: Command = {
  name: "level",
  aliases: [],
  usage: "[@user]",
  description: "Show the effective permission level for yourself or another user.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "level"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    if (args.length > 0) {
      const target = await resolveTarget(message, args);
      if (!target) return void message.reply("❌ Could not find that user.");

      const level = target.member ? getMemberLevel(target.member) : 0;

      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🔑 Permission Level — ${target.user.tag}`)
            .setThumbnail(target.user.displayAvatarURL({ size: 64 }))
            .setDescription(`**Level:** ${level}`)
            .setTimestamp(),
        ],
      });
    } else {
      const level = getUserLevel(message);
      await message.reply(`🔑 Your permission level is **${level}**.`);
    }
  },
};

// Paginated !levels
function buildLevelsEmbed(pageTitle: string, lines: string[], pageNum: number, totalPages: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🔑 Permission Levels`)
    .addFields({ name: pageTitle, value: lines.join("\n").slice(0, 1024) || "*(none)*" })
    .setFooter({ text: `Page ${pageNum} of ${totalPages}` });
}

function buildNavRow(page: number, total: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("levels_prev")
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("levels_next")
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === total - 1),
  );
}

// !levels — show all configured levels with pagination
export const levelsCmd: Command = {
  name: "levels",
  aliases: [],
  usage: "",
  description: "Show the configured permission levels for this server.",
  async execute(message: Message, _args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "levels"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const cfg = getCachedConfig(message.guild.id);
    const levels = cfg.levels;

    const roleLines = Object.entries(levels.roles).map(
      ([id, lvl]) => `• <@&${id}> — Level **${lvl}**`,
    );
    const userLines = Object.entries(levels.users).map(
      ([id, lvl]) => `• <@${id}> — Level **${lvl}**`,
    );
    const cmdLines = Object.entries(levels.commands)
      .filter(([, req]) => req < LEVEL_UNCONFIGURED)
      .sort((a, b) => a[1] - b[1])
      .map(([cmd, req]) => `• \`${cmd}\` — Level **${req}**`);

    // Build pages: non-empty sections only
    const pages: { title: string; lines: string[] }[] = [];
    if (roleLines.length > 0) pages.push({ title: "Role Levels", lines: roleLines });
    if (userLines.length > 0) pages.push({ title: "User Overrides", lines: userLines });
    if (cmdLines.length > 0) pages.push({ title: "Command Requirements", lines: cmdLines });

    if (pages.length === 0) {
      return void message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🔑 Permission Levels — ${message.guild.name}`)
            .setDescription("No levels configured. Edit your server config to set up levels."),
        ],
      });
    }

    // Single page — no buttons needed
    if (pages.length === 1) {
      return void message.channel.send({
        embeds: [buildLevelsEmbed(pages[0]!.title, pages[0]!.lines, 1, 1)],
      });
    }

    // Multi-page with navigation buttons
    let currentPage = 0;

    const msg = await message.channel.send({
      embeds: [buildLevelsEmbed(pages[0]!.title, pages[0]!.lines, 1, pages.length)],
      components: [buildNavRow(0, pages.length)],
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 90_000,
      filter: (i) => i.user.id === message.author.id,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "levels_prev" && currentPage > 0) currentPage--;
      else if (i.customId === "levels_next" && currentPage < pages.length - 1) currentPage++;

      await i.update({
        embeds: [buildLevelsEmbed(pages[currentPage]!.title, pages[currentPage]!.lines, currentPage + 1, pages.length)],
        components: [buildNavRow(currentPage, pages.length)],
      });
    });

    collector.on("end", () => {
      msg.edit({ components: [] }).catch(() => {});
    });
  },
};

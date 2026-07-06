import { Client, EmbedBuilder, Message, TextChannel } from "discord.js";
import type { Command } from "../types";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getCachedConfig } from "../../store/guildConfig";
import { buildPayload } from "../../lib/msgTemplate";

// !slowmodeinfo [#channel] — show slowmode info for a channel
export const slowmodeinfoCmd: Command = {
  name: "slowmodeinfo",
  aliases: [],
  usage: "[#channel]",
  description: "Show the current slowmode setting for a channel.",
  async execute(message: Message, _args: string[], _client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "slowmodeinfo"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const ch =
      (message.mentions.channels.first() as TextChannel | undefined) ??
      (message.channel as TextChannel);

    const slowmode = ch.rateLimitPerUser ?? 0;

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(slowmode > 0 ? 0xf39c12 : 0x2ecc71)
          .setTitle(`⏱️ Slowmode Info — #${ch.name}`)
          .setDescription(
            slowmode > 0
              ? `**Slowmode:** ${slowmode} second${slowmode !== 1 ? "s" : ""}`
              : "**Slowmode:** Off"
          )
          .setTimestamp(),
      ],
    });
  },
};

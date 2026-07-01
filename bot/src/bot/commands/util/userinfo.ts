import { Client, Message, EmbedBuilder } from "discord.js";
import type { Command } from "../types";
import { resolveTarget } from "../../lib/resolveUser";

const userinfoCmd: Command = {
  name: "userinfo",
  aliases: [],
  usage: "[@user|user_id]",
  description: "Show information about a user.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;

    const target = args.length > 0
      ? await resolveTarget(message, args)
      : { user: message.author, member: message.member };

    if (!target) return void message.reply("❌ Could not find that user.");

    const { user, member } = target;
    const createdAt = Math.floor(user.createdTimestamp / 1000);
    const joinedAt = member?.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

    const roles = member?.roles.cache
      .filter((r) => r.id !== message.guild!.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => `<@&${r.id}>`)
      .slice(0, 10)
      .join(", ") || "None";

    const embed = new EmbedBuilder()
      .setColor(member?.displayHexColor !== "#000000" ? member?.displayHexColor ?? 0x5865f2 : 0x5865f2)
      .setTitle(`${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "User ID", value: user.id, inline: true },
        { name: "Account Created", value: `<t:${createdAt}:R>`, inline: true },
        ...(joinedAt ? [{ name: "Joined Server", value: `<t:${joinedAt}:R>`, inline: true }] : []),
        { name: "Bot", value: user.bot ? "Yes" : "No", inline: true },
        ...(member ? [{ name: `Roles (${member.roles.cache.size - 1})`, value: roles }] : [])
      )
      .setFooter({ text: `Requested by ${message.author.tag}` })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
  },
};

export default userinfoCmd;

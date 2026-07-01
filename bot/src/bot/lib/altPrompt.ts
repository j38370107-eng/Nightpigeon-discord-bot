import { Message, EmbedBuilder } from "discord.js";
import { getAlts, getMainAccount } from "../store/alts";

export function getLinkedAlts(guildId: string, userId: string): string[] {
  const direct = getAlts(guildId, userId);
  if (direct.length > 0) return direct;
  const mainId = getMainAccount(guildId, userId);
  if (mainId) {
    const siblings = getAlts(guildId, mainId).filter(id => id !== userId);
    return [mainId, ...siblings];
  }
  return [];
}

export async function promptAltPunishment(
  message: Message,
  targetId: string,
  actionLabel: string,
  onConfirm: (altId: string) => Promise<void>,
): Promise<void> {
  if (!message.guild) return;
  const alts = getLinkedAlts(message.guild.id, targetId);
  if (alts.length === 0) return;

  const altMentions = alts.map(id => `<@${id}>`).join(", ");
  const plural = alts.length !== 1;

  const prompt = await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf0a500)
        .setTitle("⚠️ Alt Accounts Detected")
        .setDescription(
          `<@${targetId}> has ${plural ? `**${alts.length}** linked alt accounts` : "a linked alt account"}: ${altMentions}\n\n` +
          `Should ${plural ? "these accounts" : "this account"} also be **${actionLabel}**?\n` +
          `Reply \`yes\` to confirm or \`no\` to skip *(auto-cancels in 15s)*`,
        )
        .setFooter({ text: `Only ${message.author.username} can respond` }),
    ],
  });

  const collected = await message.channel.awaitMessages({
    filter: m =>
      m.author.id === message.author.id &&
      ["yes", "no"].includes(m.content.toLowerCase().trim()),
    max: 1,
    time: 15_000,
    errors: [],
  });

  await prompt.delete().catch(() => {});

  const reply = collected.first();
  if (reply) await reply.delete().catch(() => {});

  if (!reply || reply.content.toLowerCase().trim() !== "yes") {
    const skip = await message.channel
      .send("↩️ Alt punishment skipped.")
      .catch(() => null);
    if (skip) setTimeout(() => skip.delete().catch(() => {}), 4_000);
    return;
  }

  for (const altId of alts) {
    try {
      await onConfirm(altId);
    } catch {
      await message.channel
        .send(`⚠️ Failed to ${actionLabel} alt <@${altId}>.`)
        .catch(() => {});
    }
  }
}

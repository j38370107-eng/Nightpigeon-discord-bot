import { Message } from "discord.js";
import { getPrefix } from "../store/prefixes";
import type { Command } from "../commands/types";

export function usageErr(message: Message, command: Command, hint: string): string {
  const prefix = message.guild ? getPrefix(message.guild.id) : ">";
  return `❌ ${hint}. Usage: \`${prefix}${command.name} ${command.usage}\``;
}

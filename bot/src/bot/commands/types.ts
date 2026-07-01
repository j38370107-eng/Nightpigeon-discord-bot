import { Client, Message } from "discord.js";

export interface Command {
  name: string;
  aliases?: string[];
  usage: string;
  description: string;
  execute(message: Message, args: string[], client: Client): Promise<void>;
}

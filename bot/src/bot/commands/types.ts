import { Client, Message } from "discord.js";

export interface Command {
  name: string;
  aliases?: string[];
  usage: string;
  description: string;
  /** If true, the command runs regardless of levels.commands configuration. */
  public?: boolean;
  execute(message: Message, args: string[], client: Client): Promise<void>;
}

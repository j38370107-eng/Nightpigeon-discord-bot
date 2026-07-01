import { Client, Message } from "discord.js";
import { logger } from "../../lib/logger";
import { runYamlAutomodOnMessage } from "./yamlAutomodRules";

/**
 * Run all automod checks against a message.
 * Uses the YAML rules engine only.
 * Returns true if the message was blocked.
 */
export async function runAutomod(client: Client, message: Message): Promise<boolean> {
  if (!message.guild) return false;
  if (message.author.bot) return false;

  const yamlBlocked = await runYamlAutomodOnMessage(client, message).catch((err) => {
    logger.warn({ err }, "YAML automod error");
    return false;
  });

  return yamlBlocked;
}

import { User } from "discord.js";
import { buildPayload, type TemplateVars } from "./msgTemplate";
import type { YamlMessage } from "../store/guildConfig";

interface DmPayload {
  action: "Warned" | "Muted" | "Unmuted" | "Kicked" | "Banned";
  guildName: string;
  reason: string;
  caseId?: string;
  duration?: string;
  expiresAt?: number;
}

const PREPOSITION: Record<DmPayload["action"], string> = {
  Warned: "in",
  Muted: "in",
  Unmuted: "in",
  Kicked: "from",
  Banned: "from",
};

/**
 * Ensures the server name appears at the top of every DM the bot sends.
 * If guildName is already found anywhere in the text it is left unchanged;
 * otherwise a bold `[ServerName]` prefix line is prepended.
 */
export function requireServerName(text: string, guildName: string): string {
  if (text.includes(guildName)) return text;
  return `**[${guildName}]**\n${text}`;
}

export function buildDmText(payload: DmPayload): string {
  const prep = PREPOSITION[payload.action];
  const type = payload.action.toLowerCase();
  let text = `You have been ${type} ${prep} **${payload.guildName}** for ${payload.reason}`;
  if (payload.duration) text += ` | ${payload.duration}`;
  return text;
}

/**
 * Send a DM to the actioned user.
 *
 * If `customMsg` and `vars` are provided the message is built via
 * `buildPayload` (supports plain strings AND embed templates from YAML).
 * Otherwise the plain-text fallback is used.
 */
export async function sendDmNotification(
  user: User,
  payload: DmPayload,
  customMsg?: YamlMessage,
  vars?: TemplateVars
): Promise<void> {
  const fallback = buildDmText(payload);
  if (customMsg !== undefined && vars !== undefined) {
    await user.send(buildPayload(customMsg, vars, fallback)).catch(() => {});
  } else {
    await user.send(fallback).catch(() => {});
  }
}

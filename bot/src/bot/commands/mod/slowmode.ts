import { Client, Message, TextChannel } from "discord.js";
import type { Command } from "../types";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getCachedConfig } from "../../store/guildConfig";
import { buildPayload } from "../../lib/msgTemplate";

/**
 * Parse a slowmode duration string into seconds.
 * Supports:
 *   - Plain number          → seconds  (e.g. "30")
 *   - Number + unit suffix  → "5s" "5m" "5h"
 *   - Relative adjustment   → "+5" "-5"  (always in seconds)
 *   - "off" / "0"           → 0
 *
 * Returns { seconds, relative } where relative is the signed delta for +/- mode,
 * or null if the input is invalid.
 */
function parseDuration(input: string): { seconds: number; relative: boolean } | null {
  const s = input.toLowerCase().trim();

  if (s === "off") return { seconds: 0, relative: false };

  const relMatch = s.match(/^([+-])(\d+)([smh]?)$/);
  if (relMatch) {
    const sign   = relMatch[1] === "+" ? 1 : -1;
    const value  = parseInt(relMatch[2]!, 10);
    const unit   = relMatch[3] ?? "s";
    const delta  = value * unitToSeconds(unit);
    return { seconds: sign * delta, relative: true };
  }

  const absMatch = s.match(/^(\d+)([smh]?)$/);
  if (absMatch) {
    const value  = parseInt(absMatch[1]!, 10);
    const unit   = absMatch[2] ?? "s";
    return { seconds: value * unitToSeconds(unit), relative: false };
  }

  return null;
}

function unitToSeconds(unit: string): number {
  if (unit === "m") return 60;
  if (unit === "h") return 3600;
  return 1;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return "0s";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0)   return `${seconds / 60}m`;
  return `${seconds}s`;
}

const slowmodeCmd: Command = {
  name: "slowmode",
  aliases: [],
  usage: "<time|+time|-time|off> [#channel]  — time: 5s / 5m / 5h",
  description: "Set or remove slowmode in a channel.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "slowmode"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    if (!args[0]) {
      return void message.reply(
        buildPayload(
          msgs.err_slowmode_usage,
          {},
          "❌ Usage: `slowmode <time|+time|-time|off> [#channel]`\n" +
          "Examples: `slowmode 5m`, `slowmode 30s`, `slowmode 2h`, `slowmode +5`, `slowmode -10`, `slowmode off`"
        )
      );
    }

    const targetChannel =
      (message.mentions.channels.first() as TextChannel | undefined) ??
      (message.channel as TextChannel);

    const input = args[0]!;
    const parsed = parseDuration(input);

    if (!parsed) {
      return void message.reply(
        buildPayload(
          msgs.err_slowmode_invalid,
          {},
          "❌ Invalid duration. Use a number with `s`, `m`, or `h` (e.g. `5m`), a relative change like `+5` or `-5`, or `off`."
        )
      );
    }

    let finalSeconds: number;

    if (parsed.relative) {
      const current = targetChannel.rateLimitPerUser ?? 0;
      finalSeconds  = current + parsed.seconds;
    } else {
      finalSeconds = parsed.seconds;
    }

    finalSeconds = Math.max(0, Math.min(21600, finalSeconds));

    await targetChannel.setRateLimitPerUser(finalSeconds, `Set by ${message.author.tag}`);

    const isOff = finalSeconds === 0;
    const vars  = {
      count: finalSeconds,
      channel: `<#${targetChannel.id}>`,
      "channel.mention": `<#${targetChannel.id}>`,
      mod: message.author.tag,
    };

    const key      = isOff ? "slowmode_off" : "slowmode_success";
    const fallback = isOff
      ? `✅ Slowmode removed in <#${targetChannel.id}>.`
      : `⏱️ Slowmode set to **${formatDuration(finalSeconds)}** in <#${targetChannel.id}>.`;

    const payload = buildPayload(msgs[key], vars, fallback);
    await message.channel.send(payload);
  },
};

export default slowmodeCmd;

import { EmbedBuilder } from "discord.js";
import type { YamlMessage, YamlEmbed } from "../store/guildConfig";

// Template variable substitution
export type TemplateVars = Record<string, string | undefined>;

/**
 * Replace `{key}` placeholders in template string.
 * Per spec: unmatched placeholders → empty string (not literal `{placeholder}`).
 */
export function applyVars(template: string, vars: TemplateVars): string {
  // First replace known vars
  let out = template;
  for (const [key, val] of Object.entries(vars)) {
    if (val !== undefined) {
      out = out.replace(
        new RegExp(`\\{${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}`, "g"),
        val
      );
    }
  }
  // Strip any remaining {placeholder} that were not matched
  out = out.replace(/\{[^{}]+\}/g, "");
  return out;
}

// Build embed from YAML config
function buildEmbed(cfg: YamlEmbed, vars: TemplateVars): EmbedBuilder {
  const r = (s?: string) => (s ? applyVars(s, vars) : "");
  const embed = new EmbedBuilder();

  if (cfg.title) embed.setTitle(r(cfg.title).slice(0, 256));
  if (cfg.description) embed.setDescription(r(cfg.description).slice(0, 4096));
  if (cfg.footer) embed.setFooter({ text: r(cfg.footer).slice(0, 2048) });
  if (cfg.thumbnail) {
    const url = r(cfg.thumbnail);
    if (url.startsWith("http")) embed.setThumbnail(url);
  }
  if (cfg.image) {
    const url = r(cfg.image);
    if (url.startsWith("http")) embed.setImage(url);
  }
  if (cfg.color) {
    const raw = cfg.color.replace("#", "");
    const hex = parseInt(raw, 16);
    if (!isNaN(hex)) embed.setColor(hex);
  }
  if (cfg.fields?.length) {
    embed.setFields(
      cfg.fields.slice(0, 25).map((f) => ({
        name: r(f.name).slice(0, 256) || "\u200b",
        value: r(f.value).slice(0, 1024) || "\u200b",
        inline: f.inline ?? false,
      }))
    );
  }

  return embed;
}

// Send a YAML-configured message
/**
 * Send a YAML message value to a channel.
 * Supports all three formats from the spec:
 *   Format 1 — plain string
 *   Format 2 — { embed: {...} }
 *   Format 3 — { content: "...", embed: {...} }
 */
export async function sendYamlMessage(
  channel: { send: (opts: any) => Promise<any> },
  msgValue: YamlMessage,
  vars: TemplateVars
): Promise<void> {
  try {
    if (typeof msgValue === "string") {
      const text = applyVars(msgValue, vars);
      if (text) await channel.send(text);
      return;
    }

    if ("embed" in msgValue) {
      const embed = buildEmbed(msgValue.embed, vars);
      const content =
        "content" in msgValue && msgValue.content
          ? applyVars(msgValue.content, vars)
          : undefined;
      await channel.send({ content, embeds: [embed] });
      return;
    }
  } catch {
    // swallow send errors silently
  }
}

// Build YAML embed for direct use (e.g. in yamlLogging)
export function buildYamlEmbed(cfg: YamlEmbed, vars: TemplateVars): EmbedBuilder {
  return buildEmbed(cfg, vars);
}

// Build common template vars from message context
export function buildVars(
  partial: Record<string, string | undefined>
): TemplateVars {
  const now = new Date();
  return {
    timestamp: now.toISOString(),
    "timestamp.date": now.toLocaleDateString("en-US"),
    "timestamp.time": now.toLocaleTimeString("en-US"),
    ...partial,
  };
}

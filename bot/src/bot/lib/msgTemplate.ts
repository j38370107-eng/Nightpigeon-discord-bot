import { EmbedBuilder } from "discord.js";
import type { MessageCreateOptions } from "discord.js";
import type { YamlMessage, YamlEmbed } from "../store/guildConfig";

export interface TemplateVars {
  user?: string;
  "user.mention"?: string;
  "user.id"?: string;
  "user.name"?: string;
  mod?: string;
  "mod.mention"?: string;
  "mod.id"?: string;
  "mod.name"?: string;
  reason?: string;
  duration?: string;
  case_id?: string | number;
  count?: string | number;
  channel?: string;
  action?: string;
  expires_at?: string;
  timestamp?: string;
  server?: string;
  [key: string]: string | number | undefined;
}

function fill(text: string, vars: TemplateVars): string {
  return text.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{${key}}`;
  });
}

function buildEmbed(embed: YamlEmbed, vars: TemplateVars): EmbedBuilder {
  const e = new EmbedBuilder();
  if (embed.title) e.setTitle(fill(embed.title, vars));
  if (embed.description) e.setDescription(fill(embed.description, vars));
  if (embed.color) {
    const raw = embed.color.replace("#", "");
    e.setColor(parseInt(raw, 16) as any);
  }
  if (embed.thumbnail) e.setThumbnail(fill(embed.thumbnail, vars));
  if (embed.image) e.setImage(fill(embed.image, vars));
  if (embed.footer) e.setFooter({ text: fill(embed.footer, vars) });
  if (embed.fields && embed.fields.length > 0) {
    e.addFields(
      embed.fields.map((f) => ({
        name: fill(f.name, vars),
        value: fill(f.value, vars),
        inline: f.inline ?? false,
      }))
    );
  }
  return e;
}

export function buildPayload(
  msg: YamlMessage | undefined,
  vars: TemplateVars,
  fallback: string
): MessageCreateOptions {
  if (!msg) return { content: fill(fallback, vars) };

  if (typeof msg === "string") {
    return { content: fill(msg, vars) };
  }

  if ("embed" in msg) {
    const opts: MessageCreateOptions = { embeds: [buildEmbed(msg.embed, vars)] };
    if ("content" in msg && typeof msg.content === "string" && msg.content) {
      opts.content = fill(msg.content, vars);
    }
    return opts;
  }

  return { content: fill(fallback, vars) };
}

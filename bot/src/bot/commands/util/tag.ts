import { Client, EmbedBuilder, Message } from "discord.js";
import type { Command } from "../types";
import { getCachedConfig } from "../../store/guildConfig";
import type { YamlEmbed, YamlMessage, YamlTag } from "../../store/guildConfig";

// Template variable context
interface TagContext {
  userId: string;
  username: string;
  mention: string;
  serverName: string;
  serverId: string;
  memberCount: string;
  serverIcon: string;
  timestamp: string;
  date: string;
  time: string;
  trigger: string;
}

export function buildTagContext(message: Message, trigger = ""): TagContext {
  const guild = message.guild!;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return {
    userId: message.author.id,
    username: message.author.username,
    mention: `<@${message.author.id}>`,
    serverName: guild.name,
    serverId: guild.id,
    memberCount: guild.memberCount.toString(),
    serverIcon: guild.iconURL() ?? "",
    timestamp: `${dateStr} ${timeStr}`,
    date: dateStr,
    time: timeStr,
    trigger,
  };
}

function applyVars(text: string, ctx: TagContext): string {
  return text
    .replace(/\{user\.mention\}/g, ctx.mention)
    .replace(/\{user\.id\}/g, ctx.userId)
    .replace(/\{user\}/g, ctx.username)
    .replace(/\{server\.id\}/g, ctx.serverId)
    .replace(/\{server\.member_count\}/g, ctx.memberCount)
    .replace(/\{server\.icon\}/g, ctx.serverIcon)
    .replace(/\{server\}/g, ctx.serverName)
    .replace(/\{timestamp\.date\}/g, ctx.date)
    .replace(/\{timestamp\.time\}/g, ctx.time)
    .replace(/\{timestamp\}/g, ctx.timestamp)
    .replace(/\{trigger\}/g, ctx.trigger);
}

// Embed builder from YAML embed definition
function parseColor(color: string | undefined): number | undefined {
  if (!color) return undefined;
  const hex = color.replace(/^#/, "");
  const parsed = parseInt(hex, 16);
  return isNaN(parsed) ? undefined : parsed;
}

function buildEmbed(def: YamlEmbed, ctx: TagContext): EmbedBuilder {
  const embed = new EmbedBuilder();

  if (def.title)       embed.setTitle(applyVars(def.title, ctx));
  if (def.description) embed.setDescription(applyVars(def.description, ctx));
  if (def.color)       embed.setColor(parseColor(def.color) as any);
  if (def.thumbnail) {
    const thumb = applyVars(def.thumbnail, ctx);
    if (thumb) embed.setThumbnail(thumb);
  }
  if (def.image) {
    const img = applyVars(def.image, ctx);
    if (img) embed.setImage(img);
  }
  if (def.footer) {
    embed.setFooter({ text: applyVars(def.footer, ctx) });
  }
  if (def.fields?.length) {
    embed.setFields(
      def.fields.map((f) => ({
        name: applyVars(f.name, ctx),
        value: applyVars(f.value, ctx),
        inline: f.inline ?? false,
      }))
    );
  }

  return embed;
}

// Send a YamlMessage (used for configurable error messages)
async function sendYamlMessage(
  message: Message,
  msg: YamlMessage,
  ctx: TagContext
): Promise<void> {
  if (typeof msg === "string") {
    await message.reply(applyVars(msg, ctx));
    return;
  }
  if ("embed" in msg && msg.embed) {
    const embed = buildEmbed(msg.embed, ctx);
    const content = "content" in msg && msg.content
      ? applyVars(msg.content, ctx)
      : undefined;
    await message.reply(content ? { content, embeds: [embed] } : { embeds: [embed] });
  }
}

// Core send function — exported so messageCreate.ts fallback can reuse it
export async function sendTag(
  message: Message,
  tag: YamlTag,
  ctx: TagContext
): Promise<void> {
  const ch = message.channel as any;
  if (typeof tag === "string") {
    await ch.send(applyVars(tag, ctx));
    return;
  }

  const embed = buildEmbed(tag.embed, ctx);
  const content = "content" in tag && tag.content
    ? applyVars(tag.content, ctx)
    : undefined;

  await ch.send(content ? { content, embeds: [embed] } : { embeds: [embed] });
}

// !tag list helper
async function sendTagList(message: Message): Promise<void> {
  const cfg = getCachedConfig(message.guild!.id);
  const tags = cfg.tags ?? {};
  const keys = Object.keys(tags);

  const emptyMsg = cfg.plugins?.utility?.messages?.tag_list_empty;

  if (!keys.length) {
    if (emptyMsg) {
      await sendYamlMessage(message, emptyMsg, buildTagContext(message));
    } else {
      await message.reply("No tags have been created yet. Ask an admin to add some in the dashboard.");
    }
    return;
  }

  const prefix = cfg.prefix ?? "!";
  const list = keys.map((k) => `\`${k}\``).join(" · ");

  const embed = new EmbedBuilder()
    .setTitle(`🏷️ Tags (${keys.length})`)
    .setDescription(list)
    .setFooter({ text: `Use ${prefix}tag <name> or ${prefix}<name> to display a tag` })
    .setColor(0x5865f2);

  await message.reply({ embeds: [embed] });
}

// Command definition
const tagCmd: Command = {
  name: "tag",
  aliases: [],
  usage: "<tagname | list>",
  description: "Display a server tag, or list all available tags.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;

    const sub = args[0]?.toLowerCase();

    if (!sub || sub === "list") {
      return void sendTagList(message);
    }

    // Join all args so "!tag rule 1" looks up "rule 1"
    const tagName = args.join(" ").toLowerCase();
    const cfg = getCachedConfig(message.guild.id);
    const tags = cfg.tags ?? {};
    const tag = tags[tagName];

    if (!tag) {
      const notFoundMsg = cfg.plugins?.utility?.messages?.tag_not_found;
      if (notFoundMsg === null) return;
      if (notFoundMsg) {
        await sendYamlMessage(message, notFoundMsg, buildTagContext(message, tagName));
      } else {
        await message.reply(
          `Tag **${tagName}** not found. Use \`${cfg.prefix ?? "!"}tag list\` to see all available tags.`
        );
      }
      return;
    }

    await sendTag(message, tag, buildTagContext(message, tagName));
  },
};

export default tagCmd;

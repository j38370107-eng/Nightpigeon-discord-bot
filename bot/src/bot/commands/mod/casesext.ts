import { AttachmentBuilder, Client, EmbedBuilder, Message } from "discord.js";
import type { Command } from "../types";
import { resolveTarget } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getAllCases, getCasesForUser, getCase, editCase, addCase, type CaseRecord } from "../../lib/cases";
import { sendModLog } from "../../lib/modlog";

// !servercases — show last 10 server cases
export const servercasesCmd: Command = {
  name: "servercases",
  aliases: [],
  usage: "[page]",
  description: "Show the most recent cases in this server.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "servercases"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const all = await getAllCases(message.guild.id);
    if (all.length === 0) return void message.reply("✅ No cases in this server yet.");

    const page = Math.max(1, parseInt(args[0] ?? "1", 10) || 1);
    const perPage = 10;
    const totalPages = Math.ceil(all.length / perPage);
    const slice = [...all].reverse().slice((page - 1) * perPage, page * perPage);

    const lines = slice.map(
      (r) =>
        `**#${r.id}** — ${r.action} · <@${r.userId}> · ${r.reason.slice(0, 50)}${r.reason.length > 50 ? "…" : ""} · <t:${Math.floor(r.createdAt / 1000)}:R>`
    );

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📋 Server Cases — ${all.length} total (Page ${page}/${totalPages})`)
          .setDescription(lines.join("\n").slice(0, 4096))
          .setFooter({ text: `Page ${page} of ${totalPages} · Use !servercases <page>` }),
      ],
    });
  },
};

// !casecount @user — breakdown of case types
export const casecountCmd: Command = {
  name: "casecount",
  aliases: [],
  usage: "@user",
  description: "Show a breakdown of case counts for a user by type.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "casecount"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply("❌ Could not find that user.");

    const records = await getCasesForUser(message.guild.id, target.user.id);

    const counts: Record<string, number> = {};
    for (const r of records) {
      const key = r.action.split(" ")[0]!;
      counts[key] = (counts[key] ?? 0) + 1;
    }

    const lines = Object.entries(counts).map(([k, v]) => `• **${k}:** ${v}`);

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📊 Case Count — ${target.user.tag}`)
          .setThumbnail(target.user.displayAvatarURL({ size: 64 }))
          .setDescription(
            lines.length > 0
              ? `${lines.join("\n")}\n\n**Total:** ${records.length}`
              : "No cases found."
          )
          .setTimestamp(),
      ],
    });
  },
};

// !exportcases [@user] — export all cases as a text attachment
export const exportcasesCmd: Command = {
  name: "exportcases",
  aliases: [],
  usage: "[@user]",
  description: "Export all cases (or cases for a specific user) as a text file.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "exportcases"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    let records: CaseRecord[];
    let label = `${message.guild.name}`;

    if (args.length > 0) {
      const target = await resolveTarget(message, args);
      if (!target) return void message.reply("❌ Could not find that user.");
      records = await getCasesForUser(message.guild.id, target.user.id);
      label = target.user.tag;
    } else {
      records = await getAllCases(message.guild.id);
    }

    if (records.length === 0) return void message.reply("✅ No cases to export.");

    const lines = records.map((r) => {
      const parts = [
        `Case #${r.id}`,
        `Action: ${r.action}`,
        `User: ${r.userTag} (${r.userId})`,
        `Moderator: ${r.modTag} (${r.modId})`,
        `Reason: ${r.reason}`,
      ];
      if (r.duration) parts.push(`Duration: ${r.duration}`);
      if (r.expiresAt) parts.push(`Expires: ${new Date(r.expiresAt).toUTCString()}`);
      parts.push(`Created: ${new Date(r.createdAt).toUTCString()}`);
      return parts.join("\n");
    });

    const content = lines.join("\n" + "-".repeat(50) + "\n");
    const buf = Buffer.from(content, "utf-8");
    const attachment = new AttachmentBuilder(buf, { name: `cases-${message.guild.id}.txt` });

    await message.channel.send({
      content: `📁 Exported **${records.length}** cases for **${label}**`,
      files: [attachment],
    });
  },
};


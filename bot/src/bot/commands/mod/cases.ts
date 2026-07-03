import { Client, EmbedBuilder, Message } from "discord.js";
import type { Command } from "../types";
import { resolveTarget } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import {
  getCase,
  getCasesForUser,
  getAllCases,
  editCase,
  deleteCase,
  addCase,
  type CaseRecord,
} from "../../lib/cases";
import { sendModLog } from "../../lib/modlog";

const ACTION_COLORS: Record<string, number> = {
  Warn: 0xf1c40f,
  Kick: 0xe67e22,
  Ban: 0xe74c3c,
  Unban: 0x2ecc71,
  Mute: 0xf39c12,
  Unmute: 0x2ecc71,
  Note: 0x5865f2,
};

function colorFor(action: string): number {
  const key = Object.keys(ACTION_COLORS).find((k) => action.startsWith(k));
  return key ? ACTION_COLORS[key]! : 0x5865f2;
}

function caseEmbed(rec: CaseRecord, guildName?: string): EmbedBuilder {
  const lines: string[] = [
    `**Action** — ${rec.action}`,
    `**User** — <@${rec.userId}> (${rec.userTag})`,
    `**Moderator** — <@${rec.modId}> (${rec.modTag})`,
    `**Reason** — ${rec.reason}`,
  ];
  if (rec.duration) lines.push(`**Duration** — ${rec.duration}`);

  const isExpired = !!rec.expiresAt && rec.expiresAt <= Date.now();
  if (rec.expiresAt) {
    lines.push(
      isExpired
        ? `**Expired** — <t:${Math.floor(rec.expiresAt / 1000)}:R>`
        : `**Expires** — <t:${Math.floor(rec.expiresAt / 1000)}:F>`
    );
  }
  lines.push(`**Created** — <t:${Math.floor(rec.createdAt / 1000)}:R>`);

  if (rec.deleted) {
    if (rec.deletedAt) lines.push(`**Deleted** — <t:${Math.floor(rec.deletedAt / 1000)}:R>`);
    if (rec.deletedByTag) lines.push(`**Deleted By** — <@${rec.deletedBy}> (${rec.deletedByTag})`);

    return new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`Case #${rec.id}${guildName ? ` · ${guildName}` : ""} — 🗑️ Deleted Case`)
      .setDescription(lines.join("\n"));
  }

  return new EmbedBuilder()
    .setColor(isExpired ? 0x99aab5 : colorFor(rec.action))
    .setTitle(`Case #${rec.id}${guildName ? ` · ${guildName}` : ""}${isExpired ? " — ⏳ Expired" : ""}`)
    .setDescription(lines.join("\n"));
}

// !case <id>
export const caseCmd: Command = {
  name: "case",
  aliases: [],
  usage: "<case_id>",
  description: "View a specific case by ID.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "case"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const id = parseInt(args[0] ?? "", 10);
    if (isNaN(id) || id < 1) return void message.reply("❌ Please provide a valid case ID.");

    const rec = await getCase(message.guild.id, id);
    if (!rec) return void message.reply(`❌ Case #${id} not found.`);

    await message.channel.send({ embeds: [caseEmbed(rec, message.guild.name)] });
  },
};

// !cases [@user] [-automod]
export const casesCmd: Command = {
  name: "cases",
  aliases: [],
  usage: "[@user|user_id] [-automod]",
  description: "View all cases for a user, or all recent server cases. Use -automod to show only automod cases.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "cases"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const automodOnly = args.some((a) => a.toLowerCase() === "-automod");
    const filteredArgs = args.filter((a) => a.toLowerCase() !== "-automod");
    const botId = client.user?.id;

    let records: CaseRecord[];
    let title: string;

    if (filteredArgs.length > 0) {
      const target = await resolveTarget(message, filteredArgs);
      if (!target) return void message.reply("❌ Could not find that user.");
      records = await getCasesForUser(message.guild.id, target.user.id, { automodOnly, botId });
      title = automodOnly ? `Automod Cases for ${target.user.tag}` : `Cases for ${target.user.tag}`;
    } else {
      const all = await getAllCases(message.guild.id, { automodOnly, botId });
      records = all.slice(-20).reverse();
      title = automodOnly ? `Recent Automod Cases in ${message.guild.name}` : `Recent cases in ${message.guild.name}`;
    }

    if (records.length === 0) {
      return void message.reply("✅ No cases found.");
    }

    const lines = records.map(
      (r) => `**#${r.id}** — ${r.action} · ${r.reason.slice(0, 60)}${r.reason.length > 60 ? "…" : ""} · <t:${Math.floor(r.createdAt / 1000)}:R>`
    );

    const chunks: string[][] = [];
    let current: string[] = [];
    let len = 0;
    for (const line of lines) {
      if (len + line.length + 1 > 3800) {
        chunks.push(current);
        current = [];
        len = 0;
      }
      current.push(line);
      len += line.length + 1;
    }
    if (current.length) chunks.push(current);

    for (let i = 0; i < chunks.length; i++) {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(i === 0 ? `📋 ${title} (${records.length})` : `📋 ${title} (cont.)`)
        .setDescription(chunks[i]!.join("\n"));
      await message.channel.send({ embeds: [embed] });
    }
  },
};

// !addcase <@user> <action> [reason]
export const addcaseCmd: Command = {
  name: "addcase",
  aliases: [],
  usage: "@user <action> [reason]",
  description: "Manually add a case for a user.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "addcase"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply("❌ Could not find that user.");

    const rest = args.slice(message.mentions.users.size > 0 ? 1 : 1);
    const action = rest[0] ?? "Manual";
    const reason = rest.slice(1).join(" ") || "No reason provided";

    const rec = await addCase(message.guild.id, {
      action,
      userId: target.user.id,
      userTag: target.user.tag,
      modId: message.author.id,
      modTag: message.author.tag,
      reason,
    });

    await sendModLog(client, message.guild.id, {
      action: `Manual Case — ${action}`,
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason,
      color: 0x5865f2,
      caseId: String(rec.id),
    });

    await message.channel.send({ embeds: [caseEmbed(rec, message.guild.name)] });
  },
};

// !editcase <id> reason <new reason>
// !editcase <id> duration <new duration>
export const editcaseCmd: Command = {
  name: "editcase",
  aliases: [],
  usage: "<case_id> reason <new reason> | <case_id> duration <value>",
  description: "Edit the reason or duration of an existing case.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "editcase"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const id = parseInt(args[0] ?? "", 10);
    if (isNaN(id) || id < 1) return void message.reply("❌ Please provide a valid case ID.");

    const field = args[1]?.toLowerCase();
    const value = args.slice(2).join(" ").trim();

    if (field !== "reason" && field !== "duration") {
      return void message.reply(
        "❌ Specify a field to edit: `reason` or `duration`.\n" +
        "Usage: `!editcase <id> reason <text>` or `!editcase <id> duration <value>`"
      );
    }
    if (!value) {
      return void message.reply(`❌ Please provide a new value for **${field}**.`);
    }

    const before = await getCase(message.guild.id, id);
    if (!before) return void message.reply(`❌ Case #${id} not found.`);

    const ok = await editCase(message.guild.id, id, { [field]: value });
    if (!ok) return void message.reply(`❌ Case #${id} not found.`);

    const updated = await getCase(message.guild.id, id);
    const label = field === "reason" ? "Reason" : "Duration";

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setDescription(
            `✅ Case #${id} **${field}** updated.\n\n**New ${label}:** ${value}` +
            (updated && field === "reason" && updated.duration ? `\n**Duration:** ${updated.duration}` : "") +
            (updated && field === "duration" ? `\n**Reason:** ${updated.reason}` : "")
          )
          .setFooter({ text: `Edited by ${message.author.tag}` })
          .setTimestamp(),
      ],
    });

    const logAction =
      field === "duration"
        ? `Case Edit — Duration (${value})`
        : `Case Edit — Reason`;

    await sendModLog(client, message.guild.id, {
      action: logAction,
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: before.userTag, id: before.userId },
      reason:
        field === "reason"
          ? `Reason changed from "${before.reason}" to "${value}"`
          : `Reason: ${before.reason}`,
      duration: field === "duration" ? value : before.duration,
      color: 0x2ecc71,
      caseId: String(id),
    });
  },
};

// !deletecase <id>
export const deletecaseCmd: Command = {
  name: "deletecase",
  aliases: [],
  usage: "<case_id>",
  description: "Delete a case. It is removed from all lists and counts, but !case <id> will still show it, greyed out.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "deletecase"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const id = parseInt(args[0] ?? "", 10);
    if (isNaN(id) || id < 1) return void message.reply("❌ Please provide a valid case ID.");

    const before = await getCase(message.guild.id, id);
    if (!before) return void message.reply(`❌ Case #${id} not found.`);

    const ok = await deleteCase(message.guild.id, id, {
      id: message.author.id,
      tag: message.author.tag,
    });
    if (!ok) return void message.reply(`❌ Case #${id} not found or already deleted.`);

    await message.reply(`🗑️ Case #${id} has been deleted. It will no longer appear in lists or counts, but \`!case ${id}\` will still show it as a deleted case.`);

    await sendModLog(client, message.guild.id, {
      action: "Case Delete",
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: before.userTag, id: before.userId },
      reason: `Case #${id} (${before.action}) deleted — original reason: ${before.reason}`,
      color: 0xe74c3c,
      caseId: String(id),
    });
  },
};

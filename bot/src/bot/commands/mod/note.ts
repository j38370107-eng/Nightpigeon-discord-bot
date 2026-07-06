import { Client, EmbedBuilder, Message } from "discord.js";
import type { Command } from "../types";
import { resolveTarget } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getCachedConfig } from "../../store/guildConfig";
import { buildPayload } from "../../lib/msgTemplate";
import { dbGet, dbSet } from "../../store/db";

const STORE = "mod_notes";

interface NoteEntry {
  id: number;
  text: string;
  modId: string;
  modTag: string;
  createdAt: number;
}

type GuildNotes = Record<string, NoteEntry[]>;

async function loadNotes(guildId: string): Promise<GuildNotes> {
  return (await dbGet<GuildNotes>(STORE, guildId)) ?? {};
}

async function saveNotes(guildId: string, notes: GuildNotes): Promise<void> {
  await dbSet(STORE, guildId, notes);
}

async function nextNoteId(guildId: string): Promise<number> {
  const all = await loadNotes(guildId);
  let max = 0;
  for (const entries of Object.values(all)) {
    for (const e of entries) {
      if (e.id > max) max = e.id;
    }
  }
  return max + 1;
}

// !note @user <text>
export const noteCmd: Command = {
  name: "note",
  aliases: [],
  usage: "@user <text>",
  description: "Add a private note to a user's record.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "note"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));

    const text = args.slice(message.mentions.users.size > 0 ? 1 : 1).join(" ");
    if (!text) return void message.reply(buildPayload(msgs.err_note_required, {}, "❌ Please provide note text."));

    const notes = await loadNotes(message.guild.id);
    const userNotes = notes[target.user.id] ?? [];
    const id = await nextNoteId(message.guild.id);

    userNotes.push({
      id,
      text,
      modId: message.author.id,
      modTag: message.author.tag,
      createdAt: Date.now(),
    });
    notes[target.user.id] = userNotes;
    await saveNotes(message.guild.id, notes);

    const vars = {
      user: target.user.tag,
      "user.mention": `<@${target.user.id}>`,
      "user.id": target.user.id,
      mod: message.author.tag,
      note_id: id,
    };

    await message.reply(buildPayload(msgs.note_success, vars, `📝 Note #${id} added for **${target.user.tag}**.`));
  },
};

// !viewnotes @user
export const viewnotesCmd: Command = {
  name: "viewnotes",
  aliases: [],
  usage: "@user",
  description: "View all notes for a user.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};
    if (!(await checkYamlLevelAsync(message, "viewnotes"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));

    const notes = await loadNotes(message.guild.id);
    const userNotes = notes[target.user.id] ?? [];

    if (userNotes.length === 0) {
      const modCfg = getCachedConfig(message.guild.id);
      const modMsgs = (modCfg.plugins.moderation as any)?.messages ?? {};
      return void message.reply(buildPayload(modMsgs.no_notes, { user: target.user.tag, "user.id": target.user.id }, `✅ No notes found for **${target.user.tag}**.`));
    }

    const lines = userNotes.map(
      (n) =>
        `**#${n.id}** — ${n.text}\n> by ${n.modTag} · <t:${Math.floor(n.createdAt / 1000)}:R>`
    );

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📝 Notes for ${target.user.tag} (${userNotes.length})`)
          .setThumbnail(target.user.displayAvatarURL({ size: 64 }))
          .setDescription(lines.join("\n\n").slice(0, 4096)),
      ],
    });
  },
};

// !deletenote @user <id>
export const deletenoteCmd: Command = {
  name: "deletenote",
  aliases: [],
  usage: "@user <note_id>",
  description: "Delete a specific note from a user.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const msgs = (cfg.plugins.moderation as any)?.messages ?? {};

    if (!(await checkYamlLevelAsync(message, "deletenote"))) {
      return void message.reply(buildPayload(msgs.err_no_permission, {}, "❌ You don't have permission to use this command."));
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply(buildPayload(msgs.err_user_not_found, {}, "❌ Could not find that user."));

    const noteId = parseInt(args[message.mentions.users.size > 0 ? 1 : 1] ?? "", 10);
    if (isNaN(noteId)) return void message.reply(buildPayload(msgs.err_note_invalid_id, {}, "❌ Please provide a valid note ID."));

    const notes = await loadNotes(message.guild.id);
    const userNotes = notes[target.user.id] ?? [];
    const idx = userNotes.findIndex((n) => n.id === noteId);
    if (idx === -1) {
      return void message.reply(
        buildPayload(msgs.err_note_not_found, { note_id: noteId, user: target.user.tag }, `❌ Note #${noteId} not found for that user.`)
      );
    }

    userNotes.splice(idx, 1);
    notes[target.user.id] = userNotes;
    await saveNotes(message.guild.id, notes);

    const vars = {
      user: target.user.tag,
      "user.mention": `<@${target.user.id}>`,
      note_id: noteId,
      mod: message.author.tag,
    };

    await message.reply(buildPayload(msgs.deletenote_success, vars, `🗑️ Note #${noteId} deleted for **${target.user.tag}**.`));
  },
};

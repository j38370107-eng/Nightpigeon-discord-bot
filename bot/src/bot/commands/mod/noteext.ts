import { Client, EmbedBuilder, Message } from "discord.js";
import type { Command } from "../types";
import { resolveTarget } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { dbGet, dbSet } from "../../store/db";

const STORE = "mod_notes";

interface NoteEntry {
  id: number;
  userId: string;
  userTag: string;
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

// !forcenote <user_id> <text> — add a note by user ID
export const forcenoteCmd: Command = {
  name: "forcenote",
  aliases: [],
  usage: "<user_id> <text>",
  description: "Add a note to a user by ID (even if not in server).",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "forcenote"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const rawId = (args[0] ?? "").replace(/[<@!>]/g, "");
    if (!/^\d{15,20}$/.test(rawId)) return void message.reply("❌ Please provide a valid user ID.");

    const text = args.slice(1).join(" ");
    if (!text) return void message.reply("❌ Please provide note text.");

    let userTag = rawId;
    try {
      const u = await message.client.users.fetch(rawId);
      userTag = u.tag;
    } catch { /* unknown */ }

    const notes = await loadNotes(message.guild.id);
    const userNotes = notes[rawId] ?? [];
    const id = await nextNoteId(message.guild.id);

    userNotes.push({
      id,
      userId: rawId,
      userTag,
      text,
      modId: message.author.id,
      modTag: message.author.tag,
      createdAt: Date.now(),
    });
    notes[rawId] = userNotes;
    await saveNotes(message.guild.id, notes);

    await message.reply(`📝 Note #${id} added for **${userTag}**.`);
  },
};

// !viewnote <note_id> — view a specific note
export const viewnoteCmd: Command = {
  name: "viewnote",
  aliases: [],
  usage: "<note_id>",
  description: "View a specific note by global note ID.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "viewnote"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const noteId = parseInt(args[0] ?? "", 10);
    if (isNaN(noteId)) return void message.reply("❌ Please provide a valid note ID.");

    const notes = await loadNotes(message.guild.id);
    let found: NoteEntry | null = null;

    for (const userNotes of Object.values(notes)) {
      const match = userNotes.find((n) => n.id === noteId);
      if (match) { found = match; break; }
    }

    if (!found) return void message.reply(`❌ Note #${noteId} not found.`);

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📝 Note #${found.id}`)
          .setDescription(found.text)
          .addFields(
            { name: "User", value: `${found.userTag} (${found.userId})`, inline: true },
            { name: "Added by", value: found.modTag, inline: true },
            { name: "Created", value: `<t:${Math.floor(found.createdAt / 1000)}:R>`, inline: true }
          ),
      ],
    });
  },
};

// !notesearch <keyword> — search notes across all users
export const notesearchCmd: Command = {
  name: "notesearch",
  aliases: [],
  usage: "<keyword>",
  description: "Search all notes for a keyword.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "notesearch"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const keyword = args.join(" ").toLowerCase();
    if (!keyword) return void message.reply("❌ Please provide a search keyword.");

    const notes = await loadNotes(message.guild.id);
    const matches: NoteEntry[] = [];

    for (const userNotes of Object.values(notes)) {
      for (const n of userNotes) {
        if (n.text.toLowerCase().includes(keyword)) matches.push(n);
      }
    }

    if (matches.length === 0) return void message.reply(`❌ No notes found matching **${keyword}**.`);

    const lines = matches.slice(0, 20).map(
      (n) => `**#${n.id}** — ${n.userTag} — ${n.text.slice(0, 80)}${n.text.length > 80 ? "…" : ""}`
    );

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🔍 Note Search: "${keyword}" (${matches.length} found)`)
          .setDescription(lines.join("\n").slice(0, 4096)),
      ],
    });
  },
};

// !editnote <note_id> <new text> — edit a note's text
export const editnoteCmd: Command = {
  name: "editnote",
  aliases: [],
  usage: "<note_id> <new text>",
  description: "Edit the text of an existing note.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "editnote"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const noteId = parseInt(args[0] ?? "", 10);
    if (isNaN(noteId)) return void message.reply("❌ Please provide a valid note ID.");

    const newText = args.slice(1).join(" ");
    if (!newText) return void message.reply("❌ Please provide the new text.");

    const notes = await loadNotes(message.guild.id);
    let edited = false;

    for (const userNotes of Object.values(notes)) {
      const idx = userNotes.findIndex((n) => n.id === noteId);
      if (idx !== -1) {
        userNotes[idx]!.text = newText;
        edited = true;
        break;
      }
    }

    if (!edited) return void message.reply(`❌ Note #${noteId} not found.`);

    await saveNotes(message.guild.id, notes);
    await message.reply(`✅ Note #${noteId} updated.`);
  },
};

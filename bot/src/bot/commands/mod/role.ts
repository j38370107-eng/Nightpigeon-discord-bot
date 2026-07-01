import { Client, EmbedBuilder, Message, Role } from "discord.js";
import type { Command } from "../types";
import { resolveTarget, getArgs } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getCachedConfig } from "../../store/guildConfig";
import { dbGet, dbSet } from "../../store/db";
import { parseDuration, formatDuration } from "../../lib/parseDuration";
import { sendModLog } from "../../lib/modlog";

const STORE = "temproles";

interface TempRoleEntry {
  userId: string;
  userTag: string;
  roleId: string;
  roleName: string;
  guildId: string;
  expiresAt: number;
  modId: string;
}

type GuildTempRoles = TempRoleEntry[];

async function loadTempRoles(guildId: string): Promise<GuildTempRoles> {
  return (await dbGet<GuildTempRoles>(STORE, guildId)) ?? [];
}

async function saveTempRoles(guildId: string, entries: GuildTempRoles): Promise<void> {
  await dbSet(STORE, guildId, entries);
}

function resolveRole(guild: import("discord.js").Guild, input: string): Role | null {
  const id = input.replace(/[<@&>]/g, "");
  return (
    guild.roles.cache.get(id) ??
    guild.roles.cache.find((r) => r.name.toLowerCase() === input.toLowerCase()) ??
    null
  );
}

/**
 * Try to find a role from the start of `args`, supporting multi-word names.
 * Tries the longest prefix first, then shorter ones.
 * Returns the matched role and how many tokens were consumed, or null.
 */
function resolveRoleFromArgs(
  guild: import("discord.js").Guild,
  args: string[],
  maxTokens = args.length
): { role: Role; consumed: number } | null {
  // First, try a single-token mention or ID (fast path)
  if (args[0]) {
    const byId = guild.roles.cache.get(args[0].replace(/[<@&>]/g, ""));
    if (byId) return { role: byId, consumed: 1 };
  }
  // Try longest prefix down to 1 token for name-based lookup
  const limit = Math.min(maxTokens, args.length);
  for (let len = limit; len >= 1; len--) {
    const candidate = args.slice(0, len).join(" ");
    const role = guild.roles.cache.find(
      (r) => r.name.toLowerCase() === candidate.toLowerCase()
    );
    if (role) return { role, consumed: len };
  }
  return null;
}

// !addrole @user <role> [reason]
export const addroleCmd: Command = {
  name: "addrole",
  aliases: [],
  usage: "@user <role> [reason]",
  description: "Add a role to a member.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "addrole"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply("❌ Could not find that user.");
    if (!target.member) return void message.reply("❌ That user is not in this server.");

    const remaining = getArgs(message, args);
    if (!remaining[0]) return void message.reply("❌ Please provide a role.");

    const resolved = resolveRoleFromArgs(message.guild, remaining);
    if (!resolved) return void message.reply("❌ Could not find that role.");
    const { role, consumed } = resolved;
    if (role.managed) return void message.reply("❌ That role is managed by an integration.");
    if (role.position >= message.guild.members.me!.roles.highest.position) {
      return void message.reply("❌ That role is above my highest role.");
    }
    if (target.member.roles.cache.has(role.id)) {
      return void message.reply(`❌ **${target.user.tag}** already has the **${role.name}** role.`);
    }

    const reason = remaining.slice(consumed).join(" ") || "No reason provided";
    await target.member.roles.add(role, `Added by ${message.author.tag} — ${reason}`);

    await sendModLog(client, message.guild.id, {
      action: "Role Added",
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason: `Role: ${role.name} — ${reason}`,
      color: 0x2ecc71,
    });

    await message.reply(`✅ Added **${role.name}** to **${target.user.tag}**.`);
  },
};

// !removerole @user <role> [reason]
export const removeroleCmd: Command = {
  name: "removerole",
  aliases: [],
  usage: "@user <role> [reason]",
  description: "Remove a role from a member.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "removerole"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply("❌ Could not find that user.");
    if (!target.member) return void message.reply("❌ That user is not in this server.");

    const remaining = getArgs(message, args);
    if (!remaining[0]) return void message.reply("❌ Please provide a role.");

    const resolved = resolveRoleFromArgs(message.guild, remaining);
    if (!resolved) return void message.reply("❌ Could not find that role.");
    const { role, consumed } = resolved;
    if (role.managed) return void message.reply("❌ That role is managed by an integration.");
    if (role.position >= message.guild.members.me!.roles.highest.position) {
      return void message.reply("❌ That role is above my highest role.");
    }
    if (!target.member.roles.cache.has(role.id)) {
      return void message.reply(`❌ **${target.user.tag}** does not have the **${role.name}** role.`);
    }

    const reason = remaining.slice(consumed).join(" ") || "No reason provided";
    await target.member.roles.remove(role, `Removed by ${message.author.tag} — ${reason}`);

    await sendModLog(client, message.guild.id, {
      action: "Role Removed",
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason: `Role: ${role.name} — ${reason}`,
      color: 0xe67e22,
    });

    await message.reply(`✅ Removed **${role.name}** from **${target.user.tag}**.`);
  },
};

// !temprole @user <role> <duration> [reason]
export const temproleCmd: Command = {
  name: "temprole",
  aliases: [],
  usage: "@user <role> <duration> [reason]",
  description: "Give a member a role for a limited time.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "temprole"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply("❌ Could not find that user.");
    if (!target.member) return void message.reply("❌ That user is not in this server.");

    const remaining = getArgs(message, args);
    if (remaining.length < 2) return void message.reply("❌ Usage: `!temprole @user <role> <duration> [reason]`");

    // Role name may be multi-word; reserve at least 1 token for the duration.
    const resolved = resolveRoleFromArgs(message.guild, remaining, remaining.length - 1);
    if (!resolved) return void message.reply("❌ Could not find that role.");
    const { role, consumed } = resolved;
    if (role.managed) return void message.reply("❌ That role is managed by an integration.");
    if (role.position >= message.guild.members.me!.roles.highest.position) {
      return void message.reply("❌ That role is above my highest role.");
    }

    const durationMs = parseDuration(remaining[consumed] ?? "");
    if (!durationMs) return void message.reply("❌ Please provide a valid duration (e.g. `1h`, `7d`).");

    const durationLabel = formatDuration(durationMs);
    const reason = remaining.slice(consumed + 1).join(" ") || "No reason provided";
    const expiresAt = Date.now() + durationMs;

    if (!target.member.roles.cache.has(role.id)) {
      await target.member.roles.add(role, `Temp role — ${durationLabel} — ${reason}`);
    }

    const entries = await loadTempRoles(message.guild.id);
    entries.push({
      userId: target.user.id,
      userTag: target.user.tag,
      roleId: role.id,
      roleName: role.name,
      guildId: message.guild.id,
      expiresAt,
      modId: message.author.id,
    });
    await saveTempRoles(message.guild.id, entries);

    setTimeout(async () => {
      try {
        const guild = client.guilds.cache.get(message.guild!.id);
        if (!guild) return;
        const member = await guild.members.fetch(target.user.id).catch(() => null);
        if (member && member.roles.cache.has(role.id)) {
          await member.roles.remove(role.id, "Temp role expired");
        }
        const list = await loadTempRoles(message.guild!.id);
        const updated = list.filter(
          (e) => !(e.userId === target.user.id && e.roleId === role.id && Math.abs(e.expiresAt - expiresAt) < 2000)
        );
        await saveTempRoles(message.guild!.id, updated);
      } catch { /* ok */ }
    }, durationMs);

    await message.reply(
      `⏱️ **${target.user.tag}** has been given **${role.name}** for **${durationLabel}**.\nExpires: <t:${Math.floor(expiresAt / 1000)}:F>`
    );
  },
};

// !temproles — list active temp roles
export const temprolesCmd: Command = {
  name: "temproles",
  aliases: [],
  usage: "",
  description: "List all active temporary roles in this server.",
  async execute(message: Message, _args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "temproles"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const entries = await loadTempRoles(message.guild.id);
    const now = Date.now();
    const active = entries.filter((e) => e.expiresAt > now);

    if (active.length === 0) return void message.reply("✅ No active temp roles.");

    const lines = active.map(
      (e) =>
        `• **${e.userTag}** — **${e.roleName}** — expires <t:${Math.floor(e.expiresAt / 1000)}:R>`
    );

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`⏱️ Active Temp Roles (${active.length})`)
          .setDescription(lines.join("\n").slice(0, 4096)),
      ],
    });
  },
};

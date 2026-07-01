import { Client, EmbedBuilder, Message, Role } from "discord.js";
import type { Command } from "../types";
import { resolveTarget, getArgs } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getCachedConfig } from "../../store/guildConfig";
import { dbGet, dbSet } from "../../store/db";
import { addCase } from "../../lib/cases";
import { sendModLog } from "../../lib/modlog";

const STORE = "rolebans";

interface RoleBanEntry {
  userId: string;
  userTag: string;
  roleId: string;
  roleName: string;
  reason: string;
  modId: string;
  modTag: string;
  bannedAt: number;
}

type GuildRoleBans = Record<string, RoleBanEntry[]>;

async function loadRolebans(guildId: string): Promise<GuildRoleBans> {
  return (await dbGet<GuildRoleBans>(STORE, guildId)) ?? {};
}

async function saveRolebans(guildId: string, data: GuildRoleBans): Promise<void> {
  await dbSet(STORE, guildId, data);
}

function resolveRoleFromArgs(
  guild: import("discord.js").Guild,
  args: string[],
  maxTokens = args.length
): { role: Role; consumed: number } | null {
  if (args[0]) {
    const byId = guild.roles.cache.get(args[0].replace(/[<@&>]/g, ""));
    if (byId) return { role: byId, consumed: 1 };
  }
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

// !roleban @user <role> [reason] — remove a role and prevent re-assignment
export const rolebanCmd: Command = {
  name: "roleban",
  aliases: [],
  usage: "@user <role_id|role_name> [reason]",
  description: "Remove a role from a member and prevent them from being re-assigned it.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "roleban"))) {
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

    const reason = remaining.slice(consumed).join(" ") || "No reason provided";

    if (target.member.roles.cache.has(role.id)) {
      await target.member.roles.remove(role, `Roleban — ${reason}`).catch(() => {});
    }

    const rolebans = await loadRolebans(message.guild.id);
    const userBans = rolebans[target.user.id] ?? [];
    if (!userBans.find((b) => b.roleId === role.id)) {
      userBans.push({
        userId: target.user.id,
        userTag: target.user.tag,
        roleId: role.id,
        roleName: role.name,
        reason,
        modId: message.author.id,
        modTag: message.author.tag,
        bannedAt: Date.now(),
      });
    }
    rolebans[target.user.id] = userBans;
    await saveRolebans(message.guild.id, rolebans);

    const caseRecord = await addCase(message.guild.id, {
      action: `Role Ban (${role.name})`,
      userId: target.user.id,
      userTag: target.user.tag,
      modId: message.author.id,
      modTag: message.author.tag,
      reason,
    });

    await sendModLog(client, message.guild.id, {
      action: `Role Ban`,
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: target.user.tag, id: target.user.id },
      reason: `Role: ${role.name} — ${reason}`,
      color: 0xe67e22,
      caseId: String(caseRecord.id),
    });

    await message.reply(
      `🚫 **${target.user.tag}** has been role-banned from **${role.name}**. Case: #${caseRecord.id}`
    );
  },
};

// !unroleban @user <role> — lift a role ban
export const unrolebanCmd: Command = {
  name: "unroleban",
  aliases: [],
  usage: "@user <role_id|role_name>",
  description: "Remove a role ban from a member.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "unroleban"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply("❌ Could not find that user.");

    const remaining = getArgs(message, args);
    if (!remaining[0]) return void message.reply("❌ Please provide a role.");

    const resolved = resolveRoleFromArgs(message.guild, remaining);
    if (!resolved) return void message.reply("❌ Could not find that role.");
    const { role } = resolved;

    const rolebans = await loadRolebans(message.guild.id);
    const userBans = rolebans[target.user.id] ?? [];
    const idx = userBans.findIndex((b) => b.roleId === role.id);

    if (idx === -1) {
      return void message.reply(`❌ **${target.user.tag}** is not role-banned from **${role.name}**.`);
    }

    userBans.splice(idx, 1);
    rolebans[target.user.id] = userBans;
    await saveRolebans(message.guild.id, rolebans);

    await message.reply(`✅ Role ban lifted — **${target.user.tag}** can now receive **${role.name}** again.`);
  },
};

// !rolebanned [@user] — list role bans for a user or all role bans
export const rolebannedCmd: Command = {
  name: "rolebanned",
  aliases: [],
  usage: "[@user]",
  description: "List role bans for a user, or all role bans in the server.",
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "rolebanned"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const rolebans = await loadRolebans(message.guild.id);

    if (args.length > 0) {
      const target = await resolveTarget(message, args);
      if (!target) return void message.reply("❌ Could not find that user.");
      const userBans = rolebans[target.user.id] ?? [];
      if (userBans.length === 0) {
        return void message.reply(`✅ **${target.user.tag}** has no role bans.`);
      }
      const lines = userBans.map(
        (b) => `• **${b.roleName}** (${b.roleId}) — ${b.reason} · <t:${Math.floor(b.bannedAt / 1000)}:R>`
      );
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle(`🚫 Role Bans — ${target.user.tag} (${userBans.length})`)
            .setDescription(lines.join("\n")),
        ],
      });
    } else {
      const all: string[] = [];
      for (const [userId, bans] of Object.entries(rolebans)) {
        for (const b of bans) {
          all.push(`• **${b.userTag}** (${userId}) — **${b.roleName}** — ${b.reason}`);
        }
      }
      if (all.length === 0) return void message.reply("✅ No role bans in this server.");
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle(`🚫 All Role Bans (${all.length})`)
            .setDescription(all.join("\n").slice(0, 4096)),
        ],
      });
    }
  },
};

export { loadRolebans };

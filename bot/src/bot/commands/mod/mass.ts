import { Client, Guild, GuildMember, Message, Role, TextChannel, User } from "discord.js";
import type { Command } from "../types";
import { checkYamlLevelAsync, getMemberLevel } from "../../lib/yamlLevels";
import { getCachedConfig } from "../../store/guildConfig";
import { addCase } from "../../lib/cases";
import { parseDuration, formatDuration } from "../../lib/parseDuration";
import { buildPayload } from "../../lib/msgTemplate";
import type { TemplateVars } from "../../lib/msgTemplate";
import { sendYamlLogCached } from "../../lib/yamlLogging";
import { isHierarchyBlocked } from "../../lib/hierarchy";
import { dbGet, dbSet } from "../../store/db";
import { sendModLog } from "../../lib/modlog";

const MAX_BAN_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

type MassActionCfgKey =
  | "warn" | "forcewarn"
  | "mute" | "forcemute" | "unmute"
  | "kick"
  | "ban" | "forceban" | "unban";

// Argument parser
function parseMassArgs(
  message: Message,
  args: string[]
): { targetIds: string[]; durationMs: number | null; durationLabel: string; reason: string } {
  const pipeIdx = args.indexOf("|");
  const beforePipe = pipeIdx === -1 ? args : args.slice(0, pipeIdx);
  const afterPipe  = pipeIdx === -1 ? []   : args.slice(pipeIdx + 1);

  const reason = afterPipe.join(" ").trim();

  const rawIds: string[] = [];
  let durationMs: number | null = null;
  let durationLabel = "Permanent";

  for (const arg of beforePipe) {
    const cleaned = arg.replace(/[<@!>]/g, "");
    if (/^\d{15,20}$/.test(cleaned)) {
      rawIds.push(cleaned);
    } else {
      const parsed = parseDuration(arg);
      if (parsed !== null) {
        durationMs    = parsed;
        durationLabel = formatDuration(parsed);
      }
    }
  }

  message.mentions.users.forEach((u) => {
    if (!rawIds.includes(u.id)) rawIds.push(u.id);
  });

  return { targetIds: [...new Set(rawIds)], durationMs, durationLabel, reason };
}

// Config helpers
function getMa(guildId: string): any {
  return (getCachedConfig(guildId).plugins?.mass_actions as any) ?? {};
}

function applyVarsStr(template: any, vars: Record<string, string>): string {
  if (typeof template !== "string") return "";
  return template.replace(/\{([^}]+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// Mass action engine
interface RunOpts {
  targetIds:     string[];
  durationMs:    number | null;
  durationLabel: string;
  reason:        string;
  actionCfgKey:  MassActionCfgKey;
  eventKey:      string;
  requireMember: boolean;
  perform: (
    id:       string,
    user:     User,
    member:   GuildMember | null,
    guild:    Guild,
    durMs:    number | null
  ) => Promise<void>;
  caseLabel: (durationLabel: string) => string;
}

async function runMassAction(
  message:  Message,
  client:   Client,
  opts:     RunOpts
): Promise<void> {
  const guild = message.guild!;
  const ma    = getMa(guild.id);

  if (!ma.enabled) return;

  const maxTargets:      number  = ma.max_targets         ?? 20;
  const delay:           number  = ma.delay_between_actions ?? 500;
  const requireReason:   boolean = ma.require_reason       ?? false;
  const dmOnAction:      boolean = ma.dm_on_action         ?? true;
  const createCases:     boolean = ma.create_cases         ?? true;
  const logIndividually: boolean = ma.log_individually     ?? false;
  const actionCfg:       any     = ma[opts.actionCfgKey]   ?? {};
  const errors:          any     = ma.errors               ?? {};

  // Guard: no targets
  if (opts.targetIds.length === 0) {
    return void message.reply(
      buildPayload(errors.error_no_targets, {}, "No valid targets found — provide @mentions or raw user IDs before the |")
    );
  }

  // Guard: too many targets
  if (opts.targetIds.length > maxTargets) {
    return void message.reply(
      buildPayload(errors.error_too_many_targets, { count: String(maxTargets) },
        `Too many targets — maximum is ${maxTargets} users per mass action`)
    );
  }

  // Guard: require reason
  const finalReason = opts.reason.trim() || "No reason provided";
  if (requireReason && !opts.reason.trim()) {
    return void message.reply(
      buildPayload(errors.error_no_separator, {},
        "Missing separator — use | to separate targets from reason")
    );
  }

  // Guard: self and bot
  if (opts.targetIds.includes(message.author.id)) {
    return void message.reply(
      buildPayload(errors.error_self_target, {}, "You cannot include yourself as a target")
    );
  }
  if (opts.targetIds.includes(client.user!.id)) {
    return void message.reply(
      buildPayload(errors.error_bot_target, {}, "You cannot include the bot as a target")
    );
  }

  // Pre-fetch guild members
  await guild.members.fetch().catch(() => {});

  // Process each target
  const succeededTags: string[] = [];
  const failedTags:    string[] = [];
  const succeededIds:  string[] = [];
  let hierarchySkipped = 0;
  let lastCaseId: number | undefined;

  for (const id of opts.targetIds) {
    let user: User;
    try {
      user = await client.users.fetch(id);
    } catch {
      failedTags.push(id);
      continue;
    }

    const member = guild.members.cache.get(id) ?? null;

    // Hierarchy check (level-based — higher level wins, falls back to role position)
    if (member && message.member && guild.ownerId !== message.author.id) {
      const execLevel   = getMemberLevel(message.member);
      const targetLevel = getMemberLevel(member);
      if (isHierarchyBlocked(message.member, member, execLevel, targetLevel)) {
        hierarchySkipped++;
        failedTags.push(user.username);
        continue;
      }
    }

    // Skip if action requires member in server
    if (opts.requireMember && !member) {
      failedTags.push(user.username);
      continue;
    }

    // DM before action (silent on failure)
    if (dmOnAction && actionCfg.user_dm) {
      const dmVars: TemplateVars = {
        user:       user.username,
        "user.id":  id,
        server:     guild.name,
        mod:        message.author.username,
        "mod.id":   message.author.id,
        reason:     finalReason,
        duration:   opts.durationLabel,
        expires_at: opts.durationMs
          ? new Date(Date.now() + opts.durationMs).toLocaleString("en-US")
          : "Never",
      };
      try {
        const dm = await user.createDM();
        await dm.send(buildPayload(actionCfg.user_dm, dmVars, ""));
      } catch { /* DMs closed */ }
    }

    // Execute action
    try {
      await opts.perform(id, user, member, guild, opts.durationMs);
      succeededTags.push(user.username);
      succeededIds.push(id);

      // Create case
      if (createCases) {
        const rec = await addCase(guild.id, {
          action:    opts.caseLabel(opts.durationLabel),
          userId:    id,
          userTag:   user.username,
          modId:     message.author.id,
          modTag:    message.author.username,
          reason:    finalReason,
          duration:  opts.durationMs ? opts.durationLabel : undefined,
          expiresAt: opts.durationMs ? Date.now() + opts.durationMs : undefined,
        }).catch(() => null);
        if (rec?.id) lastCaseId = rec.id;
      }

      // Per-target log (if log_individually)
      if (logIndividually && actionCfg.log_individual) {
        const logVars: Record<string, string> = {
          user:       user.username,
          "user.id":  id,
          mod:        message.author.username,
          "mod.id":   message.author.id,
          reason:     finalReason,
          duration:   opts.durationLabel,
          expires_at: opts.durationMs
            ? new Date(Date.now() + opts.durationMs).toLocaleString("en-US")
            : "Never",
          case_id: lastCaseId ? String(lastCaseId) : "—",
        };
        const logText = applyVarsStr(actionCfg.log_individual, logVars);
        await sendYamlLogCached(client, guild.id, {
          eventKey: opts.eventKey,
          vars: { description: logText, ...logVars } as any,
          category: "mass_action",
        }).catch(() => {});
      }
    } catch {
      failedTags.push(user.username);
    }

    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  // Build summary vars
  const successCount = succeededTags.length;
  const failCount    = failedTags.length;
  const total        = opts.targetIds.length;

  const summaryVars: Record<string, string> = {
    success_count: String(successCount),
    fail_count:    String(failCount),
    total:         String(total),
    reason:        finalReason,
    duration:      opts.durationLabel,
    expires_at:    opts.durationMs
      ? new Date(Date.now() + opts.durationMs).toLocaleString("en-US")
      : "Never",
    mod:           message.author.username,
    "mod.id":      message.author.id,
    trigger:       succeededIds.join(", ").slice(0, 900),
  };

  // Post channel summary
  const summaryTemplate =
    successCount === 0      ? actionCfg.all_failed :
    failCount    > 0        ? actionCfg.partial     :
                              actionCfg.success;

  const defaultSummary =
    successCount === 0
      ? `❌ Mass ${opts.actionCfgKey} failed for all ${total} targets`
      : `✅ ${successCount}/${total} users actioned | Failed: ${failCount} | Reason: ${finalReason}`;

  await (message.channel as TextChannel).send(
    buildPayload(summaryTemplate, summaryVars as TemplateVars, defaultSummary)
  ).catch(() => {});

  // Hierarchy note
  if (hierarchySkipped > 0) {
    await (message.channel as TextChannel).send(
      buildPayload(errors.error_hierarchy, { count: String(hierarchySkipped) },
        `${hierarchySkipped} target(s) skipped — their role is equal to or above yours`)
    ).catch(() => {});
  }

  // Summary log
  if (!logIndividually) {
    const allIdVars: Record<string, string> = {
      ...summaryVars,
      trigger: opts.targetIds.join(", ").slice(0, 900),
    };
    const logText = applyVarsStr(actionCfg.log, allIdVars);
    await sendYamlLogCached(client, guild.id, {
      eventKey: opts.eventKey,
      vars: { description: logText || defaultSummary, ...allIdVars } as any,
      category: "mass_action",
    }).catch(() => {});
  }
}

// MASSWARN
export const masswarnCmd: Command = {
  name: "masswarn",
  aliases: [],
  usage: "@user1 @user2 ... | [reason]",
  description: "Warn multiple users at once.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "masswarn"))) return;
    const parsed = parseMassArgs(message, args);
    await runMassAction(message, client, {
      ...parsed,
      actionCfgKey:  "warn",
      eventKey:      "masswarn",
      requireMember: false,
      perform:       async () => { /* warn = case creation only */ },
      caseLabel:     () => "Warn",
    });
  },
};

// MASSFORCEWARN
export const massforcewarnCmd: Command = {
  name: "massforcewarn",
  aliases: [],
  usage: "<id1> <id2> ... | [reason]",
  description: "Warn multiple users by raw ID (user need not be in server).",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "massforcewarn"))) return;
    const parsed = parseMassArgs(message, args);
    await runMassAction(message, client, {
      ...parsed,
      actionCfgKey:  "forcewarn",
      eventKey:      "masswarn",
      requireMember: false,
      perform:       async () => { /* warn = case creation only */ },
      caseLabel:     () => "Warn",
    });
  },
};

// MASSMUTE
export const massmuteCmd: Command = {
  name: "massmute",
  aliases: [],
  usage: "@user1 @user2 ... [duration] | [reason]",
  description: "Mute multiple users at once.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "massmute"))) return;
    const cfg      = getCachedConfig(message.guild.id);
    const muteRole = (cfg.plugins?.moderation as any)?.mute_role as string | undefined;
    const ma       = getMa(message.guild.id);
    if (!muteRole) {
      return void message.reply(
        buildPayload((ma.mute as any)?.no_mute_role, {}, "❌ Mass mute failed — no mute role configured in YAML")
      );
    }
    const parsed = parseMassArgs(message, args);
    await runMassAction(message, client, {
      ...parsed,
      actionCfgKey:  "mute",
      eventKey:      "massmute",
      requireMember: true,
      perform: async (id, user, member, guild, durMs) => {
        if (!member?.moderatable) throw new Error("not moderatable");
        await member.roles.add(muteRole, parsed.reason || "mass mute");
        if (!durMs) return;
        setTimeout(() => {
          member.roles.remove(muteRole, "Mass temp mute expired").catch(() => {});
        }, durMs);
      },
      caseLabel: (dur) => dur !== "Permanent" ? `Mute (${dur})` : "Mute",
    });
  },
};

// MASSFORCEMUTE
export const massforcemuteCmd: Command = {
  name: "massforcemute",
  aliases: [],
  usage: "<id1> <id2> ... [duration] | [reason]",
  description: "Mute multiple users by raw ID.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "massforcemute"))) return;
    const cfg      = getCachedConfig(message.guild.id);
    const muteRole = (cfg.plugins?.moderation as any)?.mute_role as string | undefined;
    const ma       = getMa(message.guild.id);
    if (!muteRole) {
      return void message.reply(
        buildPayload((ma.forcemute as any)?.no_mute_role, {}, "❌ Mass forcemute failed — no mute role configured in YAML")
      );
    }
    const parsed = parseMassArgs(message, args);
    await runMassAction(message, client, {
      ...parsed,
      actionCfgKey:  "forcemute",
      eventKey:      "massmute",
      requireMember: true,
      perform: async (id, user, member, guild, durMs) => {
        if (!member) throw new Error("not in server");
        await member.roles.add(muteRole, parsed.reason || "mass forcemute");
        if (!durMs) return;
        setTimeout(() => {
          member.roles.remove(muteRole, "Mass temp forcemute expired").catch(() => {});
        }, durMs);
      },
      caseLabel: (dur) => dur !== "Permanent" ? `Mute (${dur})` : "Mute",
    });
  },
};

// MASSUNMUTE
export const massunmuteCmd: Command = {
  name: "massunmute",
  aliases: [],
  usage: "@user1 @user2 ... | [reason]",
  description: "Unmute multiple users at once.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "massunmute"))) return;
    const cfg      = getCachedConfig(message.guild.id);
    const muteRole = (cfg.plugins?.moderation as any)?.mute_role as string | undefined;
    const ma       = getMa(message.guild.id);
    if (!muteRole) {
      return void message.reply(
        buildPayload((ma.unmute as any)?.no_mute_role, {}, "❌ Mass unmute failed — no mute role configured in YAML")
      );
    }
    const parsed = parseMassArgs(message, args);
    await runMassAction(message, client, {
      ...parsed,
      actionCfgKey:  "unmute",
      eventKey:      "massunmute",
      requireMember: true,
      perform: async (id, user, member) => {
        if (!member) throw new Error("not in server");
        await member.roles.remove(muteRole, parsed.reason || "mass unmute");
        if (member.isCommunicationDisabled()) {
          await member.timeout(null, parsed.reason || "mass unmute").catch(() => {});
        }
      },
      caseLabel: () => "Unmute",
    });
  },
};

// MASSKICK
export const masskickCmd: Command = {
  name: "masskick",
  aliases: [],
  usage: "@user1 @user2 ... | [reason]",
  description: "Kick multiple users at once.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "masskick"))) return;
    const parsed = parseMassArgs(message, args);
    await runMassAction(message, client, {
      ...parsed,
      actionCfgKey:  "kick",
      eventKey:      "masskick",
      requireMember: true,
      perform: async (id, user, member) => {
        if (!member?.kickable) throw new Error("not kickable");
        await member.kick(parsed.reason || "mass kick");
      },
      caseLabel: () => "Kick",
    });
  },
};

// MASSBAN
export const massbanCmd: Command = {
  name: "massban",
  aliases: [],
  usage: "@user1 @user2 ... [duration] | [reason]",
  description: "Ban multiple users at once.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "massban"))) return;
    const parsed   = parseMassArgs(message, args);
    const cappedMs = parsed.durationMs ? Math.min(parsed.durationMs, MAX_BAN_MS) : null;
    await runMassAction(message, client, {
      ...parsed,
      durationMs:    cappedMs,
      actionCfgKey:  "ban",
      eventKey:      "massban",
      requireMember: false,
      perform: async (id, user, member, guild, durMs) => {
        const banDayDelete = (getCachedConfig(guild.id).plugins.moderation as any)?.ban_day_delete;
        const deleteMessageSeconds =
          typeof banDayDelete === "number" && banDayDelete > 0
            ? Math.min(Math.floor(banDayDelete), 7) * 86400
            : 0;
        await guild.members.ban(id, {
          reason: `[Mass Ban] ${parsed.reason || "no reason"}`,
          ...(deleteMessageSeconds > 0 ? { deleteMessageSeconds } : {}),
        });
        if (!durMs) return;
        setTimeout(() => {
          guild.members.unban(id, "Mass temp ban expired").catch(() => {});
        }, durMs);
      },
      caseLabel: (dur) => dur !== "Permanent" ? `Temp Ban (${dur})` : "Ban",
    });
  },
};

// MASSFORCEBAN
export const massforcebanCmd: Command = {
  name: "massforceban",
  aliases: [],
  usage: "<id1> <id2> ... [duration] | [reason]",
  description: "Ban multiple users by raw ID (user need not be in server).",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "massforceban"))) return;
    const parsed   = parseMassArgs(message, args);
    const cappedMs = parsed.durationMs ? Math.min(parsed.durationMs, MAX_BAN_MS) : null;
    await runMassAction(message, client, {
      ...parsed,
      durationMs:    cappedMs,
      actionCfgKey:  "forceban",
      eventKey:      "massban",
      requireMember: false,
      perform: async (id, user, member, guild, durMs) => {
        const banDayDelete = (getCachedConfig(guild.id).plugins.moderation as any)?.ban_day_delete;
        const deleteMessageSeconds =
          typeof banDayDelete === "number" && banDayDelete > 0
            ? Math.min(Math.floor(banDayDelete), 7) * 86400
            : 0;
        await guild.members.ban(id, {
          reason: `[Mass Forceban] ${parsed.reason || "no reason"}`,
          ...(deleteMessageSeconds > 0 ? { deleteMessageSeconds } : {}),
        });
        if (!durMs) return;
        setTimeout(() => {
          guild.members.unban(id, "Mass temp forceban expired").catch(() => {});
        }, durMs);
      },
      caseLabel: (dur) => dur !== "Permanent" ? `Temp Ban (${dur})` : "Ban",
    });
  },
};

// MASSUNBAN
export const massunbanCmd: Command = {
  name: "massunban",
  aliases: [],
  usage: "<id1> <id2> ... | [reason]",
  description: "Unban multiple users by raw ID.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "massunban"))) return;
    const parsed = parseMassArgs(message, args);
    await runMassAction(message, client, {
      ...parsed,
      actionCfgKey:  "unban",
      eventKey:      "massban",
      requireMember: false,
      perform: async (id, user, member, guild) => {
        await guild.members.unban(id, parsed.reason || "mass unban");
      },
      caseLabel: () => "Unban",
    });
  },
};

// Role resolver
function resolveMassRole(guild: import("discord.js").Guild, input: string): Role | null {
  const id = input.replace(/[<@&>]/g, "");
  return (
    guild.roles.cache.get(id) ??
    guild.roles.cache.find((r) => r.name.toLowerCase() === input.toLowerCase()) ??
    null
  );
}

// Mass role argument parser
// Syntax: !massrole <role> @user1 @user2 ... [| reason]
// Role must be the first argument (ID or mention or name before the first user mention)

interface MassRoleArgs {
  role: Role | null;
  targetIds: string[];
  reason: string;
  durationMs: number | null;
  durationLabel: string;
}

function parseMassRoleArgs(message: Message, guild: import("discord.js").Guild, args: string[]): MassRoleArgs {
  const pipeIdx = args.indexOf("|");
  const beforePipe = pipeIdx === -1 ? args : args.slice(0, pipeIdx);
  const afterPipe  = pipeIdx === -1 ? [] : args.slice(pipeIdx + 1);
  const reason = afterPipe.join(" ").trim();

  // First non-user arg is the role
  const roleInput = beforePipe[0] ?? "";
  const role = resolveMassRole(guild, roleInput);

  let durationMs: number | null = null;
  let durationLabel = "Permanent";
  const targetIds: string[] = [];

  for (let i = 1; i < beforePipe.length; i++) {
    const arg = beforePipe[i]!;
    const cleaned = arg.replace(/[<@!>]/g, "");
    if (/^\d{15,20}$/.test(cleaned)) {
      targetIds.push(cleaned);
    } else {
      const parsed = parseDuration(arg);
      if (parsed !== null) {
        durationMs = parsed;
        durationLabel = formatDuration(parsed);
      }
    }
  }

  message.mentions.users.forEach((u) => {
    if (!targetIds.includes(u.id)) targetIds.push(u.id);
  });

  return { role, targetIds: [...new Set(targetIds)], reason, durationMs, durationLabel };
}

// MASSROLE
export const massroleCmd: Command = {
  name: "massrole",
  aliases: [],
  usage: "<role> @user1 @user2 ... [| reason]",
  description: "Add a role to multiple members at once.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "massrole"))) return;

    const { role, targetIds, reason } = parseMassRoleArgs(message, message.guild, args);
    if (!role) return void message.reply("❌ Could not find that role. Usage: `!massrole <role> @user1 @user2 ...`");
    if (role.managed) return void message.reply("❌ That role is managed by an integration.");
    if (role.position >= message.guild.members.me!.roles.highest.position) {
      return void message.reply("❌ That role is above my highest role.");
    }
    if (targetIds.length === 0) return void message.reply("❌ No valid targets found — mention users or provide raw IDs.");

    await message.guild.members.fetch().catch(() => {});
    const finalReason = reason || "No reason provided";
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const id of targetIds) {
      const member = message.guild.members.cache.get(id);
      if (!member) { failed.push(id); continue; }
      try {
        await member.roles.add(role, `[MassRole] ${message.author.tag} — ${finalReason}`);
        succeeded.push(member.user.username);
      } catch { failed.push(member.user.username); }
    }

    await sendModLog(client, message.guild.id, {
      action: "Mass Role Add",
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: `${succeeded.length} members`, id: "" },
      reason: `Role: ${role.name} — ${finalReason}`,
      color: 0x2ecc71,
    });

    const lines = [`✅ Added **${role.name}** to **${succeeded.length}** members.`];
    if (failed.length) lines.push(`❌ Failed for ${failed.length}: ${failed.slice(0, 10).join(", ")}`);
    await message.reply(lines.join("\n"));
  },
};

// MASSREMOVEROLE
export const massremoveroleCmd: Command = {
  name: "massremoverole",
  aliases: [],
  usage: "<role> @user1 @user2 ... [| reason]",
  description: "Remove a role from multiple members at once.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "massremoverole"))) return;

    const { role, targetIds, reason } = parseMassRoleArgs(message, message.guild, args);
    if (!role) return void message.reply("❌ Could not find that role. Usage: `!massremoverole <role> @user1 @user2 ...`");
    if (role.managed) return void message.reply("❌ That role is managed by an integration.");
    if (role.position >= message.guild.members.me!.roles.highest.position) {
      return void message.reply("❌ That role is above my highest role.");
    }
    if (targetIds.length === 0) return void message.reply("❌ No valid targets found — mention users or provide raw IDs.");

    await message.guild.members.fetch().catch(() => {});
    const finalReason = reason || "No reason provided";
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const id of targetIds) {
      const member = message.guild.members.cache.get(id);
      if (!member) { failed.push(id); continue; }
      try {
        await member.roles.remove(role, `[MassRemoveRole] ${message.author.tag} — ${finalReason}`);
        succeeded.push(member.user.username);
      } catch { failed.push(member.user.username); }
    }

    await sendModLog(client, message.guild.id, {
      action: "Mass Role Remove",
      executor: { tag: message.author.tag, id: message.author.id },
      target: { tag: `${succeeded.length} members`, id: "" },
      reason: `Role: ${role.name} — ${finalReason}`,
      color: 0xe67e22,
    });

    const lines = [`✅ Removed **${role.name}** from **${succeeded.length}** members.`];
    if (failed.length) lines.push(`❌ Failed for ${failed.length}: ${failed.slice(0, 10).join(", ")}`);
    await message.reply(lines.join("\n"));
  },
};

// MASSTEMPROLE
const MASS_TEMPROLE_STORE = "massTemproles";

interface MassTempRoleRecord {
  guildId: string;
  roleId: string;
  userId: string;
  expiresAt: number;
}

export const masstemproleCmd: Command = {
  name: "masstemprole",
  aliases: [],
  usage: "<role> <duration> @user1 @user2 ... [| reason]",
  description: "Give a role to multiple members for a limited time.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "masstemprole"))) return;

    const { role, targetIds, reason, durationMs, durationLabel } = parseMassRoleArgs(message, message.guild, args);
    if (!role) return void message.reply("❌ Could not find that role. Usage: `!masstemprole <role> <duration> @user1 @user2 ...`");
    if (!durationMs) return void message.reply("❌ Please provide a valid duration (e.g. `1h`, `7d`).");
    if (role.managed) return void message.reply("❌ That role is managed by an integration.");
    if (role.position >= message.guild.members.me!.roles.highest.position) {
      return void message.reply("❌ That role is above my highest role.");
    }
    if (targetIds.length === 0) return void message.reply("❌ No valid targets found — mention users or provide raw IDs.");

    await message.guild.members.fetch().catch(() => {});
    const finalReason = reason || "No reason provided";
    const succeeded: string[] = [];
    const failed: string[] = [];
    const expiresAt = Date.now() + durationMs;

    const existing: MassTempRoleRecord[] = (await dbGet<MassTempRoleRecord[]>(MASS_TEMPROLE_STORE, message.guild.id)) ?? [];

    for (const id of targetIds) {
      const member = message.guild.members.cache.get(id);
      if (!member) { failed.push(id); continue; }
      try {
        if (!member.roles.cache.has(role.id)) {
          await member.roles.add(role, `[MassTempRole ${durationLabel}] ${message.author.tag} — ${finalReason}`);
        }
        existing.push({ guildId: message.guild.id, roleId: role.id, userId: id, expiresAt });
        succeeded.push(member.user.username);

        // Schedule expiry
        setTimeout(async () => {
          try {
            const guild = client.guilds.cache.get(message.guild!.id);
            if (!guild) return;
            const m = await guild.members.fetch(id).catch(() => null);
            if (m && m.roles.cache.has(role.id)) {
              await m.roles.remove(role.id, "Mass temp role expired");
            }
            const current = (await dbGet<MassTempRoleRecord[]>(MASS_TEMPROLE_STORE, message.guild!.id)) ?? [];
            await dbSet(MASS_TEMPROLE_STORE, message.guild!.id,
              current.filter((r) => !(r.userId === id && r.roleId === role.id && Math.abs(r.expiresAt - expiresAt) < 2000))
            );
          } catch { /* ok */ }
        }, durationMs);
      } catch { failed.push(member.user.username); }
    }

    await dbSet(MASS_TEMPROLE_STORE, message.guild.id, existing);

    const lines = [`⏱️ Gave **${role.name}** to **${succeeded.length}** members for **${durationLabel}**.\nExpires: <t:${Math.floor(expiresAt / 1000)}:F>`];
    if (failed.length) lines.push(`❌ Failed for ${failed.length}: ${failed.slice(0, 10).join(", ")}`);
    await message.reply(lines.join("\n"));
  },
};

import { Client, Message, EmbedBuilder, GuildMember } from "discord.js";
import type { Command } from "../types";
import {
  listAutoreactionRules,
  listDbRules,
  getAutoreactionRule,
  addAutoreactionRule,
  removeAutoreactionRule,
  updateAutoreactionRule,
  idExists,
  generateRuleId,
  loadYamlRules,
  checkAndSetUserCooldown,
  checkAndSetGlobalCooldown,
  type AutoreactionRule,
  type AutoreactionTriggerType,
} from "../../store/autoreaction";
import { getUserLevel } from "../../lib/yamlLevels";
import { getGuildConfig } from "../../store/guildConfig";

const VALID_TYPES: AutoreactionTriggerType[] = ["contains", "exact", "startswith", "endswith", "regex"];
const MAX_EMOJIS_DEFAULT = 10;

function makeDefaultRule(
  guildId: string,
  id: string,
  trigger_type: AutoreactionTriggerType,
  trigger: string,
  emojis: string[]
): AutoreactionRule {
  return {
    id,
    guildId,
    trigger_type,
    trigger,
    match_case: false,
    emojis,
    cooldown_seconds: 0,
    global_cooldown_seconds: 0,
    only_channels: [],
    ignore_channels: [],
    only_roles: [],
    ignore_roles: [],
    ignore_users: [],
    min_length: 0,
    max_length: 0,
    delete_after_reaction: false,
    enabled: true,
    source: "db",
  };
}

function matchesTrigger(rule: AutoreactionRule, content: string): boolean {
  const cmp = rule.match_case ? content : content.toLowerCase();
  const trig = rule.match_case ? rule.trigger : rule.trigger.toLowerCase();

  if (rule.trigger_type === "exact") {
    if (rule.trigger === "") return true;
    return cmp === trig;
  }
  if (rule.trigger_type === "contains") return cmp.includes(trig);
  if (rule.trigger_type === "startswith") return cmp.startsWith(trig);
  if (rule.trigger_type === "endswith") return cmp.endsWith(trig);
  if (rule.trigger_type === "regex") {
    try {
      const flags = rule.match_case ? "" : "i";
      return new RegExp(rule.trigger, flags).test(content);
    } catch {
      return false;
    }
  }
  return false;
}

function memberHasRole(member: GuildMember, roleIds: string[]): boolean {
  return roleIds.some((id) => member.roles.cache.has(id));
}

export async function handleAutoreaction(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;

  const guildId = message.guild.id;
  const cfg = await getGuildConfig(guildId);
  const pluginCfg: any = (cfg as any).plugins?.autoreaction ?? (cfg as any).autoreaction;

  if (pluginCfg?.enabled === false) return;
  if (pluginCfg?.ignore_self !== false && message.author.id === message.client.user?.id) return;
  if ((pluginCfg?.ignore_bots !== false) && message.author.bot) return;

  if (Array.isArray(pluginCfg?.reactions) && pluginCfg.reactions.length > 0) {
    loadYamlRules(guildId, pluginCfg.reactions);
  }

  const rules = listAutoreactionRules(guildId).filter((r) => r.enabled);
  const content = message.content;
  const channelId = message.channelId;
  const member = message.member;

  for (const rule of rules) {
    if (rule.ignore_channels.length > 0 && rule.ignore_channels.includes(channelId)) continue;
    if (rule.only_channels.length > 0 && !rule.only_channels.includes(channelId)) continue;

    if (rule.ignore_roles.length > 0 && memberHasRole(member, rule.ignore_roles)) continue;
    if (rule.only_roles.length > 0 && !memberHasRole(member, rule.only_roles)) continue;

    if (rule.ignore_users.length > 0 && rule.ignore_users.includes(message.author.id)) continue;

    if (rule.min_length > 0 && content.length < rule.min_length) continue;
    if (rule.max_length > 0 && content.length > rule.max_length) continue;

    if (!checkAndSetGlobalCooldown(guildId, rule.id, rule.global_cooldown_seconds)) continue;
    if (!checkAndSetUserCooldown(guildId, rule.id, message.author.id, rule.cooldown_seconds)) continue;

    if (!matchesTrigger(rule, content)) continue;

    for (const emoji of rule.emojis) {
      await message.react(emoji).catch(() => {});
    }

    if (rule.delete_after_reaction) {
      await message.delete().catch(() => {});
    }
  }
}

const autoreactionCmd: Command = {
  name: "autoreaction",
  aliases: ["ar"],
  usage: "<subcommand> [args]",
  description: "Automatically react to messages matching a trigger.",

  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    const userLevel = getUserLevel(message);
    if (userLevel < 50) return void message.reply("❌ You need level 50+ to manage autoreactions.");

    const sub = args[0]?.toLowerCase();
    const guildId = message.guild.id;

    const cfg = await getGuildConfig(guildId);
    const pluginCfg: any = (cfg as any).plugins?.autoreaction ?? (cfg as any).autoreaction;
    const maxEmojis: number = pluginCfg?.max_emojis_per_rule ?? MAX_EMOJIS_DEFAULT;

    if (sub === "add") {
      const type = args[1]?.toLowerCase() as AutoreactionTriggerType | undefined;
      if (!type || !VALID_TYPES.includes(type)) {
        return void message.reply(
          `❌ Usage: \`!autoreaction add <${VALID_TYPES.join("|")}> <trigger> <emoji1> [emoji2...]\``
        );
      }
      const trigger = args[2] ?? "";
      const emojis = args.slice(3);
      if (emojis.length === 0) {
        return void message.reply("❌ Provide at least one emoji.");
      }
      if (emojis.length > maxEmojis) {
        return void message.reply(`❌ Too many emojis — maximum is **${maxEmojis}** per rule.`);
      }

      const id = generateRuleId(guildId);
      const rule = makeDefaultRule(guildId, id, type, trigger, emojis);
      await addAutoreactionRule(rule);
      return void message.reply(
        `✅ Auto reaction **${trigger || "(empty)"}** added | ID: \`${id}\` | Emojis: ${emojis.join(" ")}`
      );
    }

    if (sub === "remove") {
      const id = args[1];
      if (!id) return void message.reply("❌ Usage: `!autoreaction remove <id>`");
      const rule = getAutoreactionRule(guildId, id);
      if (!rule) return void message.reply(`❌ No rule with ID \`${id}\`.`);
      if (rule.source === "yaml") return void message.reply("❌ YAML rules are read-only — remove them from your config file.");
      const removed = await removeAutoreactionRule(guildId, id);
      return void message.reply(removed ? `✅ Auto reaction \`${id}\` removed.` : `❌ No rule with ID \`${id}\`.`);
    }

    if (sub === "list") {
      const rules = listAutoreactionRules(guildId);
      if (rules.length === 0)
        return void message.reply("No auto reaction rules configured — use `!autoreaction add` to create one.");

      const lines = rules.map((r) => {
        const src = r.source === "yaml" ? " 📄" : "";
        return `**\`${r.id}\`**${src} \`${r.trigger_type}\` · \`${r.trigger || "(empty)"}\` · ${r.emojis.join(" ")} ${r.enabled ? "✅" : "❌"}`;
      });

      const chunks: string[][] = [];
      let current: string[] = [];
      for (const line of lines) {
        if (current.join("\n").length + line.length > 3800) {
          chunks.push(current);
          current = [];
        }
        current.push(line);
      }
      if (current.length) chunks.push(current);

      for (let i = 0; i < chunks.length; i++) {
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(i === 0 ? "🎭 Autoreaction Rules" : "🎭 Autoreaction Rules (cont.)")
          .setDescription(chunks[i].join("\n"))
          .setFooter({ text: `${rules.length} rule(s) total · 📄 = YAML (read-only)` });
        await (message.channel as any).send({ embeds: [embed] });
      }
      return;
    }

    if (sub === "info") {
      const id = args[1];
      if (!id) return void message.reply("❌ Usage: `!autoreaction info <id>`");
      const rule = getAutoreactionRule(guildId, id);
      if (!rule) return void message.reply(`❌ No rule with ID \`${id}\`.`);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🎭 Autoreaction Rule: ${id}`)
        .addFields(
          { name: "Source", value: rule.source === "yaml" ? "📄 YAML (read-only)" : "🗄️ Database", inline: true },
          { name: "Status", value: rule.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
          { name: "Type", value: `\`${rule.trigger_type}\``, inline: true },
          { name: "Trigger", value: rule.trigger ? `\`${rule.trigger}\`` : "(empty — matches all messages)", inline: false },
          { name: "Case Sensitive", value: rule.match_case ? "Yes" : "No", inline: true },
          { name: "Emojis", value: rule.emojis.join(" ") || "none", inline: true },
          { name: "Per-user Cooldown", value: rule.cooldown_seconds > 0 ? `${rule.cooldown_seconds}s` : "None", inline: true },
          { name: "Global Cooldown", value: rule.global_cooldown_seconds > 0 ? `${rule.global_cooldown_seconds}s` : "None", inline: true },
          { name: "Min Length", value: rule.min_length > 0 ? String(rule.min_length) : "None", inline: true },
          { name: "Max Length", value: rule.max_length > 0 ? String(rule.max_length) : "None", inline: true },
          { name: "Only Channels", value: rule.only_channels.length > 0 ? rule.only_channels.map((c) => `<#${c}>`).join(" ") : "All channels", inline: false },
          { name: "Ignore Channels", value: rule.ignore_channels.length > 0 ? rule.ignore_channels.map((c) => `<#${c}>`).join(" ") : "None", inline: false },
          { name: "Only Roles", value: rule.only_roles.length > 0 ? rule.only_roles.map((r) => `<@&${r}>`).join(" ") : "All roles", inline: false },
          { name: "Ignore Roles", value: rule.ignore_roles.length > 0 ? rule.ignore_roles.map((r) => `<@&${r}>`).join(" ") : "None", inline: false },
          { name: "Delete After Reaction", value: rule.delete_after_reaction ? "Yes" : "No", inline: true }
        );
      return void (message.channel as any).send({ embeds: [embed] });
    }

    if (sub === "enable" || sub === "disable") {
      const id = args[1];
      if (!id) return void message.reply(`❌ Usage: \`!autoreaction ${sub} <id>\``);
      const rule = getAutoreactionRule(guildId, id);
      if (!rule) return void message.reply(`❌ No rule with ID \`${id}\`.`);
      if (rule.source === "yaml") return void message.reply("❌ YAML rules are read-only.");
      const updated = await updateAutoreactionRule(guildId, id, { enabled: sub === "enable" });
      return void message.reply(updated ? `✅ Auto reaction \`${id}\` ${sub}d.` : `❌ No rule with ID \`${id}\`.`);
    }

    if (sub === "edit") {
      const field = args[1]?.toLowerCase();
      const id = args[2];

      if (!field || !id) {
        return void message.reply(
          "❌ Usage:\n" +
          "`!autoreaction edit emojis <id> <emoji1> [emoji2...]`\n" +
          "`!autoreaction edit trigger <id> <new_trigger>`\n" +
          "`!autoreaction edit type <id> <new_type>`"
        );
      }

      const rule = getAutoreactionRule(guildId, id);
      if (!rule) return void message.reply(`❌ No rule with ID \`${id}\`.`);
      if (rule.source === "yaml") return void message.reply("❌ YAML rules are read-only.");

      if (field === "emojis") {
        const emojis = args.slice(3);
        if (emojis.length === 0) return void message.reply("❌ Provide at least one emoji.");
        if (emojis.length > maxEmojis) return void message.reply(`❌ Too many emojis — maximum is **${maxEmojis}** per rule.`);
        await updateAutoreactionRule(guildId, id, { emojis });
        return void message.reply(`✅ Rule \`${id}\` emojis updated to ${emojis.join(" ")}.`);
      }

      if (field === "trigger") {
        const trigger = args.slice(3).join(" ");
        await updateAutoreactionRule(guildId, id, { trigger });
        return void message.reply(`✅ Rule \`${id}\` trigger updated to \`${trigger || "(empty)"}\`.`);
      }

      if (field === "type") {
        const type = args[3]?.toLowerCase() as AutoreactionTriggerType | undefined;
        if (!type || !VALID_TYPES.includes(type)) {
          return void message.reply(`❌ Valid types: \`${VALID_TYPES.join("`, `")}\``);
        }
        await updateAutoreactionRule(guildId, id, { trigger_type: type });
        return void message.reply(`✅ Rule \`${id}\` type updated to \`${type}\`.`);
      }

      return void message.reply("❌ Unknown edit field. Use `emojis`, `trigger`, or `type`.");
    }

    if (sub === "cooldown") {
      const id = args[1];
      const seconds = parseInt(args[2] ?? "");
      if (!id || isNaN(seconds) || seconds < 0) {
        return void message.reply("❌ Usage: `!autoreaction cooldown <id> <seconds>`");
      }
      const rule = getAutoreactionRule(guildId, id);
      if (!rule) return void message.reply(`❌ No rule with ID \`${id}\`.`);
      if (rule.source === "yaml") return void message.reply("❌ YAML rules are read-only.");
      await updateAutoreactionRule(guildId, id, { cooldown_seconds: seconds });
      return void message.reply(`✅ Cooldown for \`${id}\` set to **${seconds}** seconds.`);
    }

    if (sub === "globalcooldown") {
      const id = args[1];
      const seconds = parseInt(args[2] ?? "");
      if (!id || isNaN(seconds) || seconds < 0) {
        return void message.reply("❌ Usage: `!autoreaction globalcooldown <id> <seconds>`");
      }
      const rule = getAutoreactionRule(guildId, id);
      if (!rule) return void message.reply(`❌ No rule with ID \`${id}\`.`);
      if (rule.source === "yaml") return void message.reply("❌ YAML rules are read-only.");
      await updateAutoreactionRule(guildId, id, { global_cooldown_seconds: seconds });
      return void message.reply(`✅ Global cooldown for \`${id}\` set to **${seconds}** seconds.`);
    }

    if (sub === "addchannel") {
      const id = args[1];
      const channelArg = args[2];
      if (!id || !channelArg) return void message.reply("❌ Usage: `!autoreaction addchannel <id> <#channel>`");
      const channelId = channelArg.replace(/[<#>]/g, "");
      const rule = getAutoreactionRule(guildId, id);
      if (!rule) return void message.reply(`❌ No rule with ID \`${id}\`.`);
      if (rule.source === "yaml") return void message.reply("❌ YAML rules are read-only.");
      if (rule.only_channels.includes(channelId)) return void message.reply("❌ Channel already in the list.");
      await updateAutoreactionRule(guildId, id, { only_channels: [...rule.only_channels, channelId] });
      return void message.reply(`✅ Channel <#${channelId}> added to rule \`${id}\` (only_channels).`);
    }

    if (sub === "removechannel") {
      const id = args[1];
      const channelArg = args[2];
      if (!id || !channelArg) return void message.reply("❌ Usage: `!autoreaction removechannel <id> <#channel>`");
      const channelId = channelArg.replace(/[<#>]/g, "");
      const rule = getAutoreactionRule(guildId, id);
      if (!rule) return void message.reply(`❌ No rule with ID \`${id}\`.`);
      if (rule.source === "yaml") return void message.reply("❌ YAML rules are read-only.");
      await updateAutoreactionRule(guildId, id, { only_channels: rule.only_channels.filter((c) => c !== channelId) });
      return void message.reply(`✅ Channel <#${channelId}> removed from rule \`${id}\`.`);
    }

    if (sub === "addrole") {
      const id = args[1];
      const roleArg = args[2];
      if (!id || !roleArg) return void message.reply("❌ Usage: `!autoreaction addrole <id> <@role>`");
      const roleId = roleArg.replace(/[<@&>]/g, "");
      const rule = getAutoreactionRule(guildId, id);
      if (!rule) return void message.reply(`❌ No rule with ID \`${id}\`.`);
      if (rule.source === "yaml") return void message.reply("❌ YAML rules are read-only.");
      if (rule.only_roles.includes(roleId)) return void message.reply("❌ Role already in the list.");
      await updateAutoreactionRule(guildId, id, { only_roles: [...rule.only_roles, roleId] });
      return void message.reply(`✅ Role <@&${roleId}> added to rule \`${id}\` (only_roles).`);
    }

    if (sub === "removerole") {
      const id = args[1];
      const roleArg = args[2];
      if (!id || !roleArg) return void message.reply("❌ Usage: `!autoreaction removerole <id> <@role>`");
      const roleId = roleArg.replace(/[<@&>]/g, "");
      const rule = getAutoreactionRule(guildId, id);
      if (!rule) return void message.reply(`❌ No rule with ID \`${id}\`.`);
      if (rule.source === "yaml") return void message.reply("❌ YAML rules are read-only.");
      await updateAutoreactionRule(guildId, id, { only_roles: rule.only_roles.filter((r) => r !== roleId) });
      return void message.reply(`✅ Role <@&${roleId}> removed from rule \`${id}\`.`);
    }

    if (sub === "setminlength") {
      const id = args[1];
      const length = parseInt(args[2] ?? "");
      if (!id || isNaN(length) || length < 0) {
        return void message.reply("❌ Usage: `!autoreaction setminlength <id> <length>`");
      }
      const rule = getAutoreactionRule(guildId, id);
      if (!rule) return void message.reply(`❌ No rule with ID \`${id}\`.`);
      if (rule.source === "yaml") return void message.reply("❌ YAML rules are read-only.");
      await updateAutoreactionRule(guildId, id, { min_length: length });
      return void message.reply(`✅ Min length for \`${id}\` set to **${length}**.`);
    }

    if (sub === "setmaxlength") {
      const id = args[1];
      const length = parseInt(args[2] ?? "");
      if (!id || isNaN(length) || length < 0) {
        return void message.reply("❌ Usage: `!autoreaction setmaxlength <id> <length>`");
      }
      const rule = getAutoreactionRule(guildId, id);
      if (!rule) return void message.reply(`❌ No rule with ID \`${id}\`.`);
      if (rule.source === "yaml") return void message.reply("❌ YAML rules are read-only.");
      await updateAutoreactionRule(guildId, id, { max_length: length });
      return void message.reply(`✅ Max length for \`${id}\` set to **${length}** (0 = unlimited).`);
    }

    const helpEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🎭 Autoreaction — Subcommands")
      .setDescription(
        "**Management**\n" +
        "`!autoreaction add <type> <trigger> <emojis...>` — create a rule\n" +
        "`!autoreaction remove <id>` — delete a rule\n" +
        "`!autoreaction list` — list all rules\n" +
        "`!autoreaction info <id>` — view rule details\n" +
        "`!autoreaction enable/disable <id>` — toggle a rule\n\n" +
        "**Editing**\n" +
        "`!autoreaction edit emojis <id> <emojis...>` — change emojis\n" +
        "`!autoreaction edit trigger <id> <text>` — change trigger text\n" +
        "`!autoreaction edit type <id> <type>` — change trigger type\n\n" +
        "**Cooldowns**\n" +
        "`!autoreaction cooldown <id> <seconds>` — per-user cooldown\n" +
        "`!autoreaction globalcooldown <id> <seconds>` — rule-wide cooldown\n\n" +
        "**Filters**\n" +
        "`!autoreaction addchannel/removechannel <id> <#ch>` — channel filter\n" +
        "`!autoreaction addrole/removerole <id> <@role>` — role filter\n" +
        "`!autoreaction setminlength/setmaxlength <id> <n>` — length filter\n\n" +
        "**Trigger Types:** `contains` · `exact` · `startswith` · `endswith` · `regex`"
      );
    return void (message.channel as any).send({ embeds: [helpEmbed] });
  },
};

export default autoreactionCmd;

import { Client, Message, EmbedBuilder, TextChannel } from "discord.js";
import type { Command } from "../types";
import {
  getAutocleanRule, listAutocleanRules, setAutocleanRule,
  removeAutocleanRule, updateAutocleanRule, allAutocleanRules,
  type AutocleanMode, type AutocleanRule,
} from "../../store/autoclean";
import { getUserLevel } from "../../lib/yamlLevels";
import { logger } from "../../../lib/logger";
import { getGuildConfig } from "../../store/guildConfig";
import { buildPayload } from "../../lib/msgTemplate";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1_000;

// Helpers
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function interp(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([\w.]+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

function resolveChannel(mention: string | undefined, fallback: string): string {
  if (!mention) return fallback;
  return mention.replace(/[<#>]/g, "");
}

// Filter
function shouldDelete(m: any, rule: AutocleanRule): boolean {
  if (rule.ignorePinned && m.pinned) return false;
  if (rule.ignoreBots && m.author.bot) return false;
  if (rule.ignoreRoles.some((rid) => m.member?.roles.cache.has(rid))) return false;
  if (rule.ignoreUsers.includes(m.author.id)) return false;
  if (rule.onlyBots && !m.author.bot) return false;
  if (rule.onlyImages && m.attachments.size === 0) return false;
  if (rule.onlyText && m.attachments.size > 0) return false;
  if (rule.minLength > 0 && m.content.length < rule.minLength) return false;
  return true;
}

// Bulk delete with 14-day fallback
interface DeleteResult { deleted: number; failed: number; oldCount: number; }

async function bulkDeleteSafe(
  channel: TextChannel,
  messages: any[],
  delaySeconds: number,
): Promise<DeleteResult> {
  const now = Date.now();
  const recent = messages.filter((m) => now - m.createdTimestamp < FOURTEEN_DAYS_MS);
  const old    = messages.filter((m) => now - m.createdTimestamp >= FOURTEEN_DAYS_MS);

  let deleted = 0;
  let failed  = 0;

  // Bulk delete recent messages (up to 100 per call)
  for (let i = 0; i < recent.length; i += 100) {
    const batch = recent.slice(i, i + 100);
    try {
      if (batch.length === 1) {
        await batch[0]!.delete();
      } else {
        await channel.bulkDelete(batch, true);
      }
      deleted += batch.length;
    } catch {
      failed += batch.length;
    }
    if (i + 100 < recent.length) await sleep(500);
  }

  // Individual delete for old messages (>14 days — Discord restriction)
  if (old.length > 0) {
    logger.warn(
      { channelId: channel.id, count: old.length },
      "Autoclean: messages >14 days require individual deletion (slower)",
    );
  }
  for (let i = 0; i < old.length; i++) {
    try {
      await old[i]!.delete();
      deleted++;
    } catch { failed++; }
    if (delaySeconds > 0 && i < old.length - 1) await sleep(delaySeconds * 1_000);
  }

  return { deleted, failed, oldCount: old.length };
}

// Purge functions
async function purgeInterval(channel: TextChannel, rule: AutocleanRule): Promise<DeleteResult> {
  const messages = await channel.messages.fetch({ limit: 100 });
  const toDelete = [...messages.values()].filter((m) => shouldDelete(m, rule));
  return bulkDeleteSafe(channel, toDelete, rule.delaySeconds);
}

async function purgeKeepX(channel: TextChannel, rule: AutocleanRule): Promise<DeleteResult> {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted   = [...messages.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  // Keep the rule.value most-recent messages (by total position); delete eligible overflow
  const toDelete = sorted.slice(rule.value).filter((m) => shouldDelete(m, rule));
  return bulkDeleteSafe(channel, toDelete, rule.delaySeconds);
}

async function purgeMaxAge(channel: TextChannel, rule: AutocleanRule): Promise<DeleteResult> {
  const messages  = await channel.messages.fetch({ limit: 100 });
  const maxAgeMs  = rule.value * 1_000;
  const now       = Date.now();
  const toDelete  = [...messages.values()].filter(
    (m) => shouldDelete(m, rule) && now - m.createdTimestamp > maxAgeMs,
  );
  return bulkDeleteSafe(channel, toDelete, rule.delaySeconds);
}

// Scheduler
let schedulerClient: Client | null = null;

export function startAutocleanScheduler(client: Client): void {
  schedulerClient = client;
  // interval: checked every 10 s; keepx/maxage: checked every 60 s
  setInterval(() => runCycle("interval").catch(() => {}), 10_000);
  setInterval(() => runCycle("keepx").catch(() => {}),    60_000);
  setInterval(() => runCycle("maxage").catch(() => {}),   60_000);
}

async function runCycle(mode: AutocleanMode): Promise<void> {
  if (!schedulerClient) return;
  const rules = allAutocleanRules().filter((r) => r.enabled && r.mode === mode);

  for (const rule of rules) {
    try {
      const channel = schedulerClient.channels.cache.get(rule.channelId) as TextChannel | undefined;
      if (!channel) continue;

      if (mode === "interval") {
        const intervalMs = rule.value * 1_000;
        if (rule.lastRun && Date.now() - rule.lastRun < intervalMs) continue;
        const res = await purgeInterval(channel, rule);
        await updateAutocleanRule(rule.guildId, rule.channelId, { lastRun: Date.now() });
        if (res.deleted > 0) await postRunLog(rule, channel, res, mode);
      } else if (mode === "keepx") {
        const res = await purgeKeepX(channel, rule);
        if (res.deleted > 0) await postRunLog(rule, channel, res, mode);
      } else {
        const res = await purgeMaxAge(channel, rule);
        if (res.deleted > 0) await postRunLog(rule, channel, res, mode);
      }
    } catch (err) {
      logger.warn({ err, channelId: rule.channelId }, "Autoclean cycle error");
    }
  }
}

async function postRunLog(
  rule: AutocleanRule,
  channel: TextChannel,
  res: DeleteResult,
  mode: string,
): Promise<void> {
  try {
    const cfg      = await getGuildConfig(rule.guildId);
    const acCfg    = (cfg.plugins?.autoclean as any) ?? {};
    const msgs     = acCfg.messages ?? {};
    const logChId: string | undefined = acCfg.log_channel;
    if (!logChId) return;

    const logCh = channel.guild.channels.cache.get(logChId) as TextChannel | undefined;
    if (!logCh) return;

    const vars: Record<string, string> = {
      channel:         `<#${rule.channelId}>`,
      "channel.id":    rule.channelId,
      "channel.mention": `<#${rule.channelId}>`,
      trigger:         mode,
      count:           String(res.deleted),
      failed:          String(res.failed),
      expires_at:      String(res.oldCount),
    };

    const template = msgs["autoclean_ran"];
    const fallback = `🧹 Autoclean | <#${rule.channelId}> | Mode: ${mode} | Deleted: ${res.deleted}`;
    const payload  = buildPayload(template, vars, interp(fallback, vars));
    await logCh.send(payload).catch(() => {});
  } catch { /* ignore log errors */ }
}

// YAML config reader (used by !autoclean now)
async function getMsgPayload(
  guildId: string,
  key: string,
  vars: Record<string, string>,
  fallback: string,
) {
  try {
    const cfg      = await getGuildConfig(guildId);
    const msgs     = (cfg.plugins?.autoclean as any)?.messages ?? {};
    const template = msgs[key];
    return buildPayload(template, vars, interp(fallback, vars));
  } catch {
    return { content: interp(fallback, vars) };
  }
}

// Command
const autocleanCmd: Command = {
  name: "autoclean",
  aliases: [],
  usage: "<subcommand> [args]",
  description: "Configure automatic channel cleanup rules.",

  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;
    const userLevel = getUserLevel(message);
    if (userLevel < 50) return void message.reply("❌ You need level 50+ to manage autoclean.");

    const sub       = args[0]?.toLowerCase();
    const guildId   = message.guild.id;
    const channelId = resolveChannel(args[1], message.channel.id);

    // add
    if (sub === "add") {
      const mode  = args[2]?.toLowerCase() as AutocleanMode | undefined;
      const value = Number(args[3]);

      if (!mode || !["interval", "keepx", "maxage"].includes(mode) || isNaN(value) || value <= 0) {
        return void message.reply(
          "❌ Usage: `!autoclean add <#channel> <interval|keepx|maxage> <value>`\n" +
          "Value = seconds for interval/maxage, message count for keepx.",
        );
      }

      if (getAutocleanRule(guildId, channelId)) {
        return void message.reply("❌ A rule already exists for that channel. Use `!autoclean remove` first.");
      }

      await setAutocleanRule({
        channelId, guildId, mode, value, enabled: true,
        delaySeconds: 0, ignorePinned: true, ignoreBots: false,
        ignoreRoles: [], ignoreUsers: [],
        onlyBots: false, onlyImages: false, onlyText: false, minLength: 0,
      });

      const vars: Record<string, string> = {
        channel:  `<#${channelId}>`, "channel.id": channelId,
        "channel.mention": `<#${channelId}>`,
        trigger:  mode,
        reason:   String(value),
        mod:      message.author.tag,
        timestamp: new Date().toLocaleString(),
      };
      const payload = await getMsgPayload(
        guildId, "autoclean_added", vars,
        `✅ Autoclean rule added for <#${channelId}> — **${mode}** (${value}).`,
      );
      return void message.reply(payload);
    }

    // remove
    if (sub === "remove") {
      const removed = await removeAutocleanRule(guildId, channelId);
      if (!removed) {
        const payload = await getMsgPayload(
          guildId, "autoclean_not_found", { channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>` },
          "❌ No autoclean rule found for that channel.",
        );
        return void message.reply(payload);
      }
      const vars: Record<string, string> = {
        channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>`,
        mod: message.author.tag, timestamp: new Date().toLocaleString(),
      };
      const payload = await getMsgPayload(guildId, "autoclean_removed", vars, `✅ Autoclean rule removed from <#${channelId}>.`);
      return void message.reply(payload);
    }

    // list
    if (sub === "list") {
      const rules = listAutocleanRules(guildId);
      if (rules.length === 0) {
        const payload = await getMsgPayload(guildId, "autoclean_list_empty", {}, "No autoclean rules configured.");
        return void message.reply(payload);
      }
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🧹 Autoclean Rules")
        .setDescription(
          rules.map((r) => {
            const label =
              r.mode === "keepx"
                ? `keep ${r.value} msgs`
                : r.mode === "interval"
                ? `every ${r.value}s`
                : `maxage ${r.value}s`;
            const filters: string[] = [];
            if (r.ignorePinned) filters.push("pin✓");
            if (r.ignoreBots)   filters.push("bots✓");
            if (r.onlyBots)     filters.push("bots-only");
            if (r.onlyText)     filters.push("text-only");
            if (r.onlyImages)   filters.push("img-only");
            if (r.minLength > 0) filters.push(`len≥${r.minLength}`);
            const filterStr = filters.length ? ` [${filters.join(", ")}]` : "";
            return `<#${r.channelId}> — **${r.mode}** (${label})${filterStr} — ${r.enabled ? "✅" : "❌ disabled"}`;
          }).join("\n"),
        );
      return void message.channel.send({ embeds: [embed] });
    }

    // info
    if (sub === "info") {
      const rule = getAutocleanRule(guildId, channelId);
      if (!rule) {
        const payload = await getMsgPayload(
          guildId, "autoclean_not_found", { channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>` },
          "❌ No autoclean rule found for that channel.",
        );
        return void message.reply(payload);
      }

      const modeLabel =
        rule.mode === "keepx"    ? `keep **${rule.value}** most recent messages` :
        rule.mode === "interval" ? `wipe every **${rule.value}s**` :
                                   `delete messages older than **${rule.value}s**`;

      const embed = new EmbedBuilder()
        .setColor(rule.enabled ? 0x57f287 : 0xed4245)
        .setTitle(`🧹 Autoclean — <#${channelId}>`)
        .addFields(
          { name: "Mode",          value: rule.mode,     inline: true },
          { name: "Value",         value: modeLabel,     inline: true },
          { name: "Status",        value: rule.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
          { name: "Delay",         value: `${rule.delaySeconds}s`,  inline: true },
          { name: "Ignore Pinned", value: String(rule.ignorePinned), inline: true },
          { name: "Ignore Bots",   value: String(rule.ignoreBots),   inline: true },
          { name: "Only Bots",     value: String(rule.onlyBots),     inline: true },
          { name: "Only Images",   value: String(rule.onlyImages),   inline: true },
          { name: "Only Text",     value: String(rule.onlyText),     inline: true },
          { name: "Min Length",    value: rule.minLength > 0 ? String(rule.minLength) : "off", inline: true },
          { name: "Ignore Roles",  value: rule.ignoreRoles.length  ? rule.ignoreRoles.map((r) => `<@&${r}>`).join(", ")  : "none", inline: false },
          { name: "Ignore Users",  value: rule.ignoreUsers.length  ? rule.ignoreUsers.map((u) => `<@${u}>`).join(", ")   : "none", inline: false },
        );
      return void message.channel.send({ embeds: [embed] });
    }

    // enable / disable
    if (sub === "enable" || sub === "disable") {
      const enabled = sub === "enable";
      const updated = await updateAutocleanRule(guildId, channelId, { enabled });
      if (!updated) {
        const payload = await getMsgPayload(
          guildId, "autoclean_not_found", { channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>` },
          "❌ No autoclean rule found for that channel.",
        );
        return void message.reply(payload);
      }
      const msgKey = enabled ? "autoclean_enabled" : "autoclean_disabled";
      const vars   = { channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>` };
      const payload = await getMsgPayload(
        guildId, msgKey, vars,
        `✅ Autoclean ${sub}d for <#${channelId}>.`,
      );
      return void message.reply(payload);
    }

    // setdelay
    if (sub === "setdelay") {
      const seconds = Number(args[2]);
      if (isNaN(seconds) || seconds < 0) {
        return void message.reply("❌ Usage: `!autoclean setdelay <#channel> <seconds>`");
      }
      const updated = await updateAutocleanRule(guildId, channelId, { delaySeconds: seconds });
      if (!updated) return void message.reply("❌ No rule found for that channel.");
      const vars    = { channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>` };
      const payload = await getMsgPayload(guildId, "autoclean_updated", vars, `✅ Delay set to **${seconds}s** for <#${channelId}>.`);
      return void message.reply(payload);
    }

    // setignorepinned
    if (sub === "setignorepinned") {
      const val = args[2]?.toLowerCase() !== "false";
      const updated = await updateAutocleanRule(guildId, channelId, { ignorePinned: val });
      if (!updated) return void message.reply("❌ No rule found for that channel.");
      const vars    = { channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>` };
      const payload = await getMsgPayload(guildId, "autoclean_updated", vars, `✅ Ignore pinned set to \`${val}\` for <#${channelId}>.`);
      return void message.reply(payload);
    }

    // setignorebots
    if (sub === "setignorebots") {
      const val = args[2]?.toLowerCase() !== "false";
      const updated = await updateAutocleanRule(guildId, channelId, { ignoreBots: val });
      if (!updated) return void message.reply("❌ No rule found for that channel.");
      const vars    = { channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>` };
      const payload = await getMsgPayload(guildId, "autoclean_updated", vars, `✅ Ignore bots set to \`${val}\` for <#${channelId}>.`);
      return void message.reply(payload);
    }

    // ignorerole
    if (sub === "ignorerole") {
      const roleId = message.mentions.roles.first()?.id ?? args[2]?.replace(/[<@&>]/g, "");
      if (!roleId) return void message.reply("❌ Usage: `!autoclean ignorerole <#channel> <@role>`");
      const rule = getAutocleanRule(guildId, channelId);
      if (!rule) return void message.reply("❌ No rule found for that channel.");
      if (rule.ignoreRoles.includes(roleId)) return void message.reply("❌ Role is already on the ignore list.");
      await updateAutocleanRule(guildId, channelId, { ignoreRoles: [...rule.ignoreRoles, roleId] });
      const vars    = { channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>` };
      const payload = await getMsgPayload(guildId, "autoclean_updated", vars, `✅ Role <@&${roleId}> added to ignore list for <#${channelId}>.`);
      return void message.reply(payload);
    }

    // unignorerole
    if (sub === "unignorerole") {
      const roleId = message.mentions.roles.first()?.id ?? args[2]?.replace(/[<@&>]/g, "");
      if (!roleId) return void message.reply("❌ Usage: `!autoclean unignorerole <#channel> <@role>`");
      const rule = getAutocleanRule(guildId, channelId);
      if (!rule) return void message.reply("❌ No rule found for that channel.");
      if (!rule.ignoreRoles.includes(roleId)) return void message.reply("❌ Role is not on the ignore list.");
      await updateAutocleanRule(guildId, channelId, { ignoreRoles: rule.ignoreRoles.filter((r) => r !== roleId) });
      const vars    = { channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>` };
      const payload = await getMsgPayload(guildId, "autoclean_updated", vars, `✅ Role <@&${roleId}> removed from ignore list for <#${channelId}>.`);
      return void message.reply(payload);
    }

    // ignoreuser
    if (sub === "ignoreuser") {
      const userId = message.mentions.users.first()?.id ?? args[2]?.replace(/[<@!>]/g, "");
      if (!userId) return void message.reply("❌ Usage: `!autoclean ignoreuser <#channel> <@user>`");
      const rule = getAutocleanRule(guildId, channelId);
      if (!rule) return void message.reply("❌ No rule found for that channel.");
      if (rule.ignoreUsers.includes(userId)) return void message.reply("❌ User is already on the ignore list.");
      await updateAutocleanRule(guildId, channelId, { ignoreUsers: [...rule.ignoreUsers, userId] });
      const vars    = { channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>` };
      const payload = await getMsgPayload(guildId, "autoclean_updated", vars, `✅ User <@${userId}> added to ignore list for <#${channelId}>.`);
      return void message.reply(payload);
    }

    // unignoreuser
    if (sub === "unignoreuser") {
      const userId = message.mentions.users.first()?.id ?? args[2]?.replace(/[<@!>]/g, "");
      if (!userId) return void message.reply("❌ Usage: `!autoclean unignoreuser <#channel> <@user>`");
      const rule = getAutocleanRule(guildId, channelId);
      if (!rule) return void message.reply("❌ No rule found for that channel.");
      if (!rule.ignoreUsers.includes(userId)) return void message.reply("❌ User is not on the ignore list.");
      await updateAutocleanRule(guildId, channelId, { ignoreUsers: rule.ignoreUsers.filter((u) => u !== userId) });
      const vars    = { channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>` };
      const payload = await getMsgPayload(guildId, "autoclean_updated", vars, `✅ User <@${userId}> removed from ignore list for <#${channelId}>.`);
      return void message.reply(payload);
    }

    // setminlength
    if (sub === "setminlength") {
      const len = Number(args[2]);
      if (isNaN(len) || len < 0) return void message.reply("❌ Usage: `!autoclean setminlength <#channel> <number>`");
      const updated = await updateAutocleanRule(guildId, channelId, { minLength: len });
      if (!updated) return void message.reply("❌ No rule found for that channel.");
      const vars    = { channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>` };
      const label   = len === 0 ? "disabled" : `messages shorter than **${len}** chars are protected`;
      const payload = await getMsgPayload(guildId, "autoclean_updated", vars, `✅ Min length set to \`${len}\` for <#${channelId}> (${label}).`);
      return void message.reply(payload);
    }

    // now
    if (sub === "now") {
      const rule = getAutocleanRule(guildId, channelId);
      if (!rule) {
        const payload = await getMsgPayload(
          guildId, "autoclean_not_found", { channel: `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>` },
          "❌ No autoclean rule for that channel.",
        );
        return void message.reply(payload);
      }

      const channel = message.guild.channels.cache.get(channelId) as TextChannel | undefined;
      if (!channel) return void message.reply("❌ Channel not found.");

      await message.reply("🧹 Running cleanup…");

      let res: DeleteResult;
      if (rule.mode === "interval")     res = await purgeInterval(channel, rule);
      else if (rule.mode === "keepx")   res = await purgeKeepX(channel, rule);
      else                               res = await purgeMaxAge(channel, rule);

      const vars: Record<string, string> = {
        channel:  `<#${channelId}>`, "channel.id": channelId, "channel.mention": `<#${channelId}>`,
        count:    String(res.deleted),
        trigger:  rule.mode,
        mod:      message.author.tag,
        timestamp: new Date().toLocaleString(),
      };

      if (res.deleted === 0) {
        const payload = await getMsgPayload(guildId, "autoclean_now_empty", vars, `✅ No messages to delete in <#${channelId}>.`);
        return void message.channel.send(payload);
      }

      const payload = await getMsgPayload(
        guildId, "autoclean_now_success", vars,
        `✅ Cleanup complete in <#${channelId}> — deleted **${res.deleted}** message${res.deleted !== 1 ? "s" : ""}.`,
      );
      return void message.channel.send(payload);
    }

    // help
    return void message.reply(
      "**Autoclean subcommands:**\n" +
      "`add` `remove` `list` `info` `enable` `disable`\n" +
      "`setdelay` `setignorepinned` `setignorebots`\n" +
      "`ignorerole` `unignorerole` `ignoreuser` `unignoreuser`\n" +
      "`setminlength` `now`",
    );
  },
};

export default autocleanCmd;

import { Client, Message, TextChannel } from "discord.js";
import type { Command } from "../types";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { getGuildConfig } from "../../store/guildConfig";
import { sendYamlMessage, buildVars } from "../../lib/yamlFormatter";
import {
  getRaidState,
  setRaidState,
  deactivateRaidMode,
  activateRaidMode,
  lockChannels,
} from "../../handlers/antiraidHandler";
import type { AntiRaidYamlConfig } from "../../handlers/antiraidHandler";

// !raidmode on|off|status
export const raidmodeCmd: Command = {
  name: "raidmode",
  aliases: [],
  usage: "<on|off|status>",
  description: "Manually activate, deactivate, or check the status of raid mode.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;
    if (!(await checkYamlLevelAsync(message, "raidmode"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const sub = (args[0] ?? "").toLowerCase();
    if (!["on", "off", "status"].includes(sub)) {
      return void message.reply(
        "❌ Usage: `!raidmode on`, `!raidmode off`, or `!raidmode status`"
      );
    }

    const guild = message.guild;
    const fullCfg = await getGuildConfig(guild.id);
    const cfg = ((fullCfg?.plugins as any)?.antiraid ?? {}) as AntiRaidYamlConfig;
    const msgs = cfg.messages ?? {};

    if (sub === "on") {
      const state = await getRaidState(guild.id);
      if (state.active) {
        const reply = msgs.raidmode_already_on ?? "⚠️ Raid mode is already active.";
        return void message.reply(reply);
      }

      // Lock channels
      const lockedIds =
        cfg.lock_during_raid !== false ? await lockChannels(guild, cfg, msgs) : [];

      await setRaidState(guild.id, {
        active: true,
        activatedAt: Date.now(),
        activatedBy: message.author.tag,
        lockedChannels: lockedIds,
        actionedCount: 0,
      });

      const vars = buildVars({
        mod: message.author.tag,
        "mod.mention": `<@${message.author.id}>`,
        count: String(lockedIds.length),
        trigger: String(cfg.auto_unlock_minutes ?? 10),
      });

      // Post raidmode_enabled to alert channel
      const alertChId = cfg.alert_channel;
      if (alertChId && msgs.raidmode_enabled) {
        const ch = guild.channels.cache.get(alertChId) as TextChannel | undefined;
        if (ch?.isTextBased()) {
          await sendYamlMessage(ch, msgs.raidmode_enabled, vars).catch(() => {});
        }
      }

      // Start auto-unlock timer (reuse activateRaidMode's timer logic via the handler)
      const autoMin = cfg.auto_unlock_minutes ?? 10;
      if (autoMin > 0) {
        setTimeout(() => {
          deactivateRaidMode(client, guild.id, "auto").catch(() => {});
        }, autoMin * 60_000);
      }

      await message.reply(
        `🚨 **Raid mode activated** by ${message.author.tag}.\n` +
          (lockedIds.length > 0
            ? `Locked **${lockedIds.length}** channel(s).`
            : "No channels locked (none configured).")
      );
    } else if (sub === "off") {
      const state = await getRaidState(guild.id);
      if (!state.active) {
        const reply = msgs.raidmode_already_off ?? "⚠️ Raid mode is not currently active.";
        return void message.reply(reply);
      }

      await deactivateRaidMode(client, guild.id, "manual", message.author.tag);

      const alertChId = cfg.alert_channel;
      if (alertChId && msgs.raidmode_disabled) {
        const ch = guild.channels.cache.get(alertChId) as TextChannel | undefined;
        if (ch?.isTextBased()) {
          await sendYamlMessage(
            ch,
            msgs.raidmode_disabled,
            buildVars({
              mod: message.author.tag,
              "mod.mention": `<@${message.author.id}>`,
              count: String(state.lockedChannels.length),
            })
          ).catch(() => {});
        }
      }

      await message.reply("✅ **Raid mode deactivated.** Channels unlocked.");
    } else if (sub === "status") {
      const state = await getRaidState(guild.id);

      if (state.active) {
        const durationMin = state.activatedAt
          ? Math.round((Date.now() - state.activatedAt) / 60000)
          : 0;
        const vars = buildVars({
          duration: String(durationMin),
          count: String(state.actionedCount),
        });

        if (msgs.raidmode_status_on) {
          await sendYamlMessage(
            message.channel as TextChannel,
            msgs.raidmode_status_on,
            vars
          ).catch(() => {});
        } else {
          await message.reply(
            `🔴 Raid mode is **ACTIVE**. ` +
              `Active for **${durationMin}** minute(s). ` +
              `Members actioned: **${state.actionedCount}**.`
          );
        }
      } else {
        if (msgs.raidmode_status_off) {
          await sendYamlMessage(
            message.channel as TextChannel,
            msgs.raidmode_status_off,
            buildVars({})
          ).catch(() => {});
        } else {
          await message.reply("🟢 Raid mode is **INACTIVE**.");
        }
      }
    }
  },
};

import { Client, Message } from "discord.js";
import type { Command } from "../types";
import { resolveTarget } from "../../lib/resolveUser";
import { checkYamlLevelAsync } from "../../lib/yamlLevels";
import { runModnick, ModnickConfig } from "../../lib/modnick";
import { getGuildConfig } from "../../store/guildConfig";
import { buildPayload } from "../../lib/msgTemplate";

const modnickCmd: Command = {
  name: "modnick",
  aliases: ["mn"],
  usage: "@user",
  description: "Manually re-check a user's nickname against all enabled modnick rules and apply a change if any rule is violated.",
  async execute(message: Message, args: string[], client: Client) {
    if (!message.guild) return;

    if (!(await checkYamlLevelAsync(message, "modnick"))) {
      return void message.reply("❌ You don't have permission to use this command.");
    }

    const target = await resolveTarget(message, args);
    if (!target) return void message.reply("❌ Could not find that user.");
    if (!target.member) return void message.reply("❌ That user is not in this server.");

    const cfg = await getGuildConfig(message.guild.id);
    const mcfg = (cfg.plugins?.modnick as ModnickConfig | undefined) ?? {};

    if (!mcfg.enabled) {
      return void message.reply("⚙️ The modnick plugin is not enabled in this server's YAML config.");
    }

    // No nickname set
    if (!target.member.nickname) {
      const vars = {
        user: `<@${target.user.id}>`,
        "user.id": target.user.id,
        "user.mention": `<@${target.user.id}>`,
        server: message.guild.name,
        trigger: "",
        reason: "",
        count: "",
        timestamp: new Date().toISOString(),
      };
      const p = buildPayload(mcfg.messages?.modnick_no_nick, vars, `${target.user.tag} has no nickname set`);
      return void message.reply(p.content ?? `${target.user.tag} has no nickname set`);
    }

    const originalNick = target.member.nickname;

    const result = await runModnick(client, target.member, "manual", async (content) => {
      await message.reply(content).catch(() => {});
    });

    if (result.skipped && !result.triggered) return;

    if (!result.triggered) {
      const vars = {
        user: `<@${target.user.id}>`,
        "user.id": target.user.id,
        "user.mention": `<@${target.user.id}>`,
        server: message.guild.name,
        trigger: originalNick,
        reason: originalNick,
        count: "",
        timestamp: new Date().toISOString(),
      };
      const p = buildPayload(mcfg.messages?.modnick_clean, vars, `${target.user.tag} nickname is clean — no violations found`);
      return void message.reply(p.content ?? `${target.user.tag} nickname is clean — no violations found`);
    }

    if (!result.skipped) {
      await message.reply(
        `✅ Modnick applied to **${target.user.tag}** | Rule: \`${result.rule}\` | New nickname: **${result.newNick}**`
      ).catch(() => {});
    }
  },
};

export default modnickCmd;

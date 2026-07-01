/**
 * Welcome plugin event handlers.
 *
 * onWelcomeMemberAdd  — runs on guildMemberAdd (after YAML automod)
 * onWelcomeMemberRemove — runs on guildMemberRemove
 *
 * All config is read live from the guild's YAML via getGuildConfig so hot
 * config changes take effect on the next join/leave without a bot restart.
 */

import { Client, EmbedBuilder, GuildMember, Message, TextChannel, VoiceChannel } from "discord.js";
import { getGuildConfig } from "../store/guildConfig";
import type { YamlMessage } from "../store/guildConfig";
import { applyVars, buildYamlEmbed, sendYamlMessage } from "../lib/yamlFormatter";
import type { TemplateVars } from "../lib/yamlFormatter";
import { buildWelcomeVars, buildGoodbyeVars } from "../lib/welcomeTemplates";
import {
  cacheGuildInvites,
  detectInvite,
  recordMemberJoin,
  recordMemberLeave,
} from "../lib/inviteTracker";
import type { InviteContext } from "../lib/inviteTracker";
import { dbGet, dbSet } from "../store/db";
import { logger } from "../../lib/logger";

// Saved member data (for rejoin restore)
interface SavedMemberData {
  roles:    string[];
  nickname: string | null;
}

async function saveMemberData(member: GuildMember): Promise<void> {
  const roles = member.roles.cache
    .filter((r) => r.id !== member.guild.id) // exclude @everyone
    .map((r) => r.id);
  await dbSet("member_leave_data", `${member.guild.id}:${member.user.id}`, {
    roles,
    nickname: member.nickname,
  });
}

async function getLeaveData(guildId: string, userId: string): Promise<SavedMemberData | null> {
  return dbGet<SavedMemberData>("member_leave_data", `${guildId}:${userId}`);
}

// Flexible message sender (returns sent message for delete_after)
async function sendMsg(
  channel: TextChannel,
  msgValue: YamlMessage,
  vars: TemplateVars,
  pingUserId?: string
): Promise<Message | null> {
  try {
    if (typeof msgValue === "string") {
      const text = applyVars(msgValue, vars);
      if (!text) return null;
      const content = pingUserId ? `<@${pingUserId}> ${text}` : text;
      return await channel.send({ content, allowedMentions: pingUserId ? { users: [pingUserId] } : undefined });
    }

    if ("embed" in msgValue) {
      const embed = buildYamlEmbed(msgValue.embed, vars);
      const rawContent = "content" in msgValue && msgValue.content
        ? applyVars(msgValue.content, vars)
        : pingUserId ? `<@${pingUserId}>` : undefined;
      const content = rawContent || undefined;
      return await channel.send({
        content,
        embeds: [embed],
        allowedMentions: pingUserId ? { users: [pingUserId] } : undefined,
      });
    }
  } catch (err) {
    logger.debug({ err }, "welcomeHandler: failed to send message");
  }
  return null;
}

function scheduleDelete(msg: Message | null, afterSeconds: number | null | undefined): void {
  if (!msg || !afterSeconds || afterSeconds <= 0) return;
  setTimeout(() => msg.delete().catch(() => {}), afterSeconds * 1_000);
}

// Member count channel updater
async function updateCountChannels(
  member: GuildMember,
  trigger: "join" | "leave"
): Promise<void> {
  const cfg = await getGuildConfig(member.guild.id);
  const mcc = (cfg.plugins?.welcome as any)?.member_count_channel;
  if (!mcc?.enabled) return;

  const updateOn: string = mcc.update_on ?? "both";
  if (updateOn !== "both" && updateOn !== trigger) return;

  const guild = member.guild;
  const vars: Record<string, string> = {
    "server.member_count": String(guild.memberCount),
    "human_count": String(guild.members.cache.filter((m) => !m.user.bot).size),
    "bot_count":   String(guild.members.cache.filter((m) => m.user.bot).size),
    "boost_count": String(guild.premiumSubscriptionCount ?? 0),
  };

  const applyCountVars = (tpl: string): string => {
    let out = tpl;
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
    return out.slice(0, 100); // Discord channel name limit
  };

  if (mcc.channel) {
    const ch = guild.channels.cache.get(mcc.channel) as VoiceChannel | undefined;
    if (ch && mcc.format) await ch.setName(applyCountVars(mcc.format)).catch(() => {});
  }

  if (Array.isArray(mcc.extra_channels)) {
    for (const ec of mcc.extra_channels as { channel?: string; format?: string }[]) {
      if (!ec.channel || !ec.format) continue;
      const ch = guild.channels.cache.get(ec.channel) as VoiceChannel | undefined;
      if (ch) await ch.setName(applyCountVars(ec.format)).catch(() => {});
    }
  }
}

// guildMemberAdd
export async function onWelcomeMemberAdd(
  client: Client,
  member: GuildMember
): Promise<void> {
  const cfg = await getGuildConfig(member.guild.id);
  const wp = (cfg.plugins?.welcome as any);
  if (!wp?.enabled) return;

  const unknownLabel: string = wp.invite_tracking?.unknown_invite_label ?? "Unknown";

  // 1. Detect invite
  let inviteCtx: InviteContext | null = null;
  let inviterNetCount = 0;

  if (wp.invite_tracking?.enabled) {
    inviteCtx = await detectInvite(member.guild, unknownLabel).catch(() => null);

    inviterNetCount = await recordMemberJoin(
      member.guild.id,
      member.user.id,
      inviteCtx?.inviterId ?? null,
      inviteCtx?.inviterTag ?? null,
      inviteCtx?.code ?? null
    ).catch(() => 0);

    // Invite log message
    const inviteLogMsg: YamlMessage | undefined =
      wp.invite_tracking.messages?.invite_log ?? wp.invite_tracking.log_message;
    const logChId: string | undefined = wp.invite_tracking.log_channel;
    if (inviteLogMsg && logChId) {
      const logCh = member.guild.channels.cache.get(logChId) as TextChannel | undefined;
      if (logCh) {
        const vars = buildWelcomeVars(member, inviteCtx);
        await sendYamlMessage(logCh, inviteLogMsg, vars).catch(() => {});
      }
    }

    // DM the inviter
    const inviterDmMsg: YamlMessage | undefined = wp.invite_tracking.messages?.inviter_dm;
    if (inviterDmMsg && inviteCtx?.inviterId) {
      try {
        const inviter = await client.users.fetch(inviteCtx.inviterId).catch(() => null);
        if (inviter) {
          const dm = await inviter.createDM().catch(() => null);
          if (dm) {
            const dmVars = {
              ...buildWelcomeVars(member, inviteCtx),
              "count": String(inviterNetCount),
            };
            await sendYamlMessage(dm, inviterDmMsg, dmVars).catch(() => {});
          }
        }
      } catch { /* ignore */ }
    }
  }

  // 3. Rejoin check
  const leaveData = await getLeaveData(member.guild.id, member.user.id);
  const isRejoin = leaveData !== null;

  // 4. Rejoin role restoration
  let restoredCount = 0;
  if (isRejoin && wp.rejoin_restore_roles?.enabled && leaveData) {
    const ignoreRoles: string[] = wp.rejoin_restore_roles.ignore_roles ?? [];
    const toRestore = leaveData.roles.filter((r) => !ignoreRoles.includes(r));

    for (const roleId of toRestore) {
      const role = member.guild.roles.cache.get(roleId);
      if (role) {
        const ok = await member.roles.add(role, "Rejoin role restore").catch(() => false);
        if (ok !== false) restoredCount++;
      }
    }

    if (wp.rejoin_restore_roles.restore_nickname && leaveData.nickname) {
      await member.setNickname(leaveData.nickname, "Rejoin nickname restore").catch(() => {});
    }

    // Restoration DM
    if (restoredCount > 0 && wp.rejoin_restore_roles.dm_on_restore) {
      const dmMsg: YamlMessage | undefined = wp.rejoin_restore_roles.messages?.roles_restored_dm;
      if (dmMsg) {
        try {
          const dm = await member.user.createDM();
          const dmVars = {
            ...buildWelcomeVars(member, inviteCtx),
            "count": String(restoredCount),
          };
          await sendYamlMessage(dm, dmMsg, dmVars).catch(() => {});
        } catch { /* DMs closed */ }
      }
    }

    // Restoration log
    const logMsg: YamlMessage | undefined = wp.rejoin_restore_roles.messages?.roles_restored;
    const logChId: string | undefined = wp.invite_tracking?.log_channel;
    if (logMsg && restoredCount > 0 && logChId) {
      const logCh = member.guild.channels.cache.get(logChId) as TextChannel | undefined;
      if (logCh) {
        const vars = {
          ...buildWelcomeVars(member, inviteCtx),
          "count": String(restoredCount),
        };
        await sendYamlMessage(logCh, logMsg, vars).catch(() => {});
      }
    }
  }

  const welcomeVars = buildWelcomeVars(member, inviteCtx, { "count": String(restoredCount) });

  // 5. Welcome back / regular welcome
  if (isRejoin && wp.welcome_back?.enabled && wp.welcome_back.message) {
    const wbChId: string | null | undefined =
      wp.welcome_back.channel ?? wp.welcome?.channel;
    if (wbChId) {
      const ch = member.guild.channels.cache.get(wbChId) as TextChannel | undefined;
      if (ch) {
        const vars = { ...welcomeVars, "count": String(restoredCount) };
        const sent = await sendMsg(ch, wp.welcome_back.message as YamlMessage, vars);
        scheduleDelete(sent, wp.welcome_back.delete_after);
      }
    }
  } else if (wp.welcome?.enabled && wp.welcome.channel && wp.welcome.message) {
    const ch = member.guild.channels.cache.get(wp.welcome.channel) as TextChannel | undefined;
    if (ch) {
      const pingId = wp.welcome.ping ? member.user.id : undefined;
      const sent = await sendMsg(ch, wp.welcome.message as YamlMessage, welcomeVars, pingId);
      scheduleDelete(sent, wp.welcome.delete_after);
    }
  }

  // 6. Join DM
  if (wp.join_dm?.enabled && wp.join_dm.message) {
    try {
      const dm = await member.user.createDM();
      await sendYamlMessage(dm, wp.join_dm.message as YamlMessage, welcomeVars);
    } catch { /* DMs closed */ }
  }

  // 7. Auto role
  if (wp.welcome_role?.enabled) {
    const roleIds: string[] = [];
    if (wp.welcome_role.role) roleIds.push(wp.welcome_role.role);
    if (Array.isArray(wp.welcome_role.roles)) roleIds.push(...wp.welcome_role.roles as string[]);

    const delayMs: number = (wp.welcome_role.delay_seconds ?? 0) * 1_000;
    const logChId: string | undefined = wp.invite_tracking?.log_channel;

    const doAssign = async (): Promise<void> => {
      for (const roleId of roleIds) {
        const role = member.guild.roles.cache.get(roleId);
        if (!role) continue;

        const result = await member.roles.add(role, "Auto role on join").catch((err: Error) => err);
        const logCh = logChId
          ? member.guild.channels.cache.get(logChId) as TextChannel | undefined
          : undefined;

        if (result instanceof Error) {
          const failMsg: YamlMessage | undefined = wp.welcome_role.messages?.autorole_failed;
          if (failMsg && logCh) {
            const vars = { ...welcomeVars, "trigger": role.name, "reason": result.message };
            await sendYamlMessage(logCh, failMsg, vars).catch(() => {});
          }
        } else if (logCh) {
          const okMsg: YamlMessage | undefined = wp.welcome_role.messages?.autorole_assigned;
          if (okMsg) {
            const vars = { ...welcomeVars, "trigger": role.name };
            await sendYamlMessage(logCh, okMsg, vars).catch(() => {});
          }
        }
      }
    };

    if (delayMs > 0) {
      setTimeout(() => doAssign().catch(() => {}), delayMs);
    } else {
      await doAssign();
    }
  }

  // 8. Invite rewards
  if (
    wp.invite_tracking?.enabled &&
    wp.invite_tracking.rewards?.enabled &&
    inviteCtx?.inviterId
  ) {
    const milestones: Array<{
      invites: number;
      role?: string | null;
      message?: YamlMessage | null;
    }> = wp.invite_tracking.rewards.milestones ?? [];

    for (const milestone of milestones) {
      if (inviterNetCount !== milestone.invites) continue;

      if (milestone.role) {
        const inviterMember = member.guild.members.cache.get(inviteCtx.inviterId);
        if (inviterMember) {
          const rewardRole = member.guild.roles.cache.get(milestone.role);
          if (rewardRole) {
            await inviterMember.roles
              .add(rewardRole, `Invite reward: ${milestone.invites} invites`)
              .catch(() => {});
          }
        }
      }

      if (milestone.message) {
        const logChId: string | undefined = wp.invite_tracking.log_channel;
        if (logChId) {
          const logCh = member.guild.channels.cache.get(logChId) as TextChannel | undefined;
          if (logCh) {
            const inviter = await client.users.fetch(inviteCtx.inviterId).catch(() => null);
            const rewardVars: TemplateVars = inviter
              ? {
                  ...welcomeVars,
                  "user":           inviter.username,
                  "user.mention":   `<@${inviter.id}>`,
                  "user.id":        inviter.id,
                  "count":          String(inviterNetCount),
                }
              : { ...welcomeVars, "count": String(inviterNetCount) };

            await sendYamlMessage(logCh, milestone.message as YamlMessage, rewardVars).catch(() => {});
          }
        }
      }
      break;
    }
  }

  // 9. Update member count channels
  await updateCountChannels(member, "join").catch(() => {});
}

// guildMemberRemove
export async function onWelcomeMemberRemove(
  _client: Client,
  member: GuildMember
): Promise<void> {
  const cfg = await getGuildConfig(member.guild.id);
  const wp = (cfg.plugins?.welcome as any);
  if (!wp?.enabled) return;

  // 1. Save roles for future rejoin
  if (wp.rejoin_restore_roles?.enabled) {
    await saveMemberData(member).catch(() => {});
  }

  // 2. Subtract left invite count
  if (wp.invite_tracking?.enabled && wp.invite_tracking.subtract_left) {
    await recordMemberLeave(member.guild.id, member.user.id).catch(() => {});
  }

  // 3. Goodbye message
  if (wp.goodbye?.enabled && wp.goodbye.channel && wp.goodbye.message) {
    const ch = member.guild.channels.cache.get(wp.goodbye.channel) as TextChannel | undefined;
    if (ch) {
      const vars = buildGoodbyeVars(member);
      const sent = await sendMsg(ch, wp.goodbye.message as YamlMessage, vars);
      scheduleDelete(sent, wp.goodbye.delete_after);
    }
  }

  // 4. Update member count channels
  await updateCountChannels(member, "leave").catch(() => {});

  // 5. Refresh invite cache
  await cacheGuildInvites(member.guild).catch(() => {});
}

// Preview helpers (used by !welcome test / !goodbye test)
export async function sendWelcomePreview(
  client: Client,
  member: GuildMember,
  targetChannelId: string
): Promise<boolean> {
  const cfg = await getGuildConfig(member.guild.id);
  const wp = (cfg.plugins?.welcome as any);
  if (!wp?.welcome?.message) return false;

  const ch = member.guild.channels.cache.get(targetChannelId) as TextChannel | undefined;
  if (!ch) return false;

  const inviteCtx: InviteContext = {
    code: "PREVIEW",
    inviterId:  member.user.id,
    inviterTag: member.user.username,
    uses: 1,
    unknown: true,
    unknownLabel: wp.invite_tracking?.unknown_invite_label ?? "Unknown",
  };

  const vars = buildWelcomeVars(member, inviteCtx);
  const sent = await sendMsg(ch, wp.welcome.message as YamlMessage, vars);
  scheduleDelete(sent, wp.welcome.delete_after);
  return !!sent;
}

export async function sendGoodbyePreview(
  _client: Client,
  member: GuildMember,
  targetChannelId: string
): Promise<boolean> {
  const cfg = await getGuildConfig(member.guild.id);
  const wp = (cfg.plugins?.welcome as any);
  if (!wp?.goodbye?.message) return false;

  const ch = member.guild.channels.cache.get(targetChannelId) as TextChannel | undefined;
  if (!ch) return false;

  const vars = buildGoodbyeVars(member);
  const sent = await sendMsg(ch, wp.goodbye.message as YamlMessage, vars);
  scheduleDelete(sent, wp.goodbye.delete_after);
  return !!sent;
}

export async function sendJoinDmPreview(
  _client: Client,
  member: GuildMember
): Promise<boolean> {
  const cfg = await getGuildConfig(member.guild.id);
  const wp = (cfg.plugins?.welcome as any);
  if (!wp?.join_dm?.message) return false;

  try {
    const inviteCtx: InviteContext = {
      code: "PREVIEW",
      inviterId:  member.user.id,
      inviterTag: member.user.username,
      uses: 1,
      unknown: true,
      unknownLabel: wp.invite_tracking?.unknown_invite_label ?? "Unknown",
    };
    const vars = buildWelcomeVars(member, inviteCtx);
    const dm = await member.user.createDM();
    await sendYamlMessage(dm, wp.join_dm.message as YamlMessage, vars);
    return true;
  } catch {
    return false;
  }
}

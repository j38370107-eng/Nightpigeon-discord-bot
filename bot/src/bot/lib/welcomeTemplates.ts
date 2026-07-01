/**
 * Template variable builder for the Welcome plugin.
 * Returns a flat TemplateVars record for use with applyVars / sendYamlMessage.
 */

import type { GuildMember } from "discord.js";
import type { TemplateVars } from "./yamlFormatter";
import type { InviteContext } from "./inviteTracker";

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function fmt(d: Date | null | undefined): string {
  if (!d) return "Unknown";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function buildWelcomeVars(
  member: GuildMember,
  invite: InviteContext | null,
  extra: Record<string, string> = {}
): TemplateVars {
  const { user, guild } = member;
  const now = new Date();

  const unknownLabel = invite?.unknownLabel ?? "Unknown";

  const humanCount = guild.members.cache.filter((m) => !m.user.bot).size;
  const botCount = guild.members.cache.filter((m) => m.user.bot).size;
  const boostCount = guild.premiumSubscriptionCount ?? 0;

  return {
    "user":                     user.username,
    "user.mention":             `<@${user.id}>`,
    "user.id":                  user.id,
    "user.name":                user.username,
    "user.avatar":              user.displayAvatarURL({ size: 256 }),
    "user.created_at":          fmt(user.createdAt),
    "user.joined_at":           member.joinedAt ? fmt(member.joinedAt) : "Unknown",
    "server":                   guild.name,
    "server.id":                guild.id,
    "server.icon":              guild.iconURL({ size: 256 }) ?? "",
    "server.member_count":      String(guild.memberCount),
    "server.owner":             guild.ownerId,
    "ordinal":                  ordinal(guild.memberCount),
    "human_count":              String(humanCount),
    "bot_count":                String(botCount),
    "boost_count":              String(boostCount),
    "timestamp":                now.toLocaleString("en-US"),
    "timestamp.date":           now.toLocaleDateString("en-US"),
    "timestamp.time":           now.toLocaleTimeString("en-US"),
    "invite.code":              invite?.code ?? unknownLabel,
    "invite.url":               invite?.code ? `discord.gg/${invite.code}` : unknownLabel,
    "invite.uses":              invite?.uses !== undefined ? String(invite.uses) : unknownLabel,
    "invite.inviter":           invite?.inviterTag ?? unknownLabel,
    "invite.inviter.id":        invite?.inviterId ?? unknownLabel,
    "invite.inviter.mention":   invite?.inviterId ? `<@${invite.inviterId}>` : unknownLabel,
    "invite.channel":           invite?.channelName ?? unknownLabel,
    "invite.created_at":        invite?.createdAt ? fmt(invite.createdAt) : unknownLabel,
    "invite.expires_at":        invite?.expiresAt ? fmt(invite.expiresAt) : "Never",
    "invite.max_uses":          invite?.maxUses ? String(invite.maxUses) : "Unlimited",
    "invite.temporary":         invite?.temporary ? "true" : "false",
    ...extra,
  };
}

export function buildGoodbyeVars(
  member: GuildMember,
  extra: Record<string, string> = {}
): TemplateVars {
  const { user, guild } = member;
  const now = new Date();

  return {
    "user":                 user.username,
    "user.mention":         `<@${user.id}>`,
    "user.id":              user.id,
    "user.name":            user.username,
    "user.avatar":          user.displayAvatarURL({ size: 256 }),
    "user.created_at":      fmt(user.createdAt),
    "user.joined_at":       member.joinedAt ? fmt(member.joinedAt) : "Unknown",
    "server":               guild.name,
    "server.id":            guild.id,
    "server.member_count":  String(guild.memberCount),
    "timestamp":            now.toLocaleString("en-US"),
    "timestamp.date":       now.toLocaleDateString("en-US"),
    "timestamp.time":       now.toLocaleTimeString("en-US"),
    ...extra,
  };
}

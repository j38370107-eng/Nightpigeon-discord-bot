import { Router } from "express";
import { dbGet, dbSet, dbDelete, dbGetAll, dbGetByGuildPrefix, pool } from "../db.js";
import {
  getGuildChannels,
  getGuildRoles,
  getGuildAuditLog,
  AUDIT_LOG_ACTIONS,
} from "../discord.js";
import yaml from "js-yaml";

const OWNER_ID = "1216140996463689810";

const router = Router();

const RESERVED_COMMAND_NAMES = new Set([
  "warn","kick","ban","unban","mute","timeout","unmute","untimeout",
  "purge","clear","prune",
  "slowmode","slow","sm",
  "lock","unlock",
  "lockdown","ld",
  "note","addnote","staffnote",
  "viewnote","shownote","getnote","notes",
  "editnote","updatenote","notereason",
  "reason","case",
  "delcase","deletecase","removecase","rmcase",
  "delnote","deletenote","removenote","rmnote",
  "shortcut","sc",
  "automod","am",
  "userinfo","ui","whois",
  "serverinfo","si","guildinfo",
  "modnick","mn","moderatenick",
  "modrole","mr",
  "ping","latency",
  "nick","nickname",
  "afk","afkreset",
  "alt","clearalt","alts","altlist","linkedalts","altslist",
  "addrole","ar","removerole","rr",
  "remind","reminder","remindme",
  "alias",
  "setmodlogs","setlogchannel","setlogs","logchannel",
  "setserverlogs","serverlogs","serverlogchannel",
  "antinuke","an","nuke",
  "antiraid","raid",
  "ticket","tickets",
  "tblacklist","ticketblacklist","tblist",
  "tunblacklist","ticketunblacklist","tbunlist",
  "setup","tsetup","close","tclose","delete","tdelete",
  "reopen","treopen","add","tadd","remove","tremove",
  "claim","tclaim","transcript","ttranscript","stats","tstats","ticketstats",
  "baninfo","binfo",
  "botinfo","bot","about",
  "duration","setduration","changeduration",
  "eval","ev",
  "serverblacklist","sbl","guildblacklist",
  "userblacklist","ubl","globalban",
  "backup","bk",
  "additionalinformation","addinfo","ai","punishinfo",
  "activeactions","activemutes","activebans","active","timed",
  "modstats","moderatorstats","modleaderboard","modlb",
  "resetconfig","configreset","resetbot","factoryreset",
  "muteconfig","mutesettings",
  "dashboard","dash","panel",
  "apply","application","app",
  "ablacklist","appblacklist","ablist",
  "aunblacklist","appunblacklist","abunlist",
  "snipe","s","editsnipe","es","clearsnipe","cs",
  "protectedrole","protrole",
  "help","h","commands",
  "changeprefix","setprefix","prefix",
  "setexpiredate","setexpiry","warnexpiry","setwarnduration",
  "setautomodwarnexpiry","automodwarnexpiry","setamwarnexpiry",
  "warnings","warns","modlogs","infractions","punishments","cases","hist","history","warnsa",
  "invites",
]);

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) return res.status(401).json({ error: "Unauthorized" });
  next();
}

async function requireGuildAccess(req: any, res: any, next: any) {
  // Bot owner has unrestricted access to every server
  if (req.session?.userId === OWNER_ID) return next();

  const { guildId } = req.params;
  const userId = req.session?.userId;

  // Server owner access (guild in session)
  const guilds: any[] = req.session.guilds ?? [];
  if (guilds.find((g: any) => g.id === guildId)) return next();

  // Staff access: check dashboardAccess store
  if (userId) {
    const access = (await dbGet<DashboardAccessStore>("dashboardAccess", guildId)) ?? { users: [] };
    const entry = access.users.find((u: DashboardAccessEntry) => u.id === userId);
    if (entry) {
      req.dashboardPermission = entry.permission; // "view" or "edit"
      return next();
    }
  }

  return res.status(403).json({ error: "Access denied to this server" });
}

async function requireEditPermission(req: any, res: any, next: any) {
  if (req.session?.userId === OWNER_ID) return next();

  const { guildId } = req.params;
  const guilds: any[] = req.session.guilds ?? [];
  if (guilds.find((g: any) => g.id === guildId)) return next();

  // Staff with edit permission
  if (req.dashboardPermission === "edit") return next();

  // Newly entering staff (dashboardPermission not set yet — re-check)
  const userId = req.session?.userId;
  if (userId) {
    const access = (await dbGet<DashboardAccessStore>("dashboardAccess", guildId)) ?? { users: [] };
    const entry = access.users.find((u: DashboardAccessEntry) => u.id === userId);
    if (entry?.permission === "edit") return next();
  }

  return res.status(403).json({ error: "View-only access — you cannot modify this server's configuration" });
}

async function requireGuildOwner(req: any, res: any, next: any) {
  if (req.session?.userId === OWNER_ID) return next();
  const { guildId } = req.params;
  const guilds: any[] = req.session.guilds ?? [];
  if (guilds.find((g: any) => g.id === guildId)) return next();
  return res.status(403).json({ error: "Only the server owner can manage dashboard access" });
}

interface DashboardAccessEntry {
  id: string;
  tag: string;
  avatar: string | null;
  permission: "view" | "edit";
}

interface DashboardAccessStore {
  users: DashboardAccessEntry[];
}

const auth = [requireAuth, requireGuildAccess];

async function getGuildOwnerId(guildId: string): Promise<string | null> {
  const botToken = process.env["DISCORD_BOT_TOKEN"];
  if (!botToken) return null;
  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!r.ok) return null;
    const data: any = await r.json();
    return data.owner_id ?? null;
  } catch {
    return null;
  }
}

async function canEditSecurity(userId: string, guildId: string, store: "antiraid" | "antinuke"): Promise<boolean> {
  // Bot owner can always edit security settings on any server
  if (userId === OWNER_ID) return true;

  const ownerId = await getGuildOwnerId(guildId);
  if (ownerId && userId === ownerId) return true;
  const cfg = (await dbGet<any>(store, guildId)) ?? {};
  const whitelist: string[] = cfg.whitelist ?? [];
  return whitelist.includes(userId);
}

// Bot Presence Check
router.get("/:guildId/bot-status", requireAuth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const botToken = process.env["DISCORD_BOT_TOKEN"];
  if (!botToken) return res.json({ present: false });
  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    return res.json({ present: r.ok });
  } catch {
    return res.json({ present: false });
  }
});

// Overview
router.get("/:guildId/overview", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const guild = (req.session.guilds as any[]).find((g: any) => g.id === guildId);
  const settings = (await dbGet<any>("settings", guildId)) ?? {};
  const infractions = await dbGetByGuildPrefix("infractions", guildId);
  const timedBans = await dbGetByGuildPrefix("timedBans", guildId);
  const timedMutes = await dbGetByGuildPrefix("timedMutes", guildId);
  const shortcuts = (await dbGet<any>("shortcuts", guildId)) ?? {};
  const disabled = (await dbGet<string[]>("disabledCommands", guildId)) ?? [];

  res.json({
    guild,
    settings,
    stats: {
      totalCases: infractions.reduce((a: number, r: any) => a + (Array.isArray(r.data) ? r.data.length : 0), 0),
      activeBans: timedBans.length,
      activeMutes: timedMutes.length,
      shortcuts: Object.keys(shortcuts).length,
      disabledCommands: disabled.length,
    },
  });
});

// Settings
router.get("/:guildId/settings", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const settings = (await dbGet<any>("settings", guildId)) ?? {};
  res.json({ ...settings, prefix: settings.prefix ?? ">" });
});

router.put("/:guildId/settings", ...auth, requireEditPermission, async (req: any, res: any) => {
  const { guildId } = req.params;
  const { prefix, serverLogChannelId, automodWarnExpiryMs } = req.body;

  if (prefix !== undefined) {
    const trimmed = String(prefix).trim();
    if (trimmed.length > 3) {
      return res.status(400).json({ error: "Prefix cannot be longer than 3 characters" });
    }
  }

  const settings = (await dbGet<any>("settings", guildId)) ?? {};
  const updated: any = { ...settings };
  if ("serverLogChannelId" in req.body) updated.serverLogChannelId = serverLogChannelId;
  if (automodWarnExpiryMs !== undefined) updated.automodWarnExpiryMs = automodWarnExpiryMs;
  if (prefix !== undefined) updated.prefix = String(prefix).trim().slice(0, 3) || ">";
  await dbSet("settings", guildId, updated);
  res.json({ ok: true });
});

// Moderation Config
const DAY_MS = 86_400_000;

router.get("/:guildId/moderation", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const [settings, muteConfig, modRoles, protectedRoles, lockdownChannels] = await Promise.all([
    dbGet<any>("settings", guildId).then((s) => s ?? {}),
    dbGet<any>("muteConfig", guildId).then((c) => c ?? {}),
    dbGet<string[]>("modroles", guildId).then((r) => r ?? []),
    dbGet<string[]>("protectedRoles", guildId).then((r) => r ?? []),
    dbGet<string[]>("lockdown", guildId).then((c) => c ?? []),
  ]);

  const warnExpiryMs = settings.warnExpiryMs ?? 30 * DAY_MS;
  const warnExpiryDays = warnExpiryMs === 0 ? "0" : String(Math.round(warnExpiryMs / DAY_MS));

  const automodWarnExpiryMs = settings.automodWarnExpiryMs ?? 7 * DAY_MS;
  const automodWarnExpiryDays = automodWarnExpiryMs === 0 ? "0" : String(Math.round(automodWarnExpiryMs / DAY_MS));

  res.json({
    modRoles,
    protectedRoles,
    lockdownChannels,
    logChannelId: settings.logChannelId ?? "",
    warnExpiryDays,
    automodWarnExpiryDays,
    warnEscalation: settings.warnEscalation ?? { steps: [] },
    muteConfig: { mode: "timeout", muteRoleId: null, stripRoles: false, ...muteConfig },
  });
});

router.put("/:guildId/moderation", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const { modRoles, protectedRoles, lockdownChannels, logChannelId, warnExpiryDays, automodWarnExpiryDays, warnEscalation, muteConfig } = req.body;

  if (muteConfig?.mode === "timeout") {
    const currentMc = (await dbGet<any>("muteConfig", guildId)) ?? {};
    if ((currentMc.mode ?? "timeout") === "role") {
      const shortcuts = (await dbGet<any>("shortcuts", guildId)) ?? {};
      const permMutes: any[] = Object.values(shortcuts).filter((s: any) => s.type === "mute" && !s.duration);
      if (permMutes.length > 0) {
        const names = permMutes.map((s: any) => `"${s.name}"`).join(", ");
        return res.status(400).json({
          error: `Can't switch to Timeout mode while permanent mute shortcuts exist. Edit or delete these shortcuts first: ${names}`,
        });
      }
    }
  }

  const warnDays = parseInt(warnExpiryDays ?? "30", 10);
  const warnExpiryMs = isNaN(warnDays) ? undefined : warnDays === 0 ? 0 : warnDays * DAY_MS;

  const automodWarnDays = parseInt(automodWarnExpiryDays ?? "7", 10);
  const automodWarnExpiryMs = isNaN(automodWarnDays) ? undefined : automodWarnDays === 0 ? 0 : automodWarnDays * DAY_MS;

  await Promise.all([
    dbSet("modroles", guildId, Array.isArray(modRoles) ? modRoles : []),
    dbSet("protectedRoles", guildId, Array.isArray(protectedRoles) ? protectedRoles : []),
    dbSet("lockdown", guildId, Array.isArray(lockdownChannels) ? lockdownChannels : []),
    (async () => {
      const settings = (await dbGet<any>("settings", guildId)) ?? {};
      const updated: any = { ...settings };
      if (logChannelId !== undefined) updated.logChannelId = logChannelId || undefined;
      if (warnExpiryMs !== undefined) updated.warnExpiryMs = warnExpiryMs;
      if (automodWarnExpiryMs !== undefined) updated.automodWarnExpiryMs = automodWarnExpiryMs;
      if (warnEscalation !== undefined) updated.warnEscalation = warnEscalation;
      await dbSet("settings", guildId, updated);
    })(),
    muteConfig
      ? (async () => {
          const existing = (await dbGet<any>("muteConfig", guildId)) ?? {};
          await dbSet("muteConfig", guildId, { ...existing, ...muteConfig });
        })()
      : Promise.resolve(),
  ]);

  res.json({ ok: true });
});

// Channels & Roles (for selectors)
router.get("/:guildId/channels", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const { voice } = req.query;
  const botToken = process.env["DISCORD_BOT_TOKEN"];
  if (!botToken) return res.json([]);
  const channels = await getGuildChannels(botToken, guildId);
  const types = voice === "true" ? [0, 2, 5] : [0, 5];
  res.json(channels.filter((c) => types.includes(c.type)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
});

router.get("/:guildId/roles", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const botToken = process.env["DISCORD_BOT_TOKEN"];
  if (!botToken) return res.json([]);
  const roles = await getGuildRoles(botToken, guildId);
  res.json(roles.filter((r) => !r.managed && r.name !== "@everyone").sort((a, b) => b.position - a.position));
});

// Shortcuts
router.get("/:guildId/shortcuts", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const data = (await dbGet<any>("shortcuts", guildId)) ?? {};
  res.json(Object.values(data));
});

router.post("/:guildId/shortcuts", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const { name, type, reason, duration, originalName } = req.body;
  if (!name || !type || !reason) return res.status(400).json({ error: "name, type, reason required" });

  const cleanName = name.toLowerCase().trim();
  const cleanOriginal = originalName?.toLowerCase().trim();

  if (RESERVED_COMMAND_NAMES.has(cleanName)) {
    return res.status(400).json({ error: `"${cleanName}" is a built-in bot command or alias and cannot be used as a shortcut name.` });
  }

  if (type === "mute" && !duration?.trim()) {
    const mc = (await dbGet<any>("muteConfig", guildId)) ?? {};
    if ((mc.mode ?? "timeout") === "timeout") {
      return res.status(400).json({
        error: "Permanent mute shortcuts aren't supported in Timeout mode — Discord timeouts require a duration. Add a duration (e.g. 1h, 7d) or switch to Mute Role mode in Moderation Config.",
      });
    }
  }

  if (type === "ban" && duration?.trim()) {
    const match = duration.trim().match(/^(\d+)(s|m|h|d)$/i);
    if (match) {
      const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
      const seconds = parseInt(match[1]!, 10) * (multipliers[match[2]!.toLowerCase()] ?? 1);
      if (seconds > 30 * 24 * 3600) {
        return res.status(400).json({ error: "Max ban duration is 30 days. Leave duration empty for a permanent ban." });
      }
    }
  }

  const data = (await dbGet<any>("shortcuts", guildId)) ?? {};

  if (data[cleanName] && cleanName !== cleanOriginal) {
    return res.status(400).json({ error: `A shortcut named "${cleanName}" already exists. Delete it first to create a new one.` });
  }

  if (cleanOriginal && cleanOriginal !== cleanName) {
    delete data[cleanOriginal];
  }

  data[cleanName] = { name: cleanName, type, reason, duration: duration?.trim() || undefined };
  await dbSet("shortcuts", guildId, data);
  res.json({ ok: true });
});

router.delete("/:guildId/shortcuts/:name", ...auth, async (req: any, res: any) => {
  const { guildId, name } = req.params;
  const data = (await dbGet<any>("shortcuts", guildId)) ?? {};
  delete data[name.toLowerCase()];
  await dbSet("shortcuts", guildId, data);
  res.json({ ok: true });
});

// Commands (enable/disable)
router.get("/:guildId/commands", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const disabled = (await dbGet<string[]>("disabledCommands", guildId)) ?? [];
  res.json({ disabled });
});

router.put("/:guildId/commands", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const { disabled } = req.body as { disabled: string[] };
  if (!Array.isArray(disabled)) return res.status(400).json({ error: "disabled must be array" });
  await dbSet("disabledCommands", guildId, disabled);
  res.json({ ok: true });
});

// Command Permissions
router.get("/:guildId/command-perms", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const perms = (await dbGet<any>("commandPerms", guildId)) ?? {};
  res.json(perms);
});

router.put("/:guildId/command-perms", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const existing = (await dbGet<any>("commandPerms", guildId)) ?? {};
  await dbSet("commandPerms", guildId, { ...existing, ...req.body });
  res.json({ ok: true });
});

// Cases
router.get("/:guildId/cases", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const rows = await dbGetByGuildPrefix("infractions", guildId);
  const all: any[] = [];
  for (const row of rows) {
    const [, userId] = row.key.split(":");
    if (Array.isArray(row.data)) {
      for (const inf of row.data as any[]) {
        all.push({ ...inf, userId });
      }
    }
  }
  all.sort((a, b) => b.timestamp - a.timestamp);
  res.json(all.slice(0, 200));
});

router.get("/:guildId/cases/:caseId", ...auth, async (req: any, res: any) => {
  const { guildId, caseId } = req.params;
  const rows = await dbGetByGuildPrefix("infractions", guildId);
  for (const row of rows) {
    if (Array.isArray(row.data)) {
      const inf = (row.data as any[]).find((i: any) => i.id === caseId);
      if (inf) {
        const [, userId] = row.key.split(":");
        return res.json({ ...inf, userId });
      }
    }
  }
  res.status(404).json({ error: "Case not found" });
});

router.delete("/:guildId/cases/:caseId", ...auth, async (req: any, res: any) => {
  const { guildId, caseId } = req.params;
  const rows = await dbGetByGuildPrefix("infractions", guildId);
  for (const row of rows) {
    if (Array.isArray(row.data)) {
      const idx = (row.data as any[]).findIndex((i: any) => i.id === caseId);
      if (idx !== -1) {
        const updated = [...(row.data as any[])];
        updated.splice(idx, 1);
        await dbSet("infractions", row.key, updated);
        return res.json({ ok: true });
      }
    }
  }
  res.status(404).json({ error: "Case not found" });
});

// Active Punishments
router.get("/:guildId/punishments", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const bansRaw = await dbGetByGuildPrefix("timedBans", guildId);
  const mutesRaw = await dbGetByGuildPrefix("timedMutes", guildId);
  const now = Date.now();

  const bans = bansRaw
    .map((r: any) => ({ type: "ban", ...r.data, remainingMs: r.data.expiresAt ? r.data.expiresAt - now : null }))
    .filter((b: any) => !b.expiresAt || b.expiresAt > now);

  const mutes = mutesRaw
    .map((r: any) => ({ type: "mute", ...r.data, remainingMs: r.data.expiresAt ? r.data.expiresAt - now : null }))
    .filter((m: any) => !m.expiresAt || m.expiresAt > now);

  res.json([...bans, ...mutes]);
});

// Logging
router.get("/:guildId/logging", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const [settings, serverlog] = await Promise.all([
    dbGet<any>("settings", guildId).then((s) => s ?? {}),
    dbGet<any>("serverlog", guildId).then((s) => s ?? {}),
  ]);
  res.json({
    logChannelId: settings.logChannelId ?? "",
    serverlog: {
      enabled: serverlog.enabled ?? false,
      splitChannels: serverlog.splitChannels ?? false,
      combinedChannelId: serverlog.combinedChannelId ?? "",
      categoryChannels: serverlog.categoryChannels ?? {},
      disabledEvents: serverlog.disabledEvents ?? [],
      ignoredChannels: serverlog.ignoredChannels ?? [],
      ignoredRoles: serverlog.ignoredRoles ?? [],
      ignoredUsers: serverlog.ignoredUsers ?? [],
      logBotActions: serverlog.logBotActions ?? false,
    },
  });
});

router.put("/:guildId/logging", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const { logChannelId, serverlog } = req.body;
  const settings = (await dbGet<any>("settings", guildId)) ?? {};
  if (logChannelId !== undefined) {
    await dbSet("settings", guildId, { ...settings, logChannelId });
  }
  if (serverlog) {
    await dbSet("serverlog", guildId, serverlog);
  }
  res.json({ ok: true });
});

// Audit Log
router.get("/:guildId/audit-log", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const botToken = process.env["DISCORD_BOT_TOKEN"];
  if (!botToken) return res.json({ entries: [], users: [] });
  const data = await getGuildAuditLog(botToken, guildId, 50);
  const entries = data.audit_log_entries.map((e) => ({
    ...e,
    actionName: AUDIT_LOG_ACTIONS[e.action_type] ?? `Unknown (${e.action_type})`,
  }));
  res.json({ entries, users: data.users });
});

// Application Forms
router.get("/:guildId/applications", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const forms = (await dbGet<any>("applicationForms", guildId)) ?? {};
  res.json(Object.values(forms));
});

router.post("/:guildId/applications", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const forms = (await dbGet<any>("applicationForms", guildId)) ?? {};
  const count = Object.keys(forms).length;
  if (count >= 5) return res.status(400).json({ error: "Maximum 5 forms per server" });
  const form = {
    id: `${Date.now()}`,
    createdAt: Date.now(),
    active: true,
    ...req.body,
  };
  if (!form.title || !form.questions) return res.status(400).json({ error: "title and questions required" });
  forms[form.id] = form;
  await dbSet("applicationForms", guildId, forms);
  res.json(form);
});

router.put("/:guildId/applications/:formId", ...auth, async (req: any, res: any) => {
  const { guildId, formId } = req.params;
  const forms = (await dbGet<any>("applicationForms", guildId)) ?? {};
  if (!forms[formId]) return res.status(404).json({ error: "Form not found" });
  forms[formId] = { ...forms[formId], ...req.body, id: formId };
  await dbSet("applicationForms", guildId, forms);
  res.json(forms[formId]);
});

router.delete("/:guildId/applications/:formId", ...auth, async (req: any, res: any) => {
  const { guildId, formId } = req.params;
  const forms = (await dbGet<any>("applicationForms", guildId)) ?? {};
  delete forms[formId];
  await dbSet("applicationForms", guildId, forms);
  res.json({ ok: true });
});

router.get("/:guildId/applications/:formId/submissions", ...auth, async (req: any, res: any) => {
  const { guildId, formId } = req.params;
  const subs = (await dbGet<any>("applicationSubmissions", guildId)) ?? {};
  const filtered = Object.values(subs).filter((s: any) => s.formId === formId);
  res.json(filtered);
});

router.patch("/:guildId/applications/:formId/submissions/:subId", ...auth, async (req: any, res: any) => {
  const { guildId, subId } = req.params;
  const { status, reviewNote } = req.body;
  const subs = (await dbGet<any>("applicationSubmissions", guildId)) ?? {};
  if (!subs[subId]) return res.status(404).json({ error: "Submission not found" });
  subs[subId] = { ...subs[subId], status, reviewNote };
  await dbSet("applicationSubmissions", guildId, subs);
  res.json(subs[subId]);
});

// Mute Config
router.get("/:guildId/mute-config", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const cfg = (await dbGet<any>("muteConfig", guildId)) ?? {};
  res.json({ mode: "timeout", muteRoleId: null, stripRoles: false, ...cfg });
});

router.put("/:guildId/mute-config", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const existing = (await dbGet<any>("muteConfig", guildId)) ?? {};
  await dbSet("muteConfig", guildId, { ...existing, ...req.body });
  res.json({ ok: true });
});

// Additional Info
router.get("/:guildId/additional-info", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const cfg = (await dbGet<any>("additionalInfo", guildId)) ?? {};
  res.json(cfg);
});

router.put("/:guildId/additional-info", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const { warn, mute, kick, ban } = req.body;
  const cleaned: any = {};
  if (warn) cleaned.warn = warn; else delete cleaned.warn;
  if (mute) cleaned.mute = mute; else delete cleaned.mute;
  if (kick) cleaned.kick = kick; else delete cleaned.kick;
  if (ban) cleaned.ban = ban; else delete cleaned.ban;
  await dbSet("additionalInfo", guildId, cleaned);
  res.json({ ok: true });
});

// Security Access Check
router.get("/:guildId/security-access", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const userId: string = req.session.userId;
  const [canEditAntiraid, canEditAntinuke] = await Promise.all([
    canEditSecurity(userId, guildId, "antiraid"),
    canEditSecurity(userId, guildId, "antinuke"),
  ]);
  res.json({ canEditAntiraid, canEditAntinuke });
});

// Anti-Nuke
router.get("/:guildId/antinuke", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const cfg = (await dbGet<any>("antinuke", guildId)) ?? {};
  res.json({
    enabled: false,
    action: "ban",
    windowMs: 10000,
    whitelist: [],
    whitelistRoles: [],
    logChannel: "",
    dmOwner: true,
    watchRolePerms: true,
    watchServerUpdate: true,
    restoreEnabled: false,
    ...cfg,
    thresholds: {
      channelDelete: 3, channelCreate: 5,
      roleDelete: 3, roleCreate: 5,
      ban: 3, kick: 5,
      webhookCreate: 3, webhookDelete: 3,
      massTimeout: 5,
      ...(cfg.thresholds ?? {}),
    },
  });
});

router.put("/:guildId/antinuke", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const userId: string = req.session.userId;
  if (!await canEditSecurity(userId, guildId, "antinuke")) {
    return res.status(403).json({ error: "Only the server owner or whitelisted users can change Anti-Nuke settings." });
  }
  const existing = (await dbGet<any>("antinuke", guildId)) ?? {};
  await dbSet("antinuke", guildId, { ...existing, ...req.body });
  res.json({ ok: true });
});

// Anti-Raid
router.get("/:guildId/antiraid", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const cfg = (await dbGet<any>("antiraid", guildId)) ?? {};
  res.json({
    enabled: false,
    joinThreshold: 10,
    joinWindowMs: 10000,
    actionLevel: 3,
    action: "kick",
    lockdown: false,
    newAccountEnabled: false,
    newAccountAgeDays: 7,
    newAccountAction: "flag",
    verificationEnabled: false,
    unverifiedRoleId: "",
    verifiedRoleId: "",
    verificationChannelId: "",
    verifyOnAgePass: true,
    whitelist: [],
    whitelistRoles: [],
    logChannel: "",
    alertChannelId: "",
    ...cfg,
  });
});

router.put("/:guildId/antiraid", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const userId: string = req.session.userId;
  if (!await canEditSecurity(userId, guildId, "antiraid")) {
    return res.status(403).json({ error: "Only the server owner or whitelisted users can change Anti-Raid settings." });
  }
  const existing = (await dbGet<any>("antiraid", guildId)) ?? {};
  await dbSet("antiraid", guildId, { ...existing, ...req.body });
  res.json({ ok: true });
});

// Ticket Categories (Discord category channels)
router.get("/:guildId/ticket-categories", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const botToken = process.env["DISCORD_BOT_TOKEN"];
  if (!botToken) return res.json([]);
  const { getGuildChannels: getChannels } = await import("../discord.js");
  const all = await getChannels(botToken, guildId);
  res.json(all.filter((c: any) => c.type === 4).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)));
});

// Ticket Config
router.get("/:guildId/ticket-config", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const cfg = (await dbGet<any>("ticketConfig", guildId)) ?? {};
  res.json(cfg);
});

router.put("/:guildId/ticket-config", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const existing = (await dbGet<any>("ticketConfig", guildId)) ?? {};
  await dbSet("ticketConfig", guildId, { ...existing, ...req.body });
  res.json({ ok: true });
});

// Ticket Panels
router.get("/:guildId/ticket-panels", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const panels = (await dbGet<any>("ticketPanels", guildId)) ?? {};
  res.json(Object.values(panels));
});

router.post("/:guildId/ticket-panels", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const panels = (await dbGet<any>("ticketPanels", guildId)) ?? {};
  const panel = { createdAt: Date.now(), ...req.body };
  if (!panel.id || !panel.name) return res.status(400).json({ error: "id and name required" });
  panels[panel.id] = panel;
  await dbSet("ticketPanels", guildId, panels);
  res.json(panel);
});

router.put("/:guildId/ticket-panels/:panelId", ...auth, async (req: any, res: any) => {
  const { guildId, panelId } = req.params;
  const panels = (await dbGet<any>("ticketPanels", guildId)) ?? {};
  if (!panels[panelId]) return res.status(404).json({ error: "Panel not found" });
  panels[panelId] = { ...panels[panelId], ...req.body, id: panelId };
  await dbSet("ticketPanels", guildId, panels);
  res.json(panels[panelId]);
});

router.delete("/:guildId/ticket-panels/:panelId", ...auth, async (req: any, res: any) => {
  const { guildId, panelId } = req.params;
  const panels = (await dbGet<any>("ticketPanels", guildId)) ?? {};
  delete panels[panelId];
  await dbSet("ticketPanels", guildId, panels);
  res.json({ ok: true });
});

router.post("/:guildId/ticket-panels/:panelId/send", ...auth, async (req: any, res: any) => {
  const { guildId, panelId } = req.params;
  const botToken = process.env["DISCORD_BOT_TOKEN"];
  if (!botToken) return res.status(500).json({ error: "Bot token not configured" });

  const panels = (await dbGet<any>("ticketPanels", guildId)) ?? {};
  const panel = panels[panelId];
  if (!panel) return res.status(404).json({ error: "Panel not found" });

  const channelId = panel.panelChannelId;
  if (!channelId) return res.status(400).json({ error: "No channel selected for this panel — edit the panel and pick a channel first" });

  const emoji = panel.emoji ?? "🎫";
  const embed = {
    color: 0x5865f2,
    title: `${emoji} ${panel.name}`,
    description: panel.description?.trim() ||
      "Need help? Click the button below to open a support ticket.\n\nPlease be ready to describe your issue in detail so our team can assist you quickly.",
    footer: { text: "One ticket per user • Do not abuse the ticket system" },
  };

  const body = {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            label: "Create Ticket",
            emoji: { name: "🎫" },
            custom_id: "ticket:create",
          },
        ],
      },
    ],
  };

  const discordRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!discordRes.ok) {
    const err = await discordRes.json().catch(() => ({})) as any;
    return res.status(502).json({ error: err?.message ?? "Failed to send panel to Discord channel" });
  }

  res.json({ ok: true });
});

// Tickets
router.get("/:guildId/tickets", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const tickets = (await dbGet<any>("tickets", guildId)) ?? {};
  const sorted = Object.values(tickets).sort((a: any, b: any) => b.createdAt - a.createdAt);
  res.json(sorted);
});

router.patch("/:guildId/tickets/:ticketId", ...auth, async (req: any, res: any) => {
  const { guildId, ticketId } = req.params;
  const tickets = (await dbGet<any>("tickets", guildId)) ?? {};
  if (!tickets[ticketId]) return res.status(404).json({ error: "Ticket not found" });
  const update: any = { ...req.body };
  if (update.status === "closed" && !tickets[ticketId].closedAt) {
    update.closedAt = Date.now();
  }
  tickets[ticketId] = { ...tickets[ticketId], ...update };
  await dbSet("tickets", guildId, tickets);
  res.json(tickets[ticketId]);
});

// Application Config (cooldown, blacklist, staff notify)
router.get("/:guildId/app-config", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const cfg = (await dbGet<any>("appConfig", guildId)) ?? {};
  res.json({ cooldownHours: 0, notifyApplicant: true, blacklist: [], ...cfg });
});

router.put("/:guildId/app-config", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const existing = (await dbGet<any>("appConfig", guildId)) ?? {};
  await dbSet("appConfig", guildId, { ...existing, ...req.body });
  res.json({ ok: true });
});

// Custom Commands
/**
 * The bot saves custom commands as CustomCommand[] (array).
 * The dashboard saves them as Record<string, CustomCommand> (keyed by id).
 * Normalise to Record so all dashboard routes work safely regardless of source.
 */
function normalizeCmds(raw: any): Record<string, any> {
  if (!raw) return {};
  if (Array.isArray(raw)) return Object.fromEntries(raw.map((c: any) => [c.id, c]));
  return raw;
}

router.get("/:guildId/custom-commands", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const cmds = normalizeCmds(await dbGet<any>("customCommands", guildId));
  res.json(Object.values(cmds));
});

router.post("/:guildId/custom-commands", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const cmds = normalizeCmds(await dbGet<any>("customCommands", guildId));
  const { id, trigger, response, embed, allowedRoles, allowedChannels, blockedRoles, blockedChannels, cooldown, cooldownType } = req.body;
  const embedFilled = embed?.enabled && (embed?.title || embed?.description || embed?.author || embed?.footer);
  if (!id || !trigger || (!response && !embedFilled)) {
    return res.status(400).json({ error: "Provide a response message or fill out the embed (title or description required)" });
  }
  if (Object.keys(cmds).length >= 50) return res.status(400).json({ error: "Custom command cap (50) reached" });
  const cleanTrigger = trigger.trim().toLowerCase();
  if (RESERVED_COMMAND_NAMES.has(cleanTrigger)) {
    return res.status(400).json({ error: `"${cleanTrigger}" is a built-in bot command or alias and cannot be used as a custom command trigger.` });
  }
  const shortcuts = (await dbGet<any>("shortcuts", guildId)) ?? {};
  if (shortcuts[cleanTrigger]) {
    return res.status(400).json({ error: `"${cleanTrigger}" is already a shortcut. Delete the shortcut first or choose a different trigger.` });
  }
  if (Object.values(cmds).some((c: any) => c.trigger === cleanTrigger)) return res.status(400).json({ error: "Trigger already exists" });
  cmds[id] = {
    id,
    trigger: trigger.trim().toLowerCase(),
    response,
    createdAt: Date.now(),
    allowedRoles: allowedRoles ?? [],
    allowedChannels: allowedChannels ?? [],
    blockedRoles: blockedRoles ?? [],
    blockedChannels: blockedChannels ?? [],
    cooldown: Number(cooldown ?? 0),
    cooldownType: cooldownType ?? "user",
  };
  await dbSet("customCommands", guildId, cmds);
  res.json(cmds[id]);
});

router.put("/:guildId/custom-commands/:cmdId", ...auth, async (req: any, res: any) => {
  const { guildId, cmdId } = req.params;
  const cmds = normalizeCmds(await dbGet<any>("customCommands", guildId));
  if (!cmds[cmdId]) return res.status(404).json({ error: "Command not found" });
  const { trigger, response, allowedRoles, allowedChannels, blockedRoles, blockedChannels, cooldown, cooldownType } = req.body;
  if (trigger) {
    const cleanTrigger = trigger.trim().toLowerCase();
    if (RESERVED_COMMAND_NAMES.has(cleanTrigger)) {
      return res.status(400).json({ error: `"${cleanTrigger}" is a built-in bot command or alias and cannot be used as a custom command trigger.` });
    }
    const shortcuts = (await dbGet<any>("shortcuts", guildId)) ?? {};
    if (shortcuts[cleanTrigger]) {
      return res.status(400).json({ error: `"${cleanTrigger}" is already a shortcut. Delete the shortcut first or choose a different trigger.` });
    }
    if (Object.values(cmds).some((c: any) => c.trigger === cleanTrigger && c.id !== cmdId)) {
      return res.status(400).json({ error: "Trigger already exists" });
    }
  }
  cmds[cmdId] = {
    ...cmds[cmdId],
    ...(trigger ? { trigger: trigger.trim().toLowerCase() } : {}),
    ...(response ? { response } : {}),
    allowedRoles: allowedRoles ?? cmds[cmdId].allowedRoles ?? [],
    allowedChannels: allowedChannels ?? cmds[cmdId].allowedChannels ?? [],
    blockedRoles: blockedRoles ?? cmds[cmdId].blockedRoles ?? [],
    blockedChannels: blockedChannels ?? cmds[cmdId].blockedChannels ?? [],
    cooldown: cooldown !== undefined ? Number(cooldown) : (cmds[cmdId].cooldown ?? 0),
    cooldownType: cooldownType ?? cmds[cmdId].cooldownType ?? "user",
  };
  await dbSet("customCommands", guildId, cmds);
  res.json(cmds[cmdId]);
});

router.delete("/:guildId/custom-commands/:cmdId", ...auth, async (req: any, res: any) => {
  const { guildId, cmdId } = req.params;
  const cmds = normalizeCmds(await dbGet<any>("customCommands", guildId));
  delete cmds[cmdId];
  await dbSet("customCommands", guildId, cmds);
  res.json({ ok: true });
});

// YAML Config
const DEFAULT_YAML = `# NightPigeon configuration
# Edit this file to configure your server.
# Changes take effect within a few seconds.

prefix: "!"

# Permission levels — assign a level (0-100) to users, roles, or commands.
# 0 = everyone, 100 = bot owner only
levels:
  users: {}
  roles: {}
  commands: {}

# Tags — custom text responses
# Example: greet: "Welcome to the server, {user}!"
tags: {}

# Plugins
plugins: {}
`;

async function ensureGuildConfigsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_configs (
      guild_id TEXT PRIMARY KEY,
      config   TEXT NOT NULL DEFAULT ''
    )
  `);
}

router.get("/:guildId/yaml-config", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  try {
    await ensureGuildConfigsTable();
    const result = await pool.query(
      "SELECT config FROM guild_configs WHERE guild_id = $1",
      [guildId]
    );
    const rawYaml = result.rows[0]?.config;
    return res.json({ yaml: rawYaml && rawYaml.trim() ? rawYaml : DEFAULT_YAML });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }

});

router.put("/:guildId/yaml-config", ...auth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const { yaml: yamlText } = req.body;
  if (typeof yamlText !== "string") return res.status(400).json({ error: "yaml string required" });

  try {
    const parsed = yaml.load(yamlText);
    if (!parsed || typeof parsed !== "object") {
      return res.status(400).json({ error: "Config must be a YAML mapping at the top level" });
    }
  } catch (e: any) {
    return res.status(400).json({ error: `Invalid YAML: ${e.message}` });
  }

  try {
    await ensureGuildConfigsTable();
    await pool.query(
      `INSERT INTO guild_configs (guild_id, config)
       VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE SET config = EXCLUDED.config`,
      [guildId, yamlText]
    );
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }

  // Notify bot to invalidate its config cache
  const botApiUrl = process.env["BOT_API_URL"] ?? "http://localhost:3000";
  fetch(`${botApiUrl}/api/cache/yaml-config/${guildId}`, { method: "POST" }).catch(() => {});

  res.json({ ok: true });
});

// Dashboard Access Management (owner-only)
router.get("/:guildId/dashboard-access", requireAuth, requireGuildOwner, async (req: any, res: any) => {
  const { guildId } = req.params;
  const access = (await dbGet<DashboardAccessStore>("dashboardAccess", guildId)) ?? { users: [] };
  res.json(access.users);
});

router.post("/:guildId/dashboard-access", requireAuth, requireGuildOwner, async (req: any, res: any) => {
  const { guildId } = req.params;
  const { userId, permission } = req.body as { userId: string; permission: "view" | "edit" };

  if (!userId || !/^\d{15,20}$/.test(userId)) {
    return res.status(400).json({ error: "Invalid Discord user ID" });
  }
  if (permission !== "view" && permission !== "edit") {
    return res.status(400).json({ error: "Permission must be 'view' or 'edit'" });
  }

  // Fetch user info from Discord
  const botToken = process.env["DISCORD_BOT_TOKEN"];
  let tag = userId;
  let avatar: string | null = null;
  if (botToken) {
    try {
      const r = await fetch(`https://discord.com/api/v10/users/${userId}`, {
        headers: { Authorization: `Bot ${botToken}` },
      });
      if (r.ok) {
        const u: any = await r.json();
        tag = u.global_name ?? u.username ?? userId;
        avatar = u.avatar ?? null;
      }
    } catch { /* ignore */ }
  }

  const access = (await dbGet<DashboardAccessStore>("dashboardAccess", guildId)) ?? { users: [] };
  const existing = access.users.findIndex((u) => u.id === userId);
  const entry: DashboardAccessEntry = { id: userId, tag, avatar, permission };
  if (existing >= 0) {
    access.users[existing] = entry;
  } else {
    access.users.push(entry);
  }
  await dbSet("dashboardAccess", guildId, access);
  res.json(entry);
});

router.patch("/:guildId/dashboard-access/:userId", requireAuth, requireGuildOwner, async (req: any, res: any) => {
  const { guildId, userId } = req.params;
  const { permission } = req.body as { permission: "view" | "edit" };
  if (permission !== "view" && permission !== "edit") {
    return res.status(400).json({ error: "Permission must be 'view' or 'edit'" });
  }
  const access = (await dbGet<DashboardAccessStore>("dashboardAccess", guildId)) ?? { users: [] };
  const idx = access.users.findIndex((u) => u.id === userId);
  if (idx < 0) return res.status(404).json({ error: "User not found in access list" });
  access.users[idx]!.permission = permission;
  await dbSet("dashboardAccess", guildId, access);
  res.json(access.users[idx]);
});

router.delete("/:guildId/dashboard-access/:userId", requireAuth, requireGuildOwner, async (req: any, res: any) => {
  const { guildId, userId } = req.params;
  const access = (await dbGet<DashboardAccessStore>("dashboardAccess", guildId)) ?? { users: [] };
  access.users = access.users.filter((u) => u.id !== userId);
  await dbSet("dashboardAccess", guildId, access);
  res.json({ ok: true });
});

// My dashboard permission for this guild
router.get("/:guildId/my-access", requireAuth, async (req: any, res: any) => {
  const { guildId } = req.params;
  const userId = req.session?.userId;

  if (userId === OWNER_ID) return res.json({ role: "bot-owner", permission: "edit" });

  const guilds: any[] = req.session.guilds ?? [];
  if (guilds.find((g: any) => g.id === guildId)) return res.json({ role: "owner", permission: "edit" });

  const access = (await dbGet<DashboardAccessStore>("dashboardAccess", guildId)) ?? { users: [] };
  const entry = access.users.find((u) => u.id === userId);
  if (entry) return res.json({ role: "staff", permission: entry.permission });

  return res.status(403).json({ error: "No access" });
});

export default router;

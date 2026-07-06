import { Router } from "express";
import { dbGet, dbSet, dbDelete } from "../db.js";

const router = Router();
const CHAT_STORE = "charlesChats";
const MAX_STORED_MESSAGES = 60;

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// TYPES

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

interface UserMemory {
  prefix?: string;
  style?: "quick" | "detailed";
  lastTopic?: string;
  knownIssues?: string[];
  guildContext?: string;
}

interface ChatStore {
  messages: ChatMessage[];
  memory: UserMemory;
  updatedAt: number;
}

// MEMORY EXTRACTION — pick up context clues from the user's message

function extractMemoryUpdates(msg: string, current: UserMemory): Partial<UserMemory> {
  const updates: Partial<UserMemory> = {};

  // Detect prefix: "my prefix is !" / "prefix: ?" / "i use >> as prefix"
  const prefixMatch = msg.match(/(?:my|our|the|server)\s+prefix\s+(?:is|=|:)\s*["']?([^\s"'.,]{1,6})["']?/i)
    ?? msg.match(/(?:using|use)\s+["']?([^\s"'.,]{1,6})["']?\s+(?:as\s+)?(?:a\s+)?prefix/i)
    ?? msg.match(/prefix\s*[=:]\s*["']?([^\s"'.,]{1,6})["']?/i);
  if (prefixMatch?.[1]) updates.prefix = prefixMatch[1];

  // Detect style preference
  if (/\b(quick|short|fast|just\s+(give|show)\s+me|no\s+explanation|skip\s+the\s+explain)\b/i.test(msg))
    updates.style = "quick";
  if (/\b(explain|why\s+does|how\s+does|walk\s+me\s+through|in\s+detail|what\s+does\s+.+\s+do)\b/i.test(msg))
    updates.style = "detailed";

  return updates;
}

// YAML DETECTION + ANALYSIS

function looksLikeYaml(msg: string): boolean {
  const lines = msg.split("\n").filter((l) => l.trim());
  const yamlLike = lines.filter((l) =>
    /^\s*[\w_]+\s*:/.test(l) || /^\s*-\s+/.test(l)
  );
  return yamlLike.length >= 3;
}

function buildConfigReview(yaml: string): string {
  const lower = yaml.toLowerCase();
  const hasPlugin = (name: string) => new RegExp(`(^|\\n\\s*)${name}\\s*:`).test(lower);

  const knownPlugins = [
    "moderation","automod","escalation","logging","welcome","tickets",
    "antinuke","antiraid","reaction_roles","starboard","autoreply","tags",
    "lockdown","auto_slowmode","autoreaction","temp_roles",
  ];
  const found = knownPlugins.filter(hasPlugin);
  const missing: string[] = [];

  const issues: string[] = [];
  if (/:\s+\d{15,20}(?!\s*["'])/.test(yaml))
    issues.push("Discord IDs must be **quoted strings** — e.g. `\"123456789012345678\"` not a bare number. YAML will silently truncate large integers.");
  if (/\t/.test(yaml))
    issues.push("**Tab characters** detected — YAML requires spaces only. Replace all tabs with 2-space indentation.");
  if (/ROLE_ID|CHANNEL_ID|USER_ID|_ID\b/.test(yaml))
    issues.push("**Placeholder IDs** still present (e.g. `ROLE_ID`, `CHANNEL_ID`) — replace with real Discord snowflake IDs.");
  if (!lower.includes("enabled: true") && found.length > 0)
    issues.push("Some plugin blocks may be missing `enabled: true` — plugins without it won't activate.");

  if (!lower.includes("levels:")) missing.push("**levels** — without this, all commands are disabled");
  if (!hasPlugin("moderation")) missing.push("**moderation** — core ban/kick/warn/mute commands");
  if (!hasPlugin("logging")) missing.push("**logging** — mod log and server event log");

  const lines: string[] = [];
  lines.push("## Config Review");
  lines.push(`Alright, I've read through your config — here's what I found!\n`);
  lines.push(`**Plugins detected:** ${found.length ? found.map((p) => `\`${p}\``).join(", ") : "none — looks like this might be a partial config?"}`);
  lines.push(`**Prefix:** ${/^prefix\s*:/m.test(lower) ? "✅ set" : "⚠️ not found — add `prefix: \"!\"`  at the top"}`);
  lines.push(`**Levels block:** ${lower.includes("levels:") ? "✅ present" : "❌ missing — without this, most commands won't be accessible"}`);

  if (issues.length) {
    lines.push("\n### ⚠️ Issues to fix");
    issues.forEach((i) => lines.push(`- ${i}`));
  }

  if (missing.length) {
    lines.push("\n### 💡 Things worth adding");
    missing.forEach((m) => lines.push(`- ${m}`));
    lines.push("\nJust ask me for any of these and I'll give you the ready-to-paste YAML right away.");
  }

  if (!issues.length && !missing.length) {
    lines.push("\n✅ Looks clean to me! No obvious issues. If something still isn't working, tell me what's happening and I'll dig deeper.");
  }

  lines.push("\n> Want me to expand any section, fix an issue, or add a new plugin to what you have? Just say the word!");

  return lines.join("\n");
}

// KNOWLEDGE BASE
// Each entry has: id, keywords[], followup_keywords[] (matched only as follow-up),
// parent (topic group for follow-up chaining), and answer

interface KbEntry {
  id: string;
  topic: string;          // group — used to detect follow-ups within the same topic
  priority?: number;      // higher = preferred when multiple match
  keywords: string[];
  answer: string;
}

const KB: KbEntry[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // STARTER / BASICS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "starter",
    topic: "starter",
    keywords: ["get started","basic","structure","template","starter","beginning","initial","quickstart","how do i configure","how to configure","new config","fresh config","start"],
    answer: `## Starter Config

\`\`\`yaml
# Replace every *_ID with a real Discord snowflake ID.
# Right-click any role/channel/user → Copy ID (enable Developer Mode first).

prefix: "!"

levels:
  roles:
    "TRIAL_MOD_ROLE_ID":  25
    "MOD_ROLE_ID":        50
    "SENIOR_MOD_ROLE_ID": 75
    "ADMIN_ROLE_ID":      100
  commands:
    warn: 25   mute: 25   unmute: 25   purge: 25   note: 25
    kick: 50   ban: 50    unban: 50    tempban: 50
    lock: 75   unlock: 75 masswarn: 75 massban: 100
    level: 100

plugins:
  moderation:
    enabled: true
    mute_role: null
    dm_on_action: true

  automod:
    enabled: true
    spam:
      enabled: true
      max_messages: 5
      interval_seconds: 5
      action: warn
    invite_links:
      enabled: true
      action: warn

  logging:
    enabled: true
    mod_log_channel: "MOD_LOG_CHANNEL_ID"
    server_log_channel: "SERVER_LOG_CHANNEL_ID"

  welcome:
    enabled: true
    join:
      channel: "WELCOME_CHANNEL_ID"
      message: "👋 Welcome {user.mention} to **{server}**!"
    join_role: "MEMBER_ROLE_ID"
\`\`\`

> **Tips:**
> - Always quote Discord IDs: \`"123456789012345678"\`
> - Use 2-space indentation, never tabs
> - Paste your config back here and I'll review it`,
  },

  {
    id: "prefix",
    topic: "prefix",
    keywords: ["prefix","command prefix","change prefix","set prefix","custom prefix"],
    answer: `## Prefix

\`\`\`yaml
prefix: "!"
\`\`\`

Change \`!\` to anything — \`?\`, \`.\`, \`>>\`, \`np!\`, etc. Multi-character prefixes work.

> **Tip:** If you change the prefix, tell your mods — the old one stops working immediately.`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVELS / PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "levels-basic",
    topic: "levels",
    keywords: ["level","permission","role level","command level","levels","who can use","restrict command","enable command","disable command","access"],
    answer: `## Levels (Permissions)

\`\`\`yaml
levels:
  roles:
    "TRIAL_MOD_ROLE_ID":  25
    "MOD_ROLE_ID":        50
    "SENIOR_MOD_ROLE_ID": 75
    "ADMIN_ROLE_ID":      100

  users:
    "YOUR_USER_ID": 100    # specific user override

  commands:
    # Public
    userinfo: 0   help: 0   case: 0   cases: 0

    # Trial mod (25)
    warn: 25   mute: 25   unmute: 25   purge: 25   note: 25   viewnotes: 25

    # Standard mod (50)
    kick: 50   ban: 50   unban: 50   tempban: 50   forceban: 50
    addrole: 50   removerole: 50

    # Senior mod (75)
    masswarn: 75   massban: 75   masskick: 75
    lock: 75   unlock: 75   hide: 75   unhide: 75   deletecase: 75

    # Admin (100)
    level: 100   raidmode: 100
\`\`\`

> **Tips:**
> - Owner always = 1000 regardless of config
> - Any command NOT listed here is disabled (treated as level 999)
> - Ask me *"what level should I use for X command"* for guidance`,
  },

  {
    id: "levels-all-commands",
    topic: "levels",
    priority: 5,
    keywords: ["all commands level","every command","full command list","complete command level","all levels","all command levels","command reference"],
    answer: `## All Commands — Recommended Levels

\`\`\`yaml
levels:
  commands:
    # ── Warnings ────────────────────────────────────────────
    warn: 25         forcewarn: 50

    # ── Kicks ───────────────────────────────────────────────
    kick: 50

    # ── Bans ────────────────────────────────────────────────
    ban: 50          forceban: 50      unban: 50
    tempban: 50      softban: 50       baninfo: 25    banlist: 25

    # ── Mutes ───────────────────────────────────────────────
    mute: 25         forcemute: 50     unmute: 25
    forceunmute: 50  tempmute: 25      mutelist: 25   muteinfo: 25

    # ── Purge / Slowmode ────────────────────────────────────
    purge: 25        slowmode: 50      slowmodeinfo: 25

    # ── Cases ───────────────────────────────────────────────
    case: 0          cases: 0          addcase: 50
    editcase: 50     deletecase: 75    servercases: 25
    reason: 25       casecount: 0      exportcases: 75

    # ── Notes ───────────────────────────────────────────────
    note: 25         viewnotes: 25     deletenote: 75
    forcenote: 50    notesearch: 25    editnote: 25

    # ── Nickname ────────────────────────────────────────────
    nick: 25         resetnick: 25     locknick: 75   unlocknick: 75

    # ── Channel ─────────────────────────────────────────────
    lock: 75         unlock: 75        hide: 75       unhide: 75

    # ── Watch / Roleban ─────────────────────────────────────
    watch: 25        unwatch: 25       watchlist: 25
    roleban: 75      unroleban: 75     rolebanned: 25

    # ── Roles ───────────────────────────────────────────────
    addrole: 50      removerole: 50    temprole: 50   temproles: 25

    # ── Mass actions ────────────────────────────────────────
    masswarn: 75     massforcewarn: 75 massmute: 75   massforcemute: 75
    massunmute: 75   masskick: 75      massban: 100   massforceban: 100
    massunban: 75

    # ── Raid ────────────────────────────────────────────────
    raidmode: 75     seen: 0

    # ── Level management ────────────────────────────────────
    level: 100       levels: 100

    # ── Info / Utility ──────────────────────────────────────
    userinfo: 0      avatar: 0         banner: 0      roles: 0
    joined: 0        serverinfo: 0     membercount: 0 help: 0
    warncount: 0     casecount: 0
    permissions: 25  modstats: 25      casesearch: 25 bansearch: 25
\`\`\``,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODERATION
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "moderation-full",
    topic: "moderation",
    keywords: ["moderation","moderation config","mod config","mod plugin","moderation plugin"],
    answer: `## Moderation Plugin

\`\`\`yaml
plugins:
  moderation:
    enabled: true
    mute_role: null          # null = Discord timeout | "ROLE_ID" = mute-role mode
    dm_on_action: true       # DM user when actioned
    strip_roles_on_mute: false
    dm_mute_updates: false

    messages:
      ban_success:    "🔨 **{user}** banned | Reason: {reason} | Case: #{case_id}"
      unban_success:  "✅ **{user}** unbanned | Case: #{case_id}"
      kick_success:   "👢 **{user}** kicked | Reason: {reason} | Case: #{case_id}"
      mute_success:   "🔇 **{user}** muted ({duration}) | Case: #{case_id}"
      unmute_success: "🔊 **{user}** unmuted | Case: #{case_id}"
      warn_success:   "⚠️ **{user}** warned | Case: #{case_id}"
      purge_success:  "🗑️ {count} messages deleted"
      ban_dm:    "You have been **banned** from **{server}** for: {reason}"
      kick_dm:   "You have been **kicked** from **{server}** for: {reason}"
      mute_dm:   "You have been **muted** in **{server}** | Duration: {duration} | Reason: {reason}"
      warn_dm:   "You have been **warned** in **{server}** for: {reason}"
      unmute_dm: "Your mute in **{server}** has been lifted."
\`\`\`

> **Tips:**
> - Ask *"mute role setup"* for permanent-mute configuration
> - Ask *"ban embed message"* for embed-style messages
> - Variables: \`{user}\` \`{user.mention}\` \`{mod}\` \`{reason}\` \`{duration}\` \`{case_id}\``,
  },

  {
    id: "moderation-embed",
    topic: "moderation",
    priority: 5,
    keywords: ["ban embed","kick embed","mod embed","embed message","embed ban","embed warn","moderation embed","action embed"],
    answer: `## Moderation — Embed Messages

\`\`\`yaml
plugins:
  moderation:
    enabled: true
    messages:

      ban_success:
        embed:
          title: "🔨 User Banned"
          description: "**{user}** was banned by {mod.mention}"
          color: "#FF4444"
          thumbnail: "{user.avatar}"
          footer: "Case #{case_id} • {timestamp}"
          fields:
            - name: "Reason"
              value: "{reason}"
              inline: true
            - name: "Duration"
              value: "{duration}"
              inline: true

      kick_success:
        embed:
          title: "👢 User Kicked"
          description: "**{user}** was kicked by {mod.mention}"
          color: "#FFA500"
          footer: "Case #{case_id} • {timestamp}"
          fields:
            - name: "Reason"
              value: "{reason}"
              inline: true

      warn_success:
        embed:
          title: "⚠️ User Warned"
          description: "**{user}** was warned by {mod.mention}"
          color: "#FFD700"
          footer: "Case #{case_id} • {timestamp}"
          fields:
            - name: "Reason"
              value: "{reason}"
              inline: true

      mute_success:
        embed:
          title: "🔇 User Muted"
          description: "**{user}** was muted by {mod.mention}"
          color: "#808080"
          footer: "Case #{case_id} • {timestamp}"
          fields:
            - name: "Duration"
              value: "{duration}"
              inline: true
            - name: "Reason"
              value: "{reason}"
              inline: true
\`\`\`

> **Tip:** Use \`color: "#57f287"\` for green, \`"#FF4444"\` for red, \`"#FFA500"\` for orange, \`"#FFD700"\` for gold.`,
  },

  {
    id: "mute-role",
    topic: "moderation",
    priority: 5,
    keywords: ["mute role","mute setup","configure mute","permanent mute","mute mode","timeout mode"],
    answer: `## Mute Configuration

**Option A — Discord timeout (no setup, max 28 days):**
\`\`\`yaml
plugins:
  moderation:
    enabled: true
    mute_role: null
\`\`\`

**Option B — Mute role (supports permanent mutes):**
\`\`\`yaml
plugins:
  moderation:
    enabled: true
    mute_role: "MUTED_ROLE_ID"
    strip_roles_on_mute: false   # true = remove all roles while muted
    dm_mute_updates: true
\`\`\`

**Setting up the Muted role:**
1. Create a role named \`Muted\` with no permissions
2. In every channel → Permissions → Add \`Muted\` → Deny: **Send Messages**, **Add Reactions**, **Speak**
3. Paste the role ID above

> **Tip:** Use Option B for permanent mutes. Discord timeout is capped at 28 days.`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTOMOD
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "automod-full",
    topic: "automod",
    keywords: ["automod","auto mod","auto moderation","automod config","automod plugin"],
    answer: `## AutoMod Plugin

\`\`\`yaml
plugins:
  automod:
    enabled: true

    spam:
      enabled: true
      max_messages: 5
      interval_seconds: 5
      action: warn
      ignored_channels: []
      messages:
        channel_response: "⚠️ {user.mention} slow down — spam detected."
        log_response: "AutoMod | spam | {user} | {channel}"

    bad_words:
      enabled: true
      words: ["word1","word2","bad phrase"]
      action: warn
      delete: true
      messages:
        channel_response: "⚠️ {user.mention} that word is not allowed."
        log_response: "AutoMod | bad_words | {user} | word: {trigger}"

    invite_links:
      enabled: true
      action: warn
      delete: true
      whitelist: []            # allowed invite codes
      messages:
        channel_response: "⚠️ {user.mention} no invite links."

    mass_mentions:
      enabled: true
      max_mentions: 5
      action: mute
      duration: "30m"

    caps:
      enabled: true
      min_length: 10
      caps_percent: 70
      action: warn

    repeated_text:
      enabled: true
      threshold: 3
      action: warn

    link_spam:
      enabled: true
      max_links: 3
      interval_seconds: 10
      action: mute
      duration: "10m"
\`\`\`

> **Tips:**
> - Use \`action: warn\` + escalation so repeat offenders get auto-muted/kicked/banned
> - Ask *"automod spam only"* or *"bad word filter config"* for just one filter
> - Ask *"automod escalation pipeline"* for the full warn→mute→ban flow`,
  },

  {
    id: "automod-spam",
    topic: "automod",
    priority: 5,
    keywords: ["spam filter","spam only","spam config","spam detection","spam automod","anti spam"],
    answer: `## AutoMod — Spam Filter

\`\`\`yaml
plugins:
  automod:
    enabled: true
    spam:
      enabled: true
      max_messages: 5          # messages allowed
      interval_seconds: 5      # within this window (seconds)
      action: warn             # warn | mute | kick | ban
      duration: "10m"          # for mute/ban (omit = permanent)
      ignored_channels:
        - "BOT_CHANNEL_ID"
      ignored_roles:
        - "TRUSTED_ROLE_ID"
      messages:
        channel_response: "⚠️ {user.mention} stop spamming."
        log_response: "AutoMod | spam | {user} ({user.id}) | {channel}"
        dm_response: "You were actioned in **{server}** for spamming."
\`\`\`

> **Tip:** Pair with escalation — \`action: warn\` here feeds into escalation thresholds automatically.`,
  },

  {
    id: "automod-badwords",
    topic: "automod",
    priority: 5,
    keywords: ["bad word","word filter","bad words","blocked words","word list","profanity","automod words","filter words","swear"],
    answer: `## AutoMod — Bad Word Filter

\`\`\`yaml
plugins:
  automod:
    enabled: true
    bad_words:
      enabled: true
      words:
        - "slur1"
        - "slur2"
        - "bad phrase"          # phrases work too
      # regex: true             # uncomment to use regex patterns
      action: warn
      delete: true              # delete the triggering message
      silent_delete: false      # true = delete without sending channel_response
      ignored_channels: []
      ignored_roles: []
      messages:
        channel_response: "⚠️ {user.mention} that word is not allowed here."
        log_response: "AutoMod | bad_words | {user} | word: **{trigger}** | {channel}"
\`\`\`

> **Tips:**
> - Phrases with spaces work: \`"bad phrase"\`
> - Use \`regex: true\` for pattern matching: \`"sl[u\\\\U]r"\`
> - \`silent_delete: true\` removes the message quietly without alerting the user in chat`,
  },

  {
    id: "automod-invites",
    topic: "automod",
    priority: 5,
    keywords: ["invite link","invite filter","discord invite","anti invite","block invites","invite spam"],
    answer: `## AutoMod — Invite Link Filter

\`\`\`yaml
plugins:
  automod:
    enabled: true
    invite_links:
      enabled: true
      action: warn
      delete: true
      whitelist:
        - "your-server-code"    # allowed invite codes (not full URLs)
        - "partner-server-code"
      ignored_channels:
        - "PARTNER_CHANNEL_ID"
      ignored_roles:
        - "STAFF_ROLE_ID"
      messages:
        channel_response: "⚠️ {user.mention} posting invite links is not allowed."
        log_response: "AutoMod | invite | {user} | {channel}"
\`\`\`

> **Tip:** Only add the invite code to the whitelist (e.g. \`"abc123"\`), not the full URL.`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ESCALATION
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "escalation-full",
    topic: "escalation",
    keywords: ["escalation","escalate","warn escalation","auto action","warn threshold","punishment escalation","auto ban","auto kick","auto mute","escalation config"],
    answer: `## Punishment Escalation

\`\`\`yaml
plugins:
  escalation:
    enabled: true
    manual:
      enabled: true

      thresholds:
        - tracked_type: "warn"
          count: 3
          action: mute
          duration: "1h"
          reason: "Escalation: 3 warnings"

        - tracked_type: "warn"
          count: 5
          action: mute
          duration: "12h"
          reason: "Escalation: 5 warnings"

        - tracked_type: "warn"
          count: 7
          action: kick
          reason: "Escalation: 7 warnings"

        - tracked_type: "warn"
          count: 10
          action: ban
          duration: "perm"
          reason: "Escalation: 10 warnings"

        - tracked_type: "mute"
          count: 3
          action: kick
          reason: "Escalation: 3 mutes"

        - tracked_type: "mute"
          count: 5
          action: ban
          duration: "perm"
          reason: "Escalation: 5 mutes"

      messages:
        escalation_triggered: "⚡ **{user}** has been {action_past} for repeated infractions | Case: #{case_id}"
        escalation_dm: "You have been {action_past} in **{server}** for: {reason}"
\`\`\`

> **Tips:**
> - AutoMod \`action: warn\` feeds directly into these thresholds
> - Thresholds fire on exact count — count 4 won't re-fire the count-3 threshold
> - Ask *"automod escalation pipeline"* for a combined AutoMod + Escalation config`,
  },

  {
    id: "escalation-pipeline",
    topic: "escalation",
    priority: 5,
    keywords: ["automod escalation","pipeline","automod warn escalate","escalation pipeline","automod to escalation","warn to ban","warn to mute pipeline"],
    answer: `## AutoMod → Escalation Pipeline

\`\`\`yaml
plugins:
  automod:
    enabled: true
    spam:
      enabled: true
      max_messages: 5
      interval_seconds: 5
      action: warn             # ← each trigger creates a warn case

    bad_words:
      enabled: true
      words: ["word1","word2"]
      action: warn             # ← also creates a warn case
      delete: true

    invite_links:
      enabled: true
      action: warn
      delete: true

  escalation:
    enabled: true
    manual:
      enabled: true
      thresholds:
        - tracked_type: "warn"
          count: 3
          action: mute
          duration: "1h"
          reason: "3 automod/manual warnings"

        - tracked_type: "warn"
          count: 5
          action: mute
          duration: "6h"
          reason: "5 warnings"

        - tracked_type: "warn"
          count: 8
          action: kick
          reason: "8 warnings"

        - tracked_type: "warn"
          count: 10
          action: ban
          duration: "perm"
          reason: "10 warnings — permanent ban"
\`\`\`

> **How it works:** AutoMod warns → warn cases pile up → escalation fires automatically. Manual \`!warn\` commands count toward the same totals.`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGGING — multiple granular entries
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "logging-full",
    topic: "logging",
    keywords: ["logging","log","logging config","logging plugin","log channel","set up log","configure log","server log","mod log","logs"],
    answer: `## Logging Plugin

\`\`\`yaml
plugins:
  logging:
    enabled: true

    # Mod action log (bans, kicks, warns, mutes, cases)
    mod_log_channel: "MOD_LOG_CHANNEL_ID"

    # Server event log (joins, leaves, edits, deletes, voice, roles…)
    server_log_channel: "SERVER_LOG_CHANNEL_ID"

    # Don't log messages from these channels
    ignored_channels:
      - "BOT_CHANNEL_ID"

    # Don't log these roles' activity
    ignored_roles: []

    # Log actions taken by bots (default: false)
    log_bot_actions: false

    # Include message content in edit/delete logs
    log_message_content: true
\`\`\`

> **Tips:**
> - Ask *"separate log channels"* to route different events to different channels
> - Ask *"all logging events"* to see every event you can enable/disable
> - Ask *"disable specific log events"* to turn off noisy events`,
  },

  {
    id: "logging-separate-channels",
    topic: "logging",
    priority: 5,
    keywords: ["separate log","per category","split log","different channel","join log channel","leave log","message log channel","voice log","channel per log","specific log channel","event to channel","send log to channel","log sent to channel","separate channel","sent to channel"],
    answer: `## Logging — Separate Channels Per Event

Route each event type to its own channel:

\`\`\`yaml
plugins:
  logging:
    enabled: true

    # ── Mod action log ─────────────────────────────────────────────
    mod_log_channel: "MOD_LOG_CHANNEL_ID"

    # ── Member events ──────────────────────────────────────────────
    join_log_channel:   "JOIN_LOG_CHANNEL_ID"
    leave_log_channel:  "LEAVE_LOG_CHANNEL_ID"
    member_log_channel: "MEMBER_LOG_CHANNEL_ID"  # nickname, role changes

    # ── Message events ─────────────────────────────────────────────
    message_log_channel: "MESSAGE_LOG_CHANNEL_ID" # edits and deletes

    # ── Voice events ───────────────────────────────────────────────
    voice_log_channel: "VOICE_LOG_CHANNEL_ID"    # joins, leaves, moves

    # ── Server structure events ────────────────────────────────────
    server_log_channel: "SERVER_LOG_CHANNEL_ID"  # channels, roles, guild updates

    ignored_channels:
      - "BOT_CHANNEL_ID"
    log_bot_actions: false
    log_message_content: true
\`\`\`

> **Tip:** You don't need all of them — set only the channels you want. Events without a dedicated channel fall back to \`server_log_channel\`.`,
  },

  {
    id: "logging-all-events",
    topic: "logging",
    priority: 5,
    keywords: ["all events","all log events","every event","event list","what can i log","log events","disabled events","enable events","logging events","full event","all logging","list events","send all logs"],
    answer: `## Logging — All Available Events

\`\`\`yaml
plugins:
  logging:
    enabled: true
    mod_log_channel: "MOD_LOG_CHANNEL_ID"
    server_log_channel: "SERVER_LOG_CHANNEL_ID"
    message_log_channel: "MESSAGE_LOG_CHANNEL_ID"
    voice_log_channel: "VOICE_LOG_CHANNEL_ID"
    join_log_channel: "JOIN_LOG_CHANNEL_ID"
    leave_log_channel: "LEAVE_LOG_CHANNEL_ID"
    member_log_channel: "MEMBER_LOG_CHANNEL_ID"

    # Events to silence — comment out any you WANT to keep
    disabled_events:
      # Member
      # - "member_join"
      # - "member_leave"
      # - "nickname_change"
      # - "member_role_add"
      # - "member_role_remove"
      # - "member_timeout"

      # Messages
      # - "message_edit"
      # - "message_delete"
      # - "message_bulk_delete"

      # Voice
      # - "voice_join"
      # - "voice_leave"
      # - "voice_move"
      # - "voice_mute"
      # - "voice_deafen"

      # Server structure
      # - "channel_create"
      # - "channel_delete"
      # - "channel_update"
      # - "role_create"
      # - "role_delete"
      # - "role_update"
      # - "guild_update"
      # - "emoji_update"
      # - "sticker_update"
      # - "invite_create"
      # - "invite_delete"
      # - "webhook_create"
      # - "webhook_delete"
      # - "ban_add"
      # - "ban_remove"

    log_message_content: true
    log_bot_actions: false
\`\`\`

> **Tip:** Leave \`disabled_events: []\` (empty) to log everything. Uncomment only events you want to mute.`,
  },

  {
    id: "logging-message-events",
    topic: "logging",
    priority: 5,
    keywords: ["message edit log","message delete log","log edits","log deletes","message log","edited message","deleted message","log message","message logging"],
    answer: `## Logging — Message Events

\`\`\`yaml
plugins:
  logging:
    enabled: true
    message_log_channel: "MESSAGE_LOG_CHANNEL_ID"

    # Include full message content in logs
    log_message_content: true

    # Events to disable (comment = keep enabled)
    disabled_events: []
    # - "message_edit"         # uncomment to stop logging edits
    # - "message_delete"       # uncomment to stop logging deletes
    # - "message_bulk_delete"  # uncomment to stop logging purge events

    # Don't log messages from these channels
    ignored_channels:
      - "BOT_CHANNEL_ID"
      - "SPAM_CHANNEL_ID"

    # Don't log bots' messages being edited/deleted
    log_bot_actions: false
\`\`\`

> **Tip:** \`log_message_content: false\` stops storing message text in logs — useful for privacy-sensitive servers.`,
  },

  {
    id: "logging-join-leave",
    topic: "logging",
    priority: 5,
    keywords: ["join log","leave log","member join log","member leave log","log joins","log leaves","join leave"],
    answer: `## Logging — Join / Leave Events

\`\`\`yaml
plugins:
  logging:
    enabled: true
    join_log_channel:  "JOIN_LOG_CHANNEL_ID"
    leave_log_channel: "LEAVE_LOG_CHANNEL_ID"

    # To use a single channel for both:
    # server_log_channel: "SERVER_LOG_CHANNEL_ID"

    disabled_events: []
    # - "member_join"   # uncomment to stop join logs
    # - "member_leave"  # uncomment to stop leave logs
\`\`\``,
  },

  {
    id: "logging-voice",
    topic: "logging",
    priority: 5,
    keywords: ["voice log","voice event","log voice","voice join log","voice leave log","voice channel log"],
    answer: `## Logging — Voice Events

\`\`\`yaml
plugins:
  logging:
    enabled: true
    voice_log_channel: "VOICE_LOG_CHANNEL_ID"

    disabled_events: []
    # - "voice_join"    # user joined a voice channel
    # - "voice_leave"   # user left a voice channel
    # - "voice_move"    # user moved between voice channels
    # - "voice_mute"    # user server-muted
    # - "voice_deafen"  # user server-deafened
\`\`\``,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ANTI-NUKE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "antinuke-full",
    topic: "antinuke",
    keywords: ["anti-nuke","antinuke","anti nuke","nuke protection","nuke config","antinuke config"],
    answer: `## Anti-Nuke Plugin

\`\`\`yaml
plugins:
  antinuke:
    enabled: true

    # Always trusted (owner is always exempt)
    whitelist:
      - "TRUSTED_ADMIN_ID"

    # Options: ban | kick | strip_roles | none
    punishment: ban

    # DM the server owner when triggered
    dm_owner: true

    thresholds:
      ban:
        count: 3
        interval_seconds: 10
      kick:
        count: 5
        interval_seconds: 10
      channel_delete:
        count: 3
        interval_seconds: 10
      channel_create:
        count: 5
        interval_seconds: 15
      role_delete:
        count: 3
        interval_seconds: 10
      role_create:
        count: 5
        interval_seconds: 15
      webhook_delete:
        count: 3
        interval_seconds: 10
      member_prune:
        count: 1
        interval_seconds: 60
      dangerous_perm_grant:
        enabled: true

    messages:
      alert: "🚨 Anti-Nuke! **{user}** did {count} \`{action}\` in {interval}s → {punishment_past}"
      owner_dm: "⚠️ Anti-Nuke fired in **{server}**! {user} ({user.id}) | {action} | {punishment}"
\`\`\`

> **Tips:**
> - Keep the whitelist minimal — even trusted admins can be compromised
> - \`punishment: strip_roles\` is softer — removes permissions without banning
> - Ask *"antinuke thresholds"* for guidance on adjusting count values`,
  },

  {
    id: "antinuke-thresholds",
    topic: "antinuke",
    priority: 5,
    keywords: ["antinuke threshold","nuke threshold","nuke count","how many","what count","adjust antinuke","antinuke values","nuke settings","nuke sensitivity"],
    answer: `## Anti-Nuke — Threshold Guide

\`\`\`yaml
plugins:
  antinuke:
    enabled: true
    punishment: ban

    thresholds:
      # ── Small / tight server (stricter) ──────────────────────────
      ban:            { count: 2,  interval_seconds: 10 }
      kick:           { count: 3,  interval_seconds: 10 }
      channel_delete: { count: 2,  interval_seconds: 10 }
      channel_create: { count: 3,  interval_seconds: 15 }
      role_delete:    { count: 2,  interval_seconds: 10 }
      role_create:    { count: 3,  interval_seconds: 15 }
      webhook_delete: { count: 2,  interval_seconds: 10 }
      member_prune:   { count: 1,  interval_seconds: 60 }

      # ── Large / active server (more lenient) ─────────────────────
      # ban:            { count: 5,  interval_seconds: 10 }
      # kick:           { count: 8,  interval_seconds: 10 }
      # channel_delete: { count: 5,  interval_seconds: 10 }
      # channel_create: { count: 8,  interval_seconds: 15 }
      # role_delete:    { count: 5,  interval_seconds: 10 }

      dangerous_perm_grant:
        enabled: true
\`\`\`

> **Tip:** Lower = more sensitive. For large servers with active admins, use higher counts to avoid false positives.`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ANTI-RAID
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "antiraid-full",
    topic: "antiraid",
    keywords: ["anti-raid","antiraid","anti raid","raid protection","raid config","mass join","join flood"],
    answer: `## Anti-Raid Plugin

\`\`\`yaml
plugins:
  antiraid:
    enabled: true

    # Trigger when X joins happen within Y seconds
    join_threshold: 10
    join_interval_seconds: 5

    # Action on raiders: kick | ban | none
    action: kick

    # Kick/ban accounts newer than X days
    min_account_age_days: 7

    # Lock the server when raid is detected
    lockdown_on_raid: true

    # DM the owner
    dm_owner: true

    # Verification gate (forces new users to verify via DM)
    verification:
      enabled: false
      verified_role: "VERIFIED_ROLE_ID"
      dm_message: "Reply with **verify** to gain access to **{server}**."
      timeout_minutes: 10

    whitelist:
      - "TRUSTED_USER_ID"

    messages:
      raid_detected:  "🚨 Raid detected! {count} joins in {interval}s."
      lockdown_start: "🔒 Server locked due to raid."
      lockdown_end:   "✅ Lockdown lifted."
\`\`\`

> **Tips:**
> - \`verification.enabled: true\` is the safest mode — bots can't respond to DMs
> - Combine with \`antinuke\` for full server protection
> - Ask *"antiraid verification"* for the verification gate config`,
  },

  {
    id: "antiraid-verification",
    topic: "antiraid",
    priority: 5,
    keywords: ["verification","verify","verification gate","dm verify","antiraid verification","member verify","gate","gate new members"],
    answer: `## Anti-Raid — Verification Gate

\`\`\`yaml
plugins:
  antiraid:
    enabled: true
    join_threshold: 10
    join_interval_seconds: 5
    action: none              # don't kick immediately — verify first

    verification:
      enabled: true
      verified_role: "VERIFIED_ROLE_ID"    # given after verification
      dm_message: |
        👋 Welcome to **{server}**!
        Please reply with **verify** to gain access.
        You have 10 minutes.
      timeout_minutes: 10     # kick if not verified within this time
\`\`\`

**How it works:**
1. New member joins → gets DM with verification prompt
2. They reply **verify** in DM → bot gives them the verified role
3. If they don't verify within the timeout → kicked automatically

> **Tip:** Make all server channels visible only to the \`@verified\` role, and create a small \`#verify\` channel visible to unverified members.`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WELCOME
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "welcome-full",
    topic: "welcome",
    keywords: ["welcome","welcome message","join message","welcome config","welcome plugin","greet","member join message"],
    answer: `## Welcome Plugin

\`\`\`yaml
plugins:
  welcome:
    enabled: true

    join:
      channel: "WELCOME_CHANNEL_ID"
      message: "👋 Welcome {user.mention} to **{server}**! You are member #{server.member_count}."

    join_role: "MEMBER_ROLE_ID"     # auto-role on join (remove if not needed)

    join_dm: "Welcome to **{server}**! Please read the rules in <#RULES_CHANNEL_ID>."

    leave:
      channel: "WELCOME_CHANNEL_ID"
      message: "**{user.name}** has left. We now have {server.member_count} members."
\`\`\`

> **Variables:** \`{user}\` \`{user.mention}\` \`{user.name}\` \`{user.id}\` \`{user.avatar}\` \`{server}\` \`{server.member_count}\`
> - Ask *"welcome embed"* for an embed-style welcome message`,
  },

  {
    id: "welcome-embed",
    topic: "welcome",
    priority: 5,
    keywords: ["welcome embed","embed welcome","join embed","embed join message","fancy welcome"],
    answer: `## Welcome — Embed Message

\`\`\`yaml
plugins:
  welcome:
    enabled: true
    join:
      channel: "WELCOME_CHANNEL_ID"
      message:
        embed:
          title: "Welcome to {server}! 🎉"
          description: "Hey {user.mention}, glad you joined!\\n\\nPlease read the rules and enjoy your stay."
          color: "#57f287"
          thumbnail: "{user.avatar}"
          footer: "Member #{server.member_count} • Joined {user.joined_at}"
          fields:
            - name: "📜 Rules"
              value: "<#RULES_CHANNEL_ID>"
              inline: true
            - name: "🎫 Support"
              value: "<#SUPPORT_CHANNEL_ID>"
              inline: true

    join_role: "MEMBER_ROLE_ID"
    join_dm: "Welcome to **{server}**! 👋 Read the rules in <#RULES_CHANNEL_ID>."
    leave:
      channel: "WELCOME_CHANNEL_ID"
      message: "**{user.name}** left. {server.member_count} members remaining."
\`\`\``,
  },

  {
    id: "welcome-goodbye",
    topic: "welcome",
    priority: 5,
    keywords: ["leave message","goodbye","goodbye message","farewell","leave channel","member leave message"],
    answer: `## Welcome — Leave / Goodbye Message

\`\`\`yaml
plugins:
  welcome:
    enabled: true
    leave:
      channel: "LEAVE_LOG_CHANNEL_ID"
      message: "👋 **{user.name}** has left **{server}**. We now have {server.member_count} members."

      # OR embed:
      # message:
      #   embed:
      #     title: "Member Left"
      #     description: "**{user.name}** ({user.id}) has left the server."
      #     color: "#FF4444"
      #     thumbnail: "{user.avatar}"
      #     footer: "{server.member_count} members remaining"
\`\`\``,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TICKETS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "tickets-full",
    topic: "tickets",
    keywords: ["ticket","support ticket","ticket system","ticket config","ticket plugin","ticket panel"],
    answer: `## Tickets Plugin

\`\`\`yaml
plugins:
  tickets:
    enabled: true

    # Category where ticket channels are created
    category: "TICKET_CATEGORY_ID"

    # Roles that can see all tickets
    support_roles:
      - "SUPPORT_ROLE_ID"
      - "MOD_ROLE_ID"

    log_channel: "TICKET_LOG_CHANNEL_ID"
    max_open: 1                      # max open tickets per user
    inactivity_close_hours: 48       # auto-close after 48h of inactivity
    save_transcript: true
    ping_roles: true                 # ping support when ticket opens

    open_message:
      embed:
        title: "📋 Support Ticket"
        description: "Hey {user.mention}, support will be with you shortly.\\nPlease describe your issue."
        color: "#57f287"
        footer: "Opened by {user}"

    messages:
      open:         "✅ Your ticket: {channel.mention}"
      close:        "🔒 Closed by {mod.mention}."
      already_open: "❌ You already have a ticket: {channel.mention}"
      open_dm:      "Your ticket in **{server}** has been opened."
      close_dm:     "Your ticket in **{server}** has been closed."
\`\`\`

> **Tips:**
> - Create the category in Discord first, then right-click it to get its ID
> - \`inactivity_close_hours: 48\` cleans up stale tickets automatically
> - Ask *"ticket types"* to add multiple ticket categories (e.g. support, appeals, reports)`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // REACTION ROLES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "reaction-roles",
    topic: "reaction_roles",
    keywords: ["reaction role","role panel","react role","emoji role","self role","reaction roles"],
    answer: `## Reaction Roles Plugin

\`\`\`yaml
plugins:
  reaction_roles:
    enabled: true

    panels:
      - name: "game-roles"
        channel: "ROLES_CHANNEL_ID"
        message: "🎮 React to get a role!"
        exclusive: false          # false = can pick multiple
        roles:
          - emoji: "🎮"
            role: "GAMER_ROLE_ID"
            description: "Gaming"
          - emoji: "🎵"
            role: "MUSIC_ROLE_ID"
            description: "Music"
          - emoji: "🎨"
            role: "ART_ROLE_ID"
            description: "Art"

      # Exclusive panel — picking one removes the others
      - name: "region-roles"
        channel: "ROLES_CHANNEL_ID"
        message: "🌍 Pick your region:"
        exclusive: true
        roles:
          - emoji: "🇺🇸"
            role: "NA_ROLE_ID"
          - emoji: "🇪🇺"
            role: "EU_ROLE_ID"
          - emoji: "🇦🇺"
            role: "OCE_ROLE_ID"
\`\`\`

> **Tip:** Custom server emojis work too: \`emoji: "<:myemoji:123456789>"\``,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STARBOARD
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "starboard",
    topic: "starboard",
    keywords: ["starboard","star board","star","highlight","starboard config","starred messages","extra boards","color tiers","super star","lock starboard","force starboard","ignore starboard"],
    answer: `## Starboard Plugin

\`\`\`yaml
plugins:
  starboard:
    enabled: true
    channel: "STARBOARD_CHANNEL_ID"
    emoji: "⭐"
    threshold: 5
    self_star: false
    remove_on_unstar: true
    update_on_new_stars: true
    lock_after_post: false

    ignore_channels:
      - "MOD_CHANNEL_ID"
      - "STAFF_CHANNEL_ID"
    ignore_roles: []
    ignored_users: []
    nsfw_allowed: false
    bots_allowed: false
    max_age_days: 14
    min_message_length: 0

    post_format:
      show_author: true
      show_jump_link: true
      show_attachment: true
      show_channel: true
      show_timestamp: true
      star_count_format: "{count} {emoji}"
      embed_color_by_count: true
      color_tiers:
        - min_stars: 1
          color: "#FFD700"
        - min_stars: 5
          color: "#FFA500"
        - min_stars: 10
          color: "#FF6600"
        - min_stars: 20
          color: "#FF0000"
        - min_stars: 50
          color: "#FF00FF"
      super_star_threshold: 15
      super_star_emoji: "🌟"

    extra_boards:
      - name: "halloffame"
        channel: "HALL_CHANNEL_ID"
        emoji: "👑"
        threshold: 20
        embed_color: "#FFD700"
\`\`\`

**Commands:**
| Command | What it does | Level |
|---------|-------------|-------|
| \`!starboard top [count]\` | Shows most starred messages | 0 |
| \`!starboard stats [@user]\` | Shows stars received and given | 0 |
| \`!starboard info <message_id>\` | Shows starboard data for a message | 25 |
| \`!starboard force <message_id>\` | Force-posts a message regardless of star count | 75 |
| \`!starboard ignore @user\` | Adds user to ignore list | 75 |
| \`!starboard unignore @user\` | Removes user from ignore list | 75 |
| \`!starboard ignorechannel #channel\` | Adds channel to ignore list | 75 |
| \`!starboard unignorechannel #channel\` | Removes channel from ignore list | 75 |
| \`!starboard clear @user\` | Removes all starboard entries by a user | 100 |
| \`!starboard lock\` | Temporarily stops new messages from being posted | 100 |
| \`!starboard unlock\` | Re-enables starboard posting after a lock | 100 |

> **Tips:**
> - Higher threshold (8–10) on busy servers to avoid flooding
> - Custom emoji: replace \`"⭐"\` with \`"<:name:ID>"\`
> - Use \`embed_color_by_count: true\` for dynamic colors as stars accumulate
> - \`extra_boards\` lets you run multiple boards (e.g. a skull board with 💀, a funny board with 😂)
> - \`only_roles\` on an extra board creates a staff-only appreciation board`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTOREPLY
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "autoreply-full",
    topic: "autoreply",
    keywords: ["autoreply","auto reply","trigger response","keyword reply","auto respond"],
    answer: `## Autoreply Plugin

\`\`\`yaml
plugins:
  autoreply:
    enabled: true
    rules:
      - trigger: "discord.gg"
        match: "contains"
        response: "❌ No invite links!"
        delete: true

      - trigger: "!rules"
        match: "exact"
        response: "📜 Rules are in <#RULES_CHANNEL_ID>"

      - trigger: "how do i"
        match: "startswith"
        response: "Check <#FAQ_CHANNEL_ID> or open a support ticket!"

      - trigger: "^(hello|hi|hey)$"
        match: "regex"
        response: "Hey {user.mention}! 👋"

      # Channel-specific rule
      - trigger: "giveaway"
        match: "contains"
        response: "🎉 Good luck!"
        channels:
          - "GIVEAWAY_CHANNEL_ID"
\`\`\`

> **Match types:** \`exact\` \`contains\` \`startswith\` \`endswith\` \`regex\``,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TAGS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "tags",
    topic: "tags",
    keywords: ["tag","tags","custom tag","tag config","command tag","tag embed","tag list","tag template","tag variables","tag format"],
    answer: `## Tags

Tags live at the **top level** of your config — not under \`plugins:\`. Three formats are supported.

**Format 1 — Plain string:**
\`\`\`yaml
tags:
  rules: "Please read <#CHANNEL_ID> before participating!"
  invite: "https://discord.gg/yourserver"

  # Multi-line with YAML | block scalar
  apply: |
    **📋 Staff Applications**
    Apply here: https://forms.example.com/apply
    Requirements: 16+, active, no infractions
\`\`\`

**Format 2 — Embed only:**
\`\`\`yaml
tags:
  serverinfo:
    embed:
      title: "{server} — Server Info"
      description: "Welcome to our community!"
      color: "#7289DA"
      thumbnail: "{server.icon}"
      fields:
        - name: "👥 Members"
          value: "{server.member_count}"
          inline: true
        - name: "📜 Rules"
          value: "<#CHANNEL_ID>"
          inline: true
      footer: "Use !tag list to see all tags • {timestamp.date}"
\`\`\`

**Format 3 — Content + embed:**
\`\`\`yaml
tags:
  rules_full:
    content: "Here are the rules, {user.mention}:"
    embed:
      title: "📜 {server} Rules"
      description: "By participating you agree to follow these rules."
      color: "#FF0000"
      fields:
        - name: "Rule 1 — Respect"
          value: "Treat all members with respect."
          inline: false
\`\`\`

**Template variables** (work in every field — title, description, footer, fields, content):
\`{user}\` username · \`{user.mention}\` @mention · \`{user.id}\` ID · \`{server}\` server name · \`{server.id}\` · \`{server.member_count}\` · \`{server.icon}\` · \`{timestamp}\` · \`{timestamp.date}\` · \`{timestamp.time}\` · \`{trigger}\` tag name

**Optional error messages** (under \`plugins.utility.messages\`):
\`\`\`yaml
plugins:
  utility:
    messages:
      tag_not_found: "Tag **{trigger}** not found. Use \`!tag list\` to see all tags."
      # tag_not_found: null   ← silent mode
      tag_list_empty: "No tags have been created yet."
\`\`\`

> **Triggers:** \`!tag <name>\` · \`!tag list\` (shows all tags) · \`!<name>\` shortcut (e.g. \`!rules\` directly)`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "message-templates",
    topic: "messages",
    keywords: ["message","customize message","custom message","embed","embed config","message template","message format","variables","placeholders","embed color","message variables"],
    answer: `## Message Customization

**Plain string:**
\`\`\`yaml
ban_success: "🔨 **{user}** banned | Case: #{case_id}"
\`\`\`

**Embed:**
\`\`\`yaml
ban_success:
  embed:
    title: "🔨 User Banned"
    description: "{user.mention} banned by {mod.mention}"
    color: "#FF0000"
    thumbnail: "{user.avatar}"
    footer: "Case #{case_id} • {timestamp}"
    fields:
      - name: "Reason"
        value: "{reason}"
        inline: true
      - name: "Duration"
        value: "{duration}"
        inline: true
\`\`\`

**Message + embed:**
\`\`\`yaml
ban_success:
  content: "{mod.mention} actioned {user.mention}"
  embed:
    title: "Ban Notice"
    description: "Reason: {reason}"
    color: "#FF4444"
\`\`\`

**All variables:**

| Category | Variables |
|---|---|
| User | \`{user}\` \`{user.mention}\` \`{user.id}\` \`{user.name}\` \`{user.avatar}\` |
| Mod | \`{mod}\` \`{mod.mention}\` \`{mod.id}\` |
| Action | \`{reason}\` \`{duration}\` \`{expires_at}\` \`{case_id}\` \`{count}\` |
| Server | \`{server}\` \`{server.icon}\` \`{server.member_count}\` |
| Time | \`{timestamp}\` \`{timestamp.date}\` |
| Channel | \`{channel}\` \`{channel.mention}\` |`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCKDOWN
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lockdown",
    topic: "lockdown",
    keywords: ["lockdown","lock server","server lockdown","lockdown config","emergency lock"],
    answer: `## Lockdown Plugin

\`\`\`yaml
plugins:
  lockdown:
    enabled: true
    channels:
      - "GENERAL_CHANNEL_ID"
      - "CHAT_CHANNEL_ID"
      - "MEDIA_CHANNEL_ID"
    messages:
      lock: "🔒 This channel has been locked by staff."
      unlock: "✅ This channel has been unlocked."
      lockdown_start: "🚨 Server is now in lockdown."
      lockdown_end: "✅ Lockdown ended."
\`\`\`

> **Tip:** Don't add mod channels — staff need to communicate during lockdowns.`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL CONFIG
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "full-config",
    topic: "full",
    priority: 10,
    keywords: ["full config","complete config","full example","all config","whole config","complete example","all plugins","everything"],
    answer: `## Complete Config Example

\`\`\`yaml
prefix: "!"

levels:
  roles:
    "MOD_ROLE_ID":   50
    "ADMIN_ROLE_ID": 100
  commands:
    warn: 25   mute: 25   unmute: 25   purge: 25
    kick: 50   ban: 50    unban: 50    tempban: 50
    lock: 75   masswarn: 75   massban: 100
    level: 100

plugins:
  moderation:
    enabled: true
    mute_role: null
    dm_on_action: true
    messages:
      ban_success:  "🔨 **{user}** banned | Case: #{case_id}"
      kick_success: "👢 **{user}** kicked | Case: #{case_id}"
      warn_success: "⚠️ **{user}** warned | Case: #{case_id}"
      mute_success: "🔇 **{user}** muted ({duration}) | Case: #{case_id}"

  automod:
    enabled: true
    spam: { enabled: true, max_messages: 5, interval_seconds: 5, action: warn }
    bad_words: { enabled: true, words: ["word1","word2"], action: warn, delete: true }
    invite_links: { enabled: true, action: warn, delete: true }
    mass_mentions: { enabled: true, max_mentions: 5, action: mute, duration: "30m" }

  escalation:
    enabled: true
    manual:
      enabled: true
      thresholds:
        - { tracked_type: "warn", count: 3,  action: mute, duration: "1h",   reason: "3 warnings" }
        - { tracked_type: "warn", count: 5,  action: mute, duration: "12h",  reason: "5 warnings" }
        - { tracked_type: "warn", count: 7,  action: kick,                   reason: "7 warnings" }
        - { tracked_type: "warn", count: 10, action: ban,  duration: "perm", reason: "10 warnings" }

  logging:
    enabled: true
    mod_log_channel: "MOD_LOG_CHANNEL_ID"
    server_log_channel: "SERVER_LOG_CHANNEL_ID"
    message_log_channel: "MESSAGE_LOG_CHANNEL_ID"
    ignored_channels: ["BOT_CHANNEL_ID"]

  welcome:
    enabled: true
    join: { channel: "WELCOME_CHANNEL_ID", message: "👋 Welcome {user.mention} to **{server}**!" }
    join_role: "MEMBER_ROLE_ID"
    leave: { channel: "WELCOME_CHANNEL_ID", message: "**{user.name}** left." }

  antinuke:
    enabled: true
    punishment: ban
    dm_owner: true
    thresholds:
      ban:            { count: 3, interval_seconds: 10 }
      channel_delete: { count: 3, interval_seconds: 10 }
      role_delete:    { count: 3, interval_seconds: 10 }
      member_prune:   { count: 1, interval_seconds: 60 }
      dangerous_perm_grant: { enabled: true }

  antiraid:
    enabled: true
    join_threshold: 10
    join_interval_seconds: 5
    action: kick
    min_account_age_days: 7
    lockdown_on_raid: true
\`\`\`

> **Tip:** Paste your config here for a review — I'll flag issues and suggest what's missing.`,
  },

];

// OFF-TOPIC FILTER

const OFF_TOPIC = [
  /\b(weather|stock market|sports|recipe|cook|movie|music chart|song lyrics|trivia|joke|write (an? )?essay)\b/i,
  /\b(how are you|what('s| is) your name|who (made|created|built) you|are you (human|ai|gpt|chatgpt|claude))\b/i,
];

function isOffTopic(msg: string): boolean {
  return OFF_TOPIC.some((p) => p.test(msg));
}

const OFF_TOPIC_REPLIES = [
  "Ha, I wish I could help with that — but I'm Charles, NightPigeon's config expert, so I'm laser-focused on YAML configs! Ask me about any plugin and I'll sort you out. 😄",
  "That's outside my wheelhouse! I only know NightPigeon YAML inside-out. Try me with something like *\"set up logging\"* or paste your config for a review.",
  "I'm Charles — I live and breathe NightPigeon configs, so that one's beyond my expertise! Ask me about any plugin, field, or setting and I've got you covered.",
];

// SCORING

function scoreEntry(entry: KbEntry, msg: string): number {
  const lower = msg.toLowerCase();
  let score = 0;
  for (const kw of entry.keywords) {
    if (lower.includes(kw)) score += kw.split(" ").length * 2;
  }
  if (score > 0) score += (entry.priority ?? 0);
  return score;
}

function findBest(msg: string, excludeIds: string[] = []): KbEntry | null {
  let best: { score: number; entry: KbEntry } | null = null;
  for (const entry of KB) {
    if (excludeIds.includes(entry.id)) continue;
    const score = scoreEntry(entry, msg);
    if (score > 0 && (!best || score > best.score)) {
      best = { score, entry };
    }
  }
  return best?.entry ?? null;
}

// ROUTES

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// GET / — load saved chat history + memory for the current user
router.get("/", requireAuth, async (req: any, res: any) => {
  try {
    const stored = await dbGet<ChatStore>(CHAT_STORE, req.session.userId);
    res.json({
      messages: stored?.messages ?? [],
      memory: stored?.memory ?? {},
    });
  } catch {
    res.json({ messages: [], memory: {} });
  }
});

// DELETE / — clear chat history for the current user
router.delete("/", requireAuth, async (req: any, res: any) => {
  try {
    await dbDelete(CHAT_STORE, req.session.userId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to clear chat" });
  }
});

router.post("/", requireAuth, async (req: any, res: any) => {
  const { message, history } = req.body as {
    message?: string;
    history?: HistoryMessage[];
  };

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const trimmed = message.trim();
  const userId: string = req.session.userId;

  // Load stored memory
  const stored = await dbGet<ChatStore>(CHAT_STORE, userId).catch(() => null);
  const memory: UserMemory = stored?.memory ?? {};

  // Extract memory clues from this message
  const memUpdates = extractMemoryUpdates(trimmed, memory);
  const updatedMemory: UserMemory = { ...memory, ...memUpdates };

  // Helper: save history + memory, then respond
  async function saveAndRespond(reply: string, topic?: string): Promise<void> {
    if (topic) updatedMemory.lastTopic = topic;

    const existingMsgs: ChatMessage[] = stored?.messages ?? [];
    const newMessages: ChatMessage[] = [
      ...existingMsgs,
      { role: "user", content: trimmed, ts: Date.now() },
      { role: "assistant", content: reply, ts: Date.now() },
    ].slice(-MAX_STORED_MESSAGES);

    await dbSet(CHAT_STORE, userId, {
      messages: newMessages,
      memory: updatedMemory,
      updatedAt: Date.now(),
    } satisfies ChatStore).catch(() => {});

    res.json({ reply, memory: updatedMemory });
  }

  // Off-topic
  if (isOffTopic(trimmed)) {
    const reply = OFF_TOPIC_REPLIES[Math.floor(Math.random() * OFF_TOPIC_REPLIES.length)]!;
    await saveAndRespond(reply);
    return;
  }

  // Pasted YAML → config review
  if (looksLikeYaml(trimmed)) {
    await saveAndRespond(buildConfigReview(trimmed), "config-review");
    return;
  }

  // Extract context from conversation history
  const recentIds: string[] = [];
  const recentTopics: string[] = [];

  const historySource: HistoryMessage[] = Array.isArray(history)
    ? history
    : (stored?.messages ?? []).map((m) => ({ role: m.role, content: m.content }));

  const recentAssistant = historySource
    .filter((m) => m.role === "assistant")
    .slice(-3);

  for (const msg of recentAssistant) {
    for (const entry of KB) {
      const heading = entry.answer.split("\n")[0]?.replace(/^##\s+/, "").trim();
      if (heading && msg.content.includes(heading)) {
        if (!recentIds.includes(entry.id)) recentIds.push(entry.id);
        if (!recentTopics.includes(entry.topic)) recentTopics.push(entry.topic);
      }
    }
  }

  // Also seed from saved lastTopic if no recent topics from history
  if (recentTopics.length === 0 && updatedMemory.lastTopic) {
    recentTopics.push(updatedMemory.lastTopic);
  }

  // Try to match against the full KB
  const best = findBest(trimmed);

  if (best) {
    const lastAssistantIds = recentIds.slice(0, 1);
    if (lastAssistantIds.includes(best.id) && recentTopics.includes(best.topic)) {
      const sameTopic = KB.filter(
        (e) => e.topic === best.topic && !recentIds.includes(e.id)
      );
      if (sameTopic.length > 0) {
        let alt: KbEntry | null = null;
        let altScore = 0;
        for (const e of sameTopic) {
          const s = scoreEntry(e, trimmed);
          if (s > altScore) { altScore = s; alt = e; }
        }
        const chosen = alt ?? sameTopic[0]!;
        await saveAndRespond(chosen.answer, chosen.topic);
        return;
      }
    }
    await saveAndRespond(best.answer, best.topic);
    return;
  }

  // Follow-up without strong keyword match: use last topic
  if (recentTopics.length > 0) {
    const lastTopic = recentTopics[0]!;
    const options = KB.filter(
      (e) => e.topic === lastTopic && !recentIds.includes(e.id)
    );
    if (options.length > 0) {
      const chosen = options[0]!;
      await saveAndRespond(
        `Sure! Here's more on **${lastTopic}**:\n\n${chosen.answer}`,
        lastTopic
      );
      return;
    }
    await saveAndRespond(
      `I think I've covered everything I know about **${lastTopic}**! If there's a specific part you want to tweak or a field you're unsure about, just ask. You can also paste your config and I'll review it end-to-end.`,
      lastTopic
    );
    return;
  }

  // Generic fallback
  await saveAndRespond(`Hmm, I'm not sure I caught that one — could you rephrase it? Here are some things I'm great at:

- *"Give me the logging config"* / *"Separate log channels"* / *"All log events"*
- *"AutoMod config"* / *"Bad word filter"* / *"Spam filter"*
- *"Escalation config"* / *"AutoMod escalation pipeline"*
- *"Anti-Nuke config"* / *"Anti-Raid config"*
- *"Moderation config"* / *"Mute role setup"*
- *"Full starter config"*

Or if something's not working right, **paste your current config** and I'll read through it and tell you exactly what's wrong!`);
});

export default router;

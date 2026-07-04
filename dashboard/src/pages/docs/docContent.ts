export interface SchemaField {
  key: string;
  type: string;
  default?: string;
  description: string;
  children?: SchemaField[];
}

export interface CommandDoc {
  trigger: string;
  aliases?: string[];
  usage: string;
  description: string;
  permissions?: string;
  examples?: string[];
}

export interface DocPage {
  id: string;
  title: string;
  type: "article" | "plugin";
  content: string;
  configKey?: string;
  defaultConfig?: string;
  schema?: SchemaField[];
  commands?: CommandDoc[];
}

export interface DocSection {
  id: string;
  title: string;
  pages: DocPage[];
}

export const docSections: DocSection[] = [
  // ────────────────────────────────────────────────────────────────────────────
  // GENERAL
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: "general",
    title: "General",
    pages: [
      {
        id: "introduction",
        title: "Introduction",
        type: "article",
        content: `# Introduction

NightPigeon is a plugin-based Discord moderation bot. Every plugin has its own YAML configuration block, and **every single message, embed, DM, and automod response the bot sends can be fully customized** per server through the YAML config.

## Plugins

| Plugin | What it does |
|--------|-------------|
| Moderation | ban, kick, mute, warn, purge, lock, slowmode |
| Mass Actions | masswarn, massmute, massban, massrole, masstemprole, etc. |
| Cases | infraction tracking, notes, case history |
| Automod | spam, bad words, invite links, mass mentions, caps, link spam |
| Logging | logs every Discord event to configurable channels |
| Lockdown | channel and server lockdown with presets |
| Anti-Nuke | protection against mass destructive actions |
| Anti-Raid | protection against mass join attacks |
| Tags | custom text commands per server |
| Roles | addrole, removerole, temprole |
| Reaction Roles | emoji-based role panels |
| Welcome | welcome/goodbye messages, join DM, welcome role |
| Starboard | star-pinning system |
| Reminders | personal scheduled reminders |
| Timezones | per-user timezone storage and time commands |
| Levels | manual level/rank tracking |
| Mod Nick | automated nickname moderation |
| Autoreply | trigger-based auto responses |
| Autoreaction | automatic emoji reactions |
| Autoclean | scheduled channel cleaning |
| Slowmode Auto | automatic slowmode based on activity |
| Duration Roles | time-limited role assignments |
| Tickets | support ticket system |
| Utility | userinfo, serverinfo, avatar, and many more |

`,
      },
      {
        id: "configuration-format",
        title: "Configuration format",
        type: "article",
        content: `# Configuration Format

Each server has its own YAML configuration stored in the database. Edit it from the **Config** tab in the dashboard.

## Basic structure

\`\`\`yaml
prefix: "!"

levels:
  roles:
    "111222333444555666": 50    # Moderator role → level 50
    "222333444555666777": 75    # Admin role → level 75
  users:
    "987654321098765432": 100   # Specific user override
  commands:
    warn: 25
    kick: 50
    ban: 50

plugins:
  moderation:
    enabled: true
    mute_role: null             # null = use Discord timeout (recommended)
    dm_on_action: true

  automod:
    enabled: true
    spam:
      enabled: true
      max_messages: 5
      interval_seconds: 5
      action: mute
\`\`\`

## Top-level keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| \`prefix\` | string | \`!\` | Command prefix for this server. **Maximum 3 characters.** |
| \`plugins\` | object | — | Per-plugin configuration blocks |
| \`levels\` | object | — | Permission levels for roles, users, and commands |

## Enabling a plugin

To enable a plugin with all defaults:

\`\`\`yaml
plugins:
  moderation: {}
\`\`\`

To enable with custom settings:

\`\`\`yaml
plugins:
  moderation:
    enabled: true
    mute_role: "111222333444555666"
\`\`\`

## YAML tips

- Always quote Discord snowflake IDs — they are large numbers
- Use **2 spaces** for indentation, never tabs
- Comments start with \`#\`
- Booleans: \`true\` / \`false\` (lowercase)
- Omit a key to use its default`,
      },
      {
        id: "message-customization",
        title: "Message customization",
        type: "article",
        content: `# Message Customization

Every single message the bot sends can be customized in your YAML config. Each configurable message supports three formats.

## Format 1 — Plain string

\`\`\`yaml
ban_success: "✅ {user.mention} has been banned. Case: #{case_id}"
\`\`\`

## Format 2 — Embed only

\`\`\`yaml
ban_success:
  embed:
    title: "✅ User Banned"
    description: "{user.mention} has been banned by {mod.mention}."
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
    author:
      name: "{server}"
      icon: "{server.icon}"
\`\`\`

## Format 3 — Message + embed

\`\`\`yaml
ban_success:
  content: "{user.mention} you have been banned."
  embed:
    title: "Ban Notice"
    description: "Reason: {reason}"
    color: "#FF0000"
\`\`\`

## Embed fields reference

| Field | Type | Description |
|-------|------|-------------|
| \`title\` | string | Embed title |
| \`description\` | string | Embed body text |
| \`color\` | hex string | e.g. \`"#FF0000"\` |
| \`thumbnail\` | URL | Small image top-right |
| \`image\` | URL | Large image at bottom |
| \`footer\` | string | Footer text |
| \`fields\` | array | List of \`{name, value, inline}\` objects |
| \`author.name\` | string | Author name above title |
| \`author.icon\` | URL | Author icon |

## Template variables

All message templates support these placeholders:

**User**
\`{user}\` \`{user.mention}\` \`{user.id}\` \`{user.name}\` \`{user.avatar}\` \`{user.created_at}\` \`{user.joined_at}\`

**Moderator**
\`{mod}\` \`{mod.mention}\` \`{mod.id}\` \`{mod.name}\`

**Server**
\`{server}\` \`{server.id}\` \`{server.icon}\` \`{server.member_count}\`

**Action**
\`{reason}\` \`{duration}\` \`{case_id}\` \`{action}\` \`{channel}\` \`{channel.mention}\` \`{count}\` \`{expires_at}\`

**Automod**
\`{trigger}\` \`{rule}\`

**Timestamps**
\`{timestamp}\` \`{timestamp.date}\` \`{timestamp.time}\``,
      },
      {
        id: "permissions",
        title: "Permissions",
        type: "article",
        content: `# Permissions

NightPigeon uses a **numeric level system**. Every command has a minimum level requirement. A user must have a level equal to or greater than that threshold to run the command.

- Level **0** = public (anyone can use)
- Level **9,999,999,999** = server owner (always granted automatically)
- Commands **not listed** in your \`levels.commands\` block are **disabled** for everyone except the server owner
- Levels also control **hierarchy** — a moderator can only take action on members whose level is strictly lower than their own

## Level scale

| Level | Typical role | Notes |
|-------|-------------|-------|
| 0 | Everyone | Public commands |
| 25 | Trusted / Trial Mod | Basic moderation |
| 50 | Moderator | Standard mod tools |
| 75 | Senior Mod / Admin | Destructive actions |
| 100 | Administrator | Server-level config |
| 500 | Co-owner | Elevated admin |
| 9,999,999,999 | Server owner | Always granted, cannot be removed |

> Levels can be any integer from **0** to **9,999,999,999**. You are not limited to the examples above — use any value that makes sense for your staff structure.

## How levels are resolved

For each command invocation, the bot picks the **highest** applicable level for the user:

1. Check for a direct **user override** in \`levels.users\`
2. Check all **roles** the user has in \`levels.roles\` — take the highest
3. If none match, the user's effective level is **0**
4. The **server owner** always has level **9,999,999,999**

## Hierarchy enforcement

Levels are also used to enforce **action hierarchy** across all moderation commands (ban, kick, mute, warn, mass actions, etc.). A moderator cannot take action on a member whose level is equal to or higher than their own — the action is blocked and a hierarchy error is returned.

This replaces the traditional Discord role-position check with a configurable system: two users can have the same highest Discord role but different YAML levels, giving you full control over who can action whom.

## Assigning levels in YAML

\`\`\`yaml
levels:
  # Role overrides — use the role's Discord snowflake ID
  roles:
    "111222333444555666": 50    # Moderator
    "222333444555666777": 75    # Senior Mod
    "333444555666777888": 100   # Admin

  # Individual user overrides — use their Discord user ID
  users:
    "987654321098765432": 100   # Trusted admin

  # Minimum level required to use each command
  # Commands not listed here are disabled (level 1000 required)
  commands:
    warn: 25
    kick: 50
    ban: 50
    mute: 25
    purge: 25
    case: 0
    cases: 0
    help: 0
\`\`\`

## Argument types reference

| Notation | Example | Description |
|----------|---------|-------------|
| \`@user\` | \`@Username\` | Discord user mention |
| \`<user_id>\` | \`123456789012345678\` | Raw Discord snowflake ID — works for banned/left users |
| \`[duration]\` | \`10m\`, \`1h\`, \`7d\` | Optional duration argument |
| \`<duration>\` | \`1h\` | Required duration argument |
| \`[reason]\` | \`Spamming\` | Optional reason text |
| \`#channel\` | \`#general\` | Channel mention |
| \`@role\` | \`@Moderator\` | Role mention |

## Duration format

| Unit | Suffix | Example | Equivalent |
|------|--------|---------|------------|
| Seconds | \`s\` | \`30s\` | 30 seconds |
| Minutes | \`m\` | \`10m\` | 10 minutes |
| Hours | \`h\` | \`1h\` | 1 hour |
| Days | \`d\` | \`7d\` | 7 days |
| Weeks | \`w\` | \`2w\` | 14 days |
| Permanent | \`perm\` | \`perm\` | No expiry |`,
      },
      {
        id: "dashboard-access",
        title: "Dashboard Access",
        type: "article",
        content: `# Dashboard Access

The NightPigeon dashboard supports two tiers of access:

| Role | Who | What they can do |
|------|-----|-----------------|
| **Server owner** | The Discord user who owns the server | Full read + write access to all settings. Can manage dashboard access for others. |
| **Staff (view)** | Anyone the owner grants view access | Can read all configuration pages but cannot save changes. |
| **Staff (edit)** | Anyone the owner grants edit access | Can read and modify all configuration. Cannot manage access for others. |

## Granting staff access

1. Open the dashboard for your server
2. Click **Access** in the top navigation bar
3. Enter the staff member's **Discord User ID** (18-digit number)
4. Choose **View Only** or **Can Edit**
5. Click **Add User**

The staff member must log into the dashboard using their own Discord account. After logging in they will see only the servers where they have been granted access.

## Getting a Discord User ID

Discord User IDs are 18-digit numbers. To copy one:

1. Open Discord → **Settings → Advanced**
2. Enable **Developer Mode**
3. Right-click any user → **Copy User ID**

## Changing or revoking access

From the **Access** page:
- Use the dropdown next to a staff member to switch between **View Only** and **Can Edit**
- Click the **trash icon** to remove their access entirely

Changes take effect immediately — no re-login required.

## Notes

- Staff access is **per server**. A user you grant access in Server A does not automatically get access in Server B.
- Only the **server owner** can manage the access list.
- The bot owner (NightPigeon developer) has unrestricted access to all servers for maintenance purposes.
- Prefix changes are limited to **3 characters maximum** (enforced by both the dashboard and the bot).`,
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  // SETUP GUIDES
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: "setup",
    title: "Setup Guides",
    pages: [
      {
        id: "level-setup",
        title: "Level Setup",
        type: "article",
        content: `# Level Setup

Every command in NightPigeon is **disabled by default** until you assign it a minimum level in your YAML config. This page lists every command with its recommended starting level.

## How levels work

- Levels are numbers from **0 to 9,999,999,999**.
- A user needs a level **≥ the command's required level** to use it.
- The **server owner** always has level 9,999,999,999 regardless of config.
- You can assign levels to **roles** or **individual users**.
- If a command is not listed in your config it is disabled for everyone except the server owner.
- Levels also enforce **hierarchy**: mods cannot action members with equal or higher levels.

## Default config — all commands

Copy this into your YAML config and adjust the levels to fit your server. Commands not listed are disabled for everyone except the server owner.

\`\`\`yaml
levels:
  roles:
    "ROLE_ID_MOD":    50   # Moderator
    "ROLE_ID_SENIOR": 75   # Senior Mod
    "ROLE_ID_ADMIN":  100  # Admin

  users: {}                # per-user overrides (Discord user ID: level)

  commands:
    # ── Warnings ────────────────────────────────────
    warn:             25
    forcewarn:        50

    # ── Kicks ───────────────────────────────────────
    kick:             50

    # ── Bans ────────────────────────────────────────
    ban:              50
    forceban:         50
    unban:            50
    tempban:          50
    softban:          50
    baninfo:          25
    banlist:          25

    # ── Mutes ───────────────────────────────────────
    mute:             25
    forcemute:        50
    unmute:           25
    forceunmute:      50
    tempmute:         25
    mutelist:         25
    muteinfo:         25

    # ── Purge / Slowmode ────────────────────────────
    purge:            25
    slowmode:         50
    slowmodeinfo:     25

    # ── Cases ───────────────────────────────────────
    case:             0
    cases:            0
    addcase:          50
    editcase:         50
    deletecase:       75
    servercases:      25
    casecount:        0
    exportcases:      75

    # ── Notes ───────────────────────────────────────
    note:             25
    forcenote:        50
    viewnote:         25
    viewnotes:        25
    notesearch:       25
    editnote:         25
    deletenote:       75

    # ── Nickname ────────────────────────────────────
    nick:             25
    resetnick:        25
    locknick:         75
    unlocknick:       75
    modnick:          75

    # ── Channel / Lockdown ──────────────────────────
    lockdown:         75
    unlock:           75
    hide:             75
    unhide:           75

    # ── Watch list ──────────────────────────────────
    watch:            25
    unwatch:          25
    watchlist:        25

    # ── Role ban ────────────────────────────────────
    roleban:          75
    unroleban:        75
    rolebanned:       25

    # ── Roles ───────────────────────────────────────
    addrole:          50
    removerole:       50
    temprole:         50
    temproles:        25

    # ── Mass actions ────────────────────────────────
    masswarn:         75
    massforcewarn:    75
    massmute:         75
    massforcemute:    75
    massunmute:       75
    masskick:         75
    massban:          100
    massforceban:     100
    massunban:        75
    massrole:         75
    massremoverole:   75
    masstemprole:     75

    # ── Raid / Cleanup ──────────────────────────────
    raidmode:         75
    cleanup:          25
    seen:             0

    # ── Reaction roles ──────────────────────────────
    rr:               75

    # ── Level management ────────────────────────────
    level:            100
    levels:           100

    # ── Info / Utility ──────────────────────────────
    userinfo:         0
    avatar:           0
    banner:           0
    roles:            0
    joined:           0
    firstmsg:         0
    serverinfo:       0
    channelinfo:      0
    roleinfo:         0
    membercount:      0
    botinfo:          0
    botstats:         0
    snowflake:        0
    inviteinfo:       0
    inrole:           0
    charcount:        0
    embed:            50
    warncount:        0
    casecount:        0
    modstats:         25
    casesearch:       25
    help:             0

    # ── Plugins ─────────────────────────────────────
    autoreply:        50
    autoreaction:     50
    autoclean:        75
    ticket:           0
    starboard:        75
    welcome:          100
    goodbye:          100
    welcomedm:        100
    invites:          0
    inviteleaderboard: 0
    invitereset:      75
    tag:              0
    remind:           0
    reminders:        0
    delreminder:      0
    timezone:         0
    timefor:          0
    timeconvert:      0
    ping:             0
\`\`\`

## Recommended levels

| Level | Typical role | Notes |
|-------|-------------|-------|
| 0 | Everyone | Public commands |
| 25 | Trusted / Trial Mod | Basic moderation |
| 50 | Moderator | Standard mod tools |
| 75 | Senior Mod / Admin | Destructive actions |
| 100 | Administrator | Server-level config |
| 500 | Co-owner | Elevated admin |
| 9,999,999,999 | Server owner | Always granted |

## Full command reference

### Warnings
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`warn\` | 25 | Warn a member |
| \`forcewarn\` | 50 | Warn by user ID |

### Kicks
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`kick\` | 50 | Kick a member |

### Bans
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`ban\` | 50 | Permanent or timed ban |
| \`forceban\` | 50 | Ban by ID (not in server) |
| \`unban\` | 50 | Unban a user |
| \`tempban\` | 50 | Timed ban (duration required) |
| \`softban\` | 50 | Ban + unban to clear messages |
| \`baninfo\` | 25 | View ban details |
| \`banlist\` | 25 | View ban list |

### Mutes
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`mute\` | 25 | Mute a member |
| \`forcemute\` | 50 | Mute by ID |
| \`unmute\` | 25 | Unmute a member |
| \`forceunmute\` | 50 | Unmute by ID |
| \`tempmute\` | 25 | Mute with duration |
| \`mutelist\` | 25 | View currently muted members |
| \`muteinfo\` | 25 | View mute details for a member |

### Purge / Slowmode
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`purge\` | 25 | Bulk delete messages |
| \`slowmode\` | 50 | Set channel slowmode |
| \`slowmodeinfo\` | 25 | View current slowmode |

### Cases
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`case\` | 0 | View a specific case (shows deleted cases too, greyed out) |
| \`cases\` | 0 | View cases for a user — add \`-automod\` to show only automod cases |
| \`addcase\` | 50 | Manually create a case |
| \`editcase\` | 50 | Edit a case reason or duration — logs the change to the mod log |
| \`deletecase\` | 75 | Soft-delete a case (removed from lists/counts, still viewable via \`!case\`) |
| \`servercases\` | 25 | View all server cases |
| \`casecount\` | 0 | Count cases for a user |
| \`exportcases\` | 75 | Export all cases |

### Notes
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`note\` | 25 | Add a staff note |
| \`viewnotes\` | 25 | View all notes for a user |
| \`deletenote\` | 75 | Delete a note |
| \`forcenote\` | 50 | Add note by user ID |
| \`notesearch\` | 25 | Search notes |
| \`editnote\` | 25 | Edit a note |

### Nickname
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`nick\` | 25 | Change a member's nickname |
| \`resetnick\` | 25 | Reset a member's nickname |
| \`locknick\` | 75 | Prevent a user from changing their nickname |
| \`unlocknick\` | 75 | Remove nickname lock |

### Channel / Lockdown
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`lockdown\` | 75 | Lock a channel or activate a preset |
| \`unlock\` | 75 | Unlock a channel or end a server lockdown |
| \`hide\` | 75 | Hide a channel from everyone |
| \`unhide\` | 75 | Unhide a channel |

### Watch list
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`watch\` | 25 | Add a user to the watch list |
| \`unwatch\` | 25 | Remove from watch list |
| \`watchlist\` | 25 | View the watch list |

While a user is on the watch list, every message they send is automatically:
- **Flagged in-channel** — the bot reacts with 🚩 directly on the message, so staff scrolling the channel can spot it instantly without checking the log.
- **Forwarded to your logging channel** via the \`watched_user_message\` server-log event (see [Logging](#plugin-logging)) — including the message content, channel, any attachments, the watch reason, and a jump link.

This happens automatically as soon as \`!watch\` is used; no extra config is required beyond having a logging channel set up (the 🚩 reaction works even without logging configured). Run \`!unwatch\` to stop both.

### Role ban
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`roleban\` | 75 | Prevent a user from having a role |
| \`unroleban\` | 75 | Remove role ban |
| \`rolebanned\` | 25 | View role-banned users |

### Roles
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`addrole\` | 50 | Give a role to a member |
| \`removerole\` | 50 | Remove a role from a member |
| \`temprole\` | 50 | Give a role temporarily |
| \`temproles\` | 25 | View active temp roles |

### Mass actions
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`masswarn\` | 75 | Warn multiple members at once |
| \`massforcewarn\` | 75 | Mass warn by IDs |
| \`massmute\` | 75 | Mute multiple members |
| \`massforcemute\` | 75 | Mass mute by IDs |
| \`massunmute\` | 75 | Unmute multiple members |
| \`masskick\` | 75 | Kick multiple members |
| \`massban\` | 100 | Ban multiple members |
| \`massforceban\` | 100 | Mass ban by IDs |
| \`massunban\` | 75 | Unban multiple users |
| \`massrole\` | 75 | Add a role to multiple members |
| \`massremoverole\` | 75 | Remove a role from multiple members |
| \`masstemprole\` | 75 | Give a timed role to multiple members |

### Raid / cleanup
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`raidmode\` | 75 | Toggle server raid mode |
| \`cleanup\` | 25 | Delete messages by user |
| \`seen\` | 0 | Check when a user was last active |

### Reaction roles
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`rr\` | 75 | Manage reaction role panels |

### Level management
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`level\` | 100 | Set a user or role's level |
| \`levels\` | 100 | View all assigned levels |

### Info / utility
| Command | Recommended level | Notes |
|---------|------------------|-------|
| \`userinfo\` | 0 | Show user info |
| \`avatar\` | 0 | Show user avatar |
| \`banner\` | 0 | Show user banner |
| \`roles\` | 0 | List user's roles |
| \`joined\` | 0 | Show join date |
| \`firstmsg\` | 0 | Link to first message in a channel |
| \`serverinfo\` | 0 | Show server info |
| \`channelinfo\` | 0 | Show channel info |
| \`roleinfo\` | 0 | Show role info |
| \`membercount\` | 0 | Show member count |
| \`botinfo\` | 0 | Bot info |
| \`botstats\` | 0 | Bot statistics |
| \`snowflake\` | 0 | Decode a Discord snowflake ID |
| \`inviteinfo\` | 0 | Show invite details |
| \`inrole\` | 0 | List members with a role |
| \`charcount\` | 0 | Count chars/words/lines |
| \`embed\` | 50 | Send a custom embed |
| \`warncount\` | 0 | Warn count for a user |
| \`casecount\` | 0 | Case count for a user |
| \`modstats\` | 25 | Moderator action stats |
| \`casesearch\` | 25 | Search cases by keyword |
| \`seen\` | 0 | Show when a user was last active |
| \`help\` | 0 | Show command help |`,
      },
      {
        id: "punishment-escalation",
        title: "Punishment Escalation",
        type: "article",
        content: `# Punishment Escalation

NightPigeon has two completely **separate** escalation systems with independent counters:

- **Manual escalation** — counts cases created by human moderators (\`!warn\`, \`!mute\`, \`!kick\`, \`!ban\`). Automod-generated cases are never included in this count.
- **Automod escalation** — counts violations triggered by automod rules only. Manual moderator actions are never included in this count.

The two counters never mix. A user accumulating automod warns will not push them closer to a manual escalation threshold, and vice versa.

Escalation fires **in addition** to the original action — the user receives both.

---

## Manual escalation (\`manual\`)

Triggered by human moderator commands only. Counts cases where a real moderator used \`!warn\`, \`!mute\`, \`!kick\`, or \`!ban\`. Automod cases are never counted here.

### How it works

1. A moderator runs \`!warn @user\`, \`!mute @user\`, \`!kick @user\`, or \`!ban @user\`.
2. The case is saved. The system counts all **human-moderator** cases of the configured \`tracked_type\` for that user.
3. If the count **exactly matches** a threshold, the escalation action fires automatically.
4. The escalation is logged as its own case (moderator: NightPigeon Auto-Escalation) and posted to your mod log channel.

### Configuration

\`\`\`yaml
plugins:
  escalation:
    enabled: true

    manual:
      enabled: true

      thresholds:
        # Each entry: when tracked_type reaches "count" human-mod cases,
        # automatically apply "action" with "duration" and "reason".
        #
        # IMPORTANT: thresholds fire IN ADDITION to the original action,
        # they do NOT replace it. If a !warn triggers a threshold,
        # the user gets BOTH the warn AND the escalation action.
        #
        # tracked_type — case type to count: "warn", "mute", "kick", "ban", or "any"
        # count        — exact case count that triggers this threshold
        # action       — escalation action to apply: "mute", "kick", or "ban"
        # duration     — mute/ban duration (e.g. "1h", "12h", "7d", "perm"); omit = perm for ban
        # reason       — reason string shown on the escalation case

        - tracked_type: "warn"
          count: 3
          action: mute
          duration: "1h"
          reason: "Escalation: 3 warnings reached"

        - tracked_type: "warn"
          count: 5
          action: mute
          duration: "12h"
          reason: "Escalation: 5 warnings reached"

        - tracked_type: "warn"
          count: 7
          action: kick
          reason: "Escalation: 7 warnings reached"

        - tracked_type: "warn"
          count: 10
          action: ban
          duration: "perm"
          reason: "Escalation: 10 warnings reached"

        - tracked_type: "mute"
          count: 3
          action: kick
          reason: "Escalation: 3 mutes reached"

        - tracked_type: "mute"
          count: 5
          action: ban
          duration: "perm"
          reason: "Escalation: 5 mutes reached"

        # tracked_type can also be "any" to count ALL human-mod case types combined:
        # - tracked_type: "any"
        #   count: 15
        #   action: ban
        #   duration: "perm"
        #   reason: "Escalation: 15 total infractions"

      messages:
        escalation_triggered: "{user} has been {action_past} due to repeated infractions | Case: {case_id}"
        # Posted in the moderation log channel

        escalation_dm: "You have been {action_past} in {server} for the following reason: {reason}"
        # Sent to the user (subject to dm_on_action in moderation config)
\`\`\`

---

## Automod escalation (\`auto\`)

Triggered by automod rules only. Counts warn cases created by automod (YAML rules with \`type: warn\`, legacy automod warns). Human moderator cases are never counted here.

### How it works

1. An automod rule fires and applies a \`warn\` action to a user.
2. The system counts all **automod-created** warn cases for that user.
3. If the count exactly matches a threshold, the escalation action fires automatically.
4. The escalation is logged as its own case and posted to your mod log channel.

### Configuration

\`\`\`yaml
plugins:
  escalation:
    enabled: true

    auto:
      enabled: true

      thresholds:
        # Each entry: when tracked_type reaches "count" automod-created cases,
        # automatically apply "action" with "duration" and "reason".
        #
        # IMPORTANT: thresholds fire IN ADDITION to the automod action,
        # they do NOT replace it. The user gets BOTH the automod warn AND the escalation.
        #
        # tracked_type — "warn" or "any" (automod only creates warn cases)
        # count        — exact automod case count that triggers this threshold
        # action       — escalation action to apply: "mute", "kick", or "ban"
        # duration     — mute/ban duration (e.g. "1h", "12h", "7d", "perm")
        # reason       — reason string shown on the escalation case

        - tracked_type: "warn"
          count: 3
          action: mute
          duration: "1h"
          reason: "Auto-Escalation: 3 automod warnings"

        - tracked_type: "warn"
          count: 5
          action: mute
          duration: "12h"
          reason: "Auto-Escalation: 5 automod warnings"

        - tracked_type: "warn"
          count: 7
          action: kick
          reason: "Auto-Escalation: 7 automod warnings"

        - tracked_type: "warn"
          count: 10
          action: ban
          duration: "perm"
          reason: "Auto-Escalation: 10 automod warnings"

      messages:
        escalation_triggered: "{user} has been {action_past} due to repeated automod infractions | Case: {case_id}"
        # Posted in the moderation log channel

        escalation_dm: "You have been {action_past} in {server} for the following reason: {reason}"
        # Sent to the user (subject to dm_on_action in moderation config)
\`\`\`

### Combining both systems

You can enable both \`manual\` and \`auto\` at the same time with separate thresholds for each:

\`\`\`yaml
plugins:
  escalation:
    enabled: true

    manual:
      enabled: true
      thresholds:
        - tracked_type: "warn"
          count: 5
          action: mute
          duration: "12h"
          reason: "Escalation: 5 manual warnings"

    auto:
      enabled: true
      thresholds:
        - tracked_type: "warn"
          count: 5
          action: mute
          duration: "1h"
          reason: "Auto-Escalation: 5 automod warnings"
\`\`\`

The counters are always tracked separately — a user with 4 automod warns and 4 manual warns has not hit either threshold.

### Template variables

| Variable | Value |
|---|---|
| \`{user}\` | Username of the punished user |
| \`{user.mention}\` | Discord mention (\`<@id>\`) |
| \`{user.id}\` | User's Discord ID |
| \`{action}\` | Raw action name — \`mute\`, \`kick\`, or \`ban\` |
| \`{action_past}\` | Past tense — \`muted\`, \`kicked\`, or \`banned\` |
| \`{duration}\` | Human-readable duration, or \`Permanent\` |
| \`{reason}\` | Reason string from the threshold |
| \`{case_id}\` | Auto-assigned case number |
| \`{server}\` | Server name |

### Embed messages (optional)

You can replace the plain-text \`escalation_triggered\` message with a full embed:

\`\`\`yaml
      messages:
        escalation_triggered:
          embed:
            title: "⚡ Escalation Triggered"
            description: "{user.mention} has been automatically {action_past} due to repeated infractions"
            color: "#FF6600"
            fields:
              - name: "Action"
                value: "{action_past}"
                inline: true
              - name: "Duration"
                value: "{duration}"
                inline: true
              - name: "Reason"
                value: "{reason}"
                inline: false
              - name: "Case"
                value: "#{case_id}"
                inline: true
            footer: "{server}"

        escalation_dm: "You have been {action_past} in {server} for the following reason: {reason}"
\`\`\`

---

## Automod escalation

YAML automod rules that include a \`warn\` action create warn cases exactly like the manual \`!warn\` command. Those cases are counted by the escalation system — so if a user keeps triggering automod rules they automatically climb toward escalation thresholds without a moderator ever needing to type a command.

### How it works

1. User triggers an automod rule (spam, bad word, etc.) that has \`{ type: warn }\` in its actions.
2. Automod deletes the message and saves a warn case to the database.
3. The escalation system counts the user's total warn cases.
4. When the count exactly hits a threshold (e.g. 3 warns), the escalation action fires — mute, kick, or ban.

> **Note:** Automod rules are configured under \`automod.config.rules\` (not \`plugins.automod\`). The escalation thresholds are configured separately under \`plugins.escalation\`.

### Example: automod → escalation pipeline

\`\`\`yaml
# ── YAML automod rules ─────────────────────────────────────────────────────
automod:
  config:
    enabled: true
    rules:
      spam_rule:
        triggers:
          - type: message_spam
            max_messages: 5
            within_seconds: 5
        actions:
          - type: delete_message
          - type: warn            # saves a warn case + feeds escalation

      bad_words_rule:
        triggers:
          - type: word_filter
            words: ["slur1", "slur2"]
            match_type: word
        actions:
          - type: delete_message
          - type: warn            # saves a warn case + feeds escalation

# ── Escalation thresholds ──────────────────────────────────────────────────
plugins:
  escalation:
    enabled: true

    manual:
      enabled: true

      thresholds:
        # 3 combined warns (manual + automod) → 1h mute
        - tracked_type: "warn"
          count: 3
          action: mute
          duration: "1h"
          reason: "Escalation: 3 automod/manual warnings"

        # 5 warns → 6h mute
        - tracked_type: "warn"
          count: 5
          action: mute
          duration: "6h"
          reason: "Escalation: 5 warnings"

        # 8 warns → kick
        - tracked_type: "warn"
          count: 8
          action: kick
          reason: "Escalation: 8 warnings"

        # 10 warns → permanent ban
        - tracked_type: "warn"
          count: 10
          action: ban
          duration: "perm"
          reason: "Escalation: 10 warnings — permanent ban"

      messages:
        escalation_triggered: "⚡ **{user}** has been {action_past} due to repeated infractions | Case: #{case_id}"
        escalation_dm: "You have been {action_past} in {server} for: {reason}"
\`\`\`

---

## Fields reference

### \`tracked_type\`

| Value | What is counted |
|-------|----------------|
| \`warn\` | All warn cases (manual + automod) |
| \`mute\` | All mute cases (including temp mutes) |
| \`kick\` | All kick cases |
| \`ban\` | All ban cases (including temp bans) |
| \`any\` | Total of all case types combined |

### \`action\`

| Value | Effect |
|-------|--------|
| \`mute\` | Mute (uses \`mute_role\` or Discord timeout). Add \`duration\` for timed. |
| \`kick\` | Kick the user from the server. |
| \`ban\` | Ban the user. Add \`duration\` for temp ban, use \`"perm"\` or omit for permanent. |

### Duration format

\`30s\`, \`10m\`, \`1h\`, \`7d\`, \`2w\`, \`perm\`

---

## Message variables

| Variable | Value |
|----------|-------|
| \`{user}\` | User's tag |
| \`{user.mention}\` | User mention |
| \`{user.id}\` | User's Discord ID |
| \`{action}\` | Raw action (\`mute\`, \`kick\`, \`ban\`) |
| \`{action_past}\` | Past tense (\`muted\`, \`kicked\`, \`banned\`) |
| \`{reason}\` | Escalation reason |
| \`{duration}\` | Duration label |
| \`{case_id}\` | New case ID |
| \`{server}\` | Server name |

---

## Notes

- Each threshold fires **only once per exact count hit**. Hitting count 3 fires the 3-threshold; a 4th warn does nothing until the 5-threshold is defined.
- Warn cases from automod and manual commands are identical — the escalation system does not distinguish their source.
- Escalation cases are visible in \`!cases @user\` alongside all other cases.
- If the user left the server when a \`mute\` or \`kick\` escalation fires, that threshold is skipped silently. \`ban\` works by ID and does not require the user to be present.
- Escalation respects \`dm_on_action\` from the moderation plugin — if DMs are disabled server-wide, escalation DMs are also suppressed.`,
      },

      // ── COMMAND ALIASES ─────────────────────────────────────────────────────
      {
        id: "command-aliases",
        title: "Command Aliases",
        type: "article",
        content: `# Command Aliases

Aliases let your moderation team type shorter versions of commands. They are **YAML-only** — there are no bot commands to add, remove, or list aliases. To change them, edit the \`plugins.command_aliases.config.aliases\` block in your config and save.

## How aliases work

1. Moderator types \`!b @User toxic behaviour\`
2. Bot strips the prefix → \`b @User toxic behaviour\`
3. Bot looks up \`b\` in the alias table → finds \`ban\`
4. Bot processes the message exactly as \`!ban @User toxic behaviour\`

Aliases are **completely transparent** to the rest of the bot. Level checks, case logging, and mod-log events all use the resolved command name — not the alias.

## Configuration format

\`\`\`yaml
plugins:
  command_aliases:
    config:
      aliases:
        b: "ban"
        k: "kick"
        w: "warn"
        m: "mute"
        p: "purge"
        # Add as many as you like — no limit
\`\`\`

- **Key** = what the moderator types (the short version)
- **Value** = the real command name it maps to

## Rules

| Rule | Detail |
|------|--------|
| YAML-only | No commands to manage — edit the config |
| No chaining | An alias cannot point to another alias |
| No overrides | If an alias key matches a real command name, it is ignored |
| Case-insensitive | \`B\` and \`b\` resolve the same way |
| Level-transparent | The alias inherits the exact level of the command it resolves to |

## Adding your own aliases

\`\`\`yaml
plugins:
  command_aliases:
    config:
      aliases:
        # Your custom shortcuts — add alongside or instead of defaults
        timeout: "mute"        # !timeout @User 1h  →  !mute @User 1h
        strike: "warn"         # !strike @User      →  !warn @User
        silence: "mute"        # !silence @User     →  !mute @User
        clear: "purge"         # !clear 50          →  !purge 50
\`\`\`

> **Tip:** The default alias map is applied automatically at startup. You only need to list the aliases you want to **add or override** — you do not need to copy the entire default table into your config.`,
      },

      // ── PRESET REASONS ──────────────────────────────────────────────────────
      {
        id: "preset-reasons",
        title: "Preset Reasons",
        type: "article",
        content: `# Preset Reasons

Preset reasons let your team use short keyword shortcuts instead of typing full reason text every time. When a moderator supplies a known preset name as the reason for any moderation command, the bot automatically substitutes the full configured text before creating the case.

## How it works

1. You define a preset: \`spam: "Spam / flooding the chat"\`
2. Moderator types: \`!warn @User spam\`
3. Bot looks up \`spam\` in the preset map → finds the full text
4. Case is created with reason: **Spam / flooding the chat**
5. Mod log, DM, and case viewer all show the expanded text — never the short key

Preset substitution happens **before** case creation, so the stored reason is always the full expanded text.

## Configuration

Presets live under \`plugins.preset_reasons.config.presets\`:

\`\`\`yaml
plugins:
  preset_reasons:
    config:
      presets:
        # key: "full reason text stored on the case"
        spam:    "Spam / flooding the chat"
        toxic:   "Toxic behaviour — harassment or disrespect toward other members"
        nsfw:    "Posting NSFW content outside designated channels"
        raid:    "Participating in a coordinated raid or mass-join attack"
        evade:   "Ban/mute evasion — rejoined with an alternate account"
        ad:      "Unsolicited advertising or server promotion"
        mention: "Mass-mentioning / ping spam"
        caps:    "Excessive use of capital letters"
        slur:    "Use of slurs or hate speech"
        troll:   "Trolling / deliberately provoking members"
        nick:    "Inappropriate nickname"
        pfp:     "Inappropriate profile picture"
        dox:     "Sharing personal information (doxxing)"
\`\`\`

## Using presets with commands

Any moderation command that accepts a \`[reason]\` argument supports presets. Type the preset key exactly as defined:

\`\`\`
!warn @User spam
!mute @User 1h toxic
!ban @User perm raid
!kick @User nsfw
!tempmute @User 30m mention

# Works with force variants and mass actions too
!forcewarn 123456789 evade
!masswarn @A @B @C | raid
\`\`\`

> The key comparison is **case-insensitive** — \`Spam\`, \`spam\`, and \`SPAM\` all match the same preset.

## Using presets with aliases

Presets and aliases stack naturally:

\`\`\`
!w @User spam       →  !warn @User "Spam / flooding the chat"
!b @User perm raid  →  !ban @User perm "Participating in a coordinated raid..."
!m @User 1h toxic   →  !mute @User 1h "Toxic behaviour — harassment..."
\`\`\`

## Practical example — full setup

\`\`\`yaml
plugins:
  moderation:
    enabled: true

  preset_reasons:
    config:
      presets:
        spam:    "Spam / flooding the chat"
        toxic:   "Toxic behaviour toward other members"
        nsfw:    "Posting NSFW content"
        raid:    "Participating in a raid"
        evade:   "Alternate account / ban evasion"
        ad:      "Unsolicited advertising"
        mention: "Mass-mention / ping spam"
        slur:    "Use of slurs or hate speech"

  command_aliases:
    config:
      aliases:
        w: "warn"
        m: "mute"
        b: "ban"
        k: "kick"
        p: "purge"
\`\`\`

With this setup, your mods can do full, properly-logged moderation actions in seconds:

| What they type | What gets stored |
|----------------|-----------------|
| \`!w @User spam\` | Case: warn — *Spam / flooding the chat* |
| \`!m @User 1h toxic\` | Case: mute — *Toxic behaviour toward other members* |
| \`!b @User perm evade\` | Case: ban — *Alternate account / ban evasion* |
| \`!k @User nsfw\` | Case: kick — *Posting NSFW content* |

## Tips

- **Multi-word presets** — Keys cannot contain spaces. Use a single short word as the key: \`"longban"\`, \`"verybad"\`.
- **Fallback** — If the supplied reason does not match any preset key, it is used as-is. Regular reasons always work.
- **Audit trail** — The full expanded text is what appears in the case log, mod log channel, DM to the user, and any exported CSV. Staff never see the short key in case records.`,
      },
      {
        id: "case-expirations",
        title: "Case Expirations",
        type: "article",
        content: `# Case Expirations

Staff can configure how long a case stays **active** before it automatically expires — separately for cases created by **human moderators** and cases created by **automod** (YAML automod rules, antinuke, antiraid). This is a single settings block that applies across every case type: \`warn\`, \`mute\`, \`kick\`, \`ban\`, and \`note\`.

An "expired" case is never deleted. It still shows up in \`!cases\`, \`!servercases\`, and \`!case <id>\` history exactly like any other case — it's simply excluded from active escalation / warning counts once its expiry time passes, and \`!case <id>\` marks it **⏳ Expired** so staff can tell at a glance.

This is separate from — and stacks with — the \`warning_expiry\` setting inside \`punishment_escalation\`. If both are configured, whichever expiry comes first wins for that individual case.

## How it works

1. A case is created (manually via a mod command, or automatically via automod/antiraid/antinuke).
2. If the case doesn't already carry a natural expiry (e.g. a \`!mute\` or \`!tempban\` with an explicit duration keeps its own timeout-based expiry), the bot looks up the duration configured for that case's type under \`manual\` or \`automod\` — whichever matches how the case was created.
3. If a duration is configured, \`expiresAt\` is set to \`created_at + duration\`. If left \`null\` (or omitted), that case type never auto-expires.
4. Once \`expiresAt\` passes, the case stops counting toward active warnings/escalation, exactly like a case that was force-expired with \`!escalation reset\`.

## Configuration

\`\`\`yaml
case_expirations:
  config:
    enabled: true

    # Expiry durations for cases created by real moderators using commands
    # (!warn, !mute, !kick, !ban, !note). Accepts duration strings like
    # 10m, 6h, 30d, 2w — or null for "never expires".
    manual:
      warn: "30d"
      mute: null
      kick: null
      ban: null
      note: null

    # Expiry durations for cases created automatically — YAML automod rule
    # actions, antiraid responses, and antinuke responses.
    automod:
      warn: "14d"
      mute: null
      kick: null
      ban: null
\`\`\`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| \`enabled\` | boolean | \`false\` | Turns the whole case-expirations system on or off. When \`false\`, cases never auto-expire from this system (they can still expire via \`punishment_escalation.warning_expiry\` or a manual \`!escalation reset\`). |
| \`manual.<type>\` | string \\| null | \`null\` | Expiry duration for a case of \`<type>\` (\`warn\`, \`mute\`, \`kick\`, \`ban\`, \`note\`) created by a human moderator command. \`null\` = never expires. |
| \`automod.<type>\` | string \\| null | \`null\` | Same as above, but for cases created automatically by automod rules, antiraid, or antinuke. |

## Why separate manual vs. automod?

Automod rules can fire far more often than a human moderator would warn someone, so it's common to want automod-issued warnings to fade away faster than warnings a real moderator hands out deliberately. Configuring the two independently means you can, for example, let automod warnings expire after 14 days while manual warnings from staff stick around for 30 — matching how much weight each type of action should carry over time.

## Interaction with existing durations

- **Timed mutes/bans** (\`!mute 1h\`, \`!tempban 7d\`, automod \`duration:\` fields) already compute their own \`expiresAt\` from the duration you pass to the command or rule — \`case_expirations\` does **not** override that. It only fills in an expiry when the case wouldn't otherwise get one (mainly \`warn\`, \`kick\`, \`ban\` with no duration, and \`note\`).
- **\`punishment_escalation.config.global.warning_expiry\`** is a separate, warn-only expiry used specifically for escalation step counting. You can use \`case_expirations\` and \`punishment_escalation\` together, or just one of them — they don't conflict.`,
        schema: [
          { key: "enabled", type: "boolean", default: "false", description: "Enable the case expirations system" },
          {
            key: "manual", type: "object", description: "Expiry durations for cases created by human moderator commands",
            children: [
              { key: "manual.warn", type: "string | null", default: "null", description: "How long a manually-issued warn case stays active. e.g. \"30d\". null = never expires." },
              { key: "manual.mute", type: "string | null", default: "null", description: "How long a manually-issued mute case stays active before its case record is considered expired. null = never expires." },
              { key: "manual.kick", type: "string | null", default: "null", description: "How long a manually-issued kick case stays active. null = never expires." },
              { key: "manual.ban", type: "string | null", default: "null", description: "How long a manually-issued ban case stays active. null = never expires." },
              { key: "manual.note", type: "string | null", default: "null", description: "How long a manually-added note stays active. null = never expires." },
            ],
          },
          {
            key: "automod", type: "object", description: "Expiry durations for cases created automatically by automod rules, antiraid, and antinuke",
            children: [
              { key: "automod.warn", type: "string | null", default: "null", description: "How long an automod-issued warn case stays active. e.g. \"14d\". null = never expires." },
              { key: "automod.mute", type: "string | null", default: "null", description: "How long an automod-issued mute case stays active. null = never expires." },
              { key: "automod.kick", type: "string | null", default: "null", description: "How long an automod-issued kick case stays active. null = never expires." },
              { key: "automod.ban", type: "string | null", default: "null", description: "How long an automod-issued ban case stays active. null = never expires." },
            ],
          },
        ],
        defaultConfig: `case_expirations:
  config:
    enabled: false

    manual:
      warn: "30d"
      mute: null
      kick: null
      ban: null
      note: null

    automod:
      warn: "14d"
      mute: null
      kick: null
      ban: null`,
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  // PLUGINS
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: "plugins",
    title: "Plugins",
    pages: [
      // ── MODERATION ──────────────────────────────────────────────────────────
      {
        id: "plugin-moderation",
        title: "Moderation",
        type: "plugin",
        configKey: "moderation",
        defaultConfig: `moderation:
  enabled: true

  # ── Mute mode ─────────────────────────────────────────────────────────
  # Set a role ID to use role-based muting.
  # Leave null to use Discord's native timeout instead.
  mute_role: null

  # DM the target user when any moderation action is taken against them
  dm_on_action: true

  # Strip all roles when muted; automatically restore them on unmute
  strip_roles_on_mute: false

  # DM the user when their mute duration is updated or approaching expiry
  dm_mute_updates: false

  # ── Channel response messages ──────────────────────────────────────────
  # Placeholders available on all messages:
  #   {user}          username#discriminator of the target
  #   {user.mention}  <@user_id>
  #   {user.id}       raw user ID
  #   {mod}           moderator's username
  #   {mod.mention}   <@mod_id>
  #   {reason}        reason text (or "No reason provided")
  #   {case_id}       new case number
  #   {server}        server name
  #   {timestamp}     current date/time
  # Extra per action:
  #   ban/tempban/softban  → {duration}  {expires_at}
  #   mute/tempmute        → {duration}  {expires_at}
  #   purge                → {count}
  #   slowmode             → {count}  {channel}  {channel.mention}
  #
  # Every message supports plain string, embed, or content+embed.
  messages:
    ban_success:
      embed:
        title: "🔨 Member Banned"
        description: "**{user}** has been banned by {mod.mention}"
        color: "ED4245"
        fields:
          - name: "Reason"
            value: "{reason}"
            inline: true
          - name: "Duration"
            value: "{duration}"
            inline: true
          - name: "Case"
            value: "#{case_id}"
            inline: true

    unban_success: "✅ **{user}** has been unbanned | Case: #{case_id}"
    softban_success: "🔨 **{user}** has been softbanned (messages cleared) | Case: #{case_id}"
    kick_success: "👢 **{user}** has been kicked | Case: #{case_id}"

    mute_success:
      embed:
        title: "🔇 Member Muted"
        description: "**{user}** has been muted by {mod.mention}"
        color: "FEE75C"
        fields:
          - name: "Duration"
            value: "{duration}"
            inline: true
          - name: "Expires"
            value: "{expires_at}"
            inline: true
          - name: "Case"
            value: "#{case_id}"
            inline: true
          - name: "Reason"
            value: "{reason}"
            inline: false

    unmute_success: "🔊 **{user}** has been unmuted | Case: #{case_id}"
    warn_success: "⚠️ **{user}** has been warned | Case: #{case_id}"
    purge_success: "🗑️ {count} messages deleted"
    slowmode_success: "🐢 Slowmode set to {count}s in {channel.mention}"
    slowmode_off: "✅ Slowmode removed in {channel.mention}"
    lock_success: "🔒 {channel.mention} has been locked | {reason}"
    unlock_success: "🔓 {channel.mention} has been unlocked"
    hide_success: "👁️ {channel.mention} hidden"
    unhide_success: "👁️ {channel.mention} visible again"
    nick_success: "📝 Nickname set for **{user}**"
    resetnick_success: "📝 Nickname reset for **{user}**"
    locknick_success: "🔒 Nickname locked for **{user}**"
    unlocknick_success: "🔓 Nickname unlocked for **{user}**"
    watch_success: "👁️ **{user}** added to watch list"
    unwatch_success: "✅ **{user}** removed from watch list"
    roleban_success: "🚫 **{user}** role-banned from {trigger}"
    unroleban_success: "✅ Role-ban removed for **{user}**"

    # ── DM messages sent directly to the actioned user ──────────────────
    ban_dm: "You have been **banned** from **{server}**.\n**Reason:** {reason}\n**Duration:** {duration}"
    tempban_dm: "You have been **temporarily banned** from **{server}**.\n**Reason:** {reason}\n**Expires:** {expires_at}"
    unban_dm: "You have been **unbanned** from **{server}**."
    kick_dm: "You have been **kicked** from **{server}**.\n**Reason:** {reason}"
    softban_dm: "You have been **softbanned** from **{server}** (your recent messages were cleared).\n**Reason:** {reason}"
    mute_dm: "You have been **muted** in **{server}**.\n**Reason:** {reason}\n**Duration:** {duration}\n**Expires:** {expires_at}"
    tempmute_dm: "You have been **temporarily muted** in **{server}**.\n**Reason:** {reason}\n**Expires:** {expires_at}"
    unmute_dm: "You have been **unmuted** in **{server}**."
    warn_dm: "You have received a **warning** in **{server}**.\n**Reason:** {reason}\n**Total warnings:** {count}"

    # ── Error messages ───────────────────────────────────────────────────
    error_no_permission: "❌ You do not have permission to use this command."
    error_user_not_found: "❌ User not found."
    error_already_muted: "❌ **{user}** is already muted."
    error_not_muted: "❌ **{user}** is not currently muted."
    error_cannot_action_self: "❌ You cannot perform this action on yourself."
    error_cannot_action_bot: "❌ You cannot perform this action on the bot."
    error_hierarchy: "❌ You cannot action a member with an equal or higher level."

# ── Moderation logging ─────────────────────────────────────────────────
# Moderation log events are configured under logging.config.moderation.
# Add this block alongside your moderation: config above.
logging:
  config:
    # Named channels referenced in the events map below
    channels:
      mod_logs: "MOD_LOG_CHANNEL_ID"   # replace with your channel ID

    # Default fallback for moderation events
    default_channels:
      moderation: "MOD_LOG_CHANNEL_ID"

    # ── Single-target moderation actions ──────────────────────────────
    moderation:
      events:
        warn: mod_logs
        mute: mod_logs
        unmute: mod_logs
        kick: mod_logs
        ban: mod_logs
        unban: mod_logs
        softban: mod_logs
        forceban: mod_logs
        tempban: mod_logs
        note: mod_logs
        timeout: mod_logs
        timeout_remove: mod_logs
        role_add: mod_logs
        role_remove: mod_logs
        nickname_reset: mod_logs
        nickname_force: mod_logs
        case_edit: mod_logs
        case_delete: mod_logs
        case_hide: mod_logs

      enabled:
        warn: true
        mute: true
        unmute: true
        kick: true
        ban: true
        unban: true
        softban: true
        forceban: true
        tempban: true
        note: true
        timeout: true
        timeout_remove: true
        role_add: true
        role_remove: true
        nickname_reset: true
        nickname_force: true
        case_edit: true
        case_delete: true
        case_hide: true

      messages:
        warn:
          title: "⚠️ Member Warned"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Reason:** {reason}\n**Case:** #{caseNumber}"
          color: "FEE75C"

        mute:
          title: "🔇 Member Muted"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Duration:** {duration}\n**Reason:** {reason}\n**Case:** #{caseNumber}"
          color: "ED4245"

        unmute:
          title: "🔊 Member Unmuted"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Reason:** {reason}\n**Case:** #{caseNumber}"
          color: "57F287"

        kick:
          title: "👢 Member Kicked"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Reason:** {reason}\n**Case:** #{caseNumber}"
          color: "ED4245"

        ban:
          title: "🔨 Member Banned"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Reason:** {reason}\n**Case:** #{caseNumber}"
          color: "ED4245"

        tempban:
          title: "⏱️ Member Tempbanned"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Duration:** {duration}\n**Reason:** {reason}\n**Case:** #{caseNumber}"
          color: "ED4245"

        softban:
          title: "🔨 Member Softbanned"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Reason:** {reason}\n**Case:** #{caseNumber}"
          color: "ED4245"

        forceban:
          title: "🔨 Member Forcebanned"
          description: "**User:** \`{userId}\`\n**Moderator:** {moderator}\n**Reason:** {reason}\n**Case:** #{caseNumber}"
          color: "ED4245"

        unban:
          title: "🔓 Member Unbanned"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Reason:** {reason}\n**Case:** #{caseNumber}"
          color: "57F287"

        note:
          title: "📝 Note Added"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Note:** {reason}\n**Case:** #{caseNumber}"
          color: "FEE75C"

        timeout:
          title: "⏳ Member Timed Out"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Duration:** {duration}\n**Reason:** {reason}\n**Case:** #{caseNumber}"
          color: "FEE75C"

        timeout_remove:
          title: "⏰ Timeout Removed"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Reason:** {reason}\n**Case:** #{caseNumber}"
          color: "57F287"

        role_add:
          title: "➕ Role Added"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Role:** {newValue}\n**Case:** #{caseNumber}"
          color: "57F287"

        role_remove:
          title: "➖ Role Removed"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Role:** {oldValue}\n**Case:** #{caseNumber}"
          color: "ED4245"

        nickname_reset:
          title: "📝 Nickname Reset"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**Case:** #{caseNumber}"
          color: "FEE75C"

        nickname_force:
          title: "📝 Nickname Forced"
          description: "**User:** {userMention} (\`{userId}\`)\n**Moderator:** {moderator}\n**New nickname:** {newValue}\n**Case:** #{caseNumber}"
          color: "FEE75C"

        case_edit:
          title: "📋 Case Edited"
          description: "**Case:** #{caseNumber}\n**Moderator:** {moderator}\n**New reason:** {reason}"
          color: "FEE75C"

        case_delete:
          title: "🗑️ Case Deleted"
          description: "**Case:** #{caseNumber}\n**Moderator:** {moderator}"
          color: "ED4245"

        case_hide:
          title: "👁️ Case Hidden"
          description: "**Case:** #{caseNumber}\n**Moderator:** {moderator}"
          color: "FEE75C"`,
        schema: [
          { key: "moderation.enabled", type: "boolean", default: "true", description: "Enable the moderation plugin" },
          { key: "moderation.mute_role", type: "snowflake | null", default: "null", description: "Role ID to apply when muting. Leave null to use Discord native timeout." },
          { key: "moderation.dm_on_action", type: "boolean", default: "true", description: "DM the target user when a moderation action is taken" },
          { key: "moderation.ban_day_delete", type: "integer (0–7)", default: "0", description: "Days of message history Discord deletes when a ban is issued. 0 = no deletion, max 7. Applies to !ban, !tempban, and !forceban." },
          { key: "moderation.strip_roles_on_mute", type: "boolean", default: "false", description: "Remove all roles when muted; restore them on unmute" },
          { key: "moderation.dm_mute_updates", type: "boolean", default: "false", description: "DM the user when their mute duration is updated or approaching expiry" },
          {
            key: "moderation.messages", type: "object", description: "Channel success responses and DMs. All support plain string, embed, or content+embed format.",
            children: [
              { key: "ban_success", type: "message", description: "Ban confirmed in channel. Vars: {user} {mod} {reason} {duration} {expires_at} {case_id}" },
              { key: "tempban_success", type: "message", description: "Tempban confirmed. Vars: {duration} {expires_at} {case_id}" },
              { key: "softban_success", type: "message", description: "Softban confirmed." },
              { key: "unban_success", type: "message", description: "Unban confirmed." },
              { key: "kick_success", type: "message", description: "Kick confirmed." },
              { key: "mute_success", type: "message", description: "Mute confirmed. Vars: {duration} {expires_at}" },
              { key: "unmute_success", type: "message", description: "Unmute confirmed." },
              { key: "warn_success", type: "message", description: "Warn confirmed. Var: {count} = total warn count" },
              { key: "purge_success", type: "message", description: "Purge result. Var: {count} = messages deleted" },
              { key: "slowmode_success", type: "message", description: "Slowmode set. Vars: {count} {channel} {channel.mention}" },
              { key: "slowmode_off", type: "message", description: "Slowmode disabled." },
              { key: "lock_success / unlock_success", type: "message", description: "Channel lock/unlock confirmed." },
              { key: "hide_success / unhide_success", type: "message", description: "Channel visibility changed." },
              { key: "nick_success / resetnick_success", type: "message", description: "Nickname changed or reset." },
              { key: "ban_dm", type: "message", description: "DM to banned user. Vars: {server} {reason} {duration}" },
              { key: "tempban_dm", type: "message", description: "DM to tempbanned user." },
              { key: "unban_dm", type: "message", description: "DM to unbanned user." },
              { key: "kick_dm", type: "message", description: "DM to kicked user." },
              { key: "softban_dm", type: "message", description: "DM to softbanned user." },
              { key: "mute_dm", type: "message", description: "DM to muted user." },
              { key: "unmute_dm", type: "message", description: "DM to unmuted user." },
              { key: "warn_dm", type: "message", description: "DM to warned user. Var: {count} = warn count" },
              { key: "error_no_permission", type: "message", description: "Missing permission response" },
              { key: "error_user_not_found", type: "message", description: "Target user not found" },
              { key: "error_already_muted", type: "message", description: "Target already muted" },
              { key: "error_not_muted", type: "message", description: "Target not muted" },
              { key: "error_cannot_action_self", type: "message", description: "Self-action attempt" },
              { key: "error_hierarchy", type: "message", description: "Target has equal or higher level" },
            ],
          },
          { key: "logging.config.moderation.events", type: "object", description: "Map each mod action to a named channel defined in logging.config.channels" },
          { key: "logging.config.moderation.enabled", type: "object", description: "Enable or disable individual moderation log events (all true by default)" },
          { key: "logging.config.moderation.messages", type: "object", description: "Embed templates for each mod log event. Fields: title, description, color. See placeholder table." },
        ],
        content: `The **Moderation** plugin is the core punishment system. All actions create numbered cases tracked by the Cases plugin.

---

## Mute modes

| Setting | Behaviour |
|---------|-----------|
| \`mute_role: null\` | Uses Discord's native timeout (recommended) |
| \`mute_role: "ROLE_ID"\` | Applies a role — works on older Discord clients |

When using a mute role, set \`strip_roles_on_mute: true\` to also remove all other roles during the mute.

---

## Force commands

Every action has a \`force\` variant that accepts a raw user ID instead of a mention. These work even if the user is **not in the server**:

| Command | Force variant |
|---------|--------------|
| \`!ban\` | \`!forceban <id>\` |
| \`!mute\` | \`!forcemute <id>\` |
| \`!unmute\` | \`!forceunmute <id>\` |
| \`!warn\` | \`!forcewarn <id>\` |

---

## Purge subcommands

| Usage | What it deletes |
|-------|----------------|
| \`!purge 50\` | Last 50 messages |
| \`!purge @User 20\` | Last 20 messages from one user |
| \`!purge bots 50\` | Bot messages only |
| \`!purge images 20\` | Messages with attachments |
| \`!purge links 20\` | Messages containing links |
| \`!purge contains word 20\` | Messages containing specific text |
| \`!purge before <id>\` | Messages before a message ID |
| \`!purge after <id>\` | Messages after a message ID |
| \`!purge between <id> <id>\` | Messages between two IDs |
| \`!purge embeds 20\` | Messages with embeds |
| \`!purge pins\` | Pinned messages |

---

## Moderation logging

Moderation log events (warn, ban, kick, mute, etc.) are configured under \`logging.config.moderation\` in your YAML. The full setup is included in the default config above — paste the \`logging:\` block alongside your \`moderation:\` block.

**Placeholders available in moderation log messages:**

| Placeholder | Value |
|-------------|-------|
| \`{userMention}\` | \`<@user_id>\` |
| \`{userId}\` | Raw user ID |
| \`{userTag}\` | username#discriminator |
| \`{moderator}\` | Moderator's tag |
| \`{reason}\` | Action reason |
| \`{duration}\` | Duration string |
| \`{caseNumber}\` | Case number |
| \`{newValue}\` | New value (role name, nickname, etc.) |
| \`{oldValue}\` | Old value |
| \`{timestamp}\` | Current date/time |

---

## Preset reasons

Instead of typing a full reason, moderators can use short preset names:

\`\`\`
!warn @User spam
\`\`\`

If \`spam\` is a configured preset, the full text is substituted automatically. See the **Preset Reasons** plugin.

---

## Background tasks

Timed mutes and timed bans are tracked in the database. A background task checks every 30 seconds and unmutes/unbans users when their time expires.

---

### Full Command Reference

\`\`\`
!warn <@user> [reason]
!forcewarn <user_id> [reason]
!kick <@user> [reason]
!ban <@user> [duration] [reason]
!forceban <user_id> [reason]
!unban <user_id> [reason]
!tempban <@user> <duration> [reason]
!softban <@user> [reason]
!baninfo <user_id>
!banlist
!mute <@user> [duration] [reason]
!forcemute <user_id> [duration] [reason]
!unmute <@user> [reason]
!forceunmute <user_id> [reason]
!tempmute <@user> <duration> [reason]
!mutelist
!muteinfo <@user>
!purge <count | bots | images | links | contains <text> | before/after/between <id(s)> | embeds | pins>
!slowmode <seconds>
!slowmodeinfo
!nick <@user> <new_nickname>
!resetnick <@user>
!locknick <@user>
!unlocknick <@user>
!watch <@user> [reason]
!unwatch <@user>
!watchlist
!roleban <@user> <@role> [reason]
!unroleban <@user> <@role>
!rolebanned <@role>
!lockdown [#channel | preset_name]
!unlock [#channel]
!hide [#channel]
!unhide [#channel]
\`\`\``,
      },

      // ── MASS ACTIONS ────────────────────────────────────────────────────────
      {
        id: "plugin-mass-actions",
        title: "Mass Actions",
        type: "plugin",
        configKey: "mass_actions",
        defaultConfig: `mass_actions:
  enabled: true
  max_targets: 20
  delay_between_actions: 500
  require_reason: false
  dm_on_action: true
  create_cases: true
  log_individually: false

  warn:
    success: "{success_count}/{total} users warned | Failed: {fail_count} | Reason: {reason}"
    partial: "⚠️ Mass warn partial | Warned: {success_count}/{total} | Failed: {fail_count}"
    all_failed: "❌ Mass warn failed for all {total} targets"
    user_dm: "You have been warned in **{server}** | Reason: {reason}"
    log: "Mass warn | {mod} | Warned: {success_count}/{total} | Failed: {fail_count} | Reason: {reason} | Users: {trigger}"
    log_individual: "Warn | {user} ({user.id}) | Mod: {mod} | Reason: {reason} | Case: {case_id}"

  forcewarn:
    success: "{success_count}/{total} users forcewarned | Failed: {fail_count} | Reason: {reason}"
    partial: "⚠️ Mass forcewarn partial | Warned: {success_count}/{total} | Failed: {fail_count}"
    all_failed: "❌ Mass forcewarn failed for all {total} targets"
    log: "Mass forcewarn | {mod} | Warned: {success_count}/{total} | Reason: {reason} | IDs: {trigger}"
    log_individual: "Forcewarn | {user.id} | Mod: {mod} | Reason: {reason} | Case: {case_id}"

  mute:
    success: "{success_count}/{total} users muted | Duration: {duration} | Failed: {fail_count} | Reason: {reason}"
    partial: "⚠️ Mass mute partial | Muted: {success_count}/{total} | Duration: {duration} | Failed: {fail_count}"
    all_failed: "❌ Mass mute failed for all {total} targets"
    no_mute_role: "❌ Mass mute failed — no mute role configured in YAML"
    user_dm: "You have been muted in **{server}** | Duration: {duration} | Reason: {reason}"
    log: "Mass mute | {mod} | Muted: {success_count}/{total} | Duration: {duration} | Reason: {reason} | Users: {trigger}"
    log_individual: "Mute | {user} ({user.id}) | Mod: {mod} | Duration: {duration} | Reason: {reason} | Case: {case_id}"

  forcemute:
    success: "{success_count}/{total} users forcemuted | Duration: {duration} | Failed: {fail_count} | Reason: {reason}"
    partial: "⚠️ Mass forcemute partial | Muted: {success_count}/{total} | Failed: {fail_count}"
    all_failed: "❌ Mass forcemute failed for all {total} targets"
    no_mute_role: "❌ Mass forcemute failed — no mute role configured in YAML"
    log: "Mass forcemute | {mod} | Muted: {success_count}/{total} | Duration: {duration} | Reason: {reason} | IDs: {trigger}"
    log_individual: "Forcemute | {user.id} | Mod: {mod} | Duration: {duration} | Reason: {reason} | Case: {case_id}"

  unmute:
    success: "{success_count}/{total} users unmuted | Failed: {fail_count} | Reason: {reason}"
    partial: "⚠️ Mass unmute partial | Unmuted: {success_count}/{total} | Failed: {fail_count}"
    all_failed: "❌ Mass unmute failed for all {total} targets"
    no_mute_role: "❌ Mass unmute failed — no mute role configured in YAML"
    user_dm: "You have been unmuted in **{server}** | Reason: {reason}"
    log: "Mass unmute | {mod} | Unmuted: {success_count}/{total} | Reason: {reason} | Users: {trigger}"
    log_individual: "Unmute | {user} ({user.id}) | Mod: {mod} | Reason: {reason} | Case: {case_id}"

  kick:
    success: "{success_count}/{total} users kicked | Failed: {fail_count} | Reason: {reason}"
    partial: "⚠️ Mass kick partial | Kicked: {success_count}/{total} | Failed: {fail_count}"
    all_failed: "❌ Mass kick failed for all {total} targets"
    user_dm: "You have been kicked from **{server}** | Reason: {reason}"
    log: "Mass kick | {mod} | Kicked: {success_count}/{total} | Reason: {reason} | Users: {trigger}"
    log_individual: "Kick | {user} ({user.id}) | Mod: {mod} | Reason: {reason} | Case: {case_id}"

  ban:
    success: "{success_count}/{total} users banned | Duration: {duration} | Failed: {fail_count} | Reason: {reason}"
    partial: "⚠️ Mass ban partial | Banned: {success_count}/{total} | Duration: {duration} | Failed: {fail_count}"
    all_failed: "❌ Mass ban failed for all {total} targets"
    user_dm: "You have been banned from **{server}** | Duration: {duration} | Reason: {reason}"
    log: "Mass ban | {mod} | Banned: {success_count}/{total} | Duration: {duration} | Reason: {reason} | Users: {trigger}"
    log_individual: "Ban | {user} ({user.id}) | Mod: {mod} | Duration: {duration} | Reason: {reason} | Case: {case_id}"

  forceban:
    success: "{success_count}/{total} users forcebanned | Duration: {duration} | Failed: {fail_count} | Reason: {reason}"
    partial: "⚠️ Mass forceban partial | Banned: {success_count}/{total} | Duration: {duration} | Failed: {fail_count}"
    all_failed: "❌ Mass forceban failed for all {total} targets"
    user_dm: "You have been banned from **{server}** | Duration: {duration} | Reason: {reason}"
    log: "Mass forceban | {mod} | Banned: {success_count}/{total} | Duration: {duration} | Reason: {reason} | IDs: {trigger}"
    log_individual: "Forceban | {user.id} | Mod: {mod} | Duration: {duration} | Reason: {reason} | Case: {case_id}"

  unban:
    success: "{success_count}/{total} users unbanned | Failed: {fail_count} | Reason: {reason}"
    partial: "⚠️ Mass unban partial | Unbanned: {success_count}/{total} | Failed: {fail_count}"
    all_failed: "❌ Mass unban failed for all {total} targets"
    user_dm: "You have been unbanned from **{server}** | Reason: {reason}"
    log: "Mass unban | {mod} | Unbanned: {success_count}/{total} | Reason: {reason} | IDs: {trigger}"
    log_individual: "Unban | {user.id} | Mod: {mod} | Reason: {reason} | Case: {case_id}"

  errors:
    error_too_many_targets: "Too many targets — maximum is {count} users per mass action"
    error_no_targets: "No valid targets found — provide @mentions or raw user IDs before the |"
    error_no_separator: "Missing separator — use | to separate targets from reason"
    error_self_target: "You cannot include yourself as a target"
    error_bot_target: "You cannot include the bot as a target"
    error_hierarchy: "{count} target(s) skipped — their level is equal to or above yours"`,
        schema: [
          { key: "enabled", type: "boolean", default: "true", description: "Enable mass action commands" },
          { key: "max_targets", type: "number", default: "20", description: "Maximum number of users that can be targeted in a single mass command. Exceeding this shows error_too_many_targets" },
          { key: "delay_between_actions", type: "number", default: "500", description: "Milliseconds to wait between processing each target. Increase to 1000–2000 for large actions (15+ users) to avoid rate limits" },
          { key: "require_reason", type: "boolean", default: "false", description: "If true, all mass commands require a reason after the | character. If false, reason is optional" },
          { key: "dm_on_action", type: "boolean", default: "true", description: "DM each target when a mass action is applied. DM failures are always silent. Requires user_dm to be configured per action" },
          { key: "create_cases", type: "boolean", default: "true", description: "Create individual cases in the database for each target. Strongly recommended for audit purposes" },
          { key: "log_individually", type: "boolean", default: "false", description: "If true, each target gets its own log entry. If false, one summary log entry is posted. false is recommended for most servers" },
          {
            key: "warn", type: "object", default: "—", description: "Messages for !masswarn",
            children: [
              { key: "success", type: "message", default: "...", description: "Posted once in the channel after all targets succeed. Variables: {success_count} {total} {fail_count} {reason}" },
              { key: "partial", type: "message", default: "...", description: "Posted when some but not all targets failed" },
              { key: "all_failed", type: "message", default: "...", description: "Posted when every target fails" },
              { key: "user_dm", type: "message", default: "...", description: "Sent to each warned user if dm_on_action is true. Variables: {server} {reason} {mod}" },
              { key: "log", type: "message", default: "...", description: "Summary log entry. Variables: {mod} {mod.id} {success_count} {total} {fail_count} {reason} {trigger}" },
              { key: "log_individual", type: "message", default: "...", description: "Used when log_individually is true. One entry per target. Variables: {user} {user.id} {mod} {reason} {case_id}" },
            ],
          },
          {
            key: "forcewarn", type: "object", default: "—", description: "Messages for !massforcewarn (raw user IDs, user need not be in server)",
            children: [
              { key: "success", type: "message", default: "...", description: "Posted after all targets are processed. Variables: {success_count} {total} {fail_count} {reason}" },
              { key: "partial", type: "message", default: "...", description: "Posted when some targets failed" },
              { key: "all_failed", type: "message", default: "...", description: "Posted when every target fails" },
              { key: "log", type: "message", default: "...", description: "Summary log entry. Variables: {mod} {mod.id} {success_count} {total} {reason} {trigger}" },
              { key: "log_individual", type: "message", default: "...", description: "Per-target log when log_individually is true. Variables: {user.id} {mod} {reason} {case_id}" },
            ],
          },
          {
            key: "mute", type: "object", default: "—", description: "Messages for !massmute",
            children: [
              { key: "success", type: "message", default: "...", description: "Variables: {success_count} {total} {fail_count} {duration} {reason}" },
              { key: "partial", type: "message", default: "...", description: "Posted when some targets failed" },
              { key: "all_failed", type: "message", default: "...", description: "Posted when every target fails" },
              { key: "no_mute_role", type: "message", default: "...", description: "Posted when no mute role is configured in the moderation plugin" },
              { key: "user_dm", type: "message", default: "...", description: "Variables: {server} {duration} {expires_at} {reason} {mod}" },
              { key: "log", type: "message", default: "...", description: "Variables: {mod} {mod.id} {success_count} {total} {duration} {reason} {trigger}" },
              { key: "log_individual", type: "message", default: "...", description: "Variables: {user} {user.id} {mod} {duration} {expires_at} {reason} {case_id}" },
            ],
          },
          {
            key: "forcemute", type: "object", default: "—", description: "Messages for !massforcemute (raw user IDs)",
            children: [
              { key: "success", type: "message", default: "...", description: "Variables: {success_count} {total} {fail_count} {duration} {reason}" },
              { key: "partial", type: "message", default: "...", description: "Posted when some targets failed" },
              { key: "all_failed", type: "message", default: "...", description: "Posted when every target fails" },
              { key: "no_mute_role", type: "message", default: "...", description: "Posted when no mute role is configured" },
              { key: "log", type: "message", default: "...", description: "Variables: {mod} {mod.id} {success_count} {total} {duration} {reason} {trigger}" },
              { key: "log_individual", type: "message", default: "...", description: "Variables: {user.id} {mod} {duration} {reason} {case_id}" },
            ],
          },
          {
            key: "unmute", type: "object", default: "—", description: "Messages for !massunmute",
            children: [
              { key: "success", type: "message", default: "...", description: "Variables: {success_count} {total} {fail_count} {reason}" },
              { key: "partial", type: "message", default: "...", description: "Posted when some targets failed" },
              { key: "all_failed", type: "message", default: "...", description: "Posted when every target fails" },
              { key: "no_mute_role", type: "message", default: "...", description: "Posted when no mute role is configured" },
              { key: "user_dm", type: "message", default: "...", description: "Variables: {server} {reason} {mod}" },
              { key: "log", type: "message", default: "...", description: "Variables: {mod} {mod.id} {success_count} {total} {reason} {trigger}" },
              { key: "log_individual", type: "message", default: "...", description: "Variables: {user} {user.id} {mod} {reason} {case_id}" },
            ],
          },
          {
            key: "kick", type: "object", default: "—", description: "Messages for !masskick",
            children: [
              { key: "success", type: "message", default: "...", description: "Variables: {success_count} {total} {fail_count} {reason}" },
              { key: "partial", type: "message", default: "...", description: "Posted when some targets failed" },
              { key: "all_failed", type: "message", default: "...", description: "Posted when every target fails" },
              { key: "user_dm", type: "message", default: "...", description: "Sent BEFORE the kick so the DM can be delivered. Variables: {server} {reason} {mod}" },
              { key: "log", type: "message", default: "...", description: "Variables: {mod} {mod.id} {success_count} {total} {reason} {trigger}" },
              { key: "log_individual", type: "message", default: "...", description: "Variables: {user} {user.id} {mod} {reason} {case_id}" },
            ],
          },
          {
            key: "ban", type: "object", default: "—", description: "Messages for !massban",
            children: [
              { key: "success", type: "message", default: "...", description: "Variables: {success_count} {total} {fail_count} {duration} {reason}" },
              { key: "partial", type: "message", default: "...", description: "Posted when some targets failed" },
              { key: "all_failed", type: "message", default: "...", description: "Posted when every target fails" },
              { key: "user_dm", type: "message", default: "...", description: "Sent BEFORE the ban so the DM can be delivered. Variables: {server} {duration} {expires_at} {reason} {mod}" },
              { key: "log", type: "message", default: "...", description: "Variables: {mod} {mod.id} {success_count} {total} {duration} {reason} {trigger}" },
              { key: "log_individual", type: "message", default: "...", description: "Variables: {user} {user.id} {mod} {duration} {expires_at} {reason} {case_id}" },
            ],
          },
          {
            key: "forceban", type: "object", default: "—", description: "Messages for !massforceban (raw user IDs, user need not be in server)",
            children: [
              { key: "success", type: "message", default: "...", description: "Variables: {success_count} {total} {fail_count} {duration} {reason}" },
              { key: "partial", type: "message", default: "...", description: "Posted when some targets failed" },
              { key: "all_failed", type: "message", default: "...", description: "Posted when every target fails" },
              { key: "user_dm", type: "message", default: "...", description: "DM attempt is made before the ban. Variables: {server} {duration} {expires_at} {reason}" },
              { key: "log", type: "message", default: "...", description: "Variables: {mod} {mod.id} {success_count} {total} {duration} {reason} {trigger}" },
              { key: "log_individual", type: "message", default: "...", description: "Variables: {user.id} {mod} {duration} {reason} {case_id}" },
            ],
          },
          {
            key: "unban", type: "object", default: "—", description: "Messages for !massunban (always uses raw IDs — banned users are not in the server)",
            children: [
              { key: "success", type: "message", default: "...", description: "Variables: {success_count} {total} {fail_count} {reason}" },
              { key: "partial", type: "message", default: "...", description: "Posted when some targets failed" },
              { key: "all_failed", type: "message", default: "...", description: "Posted when every target fails" },
              { key: "user_dm", type: "message", default: "...", description: "DM attempt is made after unban. Variables: {server} {reason}" },
              { key: "log", type: "message", default: "...", description: "Variables: {mod} {mod.id} {success_count} {total} {reason} {trigger}" },
              { key: "log_individual", type: "message", default: "...", description: "Variables: {user.id} {mod} {reason} {case_id}" },
            ],
          },
          {
            key: "errors", type: "object", default: "—", description: "Error messages shared across all mass commands. All support embed format",
            children: [
              { key: "error_too_many_targets", type: "message", default: "...", description: "Shown when target count exceeds max_targets. Variable: {count} = limit" },
              { key: "error_no_targets", type: "message", default: "...", description: "Shown when no valid users are found before the | separator" },
              { key: "error_no_separator", type: "message", default: "...", description: "Shown when require_reason is true and no | is present" },
              { key: "error_self_target", type: "message", default: "...", description: "Shown if the moderator includes themselves in the target list" },
              { key: "error_bot_target", type: "message", default: "...", description: "Shown if the bot itself is included as a target" },
              { key: "error_hierarchy", type: "message", default: "...", description: "Appended to the summary when targets were skipped due to level hierarchy. Variable: {count} = skipped" },
            ],
          },
        ],
        content: `The **Mass Actions** plugin lets moderators apply the same punishment to multiple users in a single command. Every command has full YAML customisation — responses, DMs, and log entries are all configurable via the config below.

## Command format

The **pipe \`|\`** character separates the list of targets from the reason:

\`\`\`
!massban @user1 @user2 @user3 [duration] | reason here
!massmute @user1 @user2 1h | spamming
!massforceban 111111 222222 333333 perm | raiding
\`\`\`

- Everything **before** the \`|\` = targets (mentions or raw IDs for force variants) and optional duration
- Everything **after** the \`|\` = reason (supports preset reasons)
- Duration (mute/ban) goes **before** the \`|\` with the targets

## Full command reference

### Punishment commands

| Command | Syntax |
|---------|--------|
| \`!masswarn\` | \`!masswarn @user1 @user2 ... \| [reason]\` |
| \`!massforcewarn\` | \`!massforcewarn <id1> <id2> ... \| [reason]\` |
| \`!massmute\` | \`!massmute @user1 @user2 ... [duration] \| [reason]\` |
| \`!massforcemute\` | \`!massforcemute <id1> <id2> ... [duration] \| [reason]\` |
| \`!massunmute\` | \`!massunmute @user1 @user2 ... \| [reason]\` |
| \`!masskick\` | \`!masskick @user1 @user2 ... \| [reason]\` |
| \`!massban\` | \`!massban @user1 @user2 ... [duration] \| [reason]\` |
| \`!massforceban\` | \`!massforceban <id1> <id2> ... [duration] \| [reason]\` |
| \`!massunban\` | \`!massunban <id1> <id2> ... \| [reason]\` |

### Role commands

| Command | Syntax |
|---------|--------|
| \`!massrole\` | \`!massrole <role> @user1 @user2 ... \| [reason]\` |
| \`!massremoverole\` | \`!massremoverole <role> @user1 @user2 ... \| [reason]\` |
| \`!masstemprole\` | \`!masstemprole <role> <duration> @user1 @user2 ... \| [reason]\` |

The role can be provided as a **role mention**, **role ID**, or **role name**.

## Command format examples

\`\`\`
!masswarn @user1 @user2 @user3 | toxic behavior
!massforcewarn 111111 222222 | evading ban
!massmute @user1 @user2 1h | spamming
!massmute @user1 @user2 | spamming   <- no duration = permanent
!massforcemute 111111 222222 30m | flooding
!massunmute @user1 @user2 | appeal accepted
!masskick @user1 @user2 @user3 | raiding
!massban @user1 @user2 perm | raiding
!massban @user1 @user2 30d | ban evasion
!massforceban 111111 222222 333333 perm | raid accounts
!massunban 111111 222222 | appeals accepted

!massrole @Verified @User1 @User2 @User3 | verified members
!massremoverole @Muted @User1 @User2 | mute cleared
!masstemprole @EventAccess 24h @User1 @User2 | event pass
\`\`\`

## Force variants

Force variants accept **raw user IDs** instead of @mentions and work even if the user is not currently in the server:

| Regular | Force variant |
|---------|---------------|
| \`!masswarn\` | \`!massforcewarn\` |
| \`!massmute\` | \`!massforcemute\` |
| \`!massban\` | \`!massforceban\` |

> \`!massunban\` always uses raw IDs since banned users are not in the server.

## Mass role commands

\`!massrole\`, \`!massremoverole\`, and \`!masstemprole\` operate on members already in the server:

- The **role** is the first argument — mention, ID, or name
- **Managed roles** (e.g. integration/bot roles) cannot be used
- The role must be **below the bot's highest role** in the role list
- Hierarchy applies — your YAML level must be higher than the target's
- \`!masstemprole\` takes a **duration** as the second argument (e.g. \`1h\`, \`7d\`); the role is removed automatically when it expires

## Processing order

For every mass action the bot processes each target in this exact order:

1. **Validate target** — check if user exists, not self, not bot
2. **Check hierarchy** — skip if target's level is equal to or above moderator's
3. **Try DM** — send DM before the action so it can be delivered (silent on fail)
4. **Execute action** — ban/kick/mute/unmute/warn/role the user
5. **Create case** — add to cases table if \`create_cases\` is true
6. **Increment counter** — add to \`success_count\` or \`fail_count\`
7. **Wait** — pause for \`delay_between_actions\` milliseconds
8. **Next target** — repeat for all remaining targets
9. **Post summary** — send ONE summary message to the channel
10. **Log** — post to logging channel (summary or individual based on \`log_individually\`)

## Variable reference

| Variable | All actions | Mute/Ban only | Log only |
|----------|-------------|---------------|----------|
| \`{success_count}\` | ✅ users successfully actioned | ✅ | ✅ |
| \`{fail_count}\` | ✅ users that failed | ✅ | ✅ |
| \`{total}\` | ✅ total targets attempted | ✅ | ✅ |
| \`{reason}\` | ✅ the reason after \`|\` | ✅ | ✅ |
| \`{duration}\` | ❌ | ✅ formatted duration | ✅ |
| \`{expires_at}\` | ❌ | ✅ exact expiry datetime | ✅ |
| \`{mod}\` | ✅ DM and log | ✅ | ✅ |
| \`{mod.id}\` | ❌ | ❌ | ✅ |
| \`{user}\` | ✅ DM only | ✅ DM only | ✅ |
| \`{user.id}\` | ✅ DM only | ✅ DM only | ✅ |
| \`{server}\` | ✅ DM only | ✅ DM only | ❌ |
| \`{case_id}\` | ❌ | ❌ | ✅ log only |
| \`{trigger}\` | ✅ | ✅ | ✅ comma-separated IDs |

## Core settings

| Key | Default | Description |
|-----|---------|-------------|
| \`max_targets\` | 20 | Max users per command. Exceeding this shows \`error_too_many_targets\` |
| \`delay_between_actions\` | 500 | Milliseconds between each target. Increase for large actions |
| \`require_reason\` | false | If true, all mass commands require a reason after \`|\` |
| \`dm_on_action\` | true | DM each target when actioned. Requires \`user_dm\` per action type |
| \`create_cases\` | true | Create individual cases for each target (strongly recommended) |
| \`log_individually\` | false | Post one log per target instead of a summary. false = less log spam |

## Per-action message keys

Each action type (\`warn\`, \`forcewarn\`, \`mute\`, \`forcemute\`, \`unmute\`, \`kick\`, \`ban\`, \`forceban\`, \`unban\`) supports these keys:

| Key | When posted |
|-----|-------------|
| \`success\` | All targets succeeded |
| \`partial\` | Some but not all targets failed |
| \`all_failed\` | Every target failed |
| \`user_dm\` | Sent to each target (if \`dm_on_action: true\`) |
| \`log\` | Posted to the mass_action log channel (summary) |
| \`log_individual\` | Posted per target when \`log_individually: true\` |
| \`no_mute_role\` | Mute/unmute/forcemute only — shown when no mute role is configured |

All message values support both plain text and embed format:

\`\`\`yaml
# Plain text
warn:
  success: "{success_count}/{total} users warned | Reason: {reason}"

# Embed
warn:
  success:
    embed:
      title: "⚠️ Mass Warn Complete"
      description: "Warned **{success_count}** out of **{total}** users"
      color: "#FFFF00"
      fields:
        - name: "✅ Warned"
          value: "{success_count}"
          inline: true
        - name: "❌ Failed"
          value: "{fail_count}"
          inline: true
        - name: "📝 Reason"
          value: "{reason}"
          inline: false
      footer: "{mod} • {timestamp}"
\`\`\``,
      },

      // ── CASES ───────────────────────────────────────────────────────────────
      {
        id: "plugin-cases",
        title: "Cases",
        type: "plugin",
        configKey: "cases",
        defaultConfig: `cases:
  enabled: true
  messages:
    case_not_found: "Case {trigger} not found"
    no_cases: "No cases found for {user}"
    no_server_cases: "No cases issued yet"
    case_deleted: "Case {trigger} deleted"
    case_edited: "Case {case_id} updated"
    casecount: "{user} | Warns: {trigger} | Mutes: {reason} | Kicks: {count} | Bans: {expires_at} | Notes: {new_reason} | Total: {success_count}"
    note_success: "Note added for {user} | Case: {case_id}"
    forcenote_success: "Note added for {user.id} | Case: {case_id}"
    note_deleted: "Note {case_id} deleted"
    note_not_found: "Note {case_id} not found"
    note_edited: "Note {case_id} updated"
    note_search_none: "No notes found matching {trigger}"
    error_no_permission: "You do not have permission to manage cases"
    case_embed:
      embed:
        title: "Case #{case_id}"
        color: "#7289DA"
        fields:
          - name: "Action"
            value: "{action}"
            inline: true
          - name: "User"
            value: "{user} ({user.id})"
            inline: true
          - name: "Moderator"
            value: "{mod} ({mod.id})"
            inline: true
          - name: "Reason"
            value: "{reason}"
            inline: false
          - name: "Date"
            value: "{timestamp}"
            inline: true`,
        schema: [
          { key: "enabled", type: "boolean", default: "true", description: "Enable the cases plugin" },
          {
            key: "messages", type: "object", description: "Customizable response messages",
            children: [
              { key: "case_not_found", type: "message", description: "When a case ID doesn't exist. Variable: {trigger} = case ID" },
              { key: "no_cases", type: "message", description: "When a user has no cases" },
              { key: "no_server_cases", type: "message", description: "When the server has no cases yet" },
              { key: "case_deleted", type: "message", description: "When a case is deleted" },
              { key: "case_edited", type: "message", description: "When a case is edited" },
              { key: "casecount", type: "message", description: "Summary of a user's case counts by type" },
              { key: "note_success", type: "message", description: "When a note is added" },
              { key: "forcenote_success", type: "message", description: "When a note is added by user ID" },
              { key: "note_deleted", type: "message", description: "When a note is deleted" },
              { key: "note_not_found", type: "message", description: "When a note ID doesn't exist" },
              { key: "note_edited", type: "message", description: "When a note is edited" },
              { key: "note_search_none", type: "message", description: "When no notes match the search keyword" },
              { key: "error_no_permission", type: "message", description: "When user lacks permission to manage cases" },
              { key: "case_embed", type: "message", description: "The embed used to display an individual case" },
            ],
          },
        ],
        content: `The **Cases** plugin tracks all moderation actions as numbered case records.

## Case types

| Type | Created by |
|------|-----------|
| ban | !ban, !forceban, !tempban |
| kick | !kick |
| mute | !mute, !tempmute |
| warn | !warn, !forcewarn |
| note | !note, !addcase |

## Notes vs. Cases

- **Cases** are created automatically by moderation commands and may notify the user
- **Notes** are staff-only records added manually with \`!note\` — users are never notified

## Editing a case — \`!editcase\`

\`!editcase <case_id> reason <new reason>\` and \`!editcase <case_id> duration <value>\` update an existing case in place.

- Every edit — whether it changes the **reason** or the **duration** — is posted to the mod log channel automatically, so there's always an audit trail of who changed what and when.
- When a duration is updated, the mod log entry shows the new duration directly in the action name, e.g. **Case Edit — Duration (7d)**, so it's obvious at a glance what changed without opening the case.
- Reason edits log the before/after text so moderators can see exactly what was changed.

## Deleting a case — \`!deletecase\`

\`!deletecase <case_id>\` **soft-deletes** a case rather than erasing it:

- The case is immediately removed from \`!cases\`, \`!servercases\`, \`!casecount\`, \`!exportcases\`, and from escalation/punishment counts — it behaves as if it never existed anywhere else in the bot.
- The underlying record is kept in storage. Running \`!case <case_id>\` on a deleted case still shows the full embed — but greyed out and labeled **🗑️ Deleted Case**, including who deleted it and when.
- Deleting a case posts a **Case Delete** entry to the mod log channel with the original reason and action for reference.

## Filtering automod cases — \`-automod\`

Add the \`-automod\` flag to \`!cases\` to show only cases that were created automatically by automod rules (as opposed to cases created by a human moderator command):

| Command | Result |
|---------|--------|
| \`!cases @user\` | All cases (manual + automod) for that user |
| \`!cases @user -automod\` | Only automod-issued cases for that user |
| \`!cases -automod\` | Recent automod-issued cases across the whole server |

Automod cases are identified by the moderator on the case being the bot itself, so this works for any automod rule action (warn, mute, kick, ban) without needing extra configuration.`,
      },

      // ── AUTOMOD ─────────────────────────────────────────────────────────────
      {
        id: "plugin-automod",
        title: "Automod",
        type: "plugin",
        configKey: "automod",
        defaultConfig: `automod:
  config:
    enabled: true
    rules:

      # ── Spam Detection ────────────────────────────────────────────────
      anti_spam:
        enabled: false
        triggers:
          - type: message_spam
            max_messages: 5        # messages allowed...
            within_seconds: 5      # ...within this many seconds
            per_channel: false     # true = track per-channel instead of globally
        conditions:
          ignore_roles: []         # role IDs to skip
          ignore_channels: []      # channel IDs to skip
        actions:
          - type: delete_message
          - type: mute
            duration: 10m
          - type: send_message
            content: "{user.mention} has been muted for spamming."
          - type: dm_user
            content: "You have been muted in **{server}** for spamming. Duration: 10 minutes."
          - type: log
            channel: ""            # paste your log channel ID here
            content: "🔇 **Automod** | {rule} — {user} muted for spam in {channel.mention} | matched: {trigger}"

      # ── Word Filter ───────────────────────────────────────────────────
      word_filter:
        enabled: false
        triggers:
          - type: word_filter
            words: ["badword1", "badword2"]
            match_type: word           # word | substring | regex
            case_sensitive: false
        conditions:
          ignore_roles: []
          ignore_channels: []
        actions:
          - type: delete_message
          - type: warn
          - type: send_message
            content: "{user.mention} Watch your language!"
          - type: dm_user
            content: "Your message in **{server}** was removed for using filtered language."
          - type: log
            channel: ""
            content: "🚫 **Automod** | {rule} — {user} triggered word filter in {channel.mention} | word: {trigger}"

      # ── Invite Links ──────────────────────────────────────────────────
      no_invites:
        enabled: false
        triggers:
          - type: invite_link
            allow_own_server: true     # true = allow links to THIS server only
        conditions:
          ignore_roles: []
        actions:
          - type: delete_message
          - type: warn
          - type: send_message
            content: "{user.mention} Invite links are not allowed here."
          - type: dm_user
            content: "Your message in **{server}** was removed for containing a Discord invite link."
          - type: log
            channel: ""
            content: "🔗 **Automod** | {rule} — {user} posted an invite in {channel.mention} | link: {trigger}"

      # ── Mass Mentions ─────────────────────────────────────────────────
      anti_mentions:
        enabled: false
        triggers:
          - type: mention_spam
            max_mentions: 5            # total @user + @role mentions in one message
            max_unique_mentions: 4     # unique @user mentions in one message
        conditions:
          ignore_roles: []
        actions:
          - type: delete_message
          - type: mute
            duration: 5m
          - type: send_message
            content: "{user.mention} has been muted for mass mentioning."
          - type: dm_user
            content: "You have been muted in **{server}** for mass mentioning. Duration: 5 minutes."
          - type: log
            channel: ""
            content: "📢 **Automod** | {rule} — {user} muted for mention spam in {channel.mention} | matched: {trigger}"

      # ── Excessive Caps ────────────────────────────────────────────────
      caps_filter:
        enabled: false
        triggers:
          - type: caps_filter
            min_length: 10             # minimum message length before checking
            percent: 70               # percentage of uppercase letters to trigger
        conditions:
          ignore_roles: []
        actions:
          - type: delete_message
          - type: send_message
            content: "{user.mention} Please avoid using excessive capitals."
          - type: dm_user
            content: "Your message in **{server}** was removed for excessive use of capitals."
          - type: log
            channel: ""
            content: "🔠 **Automod** | {rule} — {user} triggered caps filter in {channel.mention} | matched: {trigger}"

      # ── Emoji Spam ────────────────────────────────────────────────────
      emoji_spam:
        enabled: false
        triggers:
          - type: emoji_spam
            max_emojis: 10
        actions:
          - type: delete_message
          - type: send_message
            content: "{user.mention} Please don't flood messages with emoji."
          - type: dm_user
            content: "Your message in **{server}** was removed for emoji spam."
          - type: log
            channel: ""
            content: "😵 **Automod** | {rule} — {user} triggered emoji spam in {channel.mention} | matched: {trigger}"

      # ── URL / Link Filter ─────────────────────────────────────────────
      link_filter:
        enabled: false
        triggers:
          - type: link_filter
            block_all: false
            allowed_domains: []        # if non-empty, only these domains are allowed
            blocked_domains: []        # these domains are always blocked
        conditions:
          ignore_roles: []
        actions:
          - type: delete_message
          - type: send_message
            content: "{user.mention} That link is not allowed here."
          - type: dm_user
            content: "Your message in **{server}** was removed for containing a blocked link."
          - type: log
            channel: ""
            content: "🌐 **Automod** | {rule} — {user} posted a blocked link in {channel.mention} | domain: {trigger}"

      # ── Zalgo Text ────────────────────────────────────────────────────
      no_zalgo:
        enabled: false
        triggers:
          - type: zalgo_filter
        actions:
          - type: delete_message
          - type: send_message
            content: "{user.mention} Zalgo/corrupted text is not allowed."
          - type: dm_user
            content: "Your message in **{server}** was removed for containing zalgo text."
          - type: log
            channel: ""
            content: "⚠️ **Automod** | {rule} — {user} sent zalgo text in {channel.mention} | matched: {trigger}"

      # ── Repeated Characters ───────────────────────────────────────────
      no_charflood:
        enabled: false
        triggers:
          - type: repeated_characters
            max_repeats: 15            # consecutive identical characters
            min_length: 10
        actions:
          - type: delete_message
          - type: send_message
            content: "{user.mention} Please don't flood messages with repeated characters."
          - type: dm_user
            content: "Your message in **{server}** was removed for character flooding."
          - type: log
            channel: ""
            content: "🔡 **Automod** | {rule} — {user} triggered char flood in {channel.mention} | matched: {trigger}"

      # ── New Account Gate (fires on member join) ───────────────────────
      new_account_gate:
        enabled: false
        triggers:
          - type: member_join
            account_age_below: 3d      # kick accounts younger than 3 days
        actions:
          - type: kick
          - type: dm_user
            content: "You were kicked from **{server}** because your account is too new. Please wait a few days and try again."
          - type: log
            channel: ""
            content: "🚷 **Automod** | {rule} — {user} kicked (account too new) | matched: {trigger}"

      # ── Attachment Filter ─────────────────────────────────────────────
      attachment_filter:
        enabled: false
        triggers:
          - type: attachment_filter
            blocked_extensions: [exe, sh, bat, ps1, cmd, msi]
        actions:
          - type: delete_message
          - type: warn
          - type: send_message
            content: "{user.mention} That file type is not allowed here."
          - type: dm_user
            content: "Your message in **{server}** was removed for containing a blocked file type."
          - type: log
            channel: ""
            content: "📎 **Automod** | {rule} — {user} sent a blocked attachment in {channel.mention} | file type: {trigger}"

      # ── Repeated Text ─────────────────────────────────────────────────
      anti_copypasta:
        enabled: false
        triggers:
          - type: repeated_text
            max_duplicates: 3      # fire after this many identical messages
            within_seconds: 60     # within this rolling window
            normalize: true        # true = case-insensitive + trimmed comparison
        conditions:
          ignore_roles: []
        actions:
          - type: delete_message
          - type: warn
          - type: send_message
            content: "{user.mention} Please don't repeat the same message."
          - type: dm_user
            content: "Your message in **{server}** was removed for being a repeated duplicate."
          - type: log
            channel: ""
            content: "🔁 **Automod** | {rule} — {user} triggered duplicate text filter in {channel.mention} | text: {trigger}"

      # ── Newline Spam ──────────────────────────────────────────────────
      no_newline_spam:
        enabled: false
        triggers:
          - type: newline_spam
            max_newlines: 10       # maximum number of line breaks in one message
        actions:
          - type: delete_message
          - type: send_message
            content: "{user.mention} Please don't send messages with excessive line breaks."
          - type: dm_user
            content: "Your message in **{server}** was removed for excessive newlines."
          - type: log
            channel: ""
            content: "↩️ **Automod** | {rule} — {user} triggered newline spam in {channel.mention} | matched: {trigger}"

      # ── Phishing Links ────────────────────────────────────────────────
      anti_phishing:
        enabled: false
        triggers:
          - type: phishing
            custom_domains: []     # extra domains to flag beyond the built-in list
        conditions:
          ignore_roles: []
        actions:
          - type: delete_message
          - type: mute
            duration: 1h
          - type: send_message
            content: "{user.mention} A phishing link was detected and removed."
          - type: dm_user
            content: "Your message in **{server}** was removed for containing a phishing link. You have been muted for 1 hour."
          - type: log
            channel: ""
            content: "🎣 **Automod** | {rule} — {user} posted a phishing link in {channel.mention} | domain: {trigger}"

      # ── Ghost Ping ────────────────────────────────────────────────────
      anti_ghost_ping:
        enabled: false
        triggers:
          - type: ghost_ping     # fires when a message with mentions is deleted within 5 min
        conditions:
          ignore_roles: []
        actions:
          - type: warn
          - type: send_message
            content: "{user.mention} Ghost pinging is not allowed."
          - type: dm_user
            content: "You received a warning in **{server}** for ghost pinging."
          - type: log
            channel: ""
            content: "👻 **Automod** | {rule} — {user} ghost pinged in {channel.mention} | pinged: {trigger}"

      # ── Wall Text ─────────────────────────────────────────────────────
      no_wall_text:
        enabled: false
        triggers:
          - type: wall_text
            max_length: 1000     # maximum characters before the rule fires
        conditions:
          ignore_roles: []
        actions:
          - type: delete_message
          - type: send_message
            content: "{user.mention} Please don't send walls of text."
          - type: dm_user
            content: "Your message in **{server}** was removed for being too long."
          - type: log
            channel: ""
            content: "📄 **Automod** | {rule} — {user} triggered wall text filter in {channel.mention} | matched: {trigger}"`,
        schema: [
          { key: "automod.config.enabled", type: "boolean", default: "true", description: "Master switch — disabling this turns off all rules" },
          { key: "automod.config.immunity_roles", type: "string[]", default: "[]", description: "Role IDs whose members are fully immune to ALL automod rules. Any member holding at least one of these roles is never actioned by automod, regardless of individual rule conditions." },
          {
            key: "automod.config.rules.<name>", type: "object", description: "Each key under rules is a named rule block you define",
            children: [
              { key: "enabled", type: "boolean", default: "true", description: "Enable or disable this specific rule" },
              { key: "triggers", type: "array", description: "List of trigger objects. All triggers in a rule must fire for the rule to activate." },
              { key: "conditions.ignore_roles", type: "string[]", default: "[]", description: "Role IDs exempt from this specific rule only" },
              { key: "conditions.ignore_channels", type: "string[]", default: "[]", description: "Channel IDs exempt from this rule" },
              { key: "actions", type: "array", description: "Ordered list of action objects to execute when the rule fires" },
            ],
          },
        ],
        content: `The **Automod** plugin uses a named-rule system. Each rule has a list of **triggers** and a list of **actions**. You name the rules yourself — the names appear in log output.

## Structure

\`\`\`
automod:
  config:
    enabled: true
    immunity_roles:
      - "111222333444555666"   # Staff role — bypasses all automod
    rules:
      <rule_name>:
        enabled: true
        triggers: [ ... ]
        conditions:
          ignore_roles: []
          ignore_channels: []
        actions: [ ... ]
\`\`\`

## Global immunity roles

The \`immunity_roles\` list is a global bypass: any member holding **at least one** of the listed roles is completely skipped by all automod rules, regardless of per-rule \`conditions.ignore_roles\` settings.

Use this for staff roles, verified bots, or any role that should never be actioned by automod.

\`\`\`yaml
automod:
  config:
    enabled: true
    immunity_roles:
      - "111222333444555666"   # Moderator role
      - "222333444555666777"   # Admin role
\`\`\`

> **Tip:** \`immunity_roles\` is a global bypass. \`conditions.ignore_roles\` on individual rules is per-rule. Use global immunity for staff; use per-rule ignore for edge cases like allowing links in a specific channel's helper role.

---

## Trigger types

| Type | Key fields | Notes |
|------|-----------|-------|
| \`message_spam\` | \`max_messages\`, \`within_seconds\`, \`per_channel\` | Sliding window message rate |
| \`word_filter\` | \`words\`, \`match_type\`, \`case_sensitive\` | match_type: \`word\` / \`substring\` / \`regex\` |
| \`invite_link\` | \`allow_own_server\` | Detects discord.gg invites |
| \`mention_spam\` | \`max_mentions\`, \`max_unique_mentions\`, \`global_max_mentions\` | Per-message mention thresholds |
| \`caps_filter\` | \`min_length\`, \`percent\` | Uppercase % of total message |
| \`emoji_spam\` | \`max_emojis\` | Unicode + custom emojis combined |
| \`link_filter\` | \`block_all\`, \`allowed_domains\`, \`blocked_domains\` | Domain allowlist / blocklist |
| \`zalgo_filter\` | — | Detects combining-character abuse |
| \`repeated_characters\` | \`max_repeats\`, \`min_length\` | Consecutive identical characters |
| \`member_join\` | \`account_age_below\` | Fires on join; e.g. \`3d\`, \`7d\` |
| \`attachment_filter\` | \`blocked_extensions\` | File extension list (e.g. \`exe\`, \`sh\`) |
| \`repeated_text\` | \`max_duplicates\`, \`within_seconds\`, \`normalize\` | Same message sent N+ times in window |
| \`newline_spam\` | \`max_newlines\` | Too many line breaks in one message |
| \`phishing\` | \`custom_domains\` | Known phishing domains + custom list |
| \`ghost_ping\` | — | Mention someone then delete the message |
| \`wall_text\` | \`max_length\` | Message exceeds character limit (default 1000) |

---

## Action types

| Type | Fields | Effect |
|------|--------|--------|
| \`delete_message\` | — | Delete the triggering message |
| \`warn\` | — | Add a warn case (counts toward escalation) |
| \`mute\` | \`duration\` | Mute the user (e.g. \`duration: 10m\`) |
| \`kick\` | — | Kick the user |
| \`ban\` | \`duration\` | Ban the user (\`perm\` or a duration) |
| \`send_message\` | \`channel\`, \`content\` | Post a message to a specific channel |
| \`dm_user\` | \`content\` | DM the offending user |
| \`log\` | \`channel\`, \`content\` | Post a log entry to a channel |

Multiple actions are executed in order — e.g. delete then mute then log.

---

## Template variables

Available in \`send_message\`, \`dm_user\`, and \`log\` action \`content\` fields:

| Variable | Value |
|----------|-------|
| \`{user}\` | User's tag |
| \`{user.mention}\` | User mention |
| \`{user.id}\` | User's Discord ID |
| \`{channel}\` | Channel name |
| \`{channel.mention}\` | Channel mention |
| \`{server}\` | Server name |
| \`{trigger}\` | What fired (word matched, count, domain, etc.) |
| \`{rule}\` | Name of the rule that fired |
| \`{timestamp}\` | Current date/time |

---

## Full example

\`\`\`yaml
automod:
  config:
    enabled: true
    immunity_roles:
      - "111222333444555666"   # Staff — fully immune to all automod

    rules:

      # Delete messages with slurs, warn the user
      word_filter:
        enabled: true
        triggers:
          - type: word_filter
            words: ["slur1", "slur2", "badphrase"]
            match_type: word
            case_sensitive: false
        conditions:
          ignore_roles: ["123456789012345678"]   # staff role ID
        actions:
          - type: delete_message
          - type: warn
          - type: send_message
            content: "Automod: {user.mention} your message was removed."
          - type: log
            channel: "111222333444555666"
            content: "Word filter hit | {user} ({user.id}) | matched: {trigger}"

      # Mute spammers for 10 minutes
      anti_spam:
        enabled: true
        triggers:
          - type: message_spam
            max_messages: 6
            within_seconds: 5
            per_channel: false
        actions:
          - type: delete_message
          - type: mute
            duration: 10m
          - type: log
            channel: "111222333444555666"
            content: "Spam detected | {user} ({user.id}) | {channel}"

      # Block all links except allow-listed domains
      link_filter:
        enabled: true
        triggers:
          - type: link_filter
            block_all: false
            allowed_domains: ["youtube.com", "github.com"]
            blocked_domains: ["malicious-site.com"]
        conditions:
          ignore_roles: ["123456789012345678"]
        actions:
          - type: delete_message
          - type: warn

      # Gate accounts younger than 7 days on join
      new_account_gate:
        enabled: true
        triggers:
          - type: member_join
            account_age_below: 7d
        actions:
          - type: kick
          - type: log
            channel: "111222333444555666"
            content: "New account kicked | {user} ({user.id}) | Account age: {trigger}"

      # Mute users who post phishing links for 1 hour
      anti_phishing:
        enabled: true
        triggers:
          - type: phishing
        conditions:
          ignore_roles: ["123456789012345678"]
        actions:
          - type: delete_message
          - type: mute
            duration: 1h
          - type: log
            channel: "111222333444555666"
            content: "Phishing link | {user} ({user.id}) | {trigger}"

      # Warn users who copy-paste the same message 3+ times in a minute
      anti_copypasta:
        enabled: true
        triggers:
          - type: repeated_text
            max_duplicates: 3
            within_seconds: 60
            normalize: true
        actions:
          - type: delete_message
          - type: warn

      # Delete newline-flooded messages (10+ line breaks)
      no_newline_spam:
        enabled: true
        triggers:
          - type: newline_spam
            max_newlines: 10
        actions:
          - type: delete_message

      # Warn users who ghost-ping (mention then immediately delete)
      anti_ghost_ping:
        enabled: true
        triggers:
          - type: ghost_ping
        conditions:
          ignore_roles: ["123456789012345678"]
        actions:
          - type: warn
          - type: log
            channel: "111222333444555666"
            content: "Ghost ping | {user} ({user.id}) | {trigger}"

      # Delete messages longer than 1000 characters (wall text)
      no_wall_text:
        enabled: true
        triggers:
          - type: wall_text
            max_length: 1000
        conditions:
          ignore_roles: ["123456789012345678"]
        actions:
          - type: delete_message
          - type: warn
\`\`\``,
      },

      // ── LOGGING ─────────────────────────────────────────────────────────────
      {
        id: "plugin-logging",
        title: "Logging",
        type: "plugin",
        configKey: "logging",
        defaultConfig: `logging:
  config:
    # ── Default fallback channel per category ──────────────────────────────
    # Used when an event has no specific channel assigned below.
    default_channels:
      server: "SERVER_LOG_CHANNEL_ID"
      moderation: "MOD_LOG_CHANNEL_ID"
      mass_action: "MASS_ACTION_LOG_CHANNEL_ID"

    # ── Named channels — referenced by event routing below ─────────────────
    channels:
      message_logs: "CHANNEL_ID"
      member_logs: "CHANNEL_ID"
      voice_logs: "CHANNEL_ID"
      thread_logs: "CHANNEL_ID"
      server_change_logs: "CHANNEL_ID"
      mod_logs: "CHANNEL_ID"
      mass_action_logs: "CHANNEL_ID"

    # ==========================================================================
    # SERVER LOGS — automatic Discord events
    # ==========================================================================
    server:
      events:
        # Messages
        message_delete: message_logs
        message_delete_bulk: message_logs
        message_edit: message_logs
        message_attachment_delete: message_logs

        # Members
        member_join: member_logs
        member_leave: member_logs
        member_nickname_change: member_logs
        member_username_change: member_logs
        member_avatar_change: member_logs
        member_roles_change: member_logs
        member_timeout_start: member_logs
        member_timeout_end: member_logs

        # Voice
        voice_join: voice_logs
        voice_leave: voice_logs
        voice_move: voice_logs
        voice_mute: voice_logs
        voice_deafen: voice_logs
        voice_stream_start: voice_logs
        voice_stream_end: voice_logs

        # Threads
        thread_create: thread_logs
        thread_delete: thread_logs
        thread_update: thread_logs
        thread_archive: thread_logs
        thread_unarchive: thread_logs
        thread_member_join: thread_logs
        thread_member_leave: thread_logs

        # Roles
        role_create: server_change_logs
        role_delete: server_change_logs
        role_update: server_change_logs

        # Channels
        channel_create: server_change_logs
        channel_delete: server_change_logs
        channel_update: server_change_logs
        channel_permissions_update: server_change_logs

        # Emojis & Stickers
        emoji_create: server_change_logs
        emoji_delete: server_change_logs
        emoji_update: server_change_logs
        sticker_create: server_change_logs
        sticker_delete: server_change_logs

        # Server
        server_name_change: server_change_logs
        server_icon_change: server_change_logs
        server_banner_change: server_change_logs
        server_owner_change: server_change_logs

        # Invites
        invite_create: server_change_logs
        invite_delete: server_change_logs

        # Webhooks
        webhook_create: server_change_logs
        webhook_delete: server_change_logs
        webhook_update: server_change_logs

        # Scheduled Events
        scheduled_event_create: server_change_logs
        scheduled_event_delete: server_change_logs
        scheduled_event_update: server_change_logs

        # Stage Instances
        stage_create: voice_logs
        stage_delete: voice_logs
        stage_update: voice_logs

        # AutoMod (Discord native)
        automod_action: mod_logs

        # Messages — pins
        message_pinned: message_logs

      enabled:
        message_delete: true
        message_delete_bulk: true
        message_edit: true
        message_attachment_delete: false
        member_join: true
        member_leave: true
        member_nickname_change: true
        member_username_change: true
        member_avatar_change: false
        member_roles_change: true
        member_timeout_start: true
        member_timeout_end: true
        voice_join: true
        voice_leave: true
        voice_move: true
        voice_mute: false
        voice_deafen: false
        voice_stream_start: false
        voice_stream_end: false
        thread_create: true
        thread_delete: true
        thread_update: true
        thread_archive: true
        thread_unarchive: true
        thread_member_join: false
        thread_member_leave: false
        role_create: true
        role_delete: true
        role_update: true
        channel_create: true
        channel_delete: true
        channel_update: true
        channel_permissions_update: true
        emoji_create: true
        emoji_delete: true
        emoji_update: false
        sticker_create: true
        sticker_delete: true
        server_name_change: true
        server_icon_change: true
        server_banner_change: true
        server_owner_change: true
        invite_create: true
        invite_delete: true
        webhook_create: true
        webhook_delete: true
        webhook_update: true
        scheduled_event_create: true
        scheduled_event_delete: true
        scheduled_event_update: true
        stage_create: true
        stage_delete: true
        stage_update: true
        automod_action: true
        message_pinned: false
        thread_member_join: false
        thread_member_leave: false
        voice_stream_start: false
        voice_stream_end: false

      messages:
        message_delete:
          title: "🗑️ Message Deleted"
          description: "**Author:** {userMention} (\`{userId}\`)\n**Channel:** {channel}\n\n**Content:**\n{content}"
          color: "ED4245"
          show_attachments: true

        message_delete_bulk:
          title: "🧹 Bulk Message Delete"
          description: "**Channel:** {channel}\n**Count:** {count} messages\n\nFull log attached as file."
          color: "ED4245"
          attach_file: true

        message_edit:
          title: "✏️ Message Edited"
          description: "**Author:** {userMention} (\`{userId}\`)\n**Channel:** {channel}\n\n**Before:**\n{oldValue}\n\n**After:**\n{newValue}"
          color: "FEE75C"

        member_join:
          title: "📥 Member Joined"
          description: "{userMention} (\`{userId}\`)\n**Account created:** {oldValue}\n**Account age:** {newValue}"
          color: "57F287"
          show_avatar: true

        member_leave:
          title: "📤 Member Left"
          description: "{userMention} (\`{userId}\`)\n**Joined server:** {oldValue}\n**Roles:** {newValue}"
          color: "ED4245"

        member_nickname_change:
          title: "📝 Nickname Changed"
          description: "**User:** {userMention} (\`{userId}\`)\n**Before:** {oldValue}\n**After:** {newValue}"
          color: "FEE75C"

        member_username_change:
          title: "📝 Username Changed"
          description: "**User:** {userMention} (\`{userId}\`)\n**Before:** {oldValue}\n**After:** {newValue}"
          color: "FEE75C"

        member_roles_change:
          title: "🎭 Member Roles Updated"
          description: "**User:** {userMention} (\`{userId}\`)\n**Added:** {newValue}\n**Removed:** {oldValue}"
          color: "FEE75C"

        member_timeout_start:
          title: "⏳ Member Timed Out"
          description: "**User:** {userMention} (\`{userId}\`)\n**Duration:** {duration}\n**Until:** {newValue}"
          color: "FEE75C"

        member_timeout_end:
          title: "⏰ Timeout Expired"
          description: "**User:** {userMention} (\`{userId}\`)"
          color: "57F287"

        voice_join:
          title: "🔊 Joined Voice"
          description: "**User:** {userMention}\n**Channel:** {channel}"
          color: "57F287"

        voice_leave:
          title: "🔇 Left Voice"
          description: "**User:** {userMention}\n**Channel:** {channel}"
          color: "ED4245"

        voice_move:
          title: "🔁 Moved Voice Channels"
          description: "**User:** {userMention}\n**From:** {oldValue}\n**To:** {newValue}"
          color: "FEE75C"

        thread_create:
          title: "🧵 Thread Created"
          description: "**Thread:** {newValue}\n**Parent:** {channel}\n**Created by:** {userMention}"
          color: "57F287"

        thread_delete:
          title: "🧵 Thread Deleted"
          description: "**Thread:** {oldValue}\n**Parent:** {channel}"
          color: "ED4245"

        thread_archive:
          title: "🗄️ Thread Archived"
          description: "**Thread:** {channel}"
          color: "FEE75C"

        thread_unarchive:
          title: "📂 Thread Unarchived"
          description: "**Thread:** {channel}"
          color: "57F287"

        role_create:
          title: "➕ Role Created"
          description: "**Role:** {newValue}\n**Created by:** {moderator}"
          color: "57F287"

        role_delete:
          title: "➖ Role Deleted"
          description: "**Role:** {oldValue}\n**Deleted by:** {moderator}"
          color: "ED4245"

        role_update:
          title: "🔧 Role Updated"
          description: "**Role:** {oldValue}\n**Changes:** {newValue}\n**Updated by:** {moderator}"
          color: "FEE75C"

        channel_create:
          title: "📁 Channel Created"
          description: "**Channel:** {newValue}\n**Created by:** {moderator}"
          color: "57F287"

        channel_delete:
          title: "🗂️ Channel Deleted"
          description: "**Channel:** {oldValue}\n**Deleted by:** {moderator}"
          color: "ED4245"

        channel_update:
          title: "🔧 Channel Updated"
          description: "**Channel:** {channel}\n**Changes:** {newValue}\n**Updated by:** {moderator}"
          color: "FEE75C"

        channel_permissions_update:
          title: "🔐 Channel Permissions Updated"
          description: "**Channel:** {channel}\n**Changes:** {newValue}\n**Updated by:** {moderator}"
          color: "FEE75C"

        emoji_create:
          title: "😀 Emoji Added"
          description: "**Emoji:** {newValue}\n**Added by:** {moderator}"
          color: "57F287"

        emoji_delete:
          title: "😢 Emoji Removed"
          description: "**Emoji:** {oldValue}\n**Removed by:** {moderator}"
          color: "ED4245"

        sticker_create:
          title: "🎨 Sticker Added"
          description: "**Sticker:** {newValue}\n**Added by:** {moderator}"
          color: "57F287"

        sticker_delete:
          title: "🎨 Sticker Removed"
          description: "**Sticker:** {oldValue}\n**Removed by:** {moderator}"
          color: "ED4245"

        server_name_change:
          title: "🏷️ Server Name Changed"
          description: "**Before:** {oldValue}\n**After:** {newValue}\n**Changed by:** {moderator}"
          color: "FEE75C"

        server_icon_change:
          title: "🖼️ Server Icon Changed"
          description: "**Changed by:** {moderator}"
          color: "FEE75C"
          show_thumbnail: true

        server_banner_change:
          title: "🖼️ Server Banner Changed"
          description: "**Changed by:** {moderator}"
          color: "FEE75C"

        server_owner_change:
          title: "👑 Server Owner Changed"
          description: "**Previous owner:** {oldValue}\n**New owner:** {newValue}"
          color: "FEE75C"

        invite_create:
          title: "📨 Invite Created"
          description: "**Code:** {newValue}\n**Channel:** {channel}\n**Created by:** {userMention}\n**Max uses:** {count}\n**Expires:** {duration}"
          color: "57F287"

        invite_delete:
          title: "📪 Invite Deleted"
          description: "**Code:** {oldValue}\n**Channel:** {channel}"
          color: "ED4245"

        webhook_create:
          title: "🪝 Webhook Created"
          description: "**Name:** {newValue}\n**Channel:** {channel}\n**Created by:** {moderator}"
          color: "57F287"

        webhook_delete:
          title: "🪝 Webhook Deleted"
          description: "**Name:** {oldValue}\n**Channel:** {channel}"
          color: "ED4245"

        webhook_update:
          title: "🪝 Webhook Updated"
          description: "**Name:** {oldValue}\n**Channel:** {channel}\n**Updated by:** {moderator}"
          color: "FEE75C"

        message_pinned:
          title: "📌 Message Pinned"
          description: "**Channel:** {channel}\n**Pinned by:** {moderator}"
          color: "FEE75C"

        thread_member_join:
          title: "🧵 Thread Member Joined"
          description: "**User:** {userMention} (\`{userId}\`)\n**Thread:** {channel}"
          color: "57F287"

        thread_member_leave:
          title: "🧵 Thread Member Left"
          description: "**User:** {userMention} (\`{userId}\`)\n**Thread:** {channel}"
          color: "ED4245"

        voice_stream_start:
          title: "🔴 Stream Started"
          description: "**User:** {userMention}\n**Channel:** {channel}"
          color: "5865F2"

        voice_stream_end:
          title: "⏹ Stream Ended"
          description: "**User:** {userMention}\n**Channel:** {channel}"
          color: "95A5A6"

        stage_create:
          title: "🎤 Stage Started"
          description: "**Topic:** {newValue}\n**Channel:** {channel}"
          color: "5865F2"

        stage_delete:
          title: "🎤 Stage Ended"
          description: "**Topic:** {oldValue}\n**Channel:** {channel}"
          color: "95A5A6"

        stage_update:
          title: "🎤 Stage Topic Updated"
          description: "**Before:** {oldValue}\n**After:** {newValue}\n**Channel:** {channel}"
          color: "FEE75C"

        scheduled_event_create:
          title: "📅 Event Scheduled"
          description: "**Event:** {newValue}\n**Location:** {channel}\n**Starts:** {duration}\n**Created by:** {moderator}"
          color: "57F287"

        scheduled_event_delete:
          title: "📅 Event Cancelled"
          description: "**Event:** {oldValue}"
          color: "ED4245"

        scheduled_event_update:
          title: "📅 Event Updated"
          description: "**Event:** {oldValue}\n**Changes:** {newValue}"
          color: "FEE75C"

        automod_action:
          title: "🛡️ AutoMod Action"
          description: "**User:** {userMention} (\`{userId}\`)\n**Action:** {newValue}\n**Trigger:** {oldValue}\n**Channel:** {channel}"
          color: "ED4245"

    # ==========================================================================
    # MODERATION LOGS — single-target mod actions
    # (full setup documented in the Moderation plugin page)
    # ==========================================================================
    moderation:
      events:
        warn: mod_logs
        mute: mod_logs
        unmute: mod_logs
        kick: mod_logs
        ban: mod_logs
        unban: mod_logs
        softban: mod_logs
        forceban: mod_logs
        tempban: mod_logs
        note: mod_logs
        timeout: mod_logs
        timeout_remove: mod_logs
        role_add: mod_logs
        role_remove: mod_logs
        nickname_reset: mod_logs
        nickname_force: mod_logs
        case_edit: mod_logs
        case_delete: mod_logs
        case_hide: mod_logs

      enabled:
        warn: true
        mute: true
        unmute: true
        kick: true
        ban: true
        unban: true
        softban: true
        forceban: true
        tempban: true
        note: true
        timeout: true
        timeout_remove: true
        role_add: true
        role_remove: true
        nickname_reset: true
        nickname_force: true
        case_edit: true
        case_delete: true
        case_hide: true

      # See the Moderation plugin page for full message templates

    # ==========================================================================
    # MASS ACTION LOGS — bulk operations
    # (full setup documented in the Mass Actions plugin page)
    # ==========================================================================
    mass_action:
      events:
        massban: mass_action_logs
        masskick: mass_action_logs
        masswarn: mass_action_logs
        massmute: mass_action_logs
        massunmute: mass_action_logs
        massrole_add: mass_action_logs
        massrole_remove: mass_action_logs
        clean: mass_action_logs
        lock: mass_action_logs
        unlock: mass_action_logs
        slowmode_set: mass_action_logs
        purge_invites: mass_action_logs
        prune_members: mass_action_logs

      enabled:
        massban: true
        masskick: true
        masswarn: true
        massmute: true
        massunmute: true
        massrole_add: true
        massrole_remove: true
        clean: true
        lock: true
        unlock: true
        slowmode_set: true
        purge_invites: true
        prune_members: true

      # See the Mass Actions plugin page for full message templates`,
        schema: [
          {
            key: "logging.config.default_channels", type: "object", description: "Fallback channel per log category. Used when an event has no specific channel assigned.",
            children: [
              { key: "server", type: "snowflake", description: "Default channel for all server log events" },
              { key: "moderation", type: "snowflake", description: "Default channel for all moderation log events" },
              { key: "mass_action", type: "snowflake", description: "Default channel for all mass action log events" },
            ],
          },
          { key: "logging.config.channels", type: "object", description: "Named channel aliases used as values in event routing maps. Define as many as you need." },
          {
            key: "logging.config.server", type: "object", description: "Server log configuration — automatic Discord events",
            children: [
              { key: "events", type: "object", description: "Maps each event key to a named channel (from logging.config.channels)" },
              { key: "enabled", type: "object", description: "Enable/disable individual server events (all true by default)" },
              { key: "messages", type: "object", description: "Embed template per event. Fields: title, description, color, show_attachments, attach_file, show_avatar, show_thumbnail" },
            ],
          },
          {
            key: "logging.config.moderation", type: "object", description: "Moderation log configuration — single-target mod actions. Full setup in the Moderation plugin page.",
            children: [
              { key: "events", type: "object", description: "Maps each mod action to a named channel" },
              { key: "enabled", type: "object", description: "Enable/disable individual moderation log events" },
              { key: "messages", type: "object", description: "Embed template per mod action. Fields: title, description, color" },
            ],
          },
          {
            key: "logging.config.mass_action", type: "object", description: "Mass action log configuration — bulk operations. Full setup in the Mass Actions plugin page.",
            children: [
              { key: "events", type: "object", description: "Maps each bulk action to a named channel" },
              { key: "enabled", type: "object", description: "Enable/disable individual mass action log events" },
              { key: "messages", type: "object", description: "Embed template per bulk action. attach_file: true attaches a user list as a text file." },
            ],
          },
        ],
        content: `The **Logging** plugin captures Discord events across three independent log categories. All configuration lives under \`logging.config\` in your YAML.

---

## Log categories

| Category | What it covers |
|----------|---------------|
| \`server\` | Automatic Discord events — messages, members, voice, channels, roles, server settings |
| \`moderation\` | Single-target mod actions — warn, ban, kick, mute, note, etc. |
| \`mass_action\` | Bulk operations — massban, masskick, massmute, lock, clean, etc. |

Moderation and mass action log messages are configured alongside their respective plugins. The Moderation plugin page includes full message templates for every mod action; the Mass Actions plugin page includes templates for every bulk operation.

---

## Channel routing

Events are routed using two levels:

1. **Named channels** — define your channels once under \`logging.config.channels\`, then reference them by name in every event map
2. **Category defaults** — set a fallback per category under \`logging.config.default_channels\`

Resolution order per event:
1. \`logging.config.<category>.events.<event>\` (named channel reference)
2. \`logging.config.default_channels.<category>\`
3. Silently skipped if neither is set

\`\`\`yaml
logging:
  config:
    default_channels:
      server: "111222333444555666"
      moderation: "222333444555666777"
      mass_action: "333444555666777888"

    channels:
      message_logs: "444555666777888999"
      member_logs: "555666777888999000"
      mod_logs: "222333444555666777"

    server:
      events:
        message_delete: message_logs
        message_edit: message_logs
        member_join: member_logs
        member_leave: member_logs
        # all other events fall back to default_channels.server
\`\`\`

---

## Server events reference

### Messages
| Event key | Default | What it logs |
|-----------|---------|-------------|
| \`message_delete\` | ✅ | Author, channel, content, attachments |
| \`message_delete_bulk\` | ✅ | Channel, count, log file attached |
| \`message_edit\` | ✅ | Before / after content |
| \`message_attachment_delete\` | ❌ | Attachment removed from message |

### Members
| Event key | Default | What it logs |
|-----------|---------|-------------|
| \`member_join\` | ✅ | User, account age |
| \`member_leave\` | ✅ | User, roles they had |
| \`member_nickname_change\` | ✅ | Old → new nickname |
| \`member_username_change\` | ✅ | Old → new username |
| \`member_avatar_change\` | ❌ | Avatar changed |
| \`member_roles_change\` | ✅ | Roles added / removed |
| \`member_timeout_start\` | ✅ | Timeout applied, duration |
| \`member_timeout_end\` | ✅ | Timeout expired or removed |

### Voice
| Event key | Default | What it logs |
|-----------|---------|-------------|
| \`voice_join\` | ✅ | User, channel |
| \`voice_leave\` | ✅ | User, channel |
| \`voice_move\` | ✅ | User, from → to channel |
| \`voice_mute\` | ❌ | Server mute applied |
| \`voice_deafen\` | ❌ | Server deafen applied |
| \`voice_stream_start\` | ❌ | User started streaming |
| \`voice_stream_end\` | ❌ | User stopped streaming |

### Threads
| Event key | Default | What it logs |
|-----------|---------|-------------|
| \`thread_create\` | ✅ | Thread name, parent channel |
| \`thread_delete\` | ✅ | Thread name |
| \`thread_update\` | ✅ | Thread settings changed |
| \`thread_archive\` | ✅ | Thread archived |
| \`thread_unarchive\` | ✅ | Thread unarchived |
| \`thread_member_join\` | ❌ | User joined thread |
| \`thread_member_leave\` | ❌ | User left thread |

### Messages (extra)
| Event key | Default | What it logs |
|-----------|---------|-------------|
| \`message_pinned\` | ❌ | Pin event, channel, who pinned it |
| \`watched_user_message\` | ✅ | Every message sent by a user on the \`!watchlist\` — user, channel, content, attachments, watch reason, jump link. Only fires for users currently on the watch list; see [Watch List](#plugin-moderation). |

### Roles
| Event key | Default | What it logs |
|-----------|---------|-------------|
| \`role_create\` / \`role_delete\` | ✅ | Role name, who did it |
| \`role_update\` | ✅ | Name, color, hoist, mentionable changes — **plus a full permissions diff** showing exactly which permissions were granted or revoked |

### Channels
| Event key | Default | What it logs |
|-----------|---------|-------------|
| \`channel_create\` / \`channel_delete\` | ✅ | Channel name, who did it |
| \`channel_update\` | ✅ | Name, topic, NSFW toggle, slowmode, bitrate, user limit, category changes |
| \`channel_permissions_update\` | ✅ | Permission overwrite changes — fires separately from \`channel_update\`; shows which roles/users were affected |

### Server settings
| Event key | Default | What it logs |
|-----------|---------|-------------|
| \`server_name_change\` / \`server_icon_change\` / \`server_banner_change\` | ✅ | Before / after |
| \`server_owner_change\` | ✅ | Old → new owner |
| \`invite_create\` / \`invite_delete\` | ✅ | Invite code, channel |
| \`webhook_create\` / \`webhook_delete\` / \`webhook_update\` | ✅ | Webhook name, channel |

> **Server update also catches:** verification level, content filter, default notifications, AFK channel, system channel, and vanity URL changes.

### Emoji & Stickers
| Event key | Default | What it logs |
|-----------|---------|-------------|
| \`emoji_create\` / \`emoji_delete\` | ✅ | Emoji name |
| \`emoji_update\` | ❌ | Emoji renamed |
| \`sticker_create\` / \`sticker_delete\` | ✅ | Sticker name |
| \`sticker_update\` | ❌ | Sticker renamed |

### Stage instances
| Event key | Default | What it logs |
|-----------|---------|-------------|
| \`stage_create\` | ✅ | Stage topic, channel |
| \`stage_delete\` | ✅ | Stage topic, channel |
| \`stage_update\` | ✅ | Topic before / after |

### Scheduled events
| Event key | Default | What it logs |
|-----------|---------|-------------|
| \`scheduled_event_create\` | ✅ | Event name, location, start time, creator |
| \`scheduled_event_delete\` | ✅ | Event name |
| \`scheduled_event_update\` | ✅ | Changes to name, time, location, or status |

### AutoMod
| Event key | Default | What it logs |
|-----------|---------|-------------|
| \`automod_action\` | ✅ | User, action type (block/alert/timeout), trigger type, matched keyword, content |

> Requires the **AutoMod Execution** gateway intent — enabled automatically when this event is active.

---

## Log message placeholders

| Placeholder | Value |
|-------------|-------|
| \`{userMention}\` | \`<@user_id>\` |
| \`{userId}\` | Raw Discord user ID |
| \`{userTag}\` | username#discriminator |
| \`{userAvatar}\` | Avatar URL |
| \`{moderator}\` | Moderator's tag |
| \`{channel}\` | Channel mention |
| \`{channelId}\` | Raw channel ID |
| \`{oldValue}\` | Previous value (content, name, etc.) |
| \`{newValue}\` | New value |
| \`{content}\` | Message content |
| \`{count}\` | Count (messages, users, etc.) |
| \`{duration}\` | Duration string |
| \`{timestamp}\` | Current date/time |
| \`{guild}\` | Server name |

---

## Special message options

| Option | Effect |
|--------|--------|
| \`show_attachments: true\` | Attach image previews from the logged message |
| \`attach_file: true\` | Attach a .txt file (used for bulk delete logs, massban lists) |
| \`show_avatar: true\` | Show user's avatar as thumbnail |
| \`show_thumbnail: true\` | Show server icon as thumbnail |`,
      },

      // ── ANTI-NUKE ────────────────────────────────────────────────────────────
      {
        id: "plugin-antinuke",
        title: "Anti-Nuke",
        type: "plugin",
        configKey: "antinuke",
        defaultConfig: `plugins:
  antinuke:
    enabled: false

    whitelist_roles: []
    whitelist_users: []

    thresholds:
      channel_delete: 3
      channel_create: 5
      channel_update: 0
      role_delete: 3
      role_create: 5
      role_update: 0
      role_everyone_update: 1
      ban: 5
      kick: 5
      member_update: 0
      webhook_create: 3
      webhook_delete: 0
      guild_update: 1
      emoji_delete: 10
      emoji_create: 0
      sticker_delete: 0
      integration_delete: 2
      bot_add: 0

    interval_seconds: 10
    audit_log_delay_ms: 500

    action: "ban"
    quarantine_role: null
    create_case: true

    action_overrides: {}

    restore:
      enabled: false
      restore_deleted_channels: false
      restore_deleted_roles: false
      restore_everyone_permissions: false

    alert_channel: null
    alert_roles: []
    dm_owner: true

    messages:
      triggered: "{user} exceeded the **{rule}** threshold ({count}/{trigger}) and was {action}d | Case: {case_id}"
      staff_alert: "🚨 Antinuke triggered | {user} ({user.id}) | Rule: {rule} | Count: {count}/{trigger} | Action: {action}"
      action_failed: "Antinuke action failed for {user} ({user.id}) | Rule: {rule} | Error: {reason}"
      owner_dm: "⚠️ Antinuke alert for **{server}** | {user} triggered the **{rule}** threshold ({count} actions) and was {action}d | Case: {case_id}"`,
        schema: [
          { key: "enabled", type: "boolean", default: "false", description: "Enable Anti-Nuke protection" },
          { key: "whitelist_roles", type: "string[]", default: "[]", description: "Role IDs that bypass ALL antinuke checks. Keep this list small — whitelisted accounts have no protection." },
          { key: "whitelist_users", type: "string[]", default: "[]", description: "User IDs that bypass ALL antinuke checks. Use for bot owner and server owner only." },
          { key: "interval_seconds", type: "number", default: "10", description: "Rolling time window in seconds for all threshold counters. Shorter = more sensitive. Recommended: 10–30." },
          { key: "audit_log_delay_ms", type: "number", default: "500", description: "Milliseconds to wait before checking the audit log after an event. Discord audit entries have a small delay. Recommended: 500–1000." },
          { key: "action", type: "ban | kick | strip_roles | quarantine", default: "ban", description: "Global action taken against the offending user. Can be overridden per action type with action_overrides." },
          { key: "quarantine_role", type: "snowflake | null", default: "null", description: "Role ID assigned when action is quarantine. Must have NO permissions — completely restricted." },
          { key: "create_case", type: "boolean", default: "true", description: "Create a mod case in the database for each antinuke action. Strongly recommended." },
          { key: "action_overrides", type: "object", description: "Override the global action for specific trigger types. Key = action type, value = ban | kick | strip_roles | quarantine." },
          {
            key: "thresholds", type: "object", description: "Per-action-type thresholds. Set to 0 to disable a check. Set to 1 to trigger on the very first action.",
            children: [
              { key: "channel_delete", type: "number", default: "3", description: "Channel deletions within interval_seconds before triggering. Recommended: 2–3." },
              { key: "channel_create", type: "number", default: "5", description: "Channel creations within interval_seconds before triggering. Recommended: 3–5." },
              { key: "channel_update", type: "number", default: "0", description: "Channel updates within interval_seconds. Disabled by default — high false positive rate. Recommended: 5–10 if enabled." },
              { key: "role_delete", type: "number", default: "3", description: "Role deletions within interval_seconds before triggering. Recommended: 2–3." },
              { key: "role_create", type: "number", default: "5", description: "Role creations within interval_seconds before triggering. Recommended: 3–5." },
              { key: "role_update", type: "number", default: "0", description: "Role permission updates within interval_seconds. Disabled by default. Recommended: 5–10 if enabled." },
              { key: "role_everyone_update", type: "number", default: "1", description: "Changes to @everyone permissions. Set to 1 to trigger on the very first change — intentionally aggressive. Recommended: 1." },
              { key: "ban", type: "number", default: "5", description: "Member bans within interval_seconds before triggering. Recommended: 3–5." },
              { key: "kick", type: "number", default: "5", description: "Member kicks within interval_seconds before triggering. Recommended: 3–5." },
              { key: "member_update", type: "number", default: "0", description: "Member role changes within interval_seconds. Disabled by default — mass role assignment has many legitimate uses. Recommended: 10–20 if enabled." },
              { key: "webhook_create", type: "number", default: "3", description: "Webhook creations within interval_seconds. Webhooks are commonly used in nuke attacks. Recommended: 2–3." },
              { key: "webhook_delete", type: "number", default: "0", description: "Webhook deletions within interval_seconds. Disabled by default. Recommended: 0–5 if enabled." },
              { key: "guild_update", type: "number", default: "1", description: "Server setting changes (name, icon, verification level, etc.) within interval_seconds. Recommended: 1–2." },
              { key: "emoji_delete", type: "number", default: "10", description: "Emoji deletions within interval_seconds. Higher threshold — emoji deletion is less immediately harmful. Recommended: 5–10." },
              { key: "emoji_create", type: "number", default: "0", description: "Emoji creations within interval_seconds. Disabled by default — low risk." },
              { key: "sticker_delete", type: "number", default: "0", description: "Sticker deletions within interval_seconds. Disabled by default. Recommended: 0–5 if enabled." },
              { key: "integration_delete", type: "number", default: "2", description: "Integration/bot deletions within interval_seconds. Deleting bots is a common nuke step. Recommended: 1–2." },
              { key: "bot_add", type: "number", default: "0", description: "Bot additions within interval_seconds. Disabled by default — adding bots is often legitimate. Recommended: 0–3 if enabled." },
            ],
          },
          {
            key: "restore", type: "object", description: "Attempt to reverse damage done before antinuke responded. Best-effort — some actions cannot be fully reversed.",
            children: [
              { key: "enabled", type: "boolean", default: "false", description: "Enable automatic damage restoration after an antinuke trigger." },
              { key: "restore_deleted_channels", type: "boolean", default: "false", description: "Recreate deleted channels. Restores name, type, position, and parent — cannot restore message history or full permission overwrites." },
              { key: "restore_deleted_roles", type: "boolean", default: "false", description: "Recreate deleted roles. Restores name, color, permissions, and hoist — cannot guarantee exact hierarchy position." },
              { key: "restore_everyone_permissions", type: "boolean", default: "false", description: "Restore @everyone permissions to their state before the antinuke trigger. Requires Manage Roles permission." },
            ],
          },
          { key: "alert_channel", type: "snowflake | null", default: "null", description: "Channel ID where antinuke alerts are posted. Recommended: private staff-only channel." },
          { key: "alert_roles", type: "string[]", default: "[]", description: "Role IDs pinged in the alert channel when antinuke triggers." },
          { key: "dm_owner", type: "boolean", default: "true", description: "DM the server owner when antinuke triggers. Ensures the owner is always notified even if offline." },
          {
            key: "messages", type: "object", description: "Customizable alert and action messages. Supports plain strings or embed objects.",
            children: [
              { key: "triggered", type: "message", description: "Posted to alert_channel when antinuke triggers. Variables: {user} {user.id} {user.mention} {rule} {count} {trigger} {action} {case_id}" },
              { key: "staff_alert", type: "message", description: "Immediate staff notification. Sent to alert_channel with role pings. Same variables as triggered." },
              { key: "ban_success", type: "string", description: "Confirmation message when the ban action succeeds." },
              { key: "kick_success", type: "string", description: "Confirmation message when the kick action succeeds." },
              { key: "strip_success", type: "string", description: "Confirmation message when the strip_roles action succeeds." },
              { key: "quarantine_success", type: "string", description: "Confirmation message when the quarantine action succeeds." },
              { key: "action_failed", type: "message", description: "Posted when the antinuke action fails (e.g. hierarchy error). Variables: {user} {user.id} {rule} {reason}" },
              { key: "owner_dm", type: "string", description: "DM sent to the server owner when antinuke triggers. Variables: {server} {user} {rule} {count} {action} {case_id}" },
              { key: "restore_channel_success", type: "string", description: "Posted when a deleted channel is successfully restored. Variables: {trigger} (channel name)" },
              { key: "restore_channel_failed", type: "string", description: "Posted when channel restoration fails. Variables: {trigger} {reason}" },
              { key: "restore_role_success", type: "string", description: "Posted when a deleted role is successfully restored. Variables: {trigger} (role name)" },
              { key: "restore_role_failed", type: "string", description: "Posted when role restoration fails. Variables: {trigger} {reason}" },
              { key: "restore_everyone_success", type: "string", description: "Posted when @everyone permissions are successfully restored." },
              { key: "restore_everyone_failed", type: "string", description: "Posted when @everyone permission restoration fails. Variables: {reason}" },
            ],
          },
        ],
        content: `The **Anti-Nuke** plugin protects your server from internal attacks — rogue admins, compromised accounts, or malicious bots attempting to destroy the server from the inside.

Unlike Anti-Raid (which handles external join floods), Anti-Nuke handles **internal threats from people who already have permissions**.

## How it works

The bot monitors Discord's audit log for specific action types. For each action type, it tracks a rolling count per executor within \`interval_seconds\`. If any executor's count exceeds the threshold for that action, the response fires immediately.

**Rolling window:** Counts are tracked in memory per (guild, user, action type). Each count entry expires after \`interval_seconds\`. So "3 channel_deletes in 10 seconds" means exactly that — if an executor deletes 3 channels in 10 seconds, the counter hits 3 and the threshold fires.

**Audit log dependency:** The bot reads Discord's audit log to determine who performed each action. Discord audit log entries may have a slight delay (usually under 1 second). The \`audit_log_delay_ms\` setting controls how long the bot waits before checking.

## Monitored actions

| Action Type | Default Threshold | Notes |
|---|---|---|
| \`channel_delete\` | 3 | Triggers immediately on mass channel deletion |
| \`channel_create\` | 5 | Slightly higher — creation is less immediately harmful |
| \`channel_update\` | 0 (off) | High false positive rate — enable only if needed |
| \`role_delete\` | 3 | Mass role deletion is a core nuke attack |
| \`role_create\` | 5 | Catches role spam attacks |
| \`role_update\` | 0 (off) | Disabled by default to avoid false positives |
| \`role_everyone_update\` | 1 | Triggers on the FIRST @everyone change — intentionally aggressive |
| \`ban\` | 5 | Mass banning members |
| \`kick\` | 5 | Mass kicking members |
| \`member_update\` | 0 (off) | Mass role changes — disabled, many legitimate uses |
| \`webhook_create\` | 3 | Webhooks are commonly abused in nuke attacks |
| \`webhook_delete\` | 0 (off) | Disabled by default |
| \`guild_update\` | 1 | Server name/icon/verification changes — triggers on first |
| \`emoji_delete\` | 10 | Higher threshold — less immediately harmful |
| \`emoji_create\` | 0 (off) | Low risk |
| \`sticker_delete\` | 0 (off) | Disabled by default |
| \`integration_delete\` | 2 | Deleting bots/integrations is a common nuke step |
| \`bot_add\` | 0 (off) | Disabled — adding bots is often legitimate |

## Response actions

| Action | Effect |
|---|---|
| \`ban\` | Permanently bans the user — most secure, prevents re-entry |
| \`kick\` | Kicks the user — less secure, they can rejoin |
| \`strip_roles\` | Removes ALL roles — they stay in server but lose all permissions |
| \`quarantine\` | Assigns \`quarantine_role\` and removes all other roles — most controlled |

You can set different actions per trigger type using \`action_overrides\`:

\`\`\`yaml
action_overrides:
  channel_delete: "ban"
  role_delete: "ban"
  ban: "ban"
  kick: "ban"
  role_everyone_update: "ban"
  guild_update: "ban"
  channel_create: "strip_roles"
  role_create: "strip_roles"
\`\`\`

## Whitelist

Always whitelist your most trusted admins. Whitelisted accounts bypass ALL antinuke checks — keep this list very short.

\`\`\`yaml
whitelist_roles:
  - "OWNER_ROLE_ID"
  - "CO_OWNER_ROLE_ID"
whitelist_users:
  - "SERVER_OWNER_USER_ID"
  - "BOT_OWNER_USER_ID"
\`\`\`

> **Important:** Whitelist your own bot's user ID to prevent false positives when the bot performs mass actions (e.g. during antiraid response).

## Restoration

The restoration system attempts to undo damage before antinuke responded. This is best-effort — deleted channels cannot have their message history restored.

\`\`\`yaml
restore:
  enabled: true
  restore_deleted_channels: true   # Recreate deleted channels (name/type/parent only)
  restore_deleted_roles: true      # Recreate deleted roles (name/color/permissions)
  restore_everyone_permissions: true  # Restore @everyone perms to pre-attack state
\`\`\`

> Restoration is experimental. It is safer to keep \`restore: false\` and rely on manual recovery combined with the antinuke action stopping the attack quickly.

## Alerts

Configure where alerts go and who gets pinged:

\`\`\`yaml
alert_channel: "CHANNEL_ID"   # Staff-only channel
alert_roles:
  - "ADMIN_ROLE_ID"
  - "SENIOR_MOD_ROLE_ID"
dm_owner: true                # Always DM the server owner
\`\`\`

## Complete example

\`\`\`yaml
plugins:
  antinuke:
    enabled: true

    whitelist_roles:
      - "123456789012345678"   # Owner role
      - "234567890123456789"   # Co-owner role
    whitelist_users:
      - "345678901234567890"   # Bot owner user ID

    thresholds:
      channel_delete: 3
      channel_create: 5
      role_delete: 3
      role_create: 5
      role_everyone_update: 1
      ban: 5
      kick: 5
      webhook_create: 3
      guild_update: 1
      integration_delete: 2
      emoji_delete: 10

    interval_seconds: 10
    audit_log_delay_ms: 500

    action: "ban"
    create_case: true

    action_overrides:
      channel_delete: "ban"
      role_delete: "ban"
      ban: "ban"
      kick: "ban"
      webhook_create: "ban"
      role_everyone_update: "ban"
      guild_update: "ban"
      integration_delete: "ban"
      channel_create: "strip_roles"
      role_create: "strip_roles"
      emoji_delete: "strip_roles"

    restore:
      enabled: false
      restore_deleted_channels: false
      restore_deleted_roles: false
      restore_everyone_permissions: true

    alert_channel: "567890123456789012"
    alert_roles:
      - "123456789012345678"
      - "234567890123456789"
    dm_owner: true

    messages:
      triggered:
        embed:
          title: "🛡️ Antinuke Triggered"
          description: "{user.mention} performed a nuke action and was {action}d"
          color: "#FF0000"
          fields:
            - name: "User"
              value: "{user} ({user.id})"
              inline: true
            - name: "Rule Triggered"
              value: "{rule}"
              inline: true
            - name: "Count"
              value: "{count}/{trigger}"
              inline: true
            - name: "Action Taken"
              value: "{action}"
              inline: true
            - name: "Case"
              value: "#{case_id}"
              inline: true
          footer: "Server protected • {timestamp}"
      staff_alert: "🚨 Antinuke triggered | {user} ({user.id}) | Rule: {rule} | Count: {count}/{trigger} | Action: {action}"
      action_failed: "Antinuke action failed for {user} ({user.id}) | Rule: {rule} | Error: {reason}"
      owner_dm: "⚠️ Antinuke alert for **{server}** | {user} triggered the **{rule}** threshold ({count} actions) and was {action}d | Case: {case_id}"
\`\`\`

## Message variables

| Variable | Description |
|---|---|
| \`{user}\` | Offending user's username |
| \`{user.id}\` | Offending user's ID |
| \`{user.mention}\` | Offending user's @mention |
| \`{rule}\` | Which threshold was exceeded (e.g. \`channel_delete\`) |
| \`{count}\` | How many actions were detected in the window |
| \`{trigger}\` | The threshold limit that was exceeded |
| \`{action}\` | The action taken (ban/kick/strip\_roles/quarantine) |
| \`{case_id}\` | The case ID created for this event |
| \`{server}\` | The server name |
| \`{timestamp}\` | ISO timestamp of the event |`,
      },

      // ── ANTI-RAID ────────────────────────────────────────────────────────────
      {
        id: "plugin-antiraid",
        title: "Anti-Raid",
        type: "plugin",
        configKey: "antiraid",
        defaultConfig: `antiraid:
  enabled: false

  # Join flood detection
  join_threshold: 10
  join_interval_seconds: 10

  # Account age detection
  account_age_min_days: 7
  account_age_action: "flag"
  account_age_dm: true

  # Raid response
  action: "kick"
  ban_delete_days: 1
  dm_raid_members: true
  create_cases: true

  # Channel lockdown
  lockdown_channels: []
  lock_during_raid: true
  post_lockdown_notice: true
  auto_unlock_minutes: 10

  # Quarantine role (required for quarantine action)
  quarantine_role: null

  # Verification gate (during active raid mode)
  verification_gate:
    enabled: false
    auto_verify_age_days: 30
    verified_role: null

  # Whitelist
  whitelist_roles: []
  whitelist_users: []

  # Alerts
  alert_channel: null
  alert_roles: []

  # Persist raid mode across bot restarts
  persist_raid_mode: false

  # Advanced detection
  advanced:
    similar_username_detection: false
    username_similarity_threshold: 0.8
    default_avatar_flag: false
    join_pattern_detection: true
    min_account_age_in_guild_minutes: 0

  messages:
    raid_detected: "🚨 Raid detected | {count} joins in {duration}s | Action: {action} | Actioned: {success_count}"
    raid_ended: "✅ Raid mode ended | Duration: {duration} minutes"
    staff_alert: "🚨 **RAID ALERT** | {count} joins in {duration}s | Action: {action}"
    raid_summary: "📋 Raid summary | Actioned: {success_count} | Failed: {fail_count} | Window: {duration}s"
    raidmode_enabled: "🔴 Raid mode activated by {mod} | Channels locked: {count}"
    raidmode_disabled: "🟢 Raid mode deactivated by {mod} | Channels unlocked: {count}"
    lockdown_notice: "🔒 This channel has been locked due to a raid. Staff are handling the situation."
    unlock_notice: "🔓 The raid has been handled. This channel is now unlocked."
    new_account_flagged: "⚠️ New account | {user} ({user.id}) | Age: {count} days | Required: {trigger} days | Action: {reason}"
    new_account_dm: "Your account is too new to join **{server}**. Minimum age: **{trigger}** days. Your account is **{count}** days old."
    raid_member_dm: "You have been {action}d from **{server}** as part of an automated raid response."
    quarantine_notice: "⛔ Your account has been temporarily restricted in **{server}** pending staff review."`,
        schema: [
          { key: "enabled", type: "boolean", default: "false", description: "Enable Anti-Raid protection" },
          { key: "join_threshold", type: "number", default: "10", description: "Number of members that must join within join_interval_seconds to trigger raid mode" },
          { key: "join_interval_seconds", type: "number", default: "10", description: "Rolling time window in seconds for counting joins" },
          { key: "account_age_min_days", type: "number", default: "7", description: "Accounts younger than this many days are flagged. Set to 0 to disable" },
          { key: "account_age_action", type: "flag | kick | ban | quarantine", default: "flag", description: "Action taken when a new account is detected. Runs on every join regardless of raid mode" },
          { key: "account_age_dm", type: "boolean", default: "true", description: "DM the member when they are actioned for account age" },
          { key: "action", type: "kick | ban | mute | quarantine | lockonly | flag", default: "kick", description: "Action taken against all members who joined during a detected raid" },
          { key: "ban_delete_days", type: "number", default: "1", description: "Days of message history to delete when action is ban (0–7)" },
          { key: "dm_raid_members", type: "boolean", default: "true", description: "DM raid members before they are kicked/banned" },
          { key: "create_cases", type: "boolean", default: "true", description: "Create a mod case for each raid member actioned" },
          { key: "lockdown_channels", type: "string[]", default: "[]", description: "Channel IDs to lock when raid mode activates. If empty, ALL text channels are locked" },
          { key: "lock_during_raid", type: "boolean", default: "true", description: "Lock channels when raid mode activates" },
          { key: "post_lockdown_notice", type: "boolean", default: "true", description: "Post the lockdown_notice message inside each locked channel" },
          { key: "auto_unlock_minutes", type: "number", default: "10", description: "Automatically unlock channels after this many minutes. Set to 0 for manual-only control" },
          { key: "quarantine_role", type: "string | null", default: "null", description: "Role ID assigned when action or account_age_action is quarantine. Should have no permissions" },
          {
            key: "verification_gate", type: "object", description: "Quarantine ALL new joins during active raid mode until staff manually verifies them",
            children: [
              { key: "enabled", type: "boolean", default: "false", description: "Enable verification gate during active raid mode" },
              { key: "auto_verify_age_days", type: "number", default: "30", description: "Automatically approve joins from accounts older than this many days. Set to 0 to quarantine everyone" },
              { key: "verified_role", type: "string | null", default: "null", description: "Role to assign when staff verifies a quarantined member" },
            ],
          },
          { key: "whitelist_roles", type: "string[]", default: "[]", description: "Role IDs exempt from all antiraid checks" },
          { key: "whitelist_users", type: "string[]", default: "[]", description: "User IDs exempt from all antiraid checks" },
          { key: "alert_channel", type: "string | null", default: "null", description: "Channel ID for raid alerts and status messages. Recommended: private staff channel" },
          { key: "alert_roles", type: "string[]", default: "[]", description: "Role IDs pinged in the alert channel when raid mode activates" },
          { key: "persist_raid_mode", type: "boolean", default: "false", description: "Save raid mode state to the database so it survives bot restarts" },
          {
            key: "advanced", type: "object", description: "Advanced detection signals",
            children: [
              { key: "similar_username_detection", type: "boolean", default: "false", description: "Count similar-looking usernames at double weight (detects bot-name patterns like raider1, raider2, raider3)" },
              { key: "username_similarity_threshold", type: "number", default: "0.8", description: "How similar usernames must be to flag (0.0–1.0). Only used if similar_username_detection is true" },
              { key: "default_avatar_flag", type: "boolean", default: "false", description: "Log extra signal when accounts with no custom avatar join" },
              { key: "join_pattern_detection", type: "boolean", default: "true", description: "Flag suspiciously regular join intervals (common raid bot pattern)" },
              { key: "min_account_age_in_guild_minutes", type: "number", default: "0", description: "Temporary mute new members for this many minutes after joining. 0 = disabled" },
            ],
          },
          {
            key: "messages", type: "object", description: "Customizable message templates. All support plain strings or embed objects",
            children: [
              { key: "raid_detected", type: "message", description: "Posted to alert_channel when a raid is auto-detected. Variables: {count} {duration} {action} {success_count} {fail_count}" },
              { key: "raid_ended", type: "message", description: "Posted when raid mode ends (auto or manual). Variables: {duration} {count}" },
              { key: "staff_alert", type: "message", description: "First message posted in alert_channel with role pings. Variables: {count} {duration} {action} {trigger}" },
              { key: "raid_summary", type: "message", description: "Posted after all raid members are processed. Variables: {success_count} {fail_count} {count} {action} {duration}" },
              { key: "raidmode_enabled", type: "message", description: "Posted when raid mode is manually activated. Variables: {mod} {mod.mention} {count} {trigger}" },
              { key: "raidmode_disabled", type: "message", description: "Posted when raid mode is manually deactivated. Variables: {mod} {mod.mention} {count}" },
              { key: "raidmode_already_on", type: "string", description: "Reply when !raidmode on is used while already active" },
              { key: "raidmode_already_off", type: "string", description: "Reply when !raidmode off is used while already inactive" },
              { key: "raidmode_status_on", type: "message", description: "Response to !raidmode status when active. Variables: {duration} {count}" },
              { key: "raidmode_status_off", type: "message", description: "Response to !raidmode status when inactive" },
              { key: "lockdown_notice", type: "string", description: "Posted inside each locked channel when raid mode activates" },
              { key: "unlock_notice", type: "string", description: "Posted inside each channel when it unlocks" },
              { key: "auto_unlock_warning", type: "string", description: "Posted to alert_channel before auto-unlock fires. Variable: {count} = minutes remaining" },
              { key: "new_account_flagged", type: "message", description: "Posted to alert_channel when a new account joins. Variables: {user} {user.id} {user.mention} {user.avatar} {user.created_at} {count} {trigger} {reason}" },
              { key: "new_account_dm", type: "string", description: "DM sent to a new account before kick/ban. Variables: {server} {trigger} {count}" },
              { key: "raid_member_dm", type: "string", description: "DM sent to raid members before action. Variables: {action} {server}" },
              { key: "quarantine_notice", type: "string", description: "DM sent when a member is quarantined" },
              { key: "verification_required", type: "string", description: "DM sent when the verification gate quarantines a new join" },
              { key: "verified", type: "string", description: "DM sent when staff verifies a quarantined member. Variable: {server}" },
            ],
          },
        ],
        content: `The **Anti-Raid** plugin protects your server from coordinated join attacks. It has two independent detection systems that both run on every join, and a manual control command for staff.

## Two systems, always running

**System 1 — Join flood detection**
Tracks how many members join within a rolling \`join_interval_seconds\` window. When the count reaches \`join_threshold\`, raid mode automatically activates. All members who joined during the detection window are actioned, channels are locked, and staff are alerted.

**System 2 — Account age detection**
Runs on every single join, even when no raid is in progress. Accounts younger than \`account_age_min_days\` are actioned according to \`account_age_action\` (flag / kick / ban / quarantine). This catches individual alt accounts and bot accounts independently of flood detection.

## Commands

\`\`\`
!raidmode on
!raidmode off
!raidmode status
\`\`\`

| Command | What it does | Level |
|---|---|---|
| \`!raidmode on\` | Manually activates raid mode — locks configured channels, posts alert | 100 |
| \`!raidmode off\` | Manually deactivates raid mode — unlocks all channels, posts cleared message | 100 |
| \`!raidmode status\` | Shows whether raid mode is currently active and for how long | 50 |

## How raid detection works — step by step

\`\`\`
Member joins server
  ↓
Is member in whitelist_roles or whitelist_users?
├── YES → skip all antiraid checks entirely
└── NO  → continue
  ↓
ACCOUNT AGE CHECK (always runs):
Is account younger than account_age_min_days?
├── NO  → account age is fine, continue to join flood check
└── YES → log new_account_flagged to alert_channel
          account_age_dm: true → DM the member
          Apply account_age_action:
            "flag"        → log only, allow in
            "kick"        → kick member
            "ban"         → ban member
            "quarantine"  → assign quarantine_role
  ↓
Is raid mode currently ACTIVE?
├── YES → verification_gate.enabled?
│           YES → account older than auto_verify_age_days? → allow in
│                 otherwise → assign quarantine_role, DM verification_required
│         Skip flood detection
└── NO  → continue
  ↓
JOIN FLOOD CHECK (always runs):
Record this join timestamp in rolling window
Count joins within join_interval_seconds
  ↓
Count >= join_threshold?
├── NO  → do nothing, monitoring continues
└── YES → RAID DETECTED
          ↓
          Post staff_alert to alert_channel pinging alert_roles
          Post raid_detected to alert_channel
          ↓
          lock_during_raid: true?
          ├── YES → lock all lockdown_channels (or all channels if empty)
          │         post lockdown_notice in each locked channel
          └── NO  → skip lockdown
          ↓
          Process all members who joined in the detection window:
            dm_raid_members: true → send raid_member_dm before action
            Apply action (kick/ban/mute/quarantine/lockonly/flag)
            create_cases: true  → create a case for each member
            count success/fail
          ↓
          Post raid_summary with results
          ↓
          Start auto_unlock timer
          ↓
          auto_unlock_minutes elapsed OR !raidmode off:
            Unlock all locked channels (restores original permissions exactly)
            Post unlock_notice in each channel
            Post raid_ended to alert_channel
\`\`\`

## Raid action comparison

| Action | What happens to raid members | Channel lockdown |
|---|---|---|
| \`kick\` | Removed from server | ✅ if \`lock_during_raid\` |
| \`ban\` | Permanently banned | ✅ if \`lock_during_raid\` |
| \`mute\` | Timed out (28 days) | ✅ if \`lock_during_raid\` |
| \`quarantine\` | All roles removed, \`quarantine_role\` assigned | ✅ if \`lock_during_raid\` |
| \`lockonly\` | No member action | ✅ channels locked only |
| \`flag\` | Log only, no action | ❌ no lockdown |

## Account age action comparison

| Action | What happens | DM sent |
|---|---|---|
| \`flag\` | Logged to alert channel, member stays | ❌ |
| \`kick\` | Kicked with explanation | ✅ if \`account_age_dm\` |
| \`ban\` | Banned permanently | ✅ if \`account_age_dm\` |
| \`quarantine\` | Restricted to \`quarantine_role\`, staff must verify | ✅ quarantine notice sent |

## Recommended settings by server size

| Server size | \`join_threshold\` | \`join_interval_seconds\` |
|---|---|---|
| Small (under 1k) | 5 | 10 |
| Medium (1k–10k) | 10 | 10 |
| Large (10k–50k) | 15 | 10 |
| Very large (50k+) | 25 | 10 |
| High security | 5 | 5 |

## Variable reference

| Variable | Available in | Description |
|---|---|---|
| \`{count}\` | most messages | Joins detected, affected members, or account age in days |
| \`{duration}\` | raid messages | Time window in seconds, or how long raid mode was active |
| \`{action}\` | raid messages | The action taken (kick / ban / mute / quarantine) |
| \`{success_count}\` | summary messages | Members successfully actioned |
| \`{fail_count}\` | summary messages | Members that failed to be actioned |
| \`{trigger}\` | age / alert messages | Required minimum (age days or join threshold) |
| \`{reason}\` | flagged messages | Action taken or interval in seconds |
| \`{mod}\` | raidmode messages | Moderator who toggled raid mode |
| \`{mod.mention}\` | raidmode messages | @mention of the moderator |
| \`{user}\` | flagged messages | Joining user's tag |
| \`{user.id}\` | flagged messages | Joining user's ID |
| \`{user.mention}\` | flagged messages | @mention of the joining user |
| \`{user.avatar}\` | embed thumbnails | Joining user's avatar URL |
| \`{user.created_at}\` | flagged messages | When the account was created |
| \`{server}\` | DM messages | Server name |
| \`{timestamp}\` | embed footers | Current date and time |

## Quarantine setup

To use \`action: "quarantine"\` or \`account_age_action: "quarantine"\`:

1. Create a role with **no permissions** and no channels visible to it
2. Set \`quarantine_role\` to that role's ID
3. The bot removes **all** of the member's existing roles and assigns only the quarantine role
4. Staff can verify them manually by removing the quarantine role (and optionally assigning \`verified_role\`)

## Verification gate

When \`verification_gate.enabled: true\`, **every new join during an active raid** is automatically quarantined until staff manually verifies them — regardless of flood detection. This is the most aggressive protection mode.

Set \`auto_verify_age_days\` to automatically skip the gate for accounts older than that threshold (older accounts are less likely to be raid bots).

## Channel lockdown

When raid mode activates, the bot **saves the original \`Send Messages\` permission** for each channel and restores it exactly on unlock — so channels that were already restricted stay restricted, and channels that were already open return to open.

If \`lockdown_channels\` is empty, **all text channels** in the server are locked. It is strongly recommended to list only your public channels.

## Advanced detection

| Setting | What it does |
|---|---|
| \`similar_username_detection\` | Counts similar usernames (e.g. raider1, raider2) at double weight — makes the threshold trigger sooner for obvious raid bot patterns |
| \`username_similarity_threshold\` | 0.8 = 80% similar. Lower = more sensitive |
| \`default_avatar_flag\` | Logs an extra signal when an account with no avatar joins |
| \`join_pattern_detection\` | Flags suspiciously regular join timing (raid bots often join at fixed intervals) |
| \`min_account_age_in_guild_minutes\` | Temporarily mutes all new joins for N minutes before they can chat |

## Complete example config

\`\`\`yaml
plugins:
  antiraid:
    enabled: true

    join_threshold: 10
    join_interval_seconds: 10

    account_age_min_days: 7
    account_age_action: "kick"
    account_age_dm: true

    action: "kick"
    ban_delete_days: 1
    dm_raid_members: true
    create_cases: true

    lockdown_channels:
      - CHANNEL_ID_GENERAL
      - CHANNEL_ID_OFF_TOPIC
      - CHANNEL_ID_MEMES
    lock_during_raid: true
    post_lockdown_notice: true
    auto_unlock_minutes: 10

    quarantine_role: null

    verification_gate:
      enabled: false
      auto_verify_age_days: 30
      verified_role: null

    whitelist_roles:
      - ROLE_ID_ADMIN
      - ROLE_ID_STAFF
      - ROLE_ID_BOTS
    whitelist_users: []

    alert_channel: CHANNEL_ID_STAFF_ALERTS
    alert_roles:
      - ROLE_ID_STAFF

    persist_raid_mode: false

    advanced:
      similar_username_detection: true
      username_similarity_threshold: 0.8
      default_avatar_flag: false
      join_pattern_detection: true
      min_account_age_in_guild_minutes: 0

    messages:
      raid_detected:
        embed:
          title: "🚨 RAID DETECTED"
          description: "Automatic raid protection has activated"
          color: "#FF0000"
          fields:
            - name: "Joins Detected"
              value: "{count} in {duration}s"
              inline: true
            - name: "Action Taken"
              value: "{action}"
              inline: true
            - name: "Members Actioned"
              value: "{success_count}"
              inline: true
          footer: "Raid mode activated • {timestamp}"
      lockdown_notice: "🔒 This channel has been locked due to a raid. Staff are handling the situation — please stand by."
      unlock_notice: "🔓 The raid has been handled. This channel is now unlocked. Thank you for your patience!"
\`\`\``,
      },

      // ── LOCKDOWN ─────────────────────────────────────────────────────────────
      {
        id: "plugin-lockdown",
        title: "Lockdown",
        type: "plugin",
        configKey: "lockdown",
        defaultConfig: `lockdown:
  enabled: true
  server_lockdown_channels: []
  presets:
    raid:
      channels: []
      reason: "Raid detected"
      remove_send: true
      remove_reactions: false
      remove_threads: true
    exam:
      channels: []
      reason: "Exam period"
      remove_send: true
      remove_reactions: false
      remove_threads: false
  messages:
    lockdown_start: "{channel} has been locked | Reason: {reason}"
    lockdown_end: "{channel} has been unlocked"
    lockdown_server_start: "Server lockdown activated | {count} channels locked"
    lockdown_server_end: "Server lockdown lifted"
    lockdown_channel_notice: "This channel has been locked | Reason: {reason}"
    unlock_channel_notice: "This channel has been unlocked"
    already_locked: "{channel} is already locked"
    not_locked: "{channel} is not locked"`,
        schema: [
          { key: "enabled", type: "boolean", default: "true", description: "Enable the lockdown plugin" },
          { key: "server_lockdown_channels", type: "string[]", default: "[]", description: "Channel IDs included in a server-wide lockdown" },
          {
            key: "presets", type: "object", description: "Named lockdown presets",
            children: [
              { key: "<preset_name>.channels", type: "string[]", description: "Channel IDs locked by this preset" },
              { key: "<preset_name>.reason", type: "string", description: "Default reason shown in the lock notice" },
              { key: "<preset_name>.remove_send", type: "boolean", default: "true", description: "Deny Send Messages permission when locked" },
              { key: "<preset_name>.remove_reactions", type: "boolean", default: "false", description: "Deny Add Reactions permission when locked" },
              { key: "<preset_name>.remove_threads", type: "boolean", default: "true", description: "Deny Create Threads permission when locked" },
            ],
          },
          {
            key: "messages", type: "object", description: "Customizable messages",
            children: [
              { key: "lockdown_start", type: "message", description: "Posted when a channel is locked" },
              { key: "lockdown_end", type: "message", description: "Posted when a channel is unlocked" },
              { key: "lockdown_server_start", type: "message", description: "Posted when server lockdown activates. Variable: {count} = channels locked" },
              { key: "lockdown_server_end", type: "message", description: "Posted when server lockdown is lifted" },
              { key: "lockdown_channel_notice", type: "message", description: "Posted inside the locked channel" },
              { key: "unlock_channel_notice", type: "message", description: "Posted inside the channel when unlocked" },
              { key: "already_locked", type: "message", description: "When trying to lock an already locked channel" },
              { key: "not_locked", type: "message", description: "When trying to unlock a channel that isn't locked" },
            ],
          },
        ],
        content: `The **Lockdown** plugin allows quickly locking channels or the entire server.

## Presets

Presets are named lockdown configurations. Define them in YAML:

\`\`\`yaml
lockdown:
  presets:
    raid:
      channels:
        - "CHANNEL_ID_1"
        - "CHANNEL_ID_2"
      reason: "Raid in progress"
      remove_send: true
      remove_threads: true
    maintenance:
      channels:
        - "CHANNEL_ID_3"
      reason: "Maintenance"
      remove_send: true
\`\`\`

Then run \`!lockdown raid\` to instantly lock those channels.`,
      },

      // ── TAGS ────────────────────────────────────────────────────────────────
      {
        id: "plugin-tags",
        title: "Tags",
        type: "plugin",
        configKey: "tags",
        defaultConfig: `# Tags live at the TOP LEVEL of your config — NOT under plugins:
tags:
  rules: "Please read the rules in <#CHANNEL_ID> before participating!"
  invite: "Invite link: https://discord.gg/yourserver"

  # Multi-line plain string (YAML | block scalar)
  apply: |
    **📋 Staff Applications**
    Fill out the form here: https://forms.example.com/apply

  # Embed-only tag
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
      footer: "Use !tag list to see all tags • {timestamp.date}"

  # Content + embed combined
  rules_full:
    content: "Here are the rules, {user.mention}:"
    embed:
      title: "📜 {server} Rules"
      description: "By participating you agree to follow these rules."
      color: "#FF0000"

# Optional: customise error messages under plugins.utility.messages
plugins:
  utility:
    messages:
      tag_not_found: "Tag **{trigger}** not found. Use \`!tag list\` to see all tags."
      tag_list_empty: "No tags have been created yet."`,
        schema: [
          { key: "tags", type: "object", description: "Top-level map of tag name → tag value. Lives at the root of your config, not under plugins:" },
          { key: "tags.<name>", type: "string | object", description: "Tag value: plain string, embed object, or content+embed object" },
          {
            key: "plugins.utility.messages", type: "object", description: "Optional: customise bot responses for tag errors",
            children: [
              { key: "tag_not_found", type: "message | null", description: "When a tag name doesn't exist. Variable: {trigger} = the tag name typed. Set to null for silent behaviour." },
              { key: "tag_list_empty", type: "message", description: "When no tags have been created yet" },
            ],
          },
        ],
        content: `Tags are custom commands defined in your server's YAML config. Each tag can post plain text, a rich Discord embed, or both. Tags live at the **top level** of your config — not under \`plugins:\`.

## Format 1 — Plain string

The simplest format. Supports Discord markdown and channel/role/user mentions.

\`\`\`yaml
tags:
  rules: "Please read the rules in <#CHANNEL_ID> before participating!"
  invite: "Invite link: https://discord.gg/yourserver"
  support: "Need help? Open a ticket in <#CHANNEL_ID>."
\`\`\`

For multi-line content, use the YAML \`|\` block scalar:

\`\`\`yaml
tags:
  apply: |
    **📋 Staff Applications**

    Fill out the form here: https://forms.example.com/apply

    Requirements:
    • Must be 16 years or older
    • Must have no active infractions
\`\`\`

## Format 2 — Embed only

Sends a rich Discord embed. Supports title, description, color, thumbnail, image, footer, and fields.

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
        - name: "🎫 Support"
          value: "<#CHANNEL_ID>"
          inline: true
      footer: "Use !tag list to see all tags • {timestamp.date}"
\`\`\`

## Format 3 — Content + embed combined

The \`content\` line is posted as plain text above the embed. Useful for @mentions or context before the embed.

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
          value: "Treat all members with respect. No harassment or hate speech."
          inline: false
        - name: "Rule 2 — No Spam"
          value: "No message spam, emoji spam, or character spam."
          inline: false
      footer: "Violations result in punishment"
\`\`\`

## Template variables

All variables work inside **every** tag field — content, title, description, field names/values, footer, etc.

| Variable | Replaced with |
|---|---|
| \`{user}\` | Username of the person who triggered the tag |
| \`{user.mention}\` | @mention of the triggering user |
| \`{user.id}\` | User ID of the triggering user |
| \`{server}\` | Server name |
| \`{server.id}\` | Server ID |
| \`{server.member_count}\` | Current member count |
| \`{server.icon}\` | Server icon URL (use in \`thumbnail\` or \`image\`) |
| \`{timestamp}\` | Current date and time |
| \`{timestamp.date}\` | Current date only |
| \`{timestamp.time}\` | Current time only |
| \`{trigger}\` | Tag name searched (useful in error messages) |

## Embed field reference

| Field | Type | Description |
|---|---|---|
| \`title\` | string | Embed title |
| \`description\` | string | Embed body text |
| \`color\` | hex string | e.g. \`"#7289DA"\` |
| \`thumbnail\` | URL | Small image top-right (use \`{server.icon}\` for server icon) |
| \`image\` | URL | Large image at bottom |
| \`footer\` | string | Footer text |
| \`fields\` | array | List of \`{name, value, inline}\` objects (max 25) |

## Configurable error messages

Customise the bot's responses when a tag isn't found or the tag list is empty. Add these under \`plugins.utility.messages\`:

\`\`\`yaml
plugins:
  utility:
    messages:
      # Plain string
      tag_not_found: "Tag **{trigger}** not found. Use \`!tag list\` to see all tags."

      # Set to null for completely silent behaviour on unknown tags
      # tag_not_found: null

      # Embed version
      # tag_not_found:
      #   embed:
      #     title: "❌ Tag Not Found"
      #     description: "No tag named **{trigger}** exists"
      #     color: "#FF0000"
      #     footer: "Use !tag list to see all available tags"

      tag_list_empty: "No tags have been created yet. Ask an admin to add some."
\`\`\`

## How tags are triggered

| Method | Example | Notes |
|---|---|---|
| \`!tag <name>\` | \`!tag rules\` | Standard way |
| \`!tag list\` | \`!tag list\` | Shows all available tags in an embed |
| \`!<name>\` | \`!rules\` | Shortcut — skip the \`tag\` keyword entirely |

Tags are **YAML-only** — add, edit, or delete tags by editing the \`tags:\` block in the server's YAML config and saving. Changes apply within seconds.`,
      },

      // ── REMINDERS ────────────────────────────────────────────────────────────
      {
        id: "plugin-reminders",
        title: "Reminders",
        type: "plugin",
        configKey: "reminders",
        defaultConfig: `reminders:
  enabled: true
  messages:
    reminder_set: "Reminder set for {duration} | Fires at: {expires_at}"
    reminder_fired: "{user.mention} Reminder: {reminder_message}"
    reminder_not_found: "Reminder not found"
    reminder_deleted: "Reminder deleted"
    reminder_list_empty: "You have no active reminders"`,
        schema: [
          { key: "enabled", type: "boolean", default: "true", description: "Enable the reminders plugin" },
          {
            key: "messages", type: "object", description: "Customizable messages",
            children: [
              { key: "reminder_set", type: "message", description: "Confirmation when a reminder is set. Variables: {duration} {expires_at}" },
              { key: "reminder_fired", type: "message", description: "Sent when the reminder fires. Variable: {reminder_message} = the reminder text" },
              { key: "reminder_not_found", type: "message", description: "When a reminder ID doesn't exist" },
              { key: "reminder_deleted", type: "message", description: "When a reminder is deleted" },
              { key: "reminder_list_empty", type: "message", description: "When the user has no active reminders" },
            ],
          },
        ],
        content: `The **Reminders** plugin lets users set personal timed reminders.`,
      },

      // ── TIMEZONES ────────────────────────────────────────────────────────────
      {
        id: "plugin-timezones",
        title: "Timezones",
        type: "plugin",
        configKey: "timezones",
        defaultConfig: `timezones:
  enabled: true
  messages:
    timezone_set: "Your timezone has been set to {trigger}"
    timezone_get: "{user} timezone is {trigger}"
    timezone_cleared: "Your timezone has been cleared"
    timezone_not_set: "{user} has not set a timezone"
    timezone_invalid: "Invalid timezone. Use a valid tz identifier e.g. America/New_York"
    time_result: "Current time for {user}: {trigger}"
    timefor_result: "Current time in {trigger}: {reason}"`,
        schema: [
          { key: "enabled", type: "boolean", default: "true", description: "Enable the timezones plugin" },
          {
            key: "messages", type: "object", description: "Customizable messages",
            children: [
              { key: "timezone_set", type: "message", description: "When a user sets their timezone. Variable: {trigger} = timezone name" },
              { key: "timezone_get", type: "message", description: "When viewing a user's timezone" },
              { key: "timezone_cleared", type: "message", description: "When a user clears their timezone" },
              { key: "timezone_not_set", type: "message", description: "When a user has no timezone set" },
              { key: "timezone_invalid", type: "message", description: "When an invalid timezone identifier is provided" },
              { key: "time_result", type: "message", description: "Current time display. Variable: {trigger} = formatted time" },
              { key: "timefor_result", type: "message", description: "Time for a specific timezone. {trigger} = timezone, {reason} = formatted time" },
            ],
          },
        ],
        content: `The **Timezones** plugin stores per-user timezone preferences and provides time conversion commands.`,
      },

      // ── ROLES ────────────────────────────────────────────────────────────────
      {
        id: "plugin-roles",
        title: "Roles",
        type: "plugin",
        configKey: "roles",
        defaultConfig: `roles:
  enabled: true
  dm_on_action: true
  messages:
    addrole_success: "{user} has been given {trigger} | Reason: {reason}"
    removerole_success: "{trigger} has been removed from {user} | Reason: {reason}"
    temprole_success: "{user} has been given {trigger} | Duration: {duration} | Expires: {expires_at}"
    temprole_dm: "You have been given {trigger} in {server} | Duration: {duration}"
    temprole_expired: "{user} temp role {trigger} has expired"
    temprole_expired_dm: "Your temporary role {trigger} in {server} has expired"
    temprole_list_empty: "No active temp roles"
    error_role_not_found: "Role not found"
    error_already_has_role: "{user} already has {trigger}"
    error_missing_role: "{user} does not have {trigger}"
    error_role_hierarchy: "That role is above my highest role"
    error_managed_role: "That role is managed by an integration"`,
        schema: [
          { key: "enabled", type: "boolean", default: "true", description: "Enable the roles plugin" },
          { key: "dm_on_action", type: "boolean", default: "true", description: "DM the user when a temp role is given or expires" },
          {
            key: "messages", type: "object", description: "Customizable messages. Variable: {trigger} = role name",
            children: [
              { key: "addrole_success", type: "message", description: "When a role is added" },
              { key: "removerole_success", type: "message", description: "When a role is removed" },
              { key: "temprole_success", type: "message", description: "When a temp role is given" },
              { key: "temprole_dm", type: "message", description: "DM sent when a temp role is given" },
              { key: "temprole_expired", type: "message", description: "Posted when a temp role expires" },
              { key: "temprole_expired_dm", type: "message", description: "DM sent when a temp role expires" },
              { key: "temprole_list_empty", type: "message", description: "When there are no active temp roles" },
              { key: "error_role_not_found", type: "message", description: "When the role cannot be found" },
              { key: "error_already_has_role", type: "message", description: "When the user already has the role" },
              { key: "error_missing_role", type: "message", description: "When trying to remove a role the user doesn't have" },
              { key: "error_role_hierarchy", type: "message", description: "When the role is above the bot's highest role" },
              { key: "error_managed_role", type: "message", description: "When the role is managed by an integration" },
            ],
          },
        ],
        content: `The **Roles** plugin provides role management commands including temporary roles.`,
      },

      // ── WELCOME ──────────────────────────────────────────────────────────────
      {
        id: "plugin-welcome",
        title: "Welcome",
        type: "plugin",
        configKey: "welcome",
        content: `The **Welcome** plugin handles everything that happens when a member joins or leaves your server. It includes invite tracking, welcome/goodbye messages, join DMs, auto-role assignment, role restoration on rejoin, account age gating, a live member count channel, and a welcome-back message for returning members.

## Sub-systems overview

| Sub-system | What it does |
|---|---|
| \`invite_tracking\` | Tracks which invite link each member used when joining |
| \`welcome\` | Posts a message in a channel when a member joins |
| \`goodbye\` | Posts a message in a channel when a member leaves |
| \`join_dm\` | Sends a private DM to the new member on join |
| \`welcome_role\` | Automatically assigns one or more roles on join |
| \`rejoin_restore_roles\` | Restores the roles a member had before they left |
| \`member_count_channel\` | Updates a voice channel name with the live member count |
| \`welcome_back\` | Special welcome message shown when a previous member rejoins |

---

## Invite Tracking

Requires the bot to have **Manage Guild** permission. The bot caches all invite codes on startup and compares counts when a member joins to determine which invite was used.

### Invite variables (available in welcome messages when tracking is on)

| Variable | Value |
|---|---|
| \`{invite.code}\` | The invite code used, e.g. \`abc123\` |
| \`{invite.url}\` | Full URL, e.g. \`discord.gg/abc123\` |
| \`{invite.uses}\` | How many times this invite has been used |
| \`{invite.inviter}\` | Username of who created the invite |
| \`{invite.inviter.id}\` | User ID of the invite creator |
| \`{invite.inviter.mention}\` | @mention of the invite creator |
| \`{invite.channel}\` | Channel the invite points to |
| \`{invite.created_at}\` | When the invite was created |
| \`{invite.expires_at}\` | When the invite expires (or "Never") |
| \`{invite.max_uses}\` | Max uses (or "Unlimited") |
| \`{invite.temporary}\` | \`true\` if invite grants temporary membership |

### Invite rewards

Automatically assign roles when a user reaches invite milestones:

\`\`\`yaml
plugins:
  welcome:
    invite_tracking:
      enabled: true
      rewards:
        enabled: true
        milestones:
          - invites: 5
            role: 234567890123456789
            message: "{user.mention} just reached **5 invites**! 🎉"
          - invites: 10
            role: 345678901234567890
            message: "{user.mention} just reached **10 invites**! 🔥"
          - invites: 25
            role: 456789012345678901
            message: "{user.mention} just reached **25 invites**! 🚀"
\`\`\`

---

## Welcome message variables

| Variable | Value |
|---|---|
| \`{user}\` | Username |
| \`{user.mention}\` | @mention |
| \`{user.id}\` | User ID |
| \`{user.name}\` | Username without discriminator |
| \`{user.avatar}\` | Avatar URL (use as embed thumbnail) |
| \`{user.created_at}\` | Account creation date |
| \`{user.joined_at}\` | Server join date |
| \`{server}\` | Server name |
| \`{server.id}\` | Server ID |
| \`{server.icon}\` | Server icon URL |
| \`{server.member_count}\` | Current member count |
| \`{server.owner}\` | Server owner ID |
| \`{ordinal}\` | Join position as ordinal (1st, 2nd, 103rd…) |
| \`{timestamp}\` | Current datetime |
| \`{timestamp.date}\` | Current date |
| \`{timestamp.time}\` | Current time |

> Invite variables (\`{invite.*}\`) are also available in welcome messages when \`invite_tracking\` is enabled. They are **not** available in goodbye messages.

---

## Goodbye message variables

| Variable | Value |
|---|---|
| \`{user}\` | Username |
| \`{user.id}\` | User ID |
| \`{user.mention}\` | @mention (won't ping since they left) |
| \`{user.avatar}\` | Avatar URL |
| \`{user.created_at}\` | Account creation date |
| \`{user.joined_at}\` | When they originally joined |
| \`{server}\` | Server name |
| \`{server.member_count}\` | Member count **after** they left |
| \`{timestamp}\` | Current datetime |

---

## Member count channel formats

| Variable | Value |
|---|---|
| \`{server.member_count}\` | Total members (bots included) |
| \`{human_count}\` | Non-bot member count |
| \`{bot_count}\` | Bot count |
| \`{boost_count}\` | Active server boost count |

Updates are rate-limited to once every 10 minutes by Discord.

---

## Complete real-world example

\`\`\`yaml
plugins:
  welcome:
    enabled: true

    invite_tracking:
      enabled: true
      log_channel: 123456789012345678
      unknown_invite_label: "Unknown/Vanity URL"
      subtract_left: true
      subtract_banned: true
      leaderboard:
        enabled: true
      rewards:
        enabled: true
        milestones:
          - invites: 5
            role: 234567890123456789
            message: "{user.mention} just reached **5 invites**! 🎉"
          - invites: 10
            role: 345678901234567890
            message: "{user.mention} just reached **10 invites**! 🔥"
          - invites: 25
            role: 456789012345678901
            message: "{user.mention} just reached **25 invites**! 🚀"
          - invites: 50
            role: 567890123456789012
            message: "{user.mention} just reached **50 invites**! 💎"
          - invites: 100
            role: 678901234567890123
            message: "{user.mention} has reached **100 invites**! 👑 Legendary!"
      messages:
        invite_log:
          embed:
            title: "📨 New Member — Invite Tracked"
            color: "#7289DA"
            thumbnail: "{user.avatar}"
            fields:
              - name: "Member"
                value: "{user.mention} ({user.id})"
                inline: true
              - name: "Invited By"
                value: "{invite.inviter.mention} ({invite.inviter.id})"
                inline: true
              - name: "Invite Code"
                value: "\`{invite.code}\`"
                inline: true
              - name: "Invite Uses"
                value: "{invite.uses}"
                inline: true
              - name: "Account Age"
                value: "{user.created_at}"
                inline: true
              - name: "Members Now"
                value: "{server.member_count}"
                inline: true
            footer: "{timestamp}"
        inviter_dm: "🎉 Your invite code \`{invite.code}\` was just used by **{user}**! You now have **{count}** total invites."

    welcome:
      enabled: true
      channel: 123456789012345678
      ping: false
      delete_after: null
      message:
        embed:
          title: "👋 Welcome to {server}!"
          description: "Hey {user.mention}, we're so happy to have you here! You are our **{ordinal}** member."
          color: "#00FF00"
          thumbnail: "{user.avatar}"
          fields:
            - name: "📜 Read the Rules"
              value: "Head to <#CHANNEL_ID> before chatting"
              inline: false
            - name: "🎭 Get Your Roles"
              value: "Pick your roles in <#CHANNEL_ID>"
              inline: false
            - name: "🎫 Need Help?"
              value: "Open a ticket in <#CHANNEL_ID>"
              inline: false
            - name: "📨 Invited By"
              value: "{invite.inviter.mention}"
              inline: true
            - name: "🗓️ Account Created"
              value: "{user.created_at}"
              inline: true
          footer: "{server} • {server.member_count} members • {timestamp.date}"

    goodbye:
      enabled: true
      channel: 123456789012345678
      delete_after: null
      message:
        embed:
          title: "👋 Member Left"
          description: "**{user}** has left the server. We hope to see you again!"
          color: "#FF6600"
          thumbnail: "{user.avatar}"
          fields:
            - name: "User ID"
              value: "{user.id}"
              inline: true
            - name: "Joined"
              value: "{user.joined_at}"
              inline: true
            - name: "Members Remaining"
              value: "{server.member_count}"
              inline: true
          footer: "{server} • {timestamp}"

    join_dm:
      enabled: true
      message:
        embed:
          title: "👋 Welcome to {server}!"
          description: "Hey {user.mention}, thanks for joining us!"
          color: "#7289DA"
          thumbnail: "{server.icon}"
          fields:
            - name: "📜 Step 1 — Read the Rules"
              value: "Please read our rules to avoid punishment"
              inline: false
            - name: "✅ Step 2 — Verify"
              value: "Complete verification to gain full access"
              inline: false
            - name: "🎭 Step 3 — Get Roles"
              value: "Pick your interest roles to customize your experience"
              inline: false
            - name: "💬 Step 4 — Introduce Yourself"
              value: "Say hi to the community!"
              inline: false
            - name: "🎫 Need Help?"
              value: "Open a support ticket anytime"
              inline: false
          footer: "Invited by {invite.inviter} • {timestamp.date}"

    welcome_role:
      enabled: true
      role: null
      roles:
        - 123456789012345678
      delay_seconds: 0
      dm_on_assign: false

    rejoin_restore_roles:
      enabled: true
      ignore_roles:
        - 123456789012345678
      restore_nickname: false
      dm_on_restore: true
      messages:
        roles_restored_dm:
          embed:
            title: "👋 Welcome Back!"
            description: "Your previous roles in **{server}** have been restored!"
            color: "#00FF00"
            footer: "{timestamp}"

    member_count_channel:
      enabled: true
      channel: 123456789012345678
      format: "👥 Members: {server.member_count}"
      update_on: both
      extra_channels:
        - channel: 234567890123456789
          format: "👑 Humans: {human_count}"
        - channel: 345678901234567890
          format: "🤖 Bots: {bot_count}"
        - channel: 456789012345678901
          format: "🚀 Boosts: {boost_count}"

    welcome_back:
      enabled: true
      channel: null
      message:
        embed:
          title: "🎉 Welcome Back!"
          description: "Hey {user.mention}, welcome back to **{server}**! Great to see you again!"
          color: "#FFD700"
          thumbnail: "{user.avatar}"
          fields:
            - name: "Last Visit"
              value: "{user.joined_at}"
              inline: true
            - name: "Roles Restored"
              value: "{count} roles"
              inline: true
          footer: "{timestamp}"
\`\`\`

---

## Invite command levels

Add these to your \`levels.commands\` block to enable the invite commands:

\`\`\`yaml
levels:
  commands:
    invites: 0           # !invites [@user]
    inviteleaderboard: 0 # !inviteleaderboard
    invitereset: 100     # !invitereset @user
    inviteinfo: 25       # !inviteinfo <code>
\`\`\``,
        defaultConfig: `welcome:
  enabled: true

  invite_tracking:
    enabled: true
    log_channel: null
    unknown_invite_label: "Unknown"
    subtract_left: true
    subtract_banned: true
    leaderboard:
      enabled: true
    rewards:
      enabled: false
      milestones:
        - invites: 5
          role: null
          message: "{user.mention} has reached 5 invites!"
        - invites: 10
          role: null
          message: "{user.mention} has reached 10 invites!"
        - invites: 25
          role: null
          message: "{user.mention} has reached 25 invites! 🎉"
    messages:
      invite_log: "Invite used | Code: {invite.code} | Inviter: {invite.inviter} ({invite.inviter.id}) | Uses: {invite.uses} | Joined: {user} ({user.id})"
      inviter_dm: null

  welcome:
    enabled: true
    channel: null
    ping: false
    delete_after: null
    message: "Welcome to {server}, {user.mention}! You are our **{ordinal}** member! 🎉"

  goodbye:
    enabled: true
    channel: null
    delete_after: null
    message: "**{user}** has left {server}. We now have **{server.member_count}** members."

  join_dm:
    enabled: true
    message: |
      👋 **Welcome to {server}!**

      We're happy to have you here. Here's how to get started:

      📜 **Rules** — Read the rules to avoid punishment
      🎭 **Roles** — Pick your roles to customize your experience
      🎫 **Support** — Open a ticket if you need help

  welcome_role:
    enabled: true
    role: null
    roles: []
    delay_seconds: 0
    dm_on_assign: false
    messages:
      autorole_assigned: "{user} was automatically assigned {trigger}"
      autorole_failed: "Failed to assign auto role {trigger} to {user} | Error: {reason}"

  rejoin_restore_roles:
    enabled: false
    ignore_roles: []
    restore_nickname: false
    dm_on_restore: false
    messages:
      roles_restored: "{user} had their roles restored ({count} roles)"
      roles_restored_dm: "Welcome back to {server}! Your previous roles have been restored."

  member_count_channel:
    enabled: false
    channel: null
    format: "👥 Members: {server.member_count}"
    update_on: both
    extra_channels:
      - channel: null
        format: "🤖 Bots: {bot_count}"
      - channel: null
        format: "👑 Members: {human_count}"
      - channel: null
        format: "🚀 Boosts: {boost_count}"

  welcome_back:
    enabled: false
    channel: null
    message: "Welcome back to {server}, {user.mention}! Great to see you again! 👋"

  messages:
    welcome_test_sent: "Welcome test message sent to {channel}"
    goodbye_test_sent: "Goodbye test message sent to {channel}"
    welcomedm_test_sent: "Welcome DM test sent to {user.mention}"
    test_failed: "Failed to send test message | Error: {reason}"`,
        schema: [
          { key: "enabled", type: "boolean", default: "true", description: "Master switch — enable or disable the entire welcome plugin" },
          {
            key: "invite_tracking", type: "object", default: "—", description: "Tracks which invite link each new member used",
            children: [
              { key: "enabled", type: "boolean", default: "true", description: "Enable invite tracking" },
              { key: "log_channel", type: "snowflake | null", default: "null", description: "Channel to post invite log messages. null = use the logging plugin's members channel" },
              { key: "unknown_invite_label", type: "string", default: "Unknown", description: "Label shown for {invite.inviter} when the invite cannot be determined (vanity URLs, widget joins, discovery)" },
              { key: "subtract_left", type: "boolean", default: "true", description: "Decrement the inviter's count when an invited member leaves" },
              { key: "subtract_banned", type: "boolean", default: "true", description: "Decrement the inviter's count when an invited member is banned" },
              { key: "leaderboard.enabled", type: "boolean", default: "true", description: "Track total invites per user for the !inviteleaderboard command" },
              {
                key: "rewards", type: "object", default: "—", description: "Automatically assign roles at invite count milestones",
                children: [
                  { key: "enabled", type: "boolean", default: "false", description: "Enable invite rewards" },
                  { key: "milestones[].invites", type: "number", default: "—", description: "Invite count that triggers this milestone" },
                  { key: "milestones[].role", type: "snowflake | null", default: "null", description: "Role ID to assign. null = no role reward" },
                  { key: "milestones[].message", type: "string | null", default: "null", description: "Message posted to the log channel. null = silent" },
                ],
              },
              {
                key: "messages", type: "object", default: "—", description: "Customizable messages for invite tracking events",
                children: [
                  { key: "invite_log", type: "message", default: "...", description: "Posted to log_channel every time an invite is tracked. Variables: {invite.*} {user} {user.id}" },
                  { key: "inviter_dm", type: "message | null", default: "null", description: "DM sent to the inviter when someone uses their link. null = disabled. Variables: {invite.code} {user} {count}" },
                  { key: "milestone_reached", type: "message", default: "...", description: "Posted when a milestone is reached. Variables: {user.mention} {count}" },
                ],
              },
            ],
          },
          {
            key: "welcome", type: "object", default: "—", description: "Public welcome message posted in a channel when a member joins",
            children: [
              { key: "enabled", type: "boolean", default: "true", description: "Enable welcome messages" },
              { key: "channel", type: "snowflake | null", default: "null", description: "Channel ID where welcome messages are posted. Required — set to your welcome channel" },
              { key: "ping", type: "boolean", default: "false", description: "If true, the message is sent as a reply pinging the user in addition to any {user.mention} in the text" },
              { key: "delete_after", type: "number | null", default: "null", description: "Auto-delete the welcome message after this many seconds. null = never delete" },
              { key: "message", type: "message", default: "...", description: "Welcome message. Supports plain text or embed. All welcome variables + invite variables available" },
            ],
          },
          {
            key: "goodbye", type: "object", default: "—", description: "Message posted in a channel when a member leaves",
            children: [
              { key: "enabled", type: "boolean", default: "true", description: "Enable goodbye messages" },
              { key: "channel", type: "snowflake | null", default: "null", description: "Channel ID for goodbye messages. Can be the same as welcome.channel" },
              { key: "delete_after", type: "number | null", default: "null", description: "Auto-delete the goodbye message after this many seconds" },
              { key: "message", type: "message", default: "...", description: "Goodbye message. Invite variables are NOT available here" },
            ],
          },
          {
            key: "join_dm", type: "object", default: "—", description: "Private DM sent to the new member on join. DM failures (user has DMs closed) are always silent",
            children: [
              { key: "enabled", type: "boolean", default: "true", description: "Enable join DMs" },
              { key: "message", type: "message", default: "...", description: "DM message. Supports plain text or embed. All welcome variables available" },
            ],
          },
          {
            key: "welcome_role", type: "object", default: "—", description: "Automatically assigns one or more roles when a member joins",
            children: [
              { key: "enabled", type: "boolean", default: "true", description: "Enable auto-role on join" },
              { key: "role", type: "snowflake | null", default: "null", description: "Single role ID to assign to every new member. null = disabled" },
              { key: "roles", type: "snowflake[]", default: "[]", description: "List of role IDs — ALL roles in this list are assigned on join" },
              { key: "delay_seconds", type: "number", default: "0", description: "Seconds to wait before assigning the role. Useful if you want to wait for verification. 0 = assign immediately" },
              { key: "dm_on_assign", type: "boolean", default: "false", description: "DM the user when their auto role is assigned" },
              { key: "messages.autorole_assigned", type: "message", default: "...", description: "Posted to the logging channel when a role is assigned. Variables: {user} {trigger}" },
              { key: "messages.autorole_failed", type: "message", default: "...", description: "Logged when role assignment fails. Variables: {user} {trigger} {reason}" },
            ],
          },
          {
            key: "rejoin_restore_roles", type: "object", default: "—", description: "When a member who previously left rejoins, automatically restores the roles they had before leaving",
            children: [
              { key: "enabled", type: "boolean", default: "false", description: "Enable role restoration on rejoin" },
              { key: "ignore_roles", type: "snowflake[]", default: "[]", description: "Role IDs that are never restored even if the member had them (e.g. trial roles, booster roles)" },
              { key: "restore_nickname", type: "boolean", default: "false", description: "Also restore the member's previous nickname" },
              { key: "dm_on_restore", type: "boolean", default: "false", description: "DM the member when their roles are restored" },
              { key: "messages.roles_restored", type: "message", default: "...", description: "Posted to the logging channel. Variables: {user} {user.id} {count}" },
              { key: "messages.roles_restored_dm", type: "message", default: "...", description: "Sent to the user if dm_on_restore is true. Variables: {server}" },
            ],
          },
          {
            key: "member_count_channel", type: "object", default: "—", description: "Updates a voice channel name to show live member stats. Rate-limited to once every 10 minutes by Discord",
            children: [
              { key: "enabled", type: "boolean", default: "false", description: "Enable the member count channel" },
              { key: "channel", type: "snowflake | null", default: "null", description: "Voice channel ID whose name gets updated to show the member count" },
              { key: "format", type: "string", default: "👥 Members: {server.member_count}", description: "Channel name template. Max 100 characters. Variables: {server.member_count} {human_count} {bot_count} {boost_count}" },
              { key: "update_on", type: "join | leave | both", default: "both", description: "When to trigger an update" },
              {
                key: "extra_channels", type: "array", default: "[]", description: "Additional stat channels — each shows a different stat in its name",
                children: [
                  { key: "channel", type: "snowflake | null", default: "null", description: "Voice channel ID for this stat" },
                  { key: "format", type: "string", default: "—", description: "Channel name template for this extra channel" },
                ],
              },
            ],
          },
          {
            key: "welcome_back", type: "object", default: "—", description: "Special welcome message shown when a previous member rejoins. Only fires if the member's user ID is found in history",
            children: [
              { key: "enabled", type: "boolean", default: "false", description: "Enable the welcome-back message" },
              { key: "channel", type: "snowflake | null", default: "null", description: "Channel to post in. null = use welcome.channel" },
              { key: "message", type: "message", default: "...", description: "Welcome-back message. Variables: {user.mention} {server} {user.joined_at} {count} (roles restored)" },
            ],
          },
          {
            key: "messages", type: "object", default: "—", description: "System messages for test commands and errors",
            children: [
              { key: "welcome_test_sent", type: "string", default: "...", description: "Confirmation after !welcome test. Variable: {channel}" },
              { key: "goodbye_test_sent", type: "string", default: "...", description: "Confirmation after !goodbye test. Variable: {channel}" },
              { key: "welcomedm_test_sent", type: "string", default: "...", description: "Confirmation after !welcomedm test. Variable: {user.mention}" },
              { key: "test_failed", type: "string", default: "...", description: "Shown when a test command fails. Variable: {reason}" },
            ],
          },
        ],
      },

      // ── STARBOARD ────────────────────────────────────────────────────────────
      {
        id: "plugin-starboard",
        title: "Starboard",
        type: "plugin",
        configKey: "starboard",
        defaultConfig: `plugins:
  starboard:
    enabled: false

    channel: null
    emoji: "⭐"
    threshold: 3

    self_star: false
    remove_on_unstar: false
    update_on_new_stars: true
    lock_after_post: false
    repost_if_edited: false

    ignore_channels: []
    ignore_roles: []
    ignored_users: []
    nsfw_allowed: false
    bots_allowed: false
    max_age_days: 7
    min_message_length: 0

    post_format:
      show_author: true
      show_jump_link: true
      show_attachment: true
      show_channel: true
      show_timestamp: true
      star_count_format: "{count} {emoji}"
      embed_color: "#FFD700"
      embed_color_by_count: false
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
      super_star_threshold: 10
      super_star_emoji: "🌟"

    extra_boards: []

    messages:
      starboard_empty: "No starred messages found"
      stats_none: "No star data found for {user}"
      starboard_cleared: "Starboard entries cleared for {user}"
      starboard_ignored: "{user} has been added to the starboard ignore list"
      starboard_unignored: "{user} has been removed from the starboard ignore list"
      channel_ignored: "{channel} has been added to the starboard channel ignore list"
      channel_unignored: "{channel} has been removed from the starboard channel ignore list"
      already_ignored: "{user} is already on the starboard ignore list"
      not_ignored: "{user} is not on the starboard ignore list"
      lock_success: "Starboard locked — no new messages will be posted"
      unlock_success: "Starboard unlocked — messages will be posted normally"
      force_posted: "Message has been force-posted to the starboard"
      already_posted: "This message is already on the starboard"
      message_not_found: "Message not found"`,
        schema: [
          { key: "enabled", type: "boolean", default: "false", description: "Enable the starboard plugin" },
          { key: "channel", type: "snowflake | null", default: "null", description: "Channel ID where starred messages are posted. REQUIRED — bot needs Send Messages and Embed Links here." },
          { key: "emoji", type: "string", default: "⭐", description: "Reaction emoji that counts as a star. Unicode: \"⭐\" or \"💫\". Custom: \"<:name:ID>\"." },
          { key: "threshold", type: "number", default: "3", description: "Number of star reactions required before a message is posted to the starboard." },
          { key: "self_star", type: "boolean", default: "false", description: "If false, reacting to your own message does not count toward the threshold." },
          { key: "remove_on_unstar", type: "boolean", default: "false", description: "If true, the starboard post is deleted when star count drops back below the threshold." },
          { key: "update_on_new_stars", type: "boolean", default: "true", description: "If true, the starboard post is edited to reflect the updated star count whenever stars are added or removed." },
          { key: "lock_after_post", type: "boolean", default: "false", description: "If true, once a message is posted the embed is never edited again, even as star count changes." },
          { key: "repost_if_edited", type: "boolean", default: "false", description: "If true, editing the original message also updates the starboard embed content." },
          { key: "ignore_channels", type: "string[]", default: "[]", description: "Channel IDs where messages can never be starred. Reactions still work but never count." },
          { key: "ignore_roles", type: "string[]", default: "[]", description: "Role IDs — reactions from members with any of these roles do not count toward the threshold." },
          { key: "ignored_users", type: "string[]", default: "[]", description: "User IDs whose messages can never be starred (static YAML list)." },
          { key: "nsfw_allowed", type: "boolean", default: "false", description: "If false, messages from NSFW channels can never be starred." },
          { key: "bots_allowed", type: "boolean", default: "false", description: "If false, messages sent by bots can never be starred." },
          { key: "max_age_days", type: "number", default: "7", description: "Messages older than this many days cannot be starred. Set to 0 to allow any age." },
          { key: "min_message_length", type: "number", default: "0", description: "Minimum character count for a message to be starrable. Messages with attachments always qualify." },
          {
            key: "post_format", type: "object", default: "(see below)", description: "Controls the appearance of the starboard post embed.",
            children: [
              { key: "show_author", type: "boolean", default: "true", description: "Show the message author's name and avatar in the embed." },
              { key: "show_jump_link", type: "boolean", default: "true", description: "Show a Jump to Message link at the bottom of the embed." },
              { key: "show_attachment", type: "boolean", default: "true", description: "If the original message has an image, show it in the embed." },
              { key: "show_channel", type: "boolean", default: "true", description: "Show which channel the original message was posted in." },
              { key: "show_timestamp", type: "boolean", default: "true", description: "Show when the original message was sent." },
              { key: "star_count_format", type: "string", default: "\"{count} {emoji}\"", description: "Format for the star count display. {count} = number, {emoji} = star emoji." },
              { key: "embed_color", type: "hex string", default: "\"#FFD700\"", description: "Embed color. Used when embed_color_by_count is false." },
              { key: "embed_color_by_count", type: "boolean", default: "false", description: "If true, embed color automatically changes based on star count tiers (see color_tiers)." },
              { key: "color_tiers", type: "array", default: "(gold→orange→red→purple)", description: "List of {min_stars, color} pairs. Used when embed_color_by_count is true. Highest matching tier wins.", children: [
                { key: "min_stars", type: "number", description: "Minimum star count to activate this color tier." },
                { key: "color", type: "hex string", description: "Embed hex color for this tier, e.g. \"#FFA500\"." },
              ]},
              { key: "super_star_threshold", type: "number", default: "10", description: "When a message reaches this many stars the display emoji switches to super_star_emoji. Set to 0 to disable." },
              { key: "super_star_emoji", type: "string", default: "\"🌟\"", description: "Emoji shown in the star count display once super_star_threshold is reached." },
            ],
          },
          {
            key: "extra_boards", type: "array", default: "[]", description: "Additional specialized starboards alongside the main one, each with their own emoji, threshold, and channel.",
            children: [
              { key: "name", type: "string", description: "Internal identifier for this board (e.g. \"hallofshame\")." },
              { key: "channel", type: "snowflake", description: "Channel ID for this extra board." },
              { key: "emoji", type: "string", description: "Reaction emoji that counts for this board." },
              { key: "threshold", type: "number", description: "Reaction count required to post to this board." },
              { key: "self_star", type: "boolean", default: "false", description: "Allow self-starring for this board." },
              { key: "ignore_channels", type: "string[]", default: "[]", description: "Channel IDs excluded from this board." },
              { key: "ignore_roles", type: "string[]", default: "[]", description: "Role IDs whose reactions don't count for this board." },
              { key: "only_roles", type: "string[]", default: "[]", description: "Only members with one of these roles can trigger this board. Leave empty for everyone." },
              { key: "nsfw_allowed", type: "boolean", default: "false", description: "Allow NSFW channel messages for this board." },
              { key: "bots_allowed", type: "boolean", default: "false", description: "Allow bot messages for this board." },
              { key: "embed_color", type: "hex string", default: "\"#FFD700\"", description: "Embed color for posts on this board." },
            ],
          },
          {
            key: "messages", type: "object", default: "(see defaults)", description: "Customize all bot responses for starboard commands. Supports plain strings or embed objects.",
            children: [
              { key: "starboard_empty", type: "string | embed", default: "\"No starred messages found\"", description: "Shown when !starboard top is run and no entries exist." },
              { key: "stats_none", type: "string | embed", default: "\"No star data found for {user}\"", description: "Shown when !starboard stats is run on a user with no activity. {user} = mention." },
              { key: "starboard_cleared", type: "string | embed", default: "\"Starboard entries cleared for {user}\"", description: "Shown after !starboard clear. {user} = mention." },
              { key: "starboard_ignored", type: "string", default: "\"{user} has been added to the starboard ignore list\"", description: "Shown after !starboard ignore @user. {user} = mention." },
              { key: "starboard_unignored", type: "string", default: "\"{user} has been removed from the starboard ignore list\"", description: "Shown after !starboard unignore @user. {user} = mention." },
              { key: "channel_ignored", type: "string", default: "\"{channel} has been added to the starboard channel ignore list\"", description: "Shown after !starboard ignorechannel. {channel} = mention." },
              { key: "channel_unignored", type: "string", default: "\"{channel} has been removed from the starboard channel ignore list\"", description: "Shown after !starboard unignorechannel. {channel} = mention." },
              { key: "lock_success", type: "string", default: "\"Starboard locked — no new messages will be posted\"", description: "Shown after !starboard lock." },
              { key: "unlock_success", type: "string", default: "\"Starboard unlocked — messages will be posted normally\"", description: "Shown after !starboard unlock." },
              { key: "force_posted", type: "string", default: "\"Message has been force-posted to the starboard\"", description: "Shown after !starboard force." },
              { key: "already_posted", type: "string", default: "\"This message is already on the starboard\"", description: "Shown when force is used on an already-posted message." },
              { key: "message_not_found", type: "string", default: "\"Message not found\"", description: "Shown when a message ID cannot be resolved." },
            ],
          },
        ],
        content: `The **Starboard** plugin reposts highly-reacted messages to a dedicated highlight channel. It supports rich embed formatting, dynamic color tiers, multiple simultaneous boards, and full admin controls.

## How It Works

**Step-by-step flow:**

1. A member reacts to any message with the configured \`emoji\`
2. The bot checks all filtering rules — ignored channels, ignored users, ignored roles, NSFW, bots, max age, self star
3. If the reaction passes all filters, the bot counts total qualifying reactions
4. If the count reaches \`threshold\`, the message is posted to the \`channel\`
5. If \`update_on_new_stars\` is true, the post gets edited every time the count changes
6. If \`remove_on_unstar\` is true and the count drops below \`threshold\`, the post is deleted
7. If \`embed_color_by_count\` is true, the embed color updates automatically as stars accumulate

## Color Tiers

When \`embed_color_by_count\` is enabled, the embed color changes as star count grows. The default tiers are:

| Stars | Color | Meaning |
|-------|-------|---------|
| 1–4 | 🟡 Gold \`#FFD700\` | Standard star |
| 5–9 | 🟠 Orange \`#FFA500\` | Popular message |
| 10–19 | 🔶 Deep orange \`#FF6600\` | Very popular |
| 20–49 | 🔴 Red \`#FF0000\` | Community favorite |
| 50+ | 🟣 Purple \`#FF00FF\` | Legendary |

You can define your own tiers with any \`min_stars\` and hex \`color\` values.

## Super Star Threshold

When a message reaches \`super_star_threshold\` stars, the star count display in the post switches from the regular \`emoji\` to \`super_star_emoji\` — visually indicating the message is exceptional. For example \`"15 🌟"\` instead of \`"15 ⭐"\`. Set \`super_star_threshold: 0\` to disable.

## Extra Boards

You can define additional specialized boards alongside the main one using \`extra_boards\`. Each extra board has its own \`emoji\`, \`threshold\`, \`channel\`, and filtering rules. Use \`only_roles\` to restrict which members can trigger a board (e.g. a staff-only appreciation board).

\`\`\`yaml
extra_boards:
  - name: "halloffame"
    channel: 123456789012345678
    emoji: "👑"
    threshold: 20
    self_star: false
    nsfw_allowed: false
    bots_allowed: false
    embed_color: "#FFD700"

  - name: "funny"
    channel: 234567890123456789
    emoji: "😂"
    threshold: 5
    embed_color: "#FFFF00"

  - name: "staffpick"
    channel: 345678901234567890
    emoji: "⭐"
    threshold: 1
    only_roles:
      - 456789012345678901   # staff role only
    embed_color: "#5865F2"
\`\`\`

## Dynamic vs. Static Ignores

There are two ways to ignore users and channels:

- **Static (YAML):** Add IDs to \`ignored_users\` or \`ignore_channels\` in your config. These apply at startup and can only be changed by editing the YAML.
- **Dynamic (commands):** Use \`!starboard ignore @user\` or \`!starboard ignorechannel #channel\` at runtime. These persist in the database and survive restarts.

## Locking the Starboard

\`!starboard lock\` stops all new posts from being added. Existing posts remain. \`!starboard unlock\` re-enables it. Useful during events or maintenance.

## Force-Posting

\`!starboard force <message_id>\` lets a moderator manually push any message onto the starboard regardless of its star count. Run the command in the same channel as the target message.

## Complete Example

\`\`\`yaml
plugins:
  starboard:
    enabled: true
    channel: 123456789012345678
    emoji: "⭐"
    threshold: 5
    self_star: false
    remove_on_unstar: true
    update_on_new_stars: true

    ignore_channels:
      - 234567890123456789   # mod-log
      - 345678901234567890   # staff-chat

    nsfw_allowed: false
    bots_allowed: false
    max_age_days: 14

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
        channel: 678901234567890123
        emoji: "👑"
        threshold: 20
        embed_color: "#FFD700"
\`\`\``,
      },

      // ── AUTOREPLY ────────────────────────────────────────────────────────────
      {
        id: "plugin-autoreply",
        title: "Autoreply",
        type: "plugin",
        configKey: "autoreply",
        defaultConfig: `plugins:
  autoreply:
    enabled: true
    ignore_bots: true
    ignore_self: true
    case_sensitive_default: false
    max_response_length: 2000
    mention_user_in_reply: false

    replies: []

    messages:
      autoreply_added: "Auto reply **{trigger}** added | ID: \`{reason}\` | Type: {count}"
      autoreply_removed: "Auto reply \`{trigger}\` removed"
      autoreply_enabled: "Auto reply \`{trigger}\` enabled"
      autoreply_disabled: "Auto reply \`{trigger}\` disabled"
      autoreply_edited: "Auto reply \`{trigger}\` updated | Field: {reason}"
      autoreply_not_found: "Auto reply \`{trigger}\` not found — use \`!autoreply list\` to see all rules"
      autoreply_list_empty: "No auto reply rules configured — use \`!autoreply add\` to create one"
      autoreply_id_taken: "ID \`{trigger}\` is already in use — choose a different ID"
      autoreply_cooldown_set: "Cooldown for \`{trigger}\` set to **{count}** seconds"
      autoreply_global_cooldown_set: "Global cooldown for \`{trigger}\` set to **{count}** seconds"
      autoreply_delete_trigger_toggled: "Delete trigger for \`{trigger}\` set to **{reason}**"
      autoreply_delete_after_set: "Delete after for \`{trigger}\` set to **{count}** seconds"
      autoreply_channel_added: "Channel {channel} added to rule \`{trigger}\`"
      autoreply_channel_removed: "Channel {channel} removed from rule \`{trigger}\`"
      autoreply_role_added: "Role {reason} added to rule \`{trigger}\`"
      autoreply_role_removed: "Role {reason} removed from rule \`{trigger}\`"
      autoreply_minlength_set: "Minimum length for \`{trigger}\` set to **{count}** characters"
      autoreply_maxlength_set: "Maximum length for \`{trigger}\` set to **{count}** characters"
      autoreply_type_changed: "Reply type for \`{trigger}\` changed to **{reason}**"
      autoreply_response_set: "Response for \`{trigger}\` updated"
      autoreply_response_too_long: "Response too long — maximum is {count} characters"
      autoreply_invalid_trigger_type: "Invalid trigger type — use: contains, exact, startswith, endswith, regex"
      autoreply_invalid_reply_type: "Invalid reply type — use: message, reply, dm, reply_dm"
      autoreply_invalid_regex: "Invalid regex pattern — {reason}"`,
        schema: [
          { key: "enabled", type: "boolean", default: "true", description: "Master switch — set to false to disable all autoreplies" },
          { key: "ignore_bots", type: "boolean", default: "true", description: "If true, messages from other bots never trigger autoreplies. Recommended to prevent infinite reply loops." },
          { key: "ignore_self", type: "boolean", default: "true", description: "If true, the bot never replies to its own messages. Always recommended." },
          { key: "case_sensitive_default", type: "boolean", default: "false", description: "Default case sensitivity for all rules. Can be overridden per rule with match_case." },
          { key: "max_response_length", type: "number", default: "2000", description: "Maximum characters allowed in a plain text response. Discord's limit is 2000." },
          { key: "mention_user_in_reply", type: "boolean", default: "false", description: "If true, reply-type responses include a @mention ping in addition to the Discord reply notification." },
          {
            key: "replies", type: "array", default: "[]", description: "Static YAML autoreply rules. Read-only — these cannot be edited via bot commands.",
            children: [
              { key: "id", type: "string", description: "Unique identifier for the rule (REQUIRED). Must be unique across all rules (YAML + DB)." },
              { key: "trigger", type: "string", description: "Text or regex pattern to match. Leave empty (\"\") with trigger_type: exact to match every message in a channel." },
              { key: "trigger_type", type: "string", default: "contains", description: "How to match: contains | exact | startswith | endswith | regex" },
              { key: "match_case", type: "boolean", default: "false", description: "If true, matching is case-sensitive. Overrides case_sensitive_default for this rule." },
              { key: "reply_type", type: "string", default: "reply", description: "How the bot responds: message | reply | dm | reply_dm" },
              { key: "response", type: "string", description: "The text to send (REQUIRED). Supports all template variables. Can also be an embed block." },
              { key: "delete_trigger", type: "boolean", default: "false", description: "If true, the user's triggering message is deleted before the response is sent." },
              { key: "delete_after", type: "number", default: "0", description: "Auto-deletes the bot's response after this many seconds. 0 = never delete." },
              { key: "cooldown_seconds", type: "number", default: "0", description: "Per-user cooldown — same user cannot trigger this rule again until this many seconds pass." },
              { key: "global_cooldown_seconds", type: "number", default: "0", description: "Rule-wide cooldown — nobody can trigger this rule until this many seconds pass after the last trigger." },
              { key: "only_channels", type: "string[]", default: "[]", description: "If set, rule ONLY fires in these channel IDs. Empty = fires in all channels." },
              { key: "ignore_channels", type: "string[]", default: "[]", description: "Rule never fires in these channel IDs." },
              { key: "only_roles", type: "string[]", default: "[]", description: "If set, rule ONLY fires for users with at least one of these role IDs. Empty = fires for all users." },
              { key: "ignore_roles", type: "string[]", default: "[]", description: "Rule never fires for users with these role IDs." },
              { key: "ignore_users", type: "string[]", default: "[]", description: "Rule never fires for these specific user IDs." },
              { key: "min_length", type: "number", default: "0", description: "Minimum message character length to trigger. 0 = no minimum." },
              { key: "max_length", type: "number", default: "0", description: "Maximum message character length to trigger. 0 = unlimited." },
              { key: "require_prefix", type: "boolean", default: "false", description: "If true, the message must start with the server prefix before the trigger." },
              { key: "enabled", type: "boolean", default: "true", description: "Whether this rule is active." },
            ],
          },
          {
            key: "messages", type: "object", description: "Customize bot response text for all autoreply commands.",
            children: [
              { key: "autoreply_added", type: "string", description: "Shown when a rule is created. Variables: {trigger} = trigger text, {reason} = assigned ID, {count} = trigger type" },
              { key: "autoreply_removed", type: "string", description: "Shown when a rule is deleted. Variables: {trigger} = rule ID" },
              { key: "autoreply_enabled", type: "string", description: "Shown when a rule is enabled. Variables: {trigger} = rule ID" },
              { key: "autoreply_disabled", type: "string", description: "Shown when a rule is disabled. Variables: {trigger} = rule ID" },
              { key: "autoreply_edited", type: "string", description: "Shown when a rule is edited. Variables: {trigger} = rule ID, {reason} = field that was edited" },
              { key: "autoreply_not_found", type: "string", description: "Shown when a rule ID is not found. Variables: {trigger} = searched ID" },
              { key: "autoreply_list_empty", type: "string", description: "Shown when no rules are configured." },
              { key: "autoreply_id_taken", type: "string", description: "Shown when a chosen ID already exists. Variables: {trigger} = the taken ID" },
              { key: "autoreply_cooldown_set", type: "string", description: "Shown after setting per-user cooldown. Variables: {trigger} = rule ID, {count} = seconds" },
              { key: "autoreply_global_cooldown_set", type: "string", description: "Shown after setting global cooldown. Variables: {trigger} = rule ID, {count} = seconds" },
              { key: "autoreply_delete_trigger_toggled", type: "string", description: "Shown after toggling delete_trigger. Variables: {trigger} = rule ID, {reason} = enabled/disabled" },
              { key: "autoreply_delete_after_set", type: "string", description: "Shown after setting delete_after. Variables: {trigger} = rule ID, {count} = seconds" },
              { key: "autoreply_channel_added", type: "string", description: "Shown after adding a channel filter. Variables: {trigger} = rule ID, {channel} = channel mention" },
              { key: "autoreply_channel_removed", type: "string", description: "Shown after removing a channel filter. Variables: {trigger} = rule ID, {channel} = channel mention" },
              { key: "autoreply_role_added", type: "string", description: "Shown after adding a role filter. Variables: {trigger} = rule ID, {reason} = role mention" },
              { key: "autoreply_role_removed", type: "string", description: "Shown after removing a role filter. Variables: {trigger} = rule ID, {reason} = role mention" },
              { key: "autoreply_minlength_set", type: "string", description: "Shown after setting min length. Variables: {trigger} = rule ID, {count} = characters" },
              { key: "autoreply_maxlength_set", type: "string", description: "Shown after setting max length. Variables: {trigger} = rule ID, {count} = characters" },
              { key: "autoreply_type_changed", type: "string", description: "Shown after changing reply type. Variables: {trigger} = rule ID, {reason} = new reply type" },
              { key: "autoreply_response_set", type: "string", description: "Shown after updating the response text. Variables: {trigger} = rule ID" },
              { key: "autoreply_response_too_long", type: "string", description: "Error when response exceeds max_response_length. Variables: {count} = max length" },
              { key: "autoreply_invalid_trigger_type", type: "string", description: "Error when an invalid trigger type is used." },
              { key: "autoreply_invalid_reply_type", type: "string", description: "Error when an invalid reply type is used." },
              { key: "autoreply_invalid_regex", type: "string", description: "Error when the regex pattern is invalid. Variables: {reason} = error message" },
            ],
          },
        ],
        content: `The **Autoreply** plugin automatically sends a message when a trigger condition is matched. Unlike autoreaction — which only adds emoji reactions — autoreply sends a full text response, Discord reply, or private DM.

Rules can be defined in two ways: statically in YAML (read-only, great for permanent responses) or dynamically via \`!autoreply\` commands (stored in the database, fully editable).

**Only one rule fires per message — the first matching rule wins.** Rules are checked in order (YAML rules first, then DB rules).

---

## Trigger Type Comparison

| Type | Matches | Example trigger | Matches |
|------|---------|-----------------|---------|
| \`contains\` | Trigger found anywhere | \`"hello"\` | "say hello!" · "HELLO there" |
| \`exact\` | Full message equals trigger | \`"hi"\` | "hi" · "Hi" |
| \`startswith\` | Message begins with trigger | \`"!apply"\` | "!apply now" · "!apply" |
| \`endswith\` | Message ends with trigger | \`"help"\` | "i need help" · "please help" |
| \`regex\` | Message matches pattern | \`"^\\\\d+$"\` | "42" · "100" |

**Empty trigger with \`exact\`:** setting trigger to \`""\` matches every message in a channel. Combine with \`only_channels\` to react to every message in one specific channel.

**Regex notes:** set \`match_case: false\` to add the case-insensitive flag automatically. Double-escape backslashes in YAML — write \`\\\\d\` for \`\\d\`.

---

## Reply Type Comparison

| Type | What happens | Channel message | DM sent |
|------|-------------|-----------------|---------|
| \`message\` | New standalone message in channel | ✅ (not a reply) | ❌ |
| \`reply\` | Discord reply to triggering message | ✅ (reply) | ❌ |
| \`dm\` | Private message to user | ❌ | ✅ |
| \`reply_dm\` | Both reply and DM simultaneously | ✅ (reply) | ✅ |

---

## Template Variables in Responses

| Variable | Description |
|----------|-------------|
| \`{user}\` | Username of who triggered the reply |
| \`{user.mention}\` | @mention of who triggered the reply |
| \`{user.id}\` | User ID of who triggered the reply |
| \`{user.name}\` | Display name of who triggered the reply |
| \`{server}\` | Server name |
| \`{server.id}\` | Server ID |
| \`{server.member_count}\` | Current member count |
| \`{server.icon}\` | Server icon URL |
| \`{channel}\` | Channel name where message was sent |
| \`{channel.mention}\` | #mention of the channel |
| \`{channel.id}\` | Channel ID |
| \`{timestamp}\` | Current date and time |
| \`{timestamp.date}\` | Current date only |
| \`{timestamp.time}\` | Current time only |

Template variables work in all response formats — plain text, embed titles, embed descriptions, embed fields, and embed footers.

---

## Processing Order

For each message, each enabled rule is evaluated in this order:

1. Message received
2. Is author a bot? + \`ignore_bots: true\` → SKIP
3. Is author the bot itself? + \`ignore_self: true\` → SKIP
4. Check all autoreply rules (YAML rules first, then DB rules). For each rule:
5. Is rule enabled? → NO → skip this rule
6. Is channel in global \`ignore_channels\`? → YES → skip
7. Is channel in rule's \`ignore_channels\`? → YES → skip
8. Is \`only_channels\` set and channel not in it? → YES → skip
9. Does user have a role in \`ignore_roles\`? → YES → skip
10. Is \`only_roles\` set and user has none of them? → YES → skip
11. Is user in \`ignore_users\`? → YES → skip
12. Is message shorter than \`min_length\`? → YES → skip
13. Is message longer than \`max_length\` (if set)? → YES → skip
14. Is user in per-user cooldown for this rule? → YES → skip
15. Is rule in global cooldown? → YES → skip
16. Does message match the trigger? → NO → skip
17. \`delete_trigger: true\` → delete user message
18. Send response (message / reply / dm / reply_dm)
19. \`delete_after\` set → schedule bot response deletion
20. Record cooldowns for this user and rule
21. **STOP — only ONE rule fires per message (first match wins)**

---

## Variable Reference (Command Messages)

| Variable | Available in | Description |
|----------|-------------|-------------|
| \`{trigger}\` | command messages | The trigger text or rule ID |
| \`{reason}\` | added/edited messages | The rule ID or field name edited |
| \`{count}\` | messages | Trigger type or cooldown seconds |
| \`{channel}\` | channel messages | Channel name |
| \`{mod}\` | confirmation messages | Moderator who ran the command |
| \`{timestamp}\` | embed footers | Current date and time |

---

## Example Config

\`\`\`yaml
plugins:
  autoreply:
    enabled: true
    ignore_bots: true
    ignore_self: true
    case_sensitive_default: false

    replies:

      # FAQ: where are the rules?
      - id: "faq-rules"
        trigger: "where are the rules"
        trigger_type: "contains"
        match_case: false
        reply_type: "reply"
        response: "You can find the rules in <#CHANNEL_ID>! Please read them before participating."
        delete_trigger: false
        delete_after: null
        cooldown_seconds: 30
        global_cooldown_seconds: 0
        only_channels: []
        ignore_channels: []
        only_roles: []
        ignore_roles: []
        ignore_users: []
        min_length: 0
        max_length: 0
        enabled: true

      # Delete invite links and warn the user
      - id: "no-invite"
        trigger: "discord.gg"
        trigger_type: "contains"
        match_case: false
        reply_type: "reply"
        response: "Invite links are not allowed here! Please read the rules."
        delete_trigger: true
        delete_after: 15
        cooldown_seconds: 0
        global_cooldown_seconds: 0
        only_channels: []
        ignore_channels: []
        only_roles: []
        ignore_roles:
          - 123456789012345678   # Staff can post invites
        ignore_users: []
        min_length: 0
        max_length: 0
        enabled: true

      # DM confirmation when someone submits a report
      - id: "report-dm"
        trigger: "!report"
        trigger_type: "startswith"
        match_case: true
        reply_type: "dm"
        response: "Your report has been received, {user.mention}! Staff will review it within 24 hours. Thank you for helping keep {server} safe."
        delete_trigger: true
        delete_after: null
        cooldown_seconds: 300
        global_cooldown_seconds: 0
        only_channels: []
        ignore_channels: []
        only_roles: []
        ignore_roles: []
        ignore_users: []
        min_length: 8
        max_length: 0
        enabled: true

      # Welcome every intro post (empty trigger = match everything in channel)
      - id: "intro-welcome"
        trigger: ""
        trigger_type: "exact"
        match_case: false
        reply_type: "reply"
        response: "Welcome {user.mention}! Thanks for introducing yourself! 👋"
        delete_trigger: false
        delete_after: null
        cooldown_seconds: 86400
        global_cooldown_seconds: 0
        only_channels:
          - 234567890123456789   # introductions only
        ignore_channels: []
        only_roles: []
        ignore_roles: []
        ignore_users: []
        min_length: 50
        max_length: 0
        enabled: true

      # IP address regex warning
      - id: "ip-address-warn"
        trigger: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b"
        trigger_type: "regex"
        match_case: false
        reply_type: "reply"
        response: "Please do not share IP addresses in this server. Your message has been removed."
        delete_trigger: true
        delete_after: 15
        cooldown_seconds: 0
        global_cooldown_seconds: 0
        only_channels: []
        ignore_channels: []
        only_roles: []
        ignore_roles:
          - 123456789012345678   # Staff
        ignore_users: []
        min_length: 0
        max_length: 0
        enabled: true

    messages:
      autoreply_added: "Auto reply **{trigger}** added | ID: \`{reason}\` | Type: {count}"
      autoreply_removed: "Auto reply \`{trigger}\` removed"
      autoreply_not_found: "Auto reply \`{trigger}\` not found — use \`!autoreply list\` to see all rules"
      autoreply_list_empty: "No auto reply rules configured — use \`!autoreply add\` to create one"
\`\`\``,
      },

      // ── AUTOREACTION ─────────────────────────────────────────────────────────
      {
        id: "plugin-autoreaction",
        title: "Autoreaction",
        type: "plugin",
        configKey: "autoreaction",
        defaultConfig: `plugins:
  autoreaction:
    enabled: true
    ignore_bots: true
    ignore_self: true
    max_emojis_per_rule: 10
    case_sensitive_default: false

    reactions: []

    messages:
      autoreaction_added: "Auto reaction **{trigger}** added | ID: \`{reason}\` | Emojis: {count}"
      autoreaction_removed: "Auto reaction \`{trigger}\` removed"
      autoreaction_enabled: "Auto reaction \`{trigger}\` enabled"
      autoreaction_disabled: "Auto reaction \`{trigger}\` disabled"
      autoreaction_edited: "Auto reaction \`{trigger}\` updated"
      autoreaction_not_found: "Auto reaction \`{trigger}\` not found — use \`!autoreaction list\` to see all rules"
      autoreaction_list_empty: "No auto reaction rules configured — use \`!autoreaction add\` to create one"
      autoreaction_id_taken: "ID \`{trigger}\` is already in use — choose a different ID"
      autoreaction_too_many_emojis: "Too many emojis — maximum is {count} per rule"
      autoreaction_cooldown_set: "Cooldown for \`{trigger}\` set to **{count}** seconds"
      autoreaction_global_cooldown_set: "Global cooldown for \`{trigger}\` set to **{count}** seconds"
      autoreaction_channel_added: "Channel {channel} added to rule \`{trigger}\`"
      autoreaction_channel_removed: "Channel {channel} removed from rule \`{trigger}\`"
      autoreaction_role_added: "Role {reason} added to rule \`{trigger}\`"
      autoreaction_role_removed: "Role {reason} removed from rule \`{trigger}\`"`,
        schema: [
          { key: "enabled", type: "boolean", default: "true", description: "Master switch — set to false to disable all autoreactions" },
          { key: "ignore_bots", type: "boolean", default: "true", description: "If true, messages from other bots never trigger autoreactions. Recommended to prevent reaction loops." },
          { key: "ignore_self", type: "boolean", default: "true", description: "If true, the bot never reacts to its own messages. Always recommended." },
          { key: "max_emojis_per_rule", type: "number", default: "10", description: "Maximum emojis allowed per rule. Discord supports up to 20 reactions per message." },
          { key: "case_sensitive_default", type: "boolean", default: "false", description: "Default case sensitivity for all rules. Can be overridden per rule with match_case." },
          {
            key: "reactions", type: "array", default: "[]", description: "Static YAML reaction rules. Read-only — these cannot be edited via bot commands.",
            children: [
              { key: "id", type: "string", description: "Unique identifier for the rule (REQUIRED). Used to reference the rule in commands. Must be unique across all rules (YAML + DB)." },
              { key: "trigger", type: "string", description: "Text or regex pattern to match. Leave empty (\"\") with trigger_type: exact to react to every message in a channel." },
              { key: "trigger_type", type: "string", default: "contains", description: "How to match: contains | exact | startswith | endswith | regex" },
              { key: "match_case", type: "boolean", default: "false", description: "If true, the trigger match is case-sensitive. Overrides case_sensitive_default for this rule." },
              { key: "emojis", type: "string[]", description: "List of emojis to add as reactions (REQUIRED). Unicode: \"⭐\", Custom: \"<:name:ID>\", Animated: \"<a:name:ID>\"" },
              { key: "cooldown_seconds", type: "number", default: "0", description: "Per-user cooldown. Same user cannot trigger this rule again until this many seconds have passed. 0 = no cooldown." },
              { key: "global_cooldown_seconds", type: "number", default: "0", description: "Whole-rule cooldown. No one can trigger this rule until this many seconds have passed after the last trigger. 0 = no cooldown." },
              { key: "only_channels", type: "string[]", default: "[]", description: "If set, rule ONLY fires in these channel IDs. Empty list = fires in all channels." },
              { key: "ignore_channels", type: "string[]", default: "[]", description: "Rule never fires in these channel IDs." },
              { key: "only_roles", type: "string[]", default: "[]", description: "If set, rule ONLY fires for users with at least one of these role IDs. Empty list = fires for all users." },
              { key: "ignore_roles", type: "string[]", default: "[]", description: "Rule never fires for users with these role IDs." },
              { key: "ignore_users", type: "string[]", default: "[]", description: "Rule never fires for these specific user IDs." },
              { key: "min_length", type: "number", default: "0", description: "Minimum message character length to trigger. 0 = no minimum." },
              { key: "max_length", type: "number", default: "0", description: "Maximum message character length to trigger. 0 = unlimited." },
              { key: "delete_after_reaction", type: "boolean", default: "false", description: "If true, the triggering message is deleted after reactions are added. Rare use case — requires Manage Messages permission." },
              { key: "enabled", type: "boolean", default: "true", description: "Whether this rule is active." },
            ],
          },
          {
            key: "messages", type: "object", description: "Customize bot response text for all autoreaction commands.",
            children: [
              { key: "autoreaction_added", type: "string", description: "Shown when a rule is created. Variables: {trigger} = trigger text, {reason} = assigned ID, {count} = emoji count" },
              { key: "autoreaction_removed", type: "string", description: "Shown when a rule is deleted. Variables: {trigger} = rule ID" },
              { key: "autoreaction_enabled", type: "string", description: "Shown when a rule is enabled. Variables: {trigger} = rule ID" },
              { key: "autoreaction_disabled", type: "string", description: "Shown when a rule is disabled. Variables: {trigger} = rule ID" },
              { key: "autoreaction_edited", type: "string", description: "Shown when a rule is edited. Variables: {trigger} = rule ID" },
              { key: "autoreaction_not_found", type: "string", description: "Shown when a rule ID is not found. Variables: {trigger} = searched ID" },
              { key: "autoreaction_list_empty", type: "string", description: "Shown when no rules are configured." },
              { key: "autoreaction_id_taken", type: "string", description: "Shown when a chosen ID already exists. Variables: {trigger} = the taken ID" },
              { key: "autoreaction_too_many_emojis", type: "string", description: "Shown when emoji count exceeds the limit. Variables: {count} = max_emojis_per_rule" },
              { key: "autoreaction_cooldown_set", type: "string", description: "Shown after setting per-user cooldown. Variables: {trigger} = rule ID, {count} = seconds" },
              { key: "autoreaction_global_cooldown_set", type: "string", description: "Shown after setting global cooldown. Variables: {trigger} = rule ID, {count} = seconds" },
              { key: "autoreaction_channel_added", type: "string", description: "Shown after adding a channel filter. Variables: {trigger} = rule ID, {channel} = channel mention" },
              { key: "autoreaction_channel_removed", type: "string", description: "Shown after removing a channel filter. Variables: {trigger} = rule ID, {channel} = channel mention" },
              { key: "autoreaction_role_added", type: "string", description: "Shown after adding a role filter. Variables: {trigger} = rule ID, {reason} = role mention" },
              { key: "autoreaction_role_removed", type: "string", description: "Shown after removing a role filter. Variables: {trigger} = rule ID, {reason} = role mention" },
            ],
          },
        ],
        content: `The **Autoreaction** plugin automatically adds emoji reactions to messages when a trigger condition is matched. Unlike autoreply — which sends a new message — autoreaction only reacts to the existing message.

Rules can be defined in two ways: statically in YAML (read-only, great for permanent rules) or dynamically via \`!autoreaction\` commands (stored in the database, fully editable).

---

## Trigger Types

| Type | Behaviour | Example trigger | Matches | Does not match |
|------|-----------|-----------------|---------|----------------|
| \`contains\` | Message contains the string anywhere | \`good morning\` | "say good morning!" ✅ | "goodmorning" ❌ |
| \`exact\` | Entire message equals the string | \`gm\` | "gm" ✅ | "gm everyone" ❌ |
| \`startswith\` | Message starts with the string | \`!vote\` | "!vote yes" ✅ | "please !vote" ❌ |
| \`endswith\` | Message ends with the string | \`??\` | "how do I join??" ✅ | "?? idk" ❌ |
| \`regex\` | Message matches the regex pattern | \`^\\d+$\` | "1234" ✅ | "1234 abc" ❌ |

**Empty trigger with \`exact\`:** setting trigger to \`""\` matches every message. Useful for reacting to everything in a specific channel (combine with \`only_channels\`).

**Regex notes:** patterns are tested against the full message string. Set \`match_case: false\` to add the case-insensitive flag automatically. Escape backslashes in YAML — write \`\\\\d\` for \`\\d\`.

---

## Emoji Formats

| Format | Example | Usage |
|--------|---------|-------|
| Unicode emoji | \`⭐\` \`👍\` \`🎉\` | Standard emoji — works in all servers |
| Custom emoji | \`<:name:123456789012345678>\` | Server emoji — bot must be in the server where it was created |
| Animated emoji | \`<a:name:123456789012345678>\` | Animated server emoji — requires Nitro or server boost |

To get a custom emoji's ID, type \`\\:emojiname:\` in Discord — the bot ID is the number in the resulting string.

---

## Cooldown System

Two independent cooldown timers can be set per rule:

| Cooldown | Field | Behaviour |
|----------|-------|-----------|
| Per-user | \`cooldown_seconds\` | The same user cannot trigger this rule again until the cooldown expires. Other users are unaffected. |
| Global | \`global_cooldown_seconds\` | No one can trigger this rule until the cooldown expires after the last trigger. |

Both can be set simultaneously. Either can be set to \`0\` to disable it. Cooldowns reset on bot restart.

---

## Processing Order

For each message, each enabled rule is evaluated in this order:

1. Check if plugin is enabled
2. Check \`ignore_bots\` — skip if author is a bot
3. Check \`ignore_self\` — skip if author is the bot itself
4. Check \`ignore_channels\` — skip if channel is in the ignore list
5. Check \`only_channels\` — skip if channel is not in the allow list (when set)
6. Check \`ignore_roles\` — skip if user has an ignored role
7. Check \`only_roles\` — skip if user lacks a required role (when set)
8. Check \`ignore_users\` — skip if user is in the ignore list
9. Check \`min_length\` / \`max_length\` — skip if message length is out of range
10. Check global cooldown — skip if rule is on global cooldown
11. Check per-user cooldown — skip if this user is on cooldown for this rule
12. Evaluate trigger match
13. Add all emojis as reactions in order
14. If \`delete_after_reaction: true\`, delete the message

---

## YAML vs Database Rules

| | YAML rules | Database rules |
|-|------------|----------------|
| **Defined in** | Guild config file | Bot database |
| **Created via** | Config file edit | \`!autoreaction add\` |
| **Editable via commands** | ❌ Read-only | ✅ Fully editable |
| **Shown in list** | ✅ (marked 📄) | ✅ |
| **Persist across restarts** | ✅ Always | ✅ Always |
| **Best for** | Permanent, static rules | Dynamic, frequently-changed rules |

Both sources are merged — DB rules and YAML rules both fire simultaneously. IDs must be unique across both sources.

---

## Message Variables

Variables available in \`messages:\` templates:

| Variable | Description |
|----------|-------------|
| \`{trigger}\` | The rule ID (in most response messages) or trigger text (in autoreaction_added) |
| \`{reason}\` | The assigned rule ID (in autoreaction_added) or role mention (in role messages) |
| \`{count}\` | Number of emojis configured (in autoreaction_added) or cooldown seconds (in cooldown messages) |
| \`{channel}\` | Channel mention (in channel filter messages) |

---

## Example Config

\`\`\`yaml
plugins:
  autoreaction:
    enabled: true
    ignore_bots: true
    ignore_self: true
    max_emojis_per_rule: 5
    case_sensitive_default: false

    reactions:

      # React to greetings in all channels
      - id: "good-morning"
        trigger: "good morning"
        trigger_type: "contains"
        match_case: false
        emojis: ["☀️", "👋", "☕"]
        cooldown_seconds: 300
        global_cooldown_seconds: 0
        only_channels: []
        ignore_channels:
          - 123456789012345678   # mod-log
        only_roles: []
        ignore_roles: []
        ignore_users: []
        min_length: 0
        max_length: 0
        enabled: true

      # Up/down vote any message starting with "Suggestion:"
      - id: "suggestion"
        trigger: "suggestion:"
        trigger_type: "startswith"
        match_case: false
        emojis: ["👍", "👎", "🤷"]
        cooldown_seconds: 0
        global_cooldown_seconds: 0
        only_channels:
          - 234567890123456789   # #suggestions only
        ignore_channels: []
        only_roles: []
        ignore_roles: []
        ignore_users: []
        min_length: 12
        max_length: 0
        enabled: true

      # React to every message in #art with stars
      - id: "art-post"
        trigger: ""
        trigger_type: "exact"
        match_case: false
        emojis: ["❤️", "⭐", "🎨"]
        cooldown_seconds: 5
        global_cooldown_seconds: 0
        only_channels:
          - 345678901234567890   # #art only
        ignore_channels: []
        only_roles: []
        ignore_roles: []
        ignore_users: []
        min_length: 0
        max_length: 0
        enabled: true

      # React to counting channel numbers
      - id: "counting-correct"
        trigger: "^\\d+$"
        trigger_type: "regex"
        match_case: false
        emojis: ["✅"]
        cooldown_seconds: 0
        global_cooldown_seconds: 0
        only_channels:
          - 456789012345678901   # #counting only
        ignore_channels: []
        only_roles: []
        ignore_roles: []
        ignore_users: []
        min_length: 1
        max_length: 10
        enabled: true

      # Staff-only approved reaction
      - id: "staff-approved"
        trigger: "approved"
        trigger_type: "contains"
        match_case: false
        emojis: ["✅", "👍"]
        cooldown_seconds: 0
        global_cooldown_seconds: 0
        only_channels: []
        ignore_channels: []
        only_roles:
          - 567890123456789012   # Staff role only
        ignore_roles: []
        ignore_users: []
        min_length: 0
        max_length: 0
        enabled: true

    messages:
      autoreaction_added: "Auto reaction **{trigger}** added | ID: \`{reason}\` | Emojis: {count}"
      autoreaction_removed: "Auto reaction \`{trigger}\` removed"
      autoreaction_not_found: "Auto reaction \`{trigger}\` not found — use \`!autoreaction list\` to see all rules"
      autoreaction_list_empty: "No auto reaction rules configured — use \`!autoreaction add\` to create one"
\`\`\``,
      },

      // ── AUTOCLEAN ────────────────────────────────────────────────────────────
      {
        id: "plugin-autoclean",
        title: "Autoclean",
        type: "plugin",
        configKey: "autoclean",
        defaultConfig: `autoclean:
  enabled: false

  # Optional: channel ID to post autoclean_ran logs to
  # log_channel: 123456789012345678

  channels: []
  # Example rules — uncomment and edit to use:
  #
  # # Wipe #bot-commands every hour
  # - channel: 123456789012345678
  #   mode: "interval"
  #   interval_seconds: 3600
  #   delay_seconds: 1
  #   ignore_pinned: true
  #   ignore_bots: false
  #   ignore_roles: []
  #   ignore_users: []
  #   only_bots: false
  #   only_images: false
  #   only_text: false
  #   min_length: 0
  #   enabled: true
  #
  # # Keep last 50 messages in #starboard
  # - channel: 234567890123456789
  #   mode: "keepx"
  #   keep_count: 50
  #   delay_seconds: 2
  #   ignore_pinned: true
  #   ignore_bots: false
  #   ignore_roles: []
  #   ignore_users: []
  #   enabled: true
  #
  # # Delete messages older than 24 hours in #media
  # - channel: 345678901234567890
  #   mode: "maxage"
  #   max_age_seconds: 86400
  #   delay_seconds: 1
  #   ignore_pinned: true
  #   ignore_bots: false
  #   ignore_roles: []
  #   ignore_users: []
  #   enabled: true

  messages:
    autoclean_added: "Autoclean rule added for {channel} | Mode: {trigger} | Value: {reason}"
    autoclean_removed: "Autoclean rule removed from {channel}"
    autoclean_enabled: "Autoclean enabled for {channel}"
    autoclean_disabled: "Autoclean disabled for {channel}"
    autoclean_updated: "Autoclean rule updated for {channel}"
    autoclean_not_found: "No autoclean rule found for {channel}"
    autoclean_list_empty: "No autoclean rules configured"
    autoclean_ran: "Autoclean completed in {channel} | Deleted: {count} messages | Mode: {trigger}"
    autoclean_now_success: "Manual autoclean complete in {channel} | Deleted: {count} messages"
    autoclean_now_empty: "No messages to delete in {channel}"`,
        schema: [
          { key: "enabled", type: "boolean", default: "false", description: "Enable the autoclean plugin" },
          { key: "log_channel", type: "snowflake", description: "Channel to post autoclean_ran logs after each background cycle that deletes at least one message" },
          {
            key: "channels", type: "array", default: "[]", description: "List of per-channel cleanup rules",
            children: [
              { key: "channel",          type: "snowflake", description: "Channel ID to apply the rule to (required)" },
              { key: "mode",             type: "string",    description: "Cleanup mode: interval | keepx | maxage (required)" },
              { key: "interval_seconds", type: "number",    description: "(interval mode) Seconds between full wipes" },
              { key: "keep_count",       type: "number",    description: "(keepx mode) Number of most-recent messages to keep" },
              { key: "max_age_seconds",  type: "number",    description: "(maxage mode) Delete messages older than this many seconds" },
              { key: "delay_seconds",    type: "number",    default: "0",     description: "Seconds to wait between individual deletions — set to 1–2 for high-traffic channels to avoid rate limits" },
              { key: "ignore_pinned",    type: "boolean",   default: "true",  description: "Never delete pinned messages" },
              { key: "ignore_bots",      type: "boolean",   default: "false", description: "Never delete bot messages" },
              { key: "ignore_roles",     type: "array",     default: "[]",    description: "List of role IDs — messages from users with any of these roles are never deleted" },
              { key: "ignore_users",     type: "array",     default: "[]",    description: "List of user IDs — messages from these specific users are never deleted" },
              { key: "only_bots",        type: "boolean",   default: "false", description: "Only delete bot messages — human messages are never touched" },
              { key: "only_images",      type: "boolean",   default: "false", description: "Only delete messages that have attachments — text-only messages are kept" },
              { key: "only_text",        type: "boolean",   default: "false", description: "Only delete text-only messages — messages with attachments are kept" },
              { key: "min_length",       type: "number",    default: "0",     description: "Skip messages shorter than this many characters (0 = disabled). Useful for preserving longer meaningful messages." },
              { key: "enabled",          type: "boolean",   default: "true",  description: "Toggle this rule without removing it" },
            ],
          },
          {
            key: "messages", type: "object", description: "Customise bot responses. Values can be a plain string or an embed object. Supports variables listed below.",
            children: [
              { key: "autoclean_added",      type: "string | embed", description: "Sent when a rule is created via !autoclean add. Variables: {channel} {channel.mention} {trigger} {reason} {mod} {timestamp}" },
              { key: "autoclean_removed",    type: "string | embed", description: "Sent when a rule is removed. Variables: {channel} {channel.mention} {mod} {timestamp}" },
              { key: "autoclean_enabled",    type: "string | embed", description: "Sent when a rule is enabled. Variables: {channel} {channel.mention}" },
              { key: "autoclean_disabled",   type: "string | embed", description: "Sent when a rule is disabled. Variables: {channel} {channel.mention}" },
              { key: "autoclean_updated",    type: "string | embed", description: "Sent after setdelay / setignorepinned / setignorebots / ignorerole / ignoreuser / setminlength. Variables: {channel} {channel.mention}" },
              { key: "autoclean_not_found",  type: "string | embed", description: "Sent when a command targets a channel with no rule. Variables: {channel} {channel.mention}" },
              { key: "autoclean_list_empty", type: "string | embed", description: "Sent when !autoclean list finds no rules" },
              { key: "autoclean_ran",        type: "string | embed", description: "Posted to log_channel after each background cycle that deletes ≥1 message. Variables: {channel} {channel.mention} {trigger} {count} {failed} {timestamp}" },
              { key: "autoclean_now_success",type: "string | embed", description: "Sent after !autoclean now succeeds. Variables: {channel} {channel.mention} {count} {trigger} {mod} {timestamp}" },
              { key: "autoclean_now_empty",  type: "string | embed", description: "Sent after !autoclean now when nothing was deleted. Variables: {channel} {channel.mention}" },
            ],
          },
        ],
        content: `The **Autoclean** plugin automatically deletes messages in configured channels on a schedule. Rules are created with commands and stored per-channel. Each channel supports its own mode, timing, and set of filters.

## Modes

| Mode | Key field | Checked every | Behaviour |
|------|-----------|--------------|-----------|
| \`interval\` | \`interval_seconds\` | 10 seconds | Wipes all eligible messages in the channel every N seconds |
| \`keepx\` | \`keep_count\` | 60 seconds | Keeps only the N most-recent messages; deletes eligible overflow |
| \`maxage\` | \`max_age_seconds\` | 60 seconds | Deletes every eligible message older than N seconds |

## Common time values

| Seconds | Human time |
|---------|------------|
| 300 | 5 minutes |
| 900 | 15 minutes |
| 1800 | 30 minutes |
| 3600 | 1 hour |
| 7200 | 2 hours |
| 21600 | 6 hours |
| 43200 | 12 hours |
| 86400 | 1 day |
| 172800 | 2 days |
| 259200 | 3 days |
| 604800 | 7 days |
| 1209600 | 14 days |
| 2592000 | 30 days |

## Filters

Filters run on every message before deciding whether to delete it. All active filters must pass for a message to be deleted.

| Filter | Default | Effect |
|--------|---------|--------|
| \`ignore_pinned\` | true | Pinned messages are never deleted |
| \`ignore_bots\` | false | Bot messages are never deleted |
| \`ignore_roles\` | \`[]\` | Messages from users with any listed role are never deleted |
| \`ignore_users\` | \`[]\` | Messages from listed user IDs are never deleted |
| \`only_bots\` | false | Only delete bot messages — human messages are untouched |
| \`only_images\` | false | Only delete messages that have attachments — text-only messages are kept |
| \`only_text\` | false | Only delete text-only messages — messages with attachments are kept |
| \`min_length\` | 0 | Messages shorter than this many characters are never deleted (0 = off) |

> \`only_bots\`, \`only_images\`, and \`only_text\` are mutually exclusive in practice — enabling more than one at a time will usually result in nothing being deleted.

## Common filter combinations

| Goal | Config |
|------|--------|
| Delete only bot responses | \`only_bots: true\` |
| Keep images, delete text spam | \`only_text: true\` |
| Keep text, delete old images/files | \`only_images: true\` |
| Protect staff from cleanup | \`ignore_roles: [staff_role_id]\` |
| Delete only short spam | \`min_length: 50\` |
| Protect a specific user | \`ignore_users: [user_id]\` |

## Discord limitations

- Messages **older than 14 days** cannot be bulk-deleted (Discord restriction). The bot falls back to individual deletion for these, which is slower and more rate-limited.
- The bot fetches up to **100 messages per cycle**. Channels with very high message volume may take several cycles to fully clean.
- Set \`delay_seconds: 1\` or \`2\` on busy channels to avoid hitting Discord's rate limits during individual deletion.

## Logging

If \`log_channel\` is set in the config, the bot posts an \`autoclean_ran\` message there after each background cycle that deletes at least one message. Cycles that delete zero messages are silent. Customise the format under \`messages.autoclean_ran\`.

## Message variables

| Variable | Value |
|----------|-------|
| \`{channel}\` | \`#channel-name\` text |
| \`{channel.mention}\` | \`<#id>\` clickable mention |
| \`{channel.id}\` | Raw channel ID |
| \`{trigger}\` | Cleanup mode (\`interval\` / \`keepx\` / \`maxage\`) |
| \`{reason}\` | Rule value (interval seconds / keep count / max age seconds) |
| \`{count}\` | Number of messages deleted |
| \`{failed}\` | Number of messages that failed to delete |
| \`{mod}\` | Tag of the moderator who ran the command |
| \`{timestamp}\` | Human-readable date/time |

## Example: embed response

\`\`\`yaml
messages:
  autoclean_ran:
    embed:
      title: "🧹 Autoclean Complete"
      color: "#7289DA"
      fields:
        - name: "Channel"
          value: "{channel.mention}"
          inline: true
        - name: "Mode"
          value: "{trigger}"
          inline: true
        - name: "Deleted"
          value: "{count} messages"
          inline: true
      footer: "{timestamp}"

  autoclean_added:
    embed:
      title: "✅ Autoclean Rule Added"
      color: "#00FF00"
      fields:
        - name: "Channel"
          value: "{channel.mention}"
          inline: true
        - name: "Mode"
          value: "{trigger}"
          inline: true
        - name: "Value"
          value: "{reason}"
          inline: true
      footer: "{mod} • {timestamp}"
\`\`\``,
      },

      // ── TICKETS ──────────────────────────────────────────────────────────────
      {
        id: "plugin-tickets",
        title: "Tickets",
        type: "plugin",
        configKey: "tickets",
        defaultConfig: `tickets:
  config:
    # ============================================================
    # PANELS — where the ticket creation button/menu lives
    # Replace channel with the ID of the channel to post the panel in.
    # Right-click a channel in Discord → Copy Channel ID (enable
    # Developer Mode in Discord Settings → Advanced first).
    # ============================================================
    panels:
      main_panel:
        channel: "YOUR_PANEL_CHANNEL_ID"   # ← replace with real channel ID
        message:
          title: "📬 Support Tickets"
          description: "Need help? Click the button below to open a ticket."
          color: "5865F2"
          footer: "Response times may vary"
        button:
          label: "Open Ticket"
          emoji: "📬"
          style: "PRIMARY"
        # OR use a select menu (comment out button, uncomment below):
        # select_menu:
        #   placeholder: "Select a ticket category..."
        #   options:
        #     - label: "General Support"
        #       description: "Questions and general help"
        #       emoji: "❓"
        #       value: "general"

    # ============================================================
    # CATEGORIES — defines each ticket type
    # channel_category: ID of the Discord category channel to create
    #   ticket channels under (optional — remove the line to skip).
    # support_roles: list of role IDs that can see all ticket channels.
    #   Right-click a role in Server Settings → Roles → Copy Role ID.
    #   Leave as [] if you have no support roles yet.
    # ping_roles: roles pinged when a ticket opens (optional).
    # ============================================================
    categories:
      general:
        name: "General Support"
        channel_name: "ticket-{username}-{number}"
        # channel_category: "YOUR_CATEGORY_ID"   # optional — uncomment and replace
        ping_roles: []           # e.g. ["123456789012345678"]
        support_roles: []        # e.g. ["123456789012345678", "987654321098765432"]
        max_open_per_user: 1
        cooldown: "5m"
        auto_close_after: "48h"
        auto_close_warning: "6h"
        welcome_message:
          title: "👋 Ticket Opened"
          description: "Hello {userMention}, thanks for opening a ticket!\\n\\nA member of our team will be with you shortly."
          color: "57F287"
          footer: "Ticket #{number} | {timestamp}"
        opening_form:
          enabled: false
          questions:
            - label: "What is your issue?"
              placeholder: "Describe your issue in detail..."
              style: paragraph
              required: true
              max_length: 1000

    # ============================================================
    # TICKET CHANNEL BUTTONS
    # ============================================================
    buttons:
      close:
        enabled: true
        label: "Close Ticket"
        emoji: "🔒"
        style: "DANGER"
        require_reason: true
        reason_placeholder: "Why are you closing this ticket?"
        confirm: true
        confirm_message: "Are you sure you want to close this ticket?"
      claim:
        enabled: true
        label: "Claim Ticket"
        emoji: "✋"
        style: "PRIMARY"
        restrict_on_claim: false
      unclaim:
        enabled: true
        label: "Unclaim"
        emoji: "↩️"
        style: "SECONDARY"
      add_user:
        enabled: true
        label: "Add User"
        emoji: "➕"
        style: "SECONDARY"
      remove_user:
        enabled: true
        label: "Remove User"
        emoji: "➖"
        style: "SECONDARY"
      transcript:
        enabled: true
        label: "Save Transcript"
        emoji: "📄"
        style: "SECONDARY"

    # ============================================================
    # CLOSE SETTINGS
    # ============================================================
    close:
      action: "archive"
      # archive_category: "YOUR_CATEGORY_ID"   # optional — Discord category to move closed tickets into
      delete_after: "24h"
      dm_on_close: true
      dm_message:
        title: "🔒 Ticket Closed"
        description: "Your ticket **#{number}** in **{guild}** has been closed.\\n\\n**Closed by:** {moderator}\\n**Reason:** {reason}"
        color: "ED4245"
        footer: "{timestamp}"
      send_transcript_on_close: true
      close_message:
        title: "🔒 Ticket Closed"
        description: "This ticket has been closed by {moderator}.\\n**Reason:** {reason}\\n\\nThis channel will be deleted in {deleteAfter}."
        color: "ED4245"

    # ============================================================
    # TRANSCRIPTS
    # ============================================================
    transcripts:
      enabled: true
      channel: "YOUR_TRANSCRIPT_CHANNEL_ID"   # ← replace with real channel ID
      format: "html"
      include_attachments: true
      message:
        title: "📄 Ticket Transcript"
        description: "**Ticket:** #{number}\\n**Category:** {category}\\n**Opened by:** {userMention}\\n**Closed by:** {moderator}\\n**Duration:** {duration}"
        color: "5865F2"
        footer: "{timestamp}"

    # ============================================================
    # FEEDBACK — ask user to rate support after close
    # ============================================================
    feedback:
      enabled: true
      dm_user: true
      channel: "YOUR_FEEDBACK_CHANNEL_ID"   # ← replace with real channel ID
      dm_message:
        title: "⭐ How was your support experience?"
        description: "Please rate your experience with ticket **#{number}**."
        color: "FEE75C"
      ratings:
        - emoji: "⭐"
          label: "1 - Very Poor"
          value: 1
        - emoji: "⭐⭐"
          label: "2 - Poor"
          value: 2
        - emoji: "⭐⭐⭐"
          label: "3 - Average"
          value: 3
        - emoji: "⭐⭐⭐⭐"
          label: "4 - Good"
          value: 4
        - emoji: "⭐⭐⭐⭐⭐"
          label: "5 - Excellent"
          value: 5
      result_message:
        title: "⭐ Feedback Received"
        description: "**Ticket:** #{number}\\n**User:** {userMention}\\n**Rating:** {rating}"
        color: "FEE75C"

    # ============================================================
    # LOGGING
    # ============================================================
    logging:
      channel: "YOUR_LOG_CHANNEL_ID"   # ← replace with real channel ID
      events:
        ticket_open: true
        ticket_close: true
        ticket_claim: true
        ticket_unclaim: true
        ticket_add_user: true
        ticket_remove_user: true
        ticket_transcript: true
        ticket_auto_close: true
        ticket_delete: true
      messages:
        ticket_open:
          title: "📬 Ticket Opened"
          description: "**Ticket:** #{number}\\n**Category:** {category}\\n**Opened by:** {userMention}\\n**Channel:** {channel}"
          color: "57F287"
        ticket_close:
          title: "🔒 Ticket Closed"
          description: "**Ticket:** #{number}\\n**Closed by:** {moderator}\\n**Reason:** {reason}\\n**Duration:** {duration}"
          color: "ED4245"
        ticket_claim:
          title: "✋ Ticket Claimed"
          description: "**Ticket:** #{number}\\n**Claimed by:** {moderator}\\n**Channel:** {channel}"
          color: "5865F2"
        ticket_unclaim:
          title: "↩️ Ticket Unclaimed"
          description: "**Ticket:** #{number}\\n**Unclaimed by:** {moderator}\\n**Channel:** {channel}"
          color: "FEE75C"
        ticket_add_user:
          title: "➕ User Added"
          description: "**Ticket:** #{number}\\n**Added by:** {moderator}\\n**User:** {userMention}"
          color: "57F287"
        ticket_remove_user:
          title: "➖ User Removed"
          description: "**Ticket:** #{number}\\n**Removed by:** {moderator}\\n**User:** {userMention}"
          color: "ED4245"
        ticket_auto_close:
          title: "⏰ Ticket Auto-Closed"
          description: "**Ticket:** #{number}\\n**Reason:** No activity for {duration}\\n**Channel:** {channel}"
          color: "FEE75C"
        ticket_delete:
          title: "🗑️ Ticket Deleted"
          description: "**Ticket:** #{number}\\n**Deleted by:** {moderator}"
          color: "ED4245"

    # ============================================================
    # COMMANDS
    # ============================================================
    commands:
      prefix: "ticket"
      allowed_roles: ["SUPPORT_ROLE_ID", "MOD_ROLE_ID", "ADMIN_ROLE_ID"]`,

        schema: [
          {
            key: "tickets.config.panels",
            type: "object",
            description: "Map of panel names to panel configs. Each panel posts an embed with a button or select menu to a channel.",
            children: [
              { key: "channel", type: "snowflake", description: "Channel ID where the panel embed is posted." },
              { key: "message.title", type: "string", description: "Panel embed title." },
              { key: "message.description", type: "string", description: "Panel embed description." },
              { key: "message.color", type: "string", description: "Hex color string (e.g. '5865F2') for the embed sidebar." },
              { key: "message.footer", type: "string", description: "Embed footer text." },
              { key: "message.thumbnail", type: "string", description: "Optional thumbnail image URL for the embed." },
              { key: "message.image", type: "string", description: "Optional banner image URL for the embed." },
              { key: "button.label", type: "string", description: "Label on the open-ticket button." },
              { key: "button.emoji", type: "string", description: "Emoji shown on the button." },
              { key: "button.style", type: "PRIMARY | SECONDARY | SUCCESS | DANGER", default: "PRIMARY", description: "Discord button color style." },
              { key: "select_menu.placeholder", type: "string", description: "Placeholder text shown in the dropdown before selection." },
              { key: "select_menu.options[].label", type: "string", description: "Display label for this option." },
              { key: "select_menu.options[].description", type: "string", description: "Short description shown under the label." },
              { key: "select_menu.options[].emoji", type: "string", description: "Emoji shown next to the option." },
              { key: "select_menu.options[].value", type: "string", description: "The category key this option maps to (must match a key in categories)." },
            ],
          },
          {
            key: "tickets.config.categories",
            type: "object",
            description: "Map of category keys to category configs. Each category defines a ticket type with its own channel, roles, and behaviour.",
            children: [
              { key: "name", type: "string", description: "Human-readable name for this ticket type." },
              { key: "channel_name", type: "string", default: "ticket-{username}-{number}", description: "Channel name pattern. Supports: {username}, {number} (zero-padded 4 digits), {category}, {timestamp}." },
              { key: "channel_category", type: "snowflake", description: "Discord category ID where new ticket channels are created." },
              { key: "ping_roles", type: "snowflake[]", default: "[]", description: "Role IDs to @ping in the ticket channel when it is first opened." },
              { key: "support_roles", type: "snowflake[]", default: "[]", description: "Role IDs that have read/send access to all ticket channels in this category." },
              { key: "max_open_per_user", type: "number", default: "1", description: "Max simultaneous open tickets per user in this category. Set to 0 for unlimited." },
              { key: "cooldown", type: "duration", default: "0", description: "Minimum time a user must wait between opening tickets in this category (e.g. '5m', '1h')." },
              { key: "auto_close_after", type: "duration", default: "0", description: "Automatically close the ticket after this period of inactivity. Set to '0' to disable." },
              { key: "auto_close_warning", type: "duration", default: "0", description: "Send a warning message this long before auto-close triggers." },
              { key: "welcome_message.title", type: "string", description: "Title of the embed posted when the ticket opens." },
              { key: "welcome_message.description", type: "string", description: "Description of the welcome embed. Supports all placeholders." },
              { key: "welcome_message.color", type: "string", description: "Hex color for the welcome embed." },
              { key: "welcome_message.footer", type: "string", description: "Footer text for the welcome embed." },
              { key: "opening_form.enabled", type: "boolean", default: "false", description: "When true, a Discord modal form is shown before the ticket channel is created." },
              { key: "opening_form.questions[].label", type: "string", description: "Question label shown in the modal (max 45 characters)." },
              { key: "opening_form.questions[].placeholder", type: "string", description: "Placeholder hint text inside the input field (max 100 characters)." },
              { key: "opening_form.questions[].style", type: "short | paragraph", default: "short", description: "Input style: short = single line, paragraph = multi-line text box." },
              { key: "opening_form.questions[].required", type: "boolean", default: "false", description: "Whether the user must fill in this field before submitting." },
              { key: "opening_form.questions[].max_length", type: "number", description: "Maximum character length for this field." },
            ],
          },
          {
            key: "tickets.config.buttons",
            type: "object",
            description: "Controls which buttons appear in every ticket channel and their appearance/behaviour.",
            children: [
              { key: "close.enabled", type: "boolean", default: "true", description: "Show the Close Ticket button." },
              { key: "close.label", type: "string", default: "Close Ticket", description: "Button label." },
              { key: "close.emoji", type: "string", default: "🔒", description: "Button emoji." },
              { key: "close.style", type: "PRIMARY | SECONDARY | SUCCESS | DANGER", default: "DANGER", description: "Button color style." },
              { key: "close.require_reason", type: "boolean", default: "false", description: "When true, clicking Close opens a modal asking for a reason before proceeding." },
              { key: "close.reason_placeholder", type: "string", description: "Placeholder text inside the reason modal input." },
              { key: "close.confirm", type: "boolean", default: "false", description: "When true, the user must confirm with a second button click before the ticket is closed." },
              { key: "close.confirm_message", type: "string", description: "Message shown in the confirmation prompt." },
              { key: "claim.enabled", type: "boolean", default: "true", description: "Show the Claim Ticket button." },
              { key: "claim.restrict_on_claim", type: "boolean", default: "false", description: "When true, claiming removes other support roles' access so only the claimant and admins can see the ticket." },
              { key: "unclaim.enabled", type: "boolean", default: "true", description: "Show the Unclaim button." },
              { key: "add_user.enabled", type: "boolean", default: "true", description: "Show the Add User button. Opens a modal to enter a user ID." },
              { key: "remove_user.enabled", type: "boolean", default: "true", description: "Show the Remove User button. Opens a modal to enter a user ID." },
              { key: "transcript.enabled", type: "boolean", default: "true", description: "Show the Save Transcript button." },
            ],
          },
          {
            key: "tickets.config.close",
            type: "object",
            description: "Controls what happens when a ticket is closed.",
            children: [
              { key: "action", type: "archive | delete", default: "archive", description: "archive = move to archive_category and lock. delete = delete the channel immediately." },
              { key: "archive_category", type: "snowflake", description: "Category ID to move closed ticket channels to (used when action is archive)." },
              { key: "delete_after", type: "duration", default: "0", description: "If action is archive, automatically delete the channel after this duration. '0' = never delete." },
              { key: "dm_on_close", type: "boolean", default: "true", description: "DM the ticket opener when their ticket is closed." },
              { key: "dm_message", type: "embed", description: "Embed sent to the opener via DM. Supports: {number}, {guild}, {moderator}, {reason}, {timestamp}." },
              { key: "send_transcript_on_close", type: "boolean", default: "true", description: "Attach the transcript file to the DM sent to the opener on close." },
              { key: "close_message", type: "embed", description: "Embed posted in the ticket channel when it is closed. Supports: {moderator}, {reason}, {deleteAfter}." },
            ],
          },
          {
            key: "tickets.config.transcripts",
            type: "object",
            description: "Controls transcript generation and delivery.",
            children: [
              { key: "enabled", type: "boolean", default: "true", description: "Enable transcript generation." },
              { key: "channel", type: "snowflake", description: "Channel where transcripts are posted on ticket close." },
              { key: "format", type: "html | txt", default: "txt", description: "html = styled HTML file with avatars and colored embeds. txt = plain text file." },
              { key: "include_attachments", type: "boolean", default: "true", description: "Include attachment URLs in the transcript." },
              { key: "message", type: "embed", description: "Embed posted alongside the transcript file in the transcript channel. Supports: {number}, {category}, {userMention}, {userId}, {moderator}, {duration}, {count}, {timestamp}." },
            ],
          },
          {
            key: "tickets.config.feedback",
            type: "object",
            description: "After a ticket closes, optionally DM the opener a star-rating select menu.",
            children: [
              { key: "enabled", type: "boolean", default: "false", description: "Enable the post-close feedback system." },
              { key: "dm_user", type: "boolean", default: "true", description: "Send the rating select menu to the opener via DM." },
              { key: "channel", type: "snowflake", description: "Channel where feedback results are posted." },
              { key: "dm_message", type: "embed", description: "Embed sent to the opener asking for a rating. Supports: {number}." },
              { key: "ratings[].emoji", type: "string", description: "Emoji shown for this rating option." },
              { key: "ratings[].label", type: "string", description: "Label shown for this rating option." },
              { key: "ratings[].value", type: "number", description: "Numeric rating value (e.g. 1–5)." },
              { key: "result_message", type: "embed", description: "Embed posted to feedback.channel when a user submits a rating. Supports: {number}, {userMention}, {rating}." },
            ],
          },
          {
            key: "tickets.config.logging",
            type: "object",
            description: "Log ticket lifecycle events to a channel.",
            children: [
              { key: "channel", type: "snowflake", description: "Channel where all ticket log events are sent." },
              { key: "events.ticket_open", type: "boolean", default: "true", description: "Log when a ticket is opened." },
              { key: "events.ticket_close", type: "boolean", default: "true", description: "Log when a ticket is closed." },
              { key: "events.ticket_claim", type: "boolean", default: "true", description: "Log when a ticket is claimed." },
              { key: "events.ticket_unclaim", type: "boolean", default: "true", description: "Log when a ticket is unclaimed." },
              { key: "events.ticket_add_user", type: "boolean", default: "true", description: "Log when a user is added." },
              { key: "events.ticket_remove_user", type: "boolean", default: "true", description: "Log when a user is removed." },
              { key: "events.ticket_transcript", type: "boolean", default: "true", description: "Log when a transcript is generated." },
              { key: "events.ticket_auto_close", type: "boolean", default: "true", description: "Log when a ticket is auto-closed for inactivity." },
              { key: "events.ticket_delete", type: "boolean", default: "true", description: "Log when a ticket is permanently deleted." },
              { key: "messages.<event_key>", type: "embed", description: "Custom embed for each event. Keys match the events map. Supports all standard placeholders." },
            ],
          },
          {
            key: "tickets.config.commands",
            type: "object",
            description: "Controls who can run ticket management commands.",
            children: [
              { key: "prefix", type: "string", default: "ticket", description: "The command trigger word (the bot's global prefix + this word)." },
              { key: "allowed_roles", type: "snowflake[]", default: "[]", description: "Role IDs permitted to run ticket management commands. Guild owner and level 50+ always have access." },
            ],
          },
        ],


        content: `The **Tickets** plugin is a fully YAML-driven support ticket system. All configuration — panels, categories, buttons, close behaviour, transcripts, feedback, and logging — is defined in your guild YAML config under the \`tickets.config\` key. There are no separate database-based panel records; the YAML is the single source of truth.

## Architecture Overview

\`\`\`
tickets:
  config:
    panels:      ← where ticket creation UIs are posted
    categories:  ← defines each ticket type and its behaviour
    buttons:     ← controls the buttons shown inside every ticket channel
    close:       ← controls what happens on close
    transcripts: ← controls transcript generation and delivery
    feedback:    ← post-close star rating system
    logging:     ← which events to log and where
    commands:    ← staff command permissions
\`\`\`

## Ticket Creation Flow

1. **Panel post** — Run \`!ticket panel post <name>\`. The bot reads the panel config from YAML and posts an embed with either a button or a select menu to the configured channel. The message ID is stored in the database so the panel survives bot restarts.

2. **User clicks button / selects from menu** — The bot looks up the matching category key.

3. **Opening form (optional)** — If \`opening_form.enabled: true\`, a Discord modal pops up with the configured questions. The answers are attached to the welcome embed as fields.

4. **Channel creation** — A new private text channel is created inside the \`channel_category\` with the name derived from the \`channel_name\` pattern (e.g. \`ticket-john-0042\`).

5. **Permissions** — The opener gets read/send access. Every role in \`support_roles\` gets read/send/manage-messages access. Everyone else is blocked.

6. **Welcome embed + buttons** — The bot posts the \`welcome_message\` embed along with the configured button row (Close, Claim, Unclaim, Add User, Remove User, Transcript).

7. **Ping** — Roles in \`ping_roles\` are @mentioned in the channel.

8. **Logging** — A \`ticket_open\` log event is sent to \`logging.channel\`.

## Ticket Numbering

Tickets are numbered per-guild, auto-incrementing, and zero-padded to 4 digits (e.g. \`0001\`, \`0042\`, \`1337\`). Numbers never reset.

## Channel Name Patterns

The \`channel_name\` field supports these placeholders:

| Placeholder | Value |
|-------------|-------|
| \`{username}\` | Opener's Discord username (sanitised, max 20 chars) |
| \`{number}\` | 4-digit zero-padded ticket number |
| \`{category}\` | Category name (sanitised, max 15 chars) |
| \`{timestamp}\` | Date in YYYY-MM-DD format |

## Close Flow

When a ticket is closed (via button or \`!ticket close\`):

1. If \`close.require_reason: true\` → show reason modal
2. If \`close.confirm: true\` → show confirmation buttons
3. Generate transcript (html or txt based on \`transcripts.format\`)
4. Post \`close.close_message\` embed in the ticket channel
5. If \`close.dm_on_close: true\` → DM the opener with \`close.dm_message\` (+ transcript if \`send_transcript_on_close: true\`)
6. Post transcript to \`transcripts.channel\`
7. If \`feedback.enabled: true\` → DM opener a star-rating select menu
8. If \`close.action: archive\` → move channel to \`archive_category\`, lock opener out, rename to \`closed-…\`. Schedule deletion after \`delete_after\` if set.
9. If \`close.action: delete\` → delete the channel after a short delay.
10. Send \`ticket_close\` log event.

## Auto-Close System

A background job runs every 10 minutes. For each open ticket, it checks the time since the last message was sent. If inactivity exceeds \`auto_close_warning\` time remaining, a warning is posted in the channel. When inactivity reaches \`auto_close_after\`, the ticket is automatically closed using the same close flow.

Set \`auto_close_after: "0"\` (or omit it) to disable for a category.

## Transcript Formats

| Format | Description |
|--------|-------------|
| \`txt\` | Plain text file with header block and all messages chronologically |
| \`html\` | Styled HTML file with user avatars, colored embed blocks, attachment links, and a dark-mode Discord-like design |

## Claim System

When a staff member claims a ticket (button or \`!ticket claim\`), an embed is posted in the channel showing who claimed it. If \`claim.restrict_on_claim: true\`, all other support role overwrites are removed from the channel — only the claimer and admin-level roles keep access.

## Feedback System

After a ticket closes, if \`feedback.enabled: true\` and \`feedback.dm_user: true\`, the opener receives a DM with a star-rating dropdown (⭐–⭐⭐⭐⭐⭐). When they respond, the result is posted to \`feedback.channel\` using the \`result_message\` embed template.

## Reopen Flow

\`!ticket reopen\` (level 25+) — moves the channel back to its original category, restores the opener's read/send permissions, renames the channel back to the ticket name pattern, and posts a reopen embed.

## Stats Command

\`!ticket stats\` shows server-wide totals: total tickets ever opened, currently open, closed/archived, average time to close, and the busiest category.

\`!ticket stats @user\` shows that specific user's ticket history: total opened, how many are currently open, and how many are closed.

## Placeholders Reference

Available in all embed \`title\`, \`description\`, and \`footer\` fields:

| Placeholder | Value |
|-------------|-------|
| \`{user}\` | Opener's username |
| \`{userId}\` | Opener's Discord user ID |
| \`{userTag}\` | Opener's username#discriminator |
| \`{userMention}\` | @mention of the opener |
| \`{moderator}\` | Tag of the staff member who performed the action |
| \`{number}\` | 4-digit zero-padded ticket number |
| \`{category}\` | Ticket category name |
| \`{channel}\` | #mention of the ticket channel |
| \`{guild}\` | Server name |
| \`{reason}\` | Close/action reason |
| \`{timestamp}\` | Formatted UTC date-time |
| \`{duration}\` | How long the ticket was open |
| \`{count}\` | Message count |
| \`{rating}\` | Feedback star rating |
| \`{deleteAfter}\` | Configured time until channel deletion |

## Database Tables

The ticket system uses three SQL tables created automatically on startup:

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| \`tickets\` | id, guild_id, number, category_key, channel_id, opener_id, claimer_id, status, open_at, close_at, close_reason, transcript_url | One row per ticket |
| \`ticket_participants\` | ticket_id, user_id | Tracks every user added to a ticket |
| \`ticket_feedback\` | ticket_id, user_id, rating, comment | Stores post-close feedback ratings |`,
      },

      // ── MOD NICK ─────────────────────────────────────────────────────────────
      {
        id: "plugin-modnick",
        title: "Mod Nick",
        type: "plugin",
        configKey: "modnick",
        content: `The **Mod Nick** plugin automatically enforces nickname rules server-wide. When a violation is detected the offending nickname is replaced, optionally logged, and the member can be DM'd. The plugin fires on every nickname change and every server join — no manual intervention needed.

## Common Setup Mistake

The config key is **\`plugins:\`** (with an **s**). Writing \`plugin:\` (no s) is the most common reason modnick appears to do nothing — the bot simply can't find the config. The bot will log a warning if it detects this typo, but the correct fix is to rename the key.

**Wrong:**
\`\`\`yaml
plugin:       ← no s
  modnick:
    enabled: true
\`\`\`

**Correct:**
\`\`\`yaml
plugins:      ← with s
  modnick:
    enabled: true
\`\`\`

## Why Isn't It Working?

If modnick is enabled but nothing happens, check these in order:

1. **YAML key typo** — must be \`plugins:\` not \`plugin:\`
2. **Guild owner** — Discord does not allow any bot to change the guild owner's nickname. This is a Discord limitation and cannot be bypassed.
3. **Role hierarchy** — the bot's highest role must be above the target member's highest role. Move the bot's role higher in Server Settings → Roles.
4. **Missing permission** — the bot needs the **Manage Nicknames** permission in your server.
5. **Cache delay** — config changes have a 30-second cache TTL. Wait 30 seconds after saving your YAML before testing.

## How It Works

The bot checks nicknames on three occasions automatically:

- **Nickname change** — any time a member updates their nickname (\`guildMemberUpdate\`)
- **Server join** — when a new member joins (\`guildMemberAdd\`)
- **Manual command** — staff can also trigger a check on demand with \`!modnick @user\`

Rules are evaluated **in order**. The first rule that matches wins — only one replacement is made per check.

## How \`random_names\` Works

When \`random_names\` is populated, the bot picks randomly from the list instead of always assigning \`default_name\`. This means if several members get moderated at the same time they won't all end up with identical nicknames — making it easier for staff to tell them apart in the member list.

## Rule Processing Order

| Order | Rule | What it catches |
|-------|------|----------------|
| 1 | \`hoist\` | Special characters at the start of a nickname used to sort to the top of the member list |
| 2 | \`blank\` | Empty or invisible-only nicknames |
| 3 | \`unreadable\` | Nicknames made almost entirely of unreadable unicode symbols |
| 4 | \`zalgo\` | Corrupted "glitch" text created by stacking combining diacritical characters |
| 5 | \`bad_words\` | Prohibited words including l33tspeak variants |
| 6 | \`impersonation\` | Names similar to protected staff or protected accounts |
| 7 | \`mass_mentions\` | @ symbols designed to fake pings |
| 8 | \`excessive_special_chars\` | Overloaded non-letter characters |
| 9 | \`too_long\` | Over the configured length |
| 10 | \`custom_patterns\` | Your own regex patterns |

## Action Types

| Type | What happens |
|------|-------------|
| \`rename\` | Nickname is replaced. No case created unless \`warn_on_rename\` is true |
| \`warn\` | Nickname is replaced AND a warning case is created automatically |
| \`mute\` | Nickname is replaced AND the user is muted for \`mute_duration\` |
| \`log\` | Nickname is NOT changed — only logged. Useful for monitoring before enforcing |

## Bypass System

Bypass is checked before any rules run. A member is skipped entirely if any of the following apply:

- Their user ID is in \`bypass_users\`
- They have any role in \`bypass_roles\`
- \`staff_bypass: true\` and they have a staff level of 50 or higher

## Message Variables

| Variable | Value |
|----------|-------|
| \`{user}\` | Member mention |
| \`{user.id}\` | Member user ID |
| \`{user.avatar}\` | Member avatar URL |
| \`{server}\` | Server name |
| \`{trigger}\` | The old (violating) nickname |
| \`{reason}\` | The new (enforced) nickname |
| \`{count}\` | The rule that triggered (e.g. \`hoist\`, \`zalgo\`) |
| \`{timestamp}\` | Current timestamp |

## Case-Sensitive Matching

By default, **\`bad_words\`** and **\`custom_patterns\`** match without regard to letter casing — \`admin\`, \`Admin\`, and \`ADMIN\` are all treated the same. Set \`case_sensitive: true\` on either rule if you need to match an exact casing only:

\`\`\`yaml
rules:
  bad_words:
    enabled: true
    custom_words: ["OwnerOnly"]
    case_sensitive: true   # only flags "OwnerOnly" exactly — not "owneronly" or "OWNERONLY"

  custom_patterns:
    enabled: true
    patterns: ["^VIP-"]
    case_sensitive: true   # only flags names starting with "VIP-", not "vip-" or "Vip-"
\`\`\`

This is useful when a specific casing is reserved for staff-assigned nicknames (e.g. a "VIP-" prefix that only staff apply) and you don't want the rule to also catch members who happen to type the same letters in lowercase. \`whole_word_only\` and l33tspeak \`normalize_map\` substitution still apply on top of case-sensitive matching for \`bad_words\`.

Other rules (\`impersonation\`, \`mass_mentions\`, \`hoist\`, etc.) remain case-insensitive — case sensitivity only applies to \`bad_words\` and \`custom_patterns\`, since those are the only two rules built from staff-supplied text.`,
        schema: [
          { key: "enabled", type: "boolean", default: "false", description: "Enable the modnick plugin" },
          { key: "default_name", type: "string", default: '"Moderated Nickname"', description: "Nickname applied when a rule violation is detected. Used when random_names is empty or exhausted. Max 32 characters." },
          { key: "random_names", type: "string[]", default: "[]", description: "If populated, a random name from this list is used instead of default_name. Each name must be 32 characters or less." },
          { key: "log_changes", type: "boolean", default: "true", description: "Send nickname changes to the logging channel configured in plugins.logging.channels.members" },
          { key: "dm_on_change", type: "boolean", default: "true", description: "DM the user when their nickname is auto-moderated. DM failures are always silent." },
          { key: "recheck_on_rejoin", type: "boolean", default: "true", description: "Recheck nickname when a member rejoins. Prevents bypass by leaving and rejoining with a new bad nickname." },
          { key: "recheck_on_boost", type: "boolean", default: "false", description: "Recheck nickname when a member boosts the server. Set to false if boosters are granted nickname freedom." },
          { key: "staff_bypass", type: "boolean", default: "false", description: "Users with a staff level of 50 or higher bypass all modnick rules entirely." },
          { key: "bypass_roles", type: "snowflake[]", default: "[]", description: "Role IDs that bypass all modnick rules. Users with any of these roles can have any nickname." },
          { key: "bypass_users", type: "snowflake[]", default: "[]", description: "Specific user IDs that bypass all modnick rules." },
          {
            key: "rules", type: "object", description: "Detection rules — checked in order, first match wins",
            children: [
              { key: "rules.hoist.enabled", type: "boolean", default: "true", description: "Detect nicknames starting with special characters used to hoist to the top of the member list" },
              { key: "rules.hoist.hoist_characters", type: "string[]", default: "[]", description: "Characters that trigger hoist detection at the start of a nickname. Empty = use the default set (! \" # $ % & ( ) * + , - . / : ; = ? @ [ \\ ] ^ _ ` { | } ~)" },
              { key: "rules.hoist.allow_emoji_start", type: "boolean", default: "false", description: "If true, nicknames starting with a unicode emoji are allowed even if other hoist characters are blocked" },
              { key: "rules.blank.enabled", type: "boolean", default: "true", description: "Detect nicknames that are empty, only whitespace, or only invisible/zero-width unicode characters" },
              { key: "rules.blank.invisible_characters", type: "string[]", default: "[\\u200B, \\u200C, \\u200D, \\u2060, \\uFEFF, \\u00AD, \\u180E, \\u2800]", description: "Unicode codepoints treated as blank in addition to spaces and whitespace" },
              { key: "rules.unreadable.enabled", type: "boolean", default: "true", description: "Detect nicknames made almost entirely of unreadable unicode symbols (box-drawing, block elements, etc.)" },
              { key: "rules.unreadable.min_readable_ratio", type: "number", default: "0.3", description: "Minimum ratio of readable characters required (0.0–1.0). Below this the nickname is flagged." },
              { key: "rules.unreadable.allow_unicode_names", type: "boolean", default: "false", description: "If true, names in non-Latin scripts (Chinese, Arabic, Cyrillic, etc.) pass even if they fail the readable ratio. Enable for international servers." },
              { key: "rules.zalgo.enabled", type: "boolean", default: "true", description: "Detect 'corrupted' glitch text created by stacking combining diacritical marks" },
              { key: "rules.zalgo.max_combining_chars", type: "number", default: "4", description: "Maximum combining characters allowed per base character. Normal accented letters use 1–2; zalgo uses 5–50+. Recommended: 3–5." },
              { key: "rules.bad_words.enabled", type: "boolean", default: "true", description: "Cross-reference the nickname against a word list with case-insensitive substring matching and l33tspeak normalization" },
              { key: "rules.bad_words.use_automod_wordlist", type: "boolean", default: "true", description: "Also use the word list from plugins.automod.bad_words.words in addition to custom_words" },
              { key: "rules.bad_words.custom_words", type: "string[]", default: "[]", description: "Additional words to check specifically for nicknames (e.g. admin, staff, owner)" },
              { key: "rules.bad_words.normalize_map", type: "object", default: '{"0":"o","1":"i","3":"e","4":"a","5":"s","7":"t","@":"a","$":"s","!":"i"}', description: "L33tspeak substitution map applied before word-list matching. Catches variants like 4dm1n → admin." },
              { key: "rules.bad_words.whole_word_only", type: "boolean", default: "false", description: "If true, only flags when the bad word is a complete word. If false, flags any substring match." },
              { key: "rules.bad_words.case_sensitive", type: "boolean", default: "false", description: "If true, words are matched with exact casing (e.g. 'Admin' no longer also matches 'admin' or 'ADMIN'). Leave false for the normal case-insensitive behavior." },
              { key: "rules.impersonation.enabled", type: "boolean", default: "false", description: "Detect nicknames that closely match protected names or specific users' display names" },
              { key: "rules.impersonation.protected_names", type: "string[]", default: "[]", description: "Exact names or display names that are protected. Comparison is case-insensitive with normalize_map applied." },
              { key: "rules.impersonation.protected_users", type: "snowflake[]", default: "[]", description: "User IDs whose current usernames/display names are automatically protected" },
              { key: "rules.impersonation.similarity_threshold", type: "number", default: "0.85", description: "How similar a nickname must be to a protected name to trigger (0.0–1.0). 0.85 = 85% similar." },
              { key: "rules.mass_mentions.enabled", type: "boolean", default: "false", description: "Detect nicknames containing @ symbols designed to fake pings or @everyone / @here attempts" },
              { key: "rules.mass_mentions.block_at_symbol", type: "boolean", default: "true", description: "If true, any @ symbol in a nickname triggers this rule. If false, only @everyone and @here are blocked." },
              { key: "rules.excessive_special_chars.enabled", type: "boolean", default: "false", description: "Detect nicknames overloaded with special characters that make them hard to read or ping" },
              { key: "rules.excessive_special_chars.max_special_ratio", type: "number", default: "0.5", description: "Maximum ratio of special characters allowed (0.0–1.0). 0.5 = no more than 50% can be special chars." },
              { key: "rules.excessive_special_chars.allowed_special_chars", type: "string", default: '"-_. "', description: "Characters not counted as special (hyphen, underscore, period, space). Everything else counts as special." },
              { key: "rules.too_long.enabled", type: "boolean", default: "false", description: "Enforce a shorter maximum nickname length than Discord's 32-character limit" },
              { key: "rules.too_long.max_length", type: "number", default: "25", description: "Maximum nickname length in characters. Must be 32 or less." },
              { key: "rules.custom_patterns.enabled", type: "boolean", default: "false", description: "Test each nickname against a list of custom regex patterns" },
              { key: "rules.custom_patterns.patterns", type: "string[]", default: "[]", description: "List of regex pattern strings tested against the full nickname (e.g. discord\\.gg, https?://)" },
              { key: "rules.custom_patterns.case_sensitive", type: "boolean", default: "false", description: "If true, patterns are evaluated with exact casing instead of case-insensitively." },
            ],
          },
          {
            key: "action", type: "object", description: "What happens when a rule is triggered",
            children: [
              { key: "action.type", type: "rename | warn | mute | log", default: "rename", description: "rename = replace nickname only; warn = replace + create warning case; mute = replace + mute user; log = log only, do not change nickname" },
              { key: "action.warn_on_rename", type: "boolean", default: "false", description: "When action type is rename, also create a warning case in the database" },
              { key: "action.warn_reason", type: "string", default: '"Inappropriate nickname"', description: "Reason used for the auto-warning or case record" },
              { key: "action.mute_duration", type: "string | null", default: "null", description: "Only used when action type is mute. Duration string e.g. 10m, 1h, 1d. null = permanent." },
              { key: "action.revert_after_seconds", type: "number | null", default: "null", description: "If set, the enforced nickname is removed after this many seconds so the member can choose a new nickname. null = keep permanently." },
            ],
          },
          {
            key: "messages", type: "object", description: "Customisable message templates. Supports plain strings or embed objects.",
            children: [
              { key: "nickname_changed", type: "message", default: '"{user} nickname changed | Old: {trigger} | New: {reason} | Rule: {count}"', description: "Posted to the logging channel when a nickname is auto-moderated" },
              { key: "nickname_changed_dm", type: "message", default: '"Your nickname in **{server}** was changed to **{reason}** because it violated our nickname policy | Rule: {count}"', description: "DM sent to the member. Only sent if dm_on_change is true. DM failures are silent." },
              { key: "modnick_manual", type: "message", default: '"{user} nickname was manually checked and changed | Old: {trigger} | New: {reason}"', description: "Posted to logging when !modnick @user is used and a violation is found" },
              { key: "modnick_clean", type: "message", default: '"{user} nickname is clean — no violations found"', description: "Posted in channel when !modnick @user finds no violations" },
              { key: "modnick_no_nick", type: "message", default: '"{user} has no nickname set"', description: "Posted when !modnick @user is used on a member with no nickname" },
              { key: "error_hierarchy", type: "message", default: '"Cannot change nickname for {user} — their role is above mine"', description: "Posted when the bot cannot change the nickname due to role hierarchy" },
              { key: "error_missing_perms", type: "message", default: '"Missing Manage Nicknames permission"', description: "Posted when the bot lacks the Manage Nicknames permission" },
            ],
          },
        ],
        defaultConfig: `plugins:
  modnick:
    enabled: false

    default_name: "Moderated Nickname"
    random_names: []

    log_changes: true
    dm_on_change: true
    recheck_on_rejoin: true
    recheck_on_boost: false
    staff_bypass: false
    bypass_roles: []
    bypass_users: []

    rules:
      hoist:
        enabled: true
        hoist_characters: []
        allow_emoji_start: false

      blank:
        enabled: true
        invisible_characters:
          - "\\u200B"
          - "\\u200C"
          - "\\u200D"
          - "\\u2060"
          - "\\uFEFF"
          - "\\u00AD"
          - "\\u180E"
          - "\\u2800"

      unreadable:
        enabled: true
        min_readable_ratio: 0.3
        allow_unicode_names: false

      zalgo:
        enabled: true
        max_combining_chars: 4

      bad_words:
        enabled: true
        use_automod_wordlist: true
        custom_words: []
        normalize_map:
          "0": "o"
          "1": "i"
          "3": "e"
          "4": "a"
          "5": "s"
          "7": "t"
          "@": "a"
          "$": "s"
          "!": "i"
        whole_word_only: false
        case_sensitive: false

      impersonation:
        enabled: false
        protected_names: []
        protected_users: []
        similarity_threshold: 0.85

      mass_mentions:
        enabled: false
        block_at_symbol: true

      excessive_special_chars:
        enabled: false
        max_special_ratio: 0.5
        allowed_special_chars: "-_. "

      too_long:
        enabled: false
        max_length: 25

      custom_patterns:
        enabled: false
        patterns: []
        case_sensitive: false

    action:
      type: "rename"
      warn_on_rename: false
      warn_reason: "Inappropriate nickname"
      mute_duration: null
      revert_after_seconds: null

    messages:
      nickname_changed: "{user} nickname changed | Old: {trigger} | New: {reason} | Rule: {count}"
      nickname_changed_dm: "Your nickname in **{server}** was changed to **{reason}** because it violated our nickname policy | Rule: {count}"
      modnick_manual: "{user} nickname was manually checked and changed | Old: {trigger} | New: {reason}"
      modnick_clean: "{user} nickname is clean — no violations found"
      modnick_no_nick: "{user} has no nickname set"
      error_hierarchy: "Cannot change nickname for {user} — their role is above mine"
      error_missing_perms: "Missing Manage Nicknames permission"`,
      },

      // ── SLOWMODE AUTO ─────────────────────────────────────────────────────────
      {
        id: "plugin-slowmode-auto",
        title: "Slowmode Auto",
        type: "plugin",
        configKey: "slowmode_auto",
        defaultConfig: `plugins:
  slowmode_auto:
    enabled: false

    ignore_channels: []
    ignore_roles: []
    ignore_bots: true
    count_edits: false

    rules:
      - channel: null
        messages_per_seconds: 10
        window_seconds: 5
        apply_slowmode: 3
        remove_after_seconds: 30
        min_slowmode: 1
        max_slowmode: 120
        scale: false
        scale_step: 5
        scale_max: 60
        scale_interval: 30
        notify_channel: null
        ignore_channels: []
        ignore_roles: []
        enabled: true

    messages:
      slowmode_applied: "🐢 Slowmode of **{count}s** applied due to high activity"
      slowmode_scaled: "📈 Slowmode increased to **{count}s** due to continued high activity"
      slowmode_removed: "✅ Slowmode removed — activity has calmed down"`,
        schema: [
          { key: "enabled", type: "boolean", default: "false", description: "Master switch for the entire plugin. When false, no channels are monitored." },
          { key: "ignore_channels", type: "string[]", default: "[]", description: "Global list of channel IDs where auto-slowmode will never activate, even if a rule covers that channel." },
          { key: "ignore_roles", type: "string[]", default: "[]", description: "Global list of role IDs whose messages are never counted toward the threshold. Members with these roles still wait if slowmode is active — their messages just don't trigger it." },
          { key: "ignore_bots", type: "boolean", default: "true", description: "When true, messages from bots are never counted toward any threshold. Recommended: true to prevent bot activity from triggering slowmode." },
          { key: "count_edits", type: "boolean", default: "false", description: "When true, message edits also count toward the activity threshold. Usually leave this false." },
          {
            key: "rules", type: "array", description: "List of auto-slowmode rules. Channel-specific rules (with a channel ID) take priority over the global rule (channel: null). Rules are evaluated in order — first match wins.",
            children: [
              { key: "channel", type: "snowflake | null", description: "The channel ID this rule applies to. Set null to create a global fallback rule that covers all channels not individually configured." },
              { key: "messages_per_seconds", type: "number", description: "How many messages within window_seconds triggers slowmode. Example: 10 means 10 or more messages in the window will apply slowmode." },
              { key: "window_seconds", type: "number", description: "The rolling time window in seconds for counting messages. Combined with messages_per_seconds: '10 messages in 5 seconds'." },
              { key: "apply_slowmode", type: "number", description: "Slowmode value in seconds to set when the threshold is first exceeded. The bot snaps this to the nearest valid Discord value (0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600)." },
              { key: "remove_after_seconds", type: "number", description: "How many seconds the channel must be message-free before auto-slowmode is lifted. Checked every 10 seconds by the background task." },
              { key: "min_slowmode", type: "number", default: "0", description: "The minimum slowmode this rule will ever apply. If apply_slowmode falls below this, it is raised to min_slowmode." },
              { key: "max_slowmode", type: "number", default: "21600", description: "The maximum slowmode this rule will ever apply, even when scaling. Helps prevent overly aggressive throttling." },
              { key: "scale", type: "boolean", default: "false", description: "When true, slowmode escalates progressively the longer the channel stays above threshold. When false, apply_slowmode is always a fixed value." },
              { key: "scale_step", type: "number", default: "5", description: "Seconds to add to slowmode on each escalation step. Only used when scale: true. Example: apply_slowmode: 5, scale_step: 5 → 5s, 10s, 15s…" },
              { key: "scale_max", type: "number", default: "60", description: "Maximum slowmode value when scaling. Cannot exceed max_slowmode. Only used when scale: true. Scale resets to apply_slowmode when slowmode is removed." },
              { key: "scale_interval", type: "number", default: "30", description: "Seconds the channel must stay above threshold before slowmode scales up one step. Only used when scale: true." },
              { key: "notify_channel", type: "snowflake | null", default: "null", description: "Channel ID where slowmode notifications are posted. null = post in the affected channel itself. Set to a log channel to keep the affected channel clean." },
              { key: "ignore_channels", type: "string[]", default: "[]", description: "Additional channel ignore list for this specific rule. Merged with the top-level ignore_channels." },
              { key: "ignore_roles", type: "string[]", default: "[]", description: "Additional role ignore list for this specific rule. Merged with the top-level ignore_roles." },
              { key: "enabled", type: "boolean", default: "true", description: "Toggle this specific rule on/off without deleting it." },
            ],
          },
          {
            key: "messages", type: "object", description: "Customise all messages the plugin posts. Each value can be a plain string, an embed object, or null (to silence that message entirely).",
            children: [
              { key: "slowmode_applied", type: "string | embed | null", description: "Posted when auto-slowmode is first activated. Variables: {count} (slowmode seconds), {channel} (channel name), {channel.mention}, {trigger} (messages counted), {reason} (window_seconds), {timestamp}." },
              { key: "slowmode_scaled", type: "string | embed | null", description: "Posted when scaling increases slowmode. Only fires when scale: true. Variables: {count} (new slowmode), {channel}, {channel.mention}, {trigger}, {reason}, {timestamp}." },
              { key: "slowmode_removed", type: "string | embed | null", description: "Posted when auto-slowmode is lifted after the channel calms down. Variables: {count} (slowmode that was removed), {channel}, {channel.mention}, {timestamp}." },
            ],
          },
        ],
        content: `The **Slowmode Auto** plugin monitors message activity across your server and automatically applies Discord's native slowmode when a channel gets too busy. When activity calms down, slowmode is automatically removed.

## How Detection Works

The bot keeps an in-memory timestamp list per channel. On every message:

1. Member sends a message in a monitored channel
2. Bot records the timestamp in memory for that channel
3. Bot removes timestamps older than \`window_seconds\`
4. Bot counts the remaining timestamps
5. Count ≥ \`messages_per_seconds\`?
   - **NO** → do nothing, keep monitoring
   - **YES** → is auto-slowmode already active in this channel?
     - **NO** → apply slowmode (\`apply_slowmode\` value), post \`slowmode_applied\` message, mark channel as auto-managed
     - **YES** → is \`scale\` enabled?
       - **NO** → do nothing (already active)
       - **YES** → has \`scale_interval\` elapsed since last escalation?
         - **NO** → do nothing
         - **YES** → increase slowmode by \`scale_step\`, post \`slowmode_scaled\` message

**Background task (every 10 seconds):** For each auto-managed channel:
- Has it been \`remove_after_seconds\` since the last message?
  - **NO** → keep slowmode active
  - **YES** → remove slowmode, post \`slowmode_removed\` message, reset scale to \`apply_slowmode\`

## Rule Priority

\`\`\`
Channel-specific rule found for #general  →  USE IT
No channel-specific rule                  →  USE null (global) rule
Channel in ignore_channels                →  SKIP (never apply)
Message from ignored role                 →  DON'T COUNT (slowmode still applies to them)
Message from bot + ignore_bots: true      →  DON'T COUNT
\`\`\`

## Scaling Behaviour

When \`scale: true\` is set on a rule, slowmode escalates progressively:

\`\`\`
apply_slowmode: 5  |  scale_step: 5  |  scale_max: 30  |  scale_interval: 60

0:00  — threshold exceeded        → slowmode set to 5s
1:00  — still active after 60s    → scaled to 10s
2:00  — still active after 60s    → scaled to 15s
3:00  — still active after 60s    → scaled to 20s
4:00  — still active after 60s    → scaled to 25s
5:00  — still active after 60s    → scaled to 30s (scale_max)
5:30  — activity calms            → calm period starts
6:00  — 30s of calm               → slowmode removed, scale resets to 5s
\`\`\`

Scale always resets to \`apply_slowmode\` when slowmode is removed.

## Slowmode Value Reference

| Seconds | Display |
|---------|---------|
| 0 | Off |
| 5 | 5 seconds |
| 10 | 10 seconds |
| 15 | 15 seconds |
| 30 | 30 seconds |
| 60 | 1 minute |
| 120 | 2 minutes |
| 300 | 5 minutes |
| 600 | 10 minutes |
| 900 | 15 minutes |
| 1800 | 30 minutes |
| 3600 | 1 hour |
| 7200 | 2 hours |
| 21600 | 6 hours (max) |

The bot snaps your \`apply_slowmode\` value to the nearest valid Discord value automatically.

## Recommended Settings Per Channel Type

| Channel type | \`messages_per_seconds\` | \`window_seconds\` | \`apply_slowmode\` | \`remove_after_seconds\` |
|---|---|---|---|---|
| Large general chat | 15 | 5 | 5 | 60 |
| Medium general chat | 10 | 5 | 3 | 30 |
| Meme channel | 12 | 5 | 5 | 45 |
| Media channel | 8 | 10 | 10 | 120 |
| Bot commands | 20 | 5 | 3 | 20 |
| Counting channel | 5 | 3 | 5 | 15 |
| Introductions | 5 | 10 | 5 | 60 |
| Support channel | 8 | 10 | 5 | 60 |
| Announcements | — | — | — | use ignore_channels |
| Staff chat | — | — | — | use ignore_channels |

## Variable Reference

| Variable | Available in | Description |
|----------|-------------|-------------|
| \`{count}\` | all messages | The slowmode value in seconds that was applied or removed |
| \`{channel}\` | all messages | The channel name where slowmode changed |
| \`{channel.mention}\` | all messages | The channel as an @mention |
| \`{trigger}\` | applied/scaled | Number of messages that triggered the threshold |
| \`{reason}\` | applied/scaled | The window_seconds value (time window used) |
| \`{timestamp}\` | all messages | Current date and time |

## What This Plugin Does NOT Do

- Does **not** touch manually-set slowmode (via \`!slowmode\` command)
- Does **not** remove slowmode set before the bot started
- Does **not** apply slowmode below \`min_slowmode\`
- Does **not** apply slowmode above \`max_slowmode\`
- Does **not** count messages from users in \`ignore_roles\`
- Does **not** count bot messages if \`ignore_bots: true\`

## What Happens on Bot Restart

- In-memory tracking is lost
- Auto-applied slowmode stays active in Discord (the setting persists on Discord's side)
- The bot no longer tracks those channels as auto-managed
- Auto-applied slowmode will **not** be automatically removed after restart — it will remain until a member sends a message, the plugin detects the channel is calm, and removes it on the next background check
- **Recommended:** keep \`remove_after_seconds\` low (30–60s) so leftover slowmode clears quickly after a restart

## Silent Mode

Set any message template to \`null\` to suppress that notification entirely:

\`\`\`yaml
messages:
  slowmode_applied: null   # apply silently
  slowmode_scaled: null    # scale silently
  slowmode_removed: null   # remove silently
\`\`\`

## Embed Messages

All three messages support the full embed format:

\`\`\`yaml
messages:
  slowmode_applied:
    embed:
      title: "🐢 Auto Slowmode Activated"
      description: "High activity detected in {channel.mention}"
      color: "#FFA500"
      fields:
        - name: "Slowmode Set"
          value: "{count}s"
          inline: true
        - name: "Messages Detected"
          value: "{trigger} in {reason}s"
          inline: true
      footer: "Will be removed when activity calms down • {timestamp}"

  slowmode_scaled:
    embed:
      title: "📈 Slowmode Increased"
      description: "Activity remains high in {channel.mention}"
      color: "#FF6600"
      fields:
        - name: "New Slowmode"
          value: "{count}s"
          inline: true
      footer: "Will be removed when activity calms down • {timestamp}"

  slowmode_removed:
    embed:
      title: "✅ Auto Slowmode Removed"
      description: "Activity has calmed down in {channel.mention}"
      color: "#00FF00"
      fields:
        - name: "Slowmode Removed"
          value: "{count}s → 0s"
          inline: true
      footer: "Will reactivate if activity spikes again • {timestamp}"
\`\`\`

## Full Example Config

\`\`\`yaml
plugins:
  slowmode_auto:
    enabled: true

    ignore_channels:
      - 123456789012345678   # announcements
      - 234567890123456789   # mod-log
      - 345678901234567890   # staff-chat

    ignore_roles:
      - 567890123456789012   # Staff role
      - 678901234567890123   # Admin role

    ignore_bots: true
    count_edits: false

    rules:

      # General chat — busy channel with scaling
      - channel: 789012345678901234
        messages_per_seconds: 15
        window_seconds: 5
        apply_slowmode: 5
        remove_after_seconds: 60
        min_slowmode: 3
        max_slowmode: 30
        scale: true
        scale_step: 5
        scale_max: 30
        scale_interval: 60
        notify_channel: null
        enabled: true

      # Bot commands — fast trigger, quick removal
      - channel: 012345678901234567
        messages_per_seconds: 20
        window_seconds: 5
        apply_slowmode: 3
        remove_after_seconds: 20
        min_slowmode: 1
        max_slowmode: 10
        scale: false
        notify_channel: null
        ignore_roles:
          - 567890123456789012   # Staff bypass
        enabled: true

      # Global fallback — all other channels
      - channel: null
        messages_per_seconds: 10
        window_seconds: 5
        apply_slowmode: 3
        remove_after_seconds: 30
        min_slowmode: 1
        max_slowmode: 60
        scale: false
        notify_channel: null
        enabled: true

    messages:
      slowmode_applied: "🐢 Slowmode of **{count}s** applied due to high activity"
      slowmode_scaled: "📈 Slowmode increased to **{count}s** due to continued high activity"
      slowmode_removed: "✅ Slowmode removed — activity has calmed down"
\`\`\``,
      },

      // ── DURATION ROLES ────────────────────────────────────────────────────────
      {
        id: "plugin-duration-roles",
        title: "Duration Roles",
        type: "plugin",
        configKey: "duration_roles",
        defaultConfig: `plugins:
  duration_roles:
    enabled: false

    roles:
      - role: null              # Role ID this rule applies to
        duration_days: 30       # Days before the role expires (decimals OK: 0.5 = 12h)
        dm_warning: true        # Send a DM warning before expiry
        dm_warning_days: 3      # How many days before expiry to send the warning
        dm_on_removal: true     # DM the member when the role is removed
        on_expiry: "remove"     # "remove" or "replace"
        replace_with: null      # Role ID to assign on expiry (if on_expiry: replace)
        reset_on_reassign: true # Reset timer if role is re-assigned
        stack_on_reassign: false # Add duration on top of remaining time instead of resetting
        log_assignment: true    # Log to members channel when role is assigned
        log_expiry: true        # Log to members channel when role expires

    messages:
      role_assigned_log: "Duration role assigned | {user} ({user.id}) | Role: {trigger} | Expires: {expires_at}"
      role_expired: "{user} duration role {trigger} has expired and been removed"
      role_replaced: "{user} duration role {trigger} has expired | Replaced with: {reason}"
      role_expiry_warning_dm: "Your **{trigger}** role in **{server}** expires in **{count}** day(s). Contact staff if you would like to renew."
      role_expired_dm: "Your **{trigger}** role in **{server}** has expired and been removed."
      role_replaced_dm: "Your **{trigger}** role in **{server}** has expired. You have been given **{reason}** instead."`,
        schema: [
          { key: "enabled", type: "boolean", default: "false", description: "Enable the duration roles plugin" },
          {
            key: "roles", type: "array", description: "List of duration role definitions. Each entry tracks one role independently — a member can have multiple duration roles active at once.",
            children: [
              { key: "role", type: "snowflake", description: "The Discord role ID this rule applies to. When any member receives this role (via any method — bot command, manual, another bot), the timer starts automatically." },
              { key: "duration_days", type: "number", description: "Days after assignment before the role expires. Decimals supported: 0.0417 = 1h, 0.25 = 6h, 0.5 = 12h, 1 = 1 day, 7 = 1 week, 30 = 1 month." },
              { key: "dm_warning", type: "boolean", default: "true", description: "Whether to send a DM warning to the member before the role expires. The DM is sent once, dm_warning_days before expiry." },
              { key: "dm_warning_days", type: "number", default: "3", description: "How many days before expiry to send the warning DM. Must be less than duration_days. Set dm_warning: false instead of using 0." },
              { key: "dm_on_removal", type: "boolean", default: "true", description: "Whether to DM the member when their role expires and is removed or replaced. DM failures (user has DMs closed) are always silent." },
              { key: "on_expiry", type: "\"remove\" | \"replace\"", default: "\"remove\"", description: "What happens when the duration ends. remove = role is removed. replace = role is removed AND replace_with role is added." },
              { key: "replace_with", type: "snowflake | null", default: "null", description: "Role ID to assign when the original role expires. Only used if on_expiry is replace. The expired role is removed first, then this role is added." },
              { key: "reset_on_reassign", type: "boolean", default: "true", description: "If true, when a member gets this role again, the timer resets to a full duration_days from now. Recommended: true to prevent loopholes." },
              { key: "stack_on_reassign", type: "boolean", default: "false", description: "If true, getting the role again before it expires adds duration_days to the remaining time instead of resetting. Only applies when reset_on_reassign is false." },
              { key: "log_assignment", type: "boolean", default: "true", description: "Log to the members logging channel when this role is assigned and tracking begins." },
              { key: "log_expiry", type: "boolean", default: "true", description: "Log to the members logging channel when this role expires and is removed or replaced." },
            ],
          },
          {
            key: "messages", type: "object", description: "Customise all messages sent by the plugin. Each value can be a plain string or an embed object.",
            children: [
              { key: "role_assigned_log", type: "string | embed", description: "Posted to the logging channel when a duration role is assigned. Variables: {trigger}, {expires_at}, {user}, {user.mention}, {user.id}." },
              { key: "role_expired", type: "string | embed", description: "Posted to the logging channel when a role expires and is removed. Variables: {trigger}, {expires_at}, {user}, {user.mention}, {user.id}." },
              { key: "role_replaced", type: "string | embed", description: "Posted to the logging channel when a role expires and is replaced. Variables: {trigger} (removed role), {reason} (replacement role name), {expires_at}, {user}." },
              { key: "role_expiry_warning_dm", type: "string | embed", description: "DM sent to the member dm_warning_days before expiry. Variables: {trigger}, {server}, {count} (days remaining), {expires_at}." },
              { key: "role_expired_dm", type: "string | embed", description: "DM sent to the member when their role is removed on expiry. Variables: {trigger}, {server}, {expires_at}." },
              { key: "role_replaced_dm", type: "string | embed", description: "DM sent to the member when their role is replaced on expiry. Variables: {trigger} (removed role), {reason} (replacement role name), {server}." },
            ],
          },
        ],
        content: `The **Duration Roles** plugin automatically expires roles after a set amount of time. When a member receives one of the configured roles — by any means (bot command, manual assignment, another bot) — the timer starts. A background task runs every 60 seconds to send warning DMs and remove or replace expired roles.

## How the Background Task Works

Every 60 seconds the bot runs two checks:

**Check 1 — Warning DMs:**
Queries the \`duration_role_assignments\` table for rows where \`expires_at\` is within \`dm_warning_days\` days AND the warning DM has not been sent yet. For each matching row it sends the \`role_expiry_warning_dm\` to the member and marks the warning as sent so it only fires once.

**Check 2 — Expired Roles:**
Queries the \`duration_role_assignments\` table for rows where \`expires_at <= NOW()\`. For each expired row it removes the role, optionally assigns \`replace_with\`, optionally DMs the member, logs the event, and deletes the row from the table.

## Duration Days Reference

| \`duration_days\` value | Actual duration |
|---|---|
| \`0.0417\` | 1 hour |
| \`0.25\` | 6 hours |
| \`0.5\` | 12 hours |
| \`1\` | 1 day |
| \`2\` | 2 days |
| \`3\` | 3 days |
| \`7\` | 1 week |
| \`14\` | 2 weeks |
| \`30\` | 1 month |
| \`60\` | 2 months |
| \`90\` | 3 months |
| \`180\` | 6 months |
| \`365\` | 1 year |

## Variable Reference

| Variable | Available in | Description |
|---|---|---|
| \`{trigger}\` | all messages | The role name that expired or was assigned |
| \`{reason}\` | replace messages | The replacement role name |
| \`{count}\` | warning DM | Days remaining until expiry |
| \`{expires_at}\` | all messages | Exact expiry date and time |
| \`{user}\` | log messages | Username of the member |
| \`{user.mention}\` | log messages | @mention of the member |
| \`{user.id}\` | log messages | User ID of the member |
| \`{server}\` | DM messages | Server name |

## \`on_expiry\` Behavior

| Setting | What happens when role expires |
|---|---|
| \`"remove"\` | Role is removed. If \`dm_on_removal: true\`, \`role_expired_dm\` is sent |
| \`"replace"\` | Role is removed AND \`replace_with\` role is added. If \`dm_on_removal: true\`, \`role_replaced_dm\` is sent |

## \`reset_on_reassign\` vs \`stack_on_reassign\`

| Scenario | \`reset_on_reassign: true\` | \`reset_on_reassign: false\` + \`stack_on_reassign: false\` | \`reset_on_reassign: false\` + \`stack_on_reassign: true\` |
|---|---|---|---|
| Member gets role again with 10 days remaining | Timer resets to full 30 days | Original expiry kept (10 days remain) | 10 + 30 = 40 days remaining |
| Member gets role again after it expired | New 30 day timer starts | New 30 day timer starts | New 30 day timer starts |

## Use Case Examples

**Trial Staff Promotion** — Trial Mod role expires after 14 days and becomes full Mod. Staff get a DM warning 2 days before their trial ends.

**VIP Trial Membership** — VIP Trial lasts 7 days then is removed. Member gets a DM 1 day before it expires inviting them to renew.

**Monthly Subscriber** — Subscriber role expires after 30 days. Warning DM sent 3 days before expiry. Re-assigning the role before expiry resets the timer.

**New Member → Member** — New members get a "New Member" role that silently expires after 7 days and is replaced with the "Member" role granting full access.

**Tiered Promotion Chain** — Three-stage chain: Newcomer (30 days) → Regular (60 days) → Veteran. Configure separate entries for Newcomer and Regular roles each with \`on_expiry: replace\`.

**Cooldown / Restricted Role** — A restricted role that prevents access to channels expires after 12 hours (\`duration_days: 0.5\`). DM sent when it is removed.

**Event Access** — Temporary event access role expires after 3 days with no DMs. \`stack_on_reassign: true\` lets attendees extend their time if they receive the role again during the event.`,
      },

      // ── REACTION ROLES ────────────────────────────────────────────────────────
      {
        id: "plugin-reaction-roles",
        title: "Reaction Roles",
        type: "plugin",
        configKey: "reaction_roles",
        defaultConfig: `plugins:
  reaction_roles:
    enabled: true
    messages:

      # ── Panel management (sent to the mod who ran the command) ──────────────
      rr_created: "Panel **{trigger}** created"
      rr_entry_added: "Role {trigger} added to panel **{reason}**"
      rr_entry_removed: "Role {trigger} removed from panel **{reason}**"
      rr_posted: "Panel **{trigger}** posted in {channel}"
      rr_edited: "Panel **{trigger}** updated"
      rr_deleted: "Panel **{trigger}** deleted"
      rr_not_found: "Panel **{trigger}** not found — use \`!rr list\` to see all panels"
      rr_list_empty: "No panels found — use \`!rr create\` to make one"
      rr_already_exists: "A panel named **{trigger}** already exists"
      rr_entry_not_found: "No entry for {trigger} in panel {reason}"
      rr_no_entries: "Panel **{trigger}** has no entries yet — use \`!rr add\` first"
      rr_max_entries_reached: "Panel **{trigger}** is full (max {count} entries)"
      rr_max_set: "Max roles for panel **{trigger}** set to **{count}**"
      rr_required_set: "Required role for panel **{trigger}** set to **{reason}**"
      rr_required_cleared: "Required role for panel **{trigger}** cleared"

      # ── User interaction messages (sent ephemerally when they click/react) ──
      rr_role_given: "✅ You have been given **{trigger}**"
      rr_role_removed: "❌ You no longer have **{trigger}**"
      rr_max_reached: "You have reached the maximum of **{count}** roles for this panel"
      rr_missing_required: "You need the **{trigger}** role to use this panel"

      # ── DM messages (only sent if dm_on_assign is true for the panel) ───────
      rr_assign_dm: "You have been given the **{trigger}** role in **{server}**"
      rr_remove_dm: "The **{trigger}** role has been removed in **{server}**"`,
        schema: [
          { key: "enabled", type: "boolean", default: "true", description: "Master switch for all reaction role panels" },
          { key: "messages.rr_created", type: "message", description: "Sent to the mod when a panel is created. Variable: {trigger} = panel name" },
          { key: "messages.rr_entry_added", type: "message", description: "Sent when a role is added. Variables: {trigger} = role name, {reason} = panel name" },
          { key: "messages.rr_entry_removed", type: "message", description: "Sent when a role is removed. Variables: {trigger} = role name, {reason} = panel name" },
          { key: "messages.rr_posted", type: "message", description: "Sent when a panel is posted. Variables: {trigger} = panel name, {channel} = channel mention" },
          { key: "messages.rr_edited", type: "message", description: "Sent when a panel is edited. Variable: {trigger} = panel name" },
          { key: "messages.rr_deleted", type: "message", description: "Sent when a panel is deleted. Variable: {trigger} = panel name" },
          { key: "messages.rr_not_found", type: "message", description: "Sent when the panel name doesn't exist. Variable: {trigger} = name searched" },
          { key: "messages.rr_list_empty", type: "message", description: "Sent when the server has no panels" },
          { key: "messages.rr_already_exists", type: "message", description: "Sent when creating a panel that already exists. Variable: {trigger} = name" },
          { key: "messages.rr_entry_not_found", type: "message", description: "Sent when removing a role not in the panel. Variables: {trigger} = role, {reason} = panel" },
          { key: "messages.rr_no_entries", type: "message", description: "Sent when posting a panel with no entries. Variable: {trigger} = panel name" },
          { key: "messages.rr_max_entries_reached", type: "message", description: "Sent when a panel is full. Variables: {trigger} = panel name, {count} = limit" },
          { key: "messages.rr_max_set", type: "message", description: "Sent when setmax is used. Variables: {trigger} = panel name, {count} = new max" },
          { key: "messages.rr_required_set", type: "message", description: "Sent when setrequired is used. Variables: {trigger} = panel name, {reason} = role name" },
          { key: "messages.rr_required_cleared", type: "message", description: "Sent when clearrequired is used. Variable: {trigger} = panel name" },
          { key: "messages.rr_role_given", type: "message", description: "Ephemeral reply when a user receives a role. Variable: {trigger} = role name" },
          { key: "messages.rr_role_removed", type: "message", description: "Ephemeral reply when a user loses a role. Variable: {trigger} = role name" },
          { key: "messages.rr_max_reached", type: "message", description: "Ephemeral reply when user hits the panel limit. Variable: {count} = max roles" },
          { key: "messages.rr_missing_required", type: "message", description: "Ephemeral reply when user lacks the required role. Variable: {trigger} = required role name" },
          { key: "messages.rr_assign_dm", type: "message", description: "DM sent when dm_on_assign is true and a role is given. Variables: {trigger} = role name, {server} = server name" },
          { key: "messages.rr_remove_dm", type: "message", description: "DM sent when dm_on_assign is true and a role is removed. Variables: {trigger} = role name, {server} = server name" },
        ],
        content: `The **Reaction Roles** plugin lets members self-assign roles via emoji reactions, clickable buttons, or a dropdown menu. Panels persist across bot restarts — no manual re-posting needed.

---

### Panel Types

| Feature | Emoji | Button | Dropdown |
|---------|-------|--------|----------|
| Max entries | 20 | 25 | 25 |
| Mobile friendly | ✅ | ✅ | ✅ |
| Shows description per entry | ❌ | ❌ | ✅ |
| Multiple select at once | ❌ | ❌ | ✅ |
| Custom button colors | ❌ | ✅ | ❌ |
| Classic Discord look | ✅ | ❌ | ❌ |
| Persists after bot restart | ✅ | ✅ | ✅ |
| Works in threads | ✅ | ✅ | ✅ |

---

### How Persistence Works

When the bot starts, it queries the reaction role store for all panels that have been posted. For each emoji panel it re-adds the bot's own reactions to the message so new members can react. Button and dropdown panels stay registered automatically because Discord.js handles interactions natively — the bot just needs to be online.

This means panels keep working even after bot restarts, updates, or crashes — no manual re-posting needed.

---

### max_roles Behavior

| \`setmax\` value | What happens |
|-----------------|-------------|
| \`0\` | Unlimited — user can select every role in the panel |
| \`1\` | Only one role allowed — selecting a new one removes the old one automatically |
| \`2\` or more | User can hold up to that many roles simultaneously — selecting more shows \`rr_max_reached\` |

---

### Full Command Reference

\`\`\`
!rr create <name> <type> [#channel]
!rr add <name> <@role> <emoji_or_label> [description] [style]
!rr remove <name> <@role>
!rr post <name>
!rr repost <name>
!rr edit <name> title <text>
!rr edit <name> description <text>
!rr edit <name> color <hex>
!rr setmax <name> <number>
!rr setrequired <name> <@role>
!rr clearrequired <name>
!rr delete <name>
!rr list
!rr info <name>
\`\`\`

---

### Panel Type 1 — Emoji

Members react with an emoji to get or remove a role. The bot adds all reactions automatically when you post.

\`\`\`
!rr create "Colors" emoji #roles
!rr edit "Colors" title "🎨 Color Roles"
!rr edit "Colors" description "React to get a color role"
!rr setmax "Colors" 1
!rr add "Colors" @Red ❤️
!rr add "Colors" @Blue 💙
!rr add "Colors" @Green 💚
!rr post "Colors"
\`\`\`

---

### Panel Type 2 — Button

Members click a button to toggle a role on/off. Supports custom labels, emojis, and four color styles.

Button styles: **Primary** (blue) · **Secondary** (grey) · **Success** (green) · **Danger** (red)

\`\`\`
!rr create "Notifications" button #roles
!rr edit "Notifications" title "🔔 Notification Roles"
!rr edit "Notifications" description "Click to toggle pings"
!rr setmax "Notifications" 0
!rr add "Notifications" @Announcements "📢 Announcements" 📢 Primary
!rr add "Notifications" @Events "🎉 Events" 🎉 Success
!rr add "Notifications" @Giveaways "🎁 Giveaways" 🎁 Success
!rr post "Notifications"
\`\`\`

---

### Panel Type 3 — Dropdown

Members open a select menu and choose one or more roles. Supports per-option descriptions. When they submit, the bot adds newly selected roles and removes deselected ones.

\`\`\`
!rr create "Interests" dropdown #roles
!rr edit "Interests" title "🎯 Interest Roles"
!rr edit "Interests" description "Select up to 5 interests"
!rr setmax "Interests" 5
!rr add "Interests" @Gaming "🎮 Gaming" "PC, Console, and Mobile"
!rr add "Interests" @Music "🎵 Music" "Music lovers and musicians"
!rr add "Interests" @Art "🎨 Art" "Artists and appreciators"
!rr post "Interests"
\`\`\`

---

### Restricting Access

Use \`setrequired\` to limit a panel to users who already have a specific role. Great for staff-only panels.

\`\`\`
!rr create "Staff Access" button #staff-roles
!rr setrequired "Staff Access" @Staff
!rr add "Staff Access" @ModLogs "📋 Mod Log Access" 📋 Primary
!rr add "Staff Access" @Appeals "📩 Appeals Access" 📩 Primary
!rr post "Staff Access"
\`\`\`

Users without @Staff see the \`rr_missing_required\` message. Use \`!rr clearrequired <name>\` to remove the restriction.

---

### DM on Assign

When \`dm_on_assign\` is set per-panel (configured in the panel store), the bot will DM the user whenever a role is given or removed via that panel. DM failures are always silent.

Message templates: \`rr_assign_dm\` and \`rr_remove_dm\`.

---

### Customising Responses

All responses support plain text, embed-only, or content + embed format:

\`\`\`yaml
plugins:
  reaction_roles:
    messages:

      # Plain text
      rr_role_given: "✅ You now have **{trigger}**"

      # Embed only
      rr_max_reached:
        embed:
          title: "⚠️ Maximum Roles Reached"
          description: "You can only hold **{count}** roles from this panel."
          color: "#FFFF00"
          footer: "Remove a role first before selecting another"

      # Content + embed
      rr_missing_required:
        content: "🔒 Restricted panel"
        embed:
          title: "Role Required"
          description: "You need the **{trigger}** role to use this panel."
          color: "#FF0000"
\`\`\``,
      },

      // ── LEVELS ───────────────────────────────────────────────────────────────
      {
        id: "plugin-levels",
        title: "Levels",
        type: "plugin",
        configKey: "levels",
        defaultConfig: `levels:
  enabled: true`,
        schema: [
          { key: "enabled", type: "boolean", default: "true", description: "Enable the levels plugin" },
        ],
        content: `The **Levels** plugin provides manual level/rank tracking for server members.`,
      },

      // ── UTILITY ──────────────────────────────────────────────────────────────
      {
        id: "plugin-utility",
        title: "Utility",
        type: "plugin",
        configKey: "utility",
        defaultConfig: `plugins:
  utility:
    enabled: true
    custom_help_entries: []
    messages:
      ping_result: "🏓 Pong! | Websocket: {trigger}ms | API: {reason}ms"
      userinfo_not_found: "User {trigger} not found"
      banner_none: "{user} has no banner set"
      roles_none: "{user} has no roles"
      casesearch_result: "Found {count} cases matching {trigger}"
      casesearch_none: "No cases found matching {trigger}"
      warncount_result: "{user} has {count} warning(s)"
      warncount_zero: "{user} has no warnings"
      modstats_none: "{mod} has not issued any cases"
      inrole_empty: "No members have that role"`,
        schema: [
          { key: "enabled", type: "boolean", default: "true", description: "Master switch — set to false to disable all utility commands" },
          { key: "custom_help_entries", type: "array", default: "[]", description: "Extra entries shown in !help for things the bot doesn't handle itself (e.g. slash commands from other bots)" },
          { key: "messages.ping_result", type: "message", description: "Response for !ping. Variables: {trigger} = websocket ms, {reason} = API ms" },
          { key: "messages.userinfo_result", type: "message", description: "Response for !userinfo. Variables: {user}, {user.id}, {user.created_at}, {user.joined_at}, {count} = role count, {reason} = top role" },
          { key: "messages.userinfo_not_found", type: "message", description: "When the user can't be found. Variable: {trigger} = input" },
          { key: "messages.avatar_result", type: "message", description: "Response for !avatar. Variables: {user}, {user.id}, {trigger} = avatar URL" },
          { key: "messages.banner_result", type: "message", description: "Response for !banner. Variables: {user}, {trigger} = banner URL" },
          { key: "messages.banner_none", type: "message", description: "When a user has no banner. Variable: {user}" },
          { key: "messages.roles_result", type: "message", description: "Response for !roles <user>. Variables: {user}, {trigger} = role list, {count}, {reason} = top role" },
          { key: "messages.roles_none", type: "message", description: "When the user has no roles. Variable: {user}" },
          { key: "messages.joined_result", type: "message", description: "Response for !joined. Variables: {user}, {server}, {trigger} = join date, {reason} = relative time, {count} = join position" },
          { key: "messages.firstmsg_result", type: "message", description: "Response for !firstmsg. Variables: {user}, {channel}, {trigger} = jump link, {reason} = message content, {count} = timestamp" },
          { key: "messages.firstmsg_none", type: "message", description: "When no message is found. Variables: {user}, {channel}" },
          { key: "messages.casesearch_result", type: "message", description: "When cases are found. Variables: {trigger} = keyword, {count} = result count" },
          { key: "messages.casesearch_none", type: "message", description: "When no cases match. Variable: {trigger} = keyword" },
          { key: "messages.warncount_result", type: "message", description: "Warning count result. Variables: {user}, {user.id}, {count}" },
          { key: "messages.warncount_zero", type: "message", description: "When the user has zero warnings. Variables: {user}, {user.id}" },
          { key: "messages.modstats_result", type: "message", description: "Modstats result. Variables: {mod}, {trigger} = bans, {reason} = kicks, {count} = mutes, {expires_at} = warns, {success_count} = total" },
          { key: "messages.modstats_none", type: "message", description: "When the mod has no cases. Variable: {mod}" },
          { key: "messages.serverinfo_result", type: "message", description: "Serverinfo result. Variables: {server}, {server.id}, {server.member_count}, {trigger} = creation date" },
          { key: "messages.channelinfo_result", type: "message", description: "Channelinfo result. Variables: {channel}, {channel.id}, {trigger} = type, {reason} = creation date" },
          { key: "messages.roleinfo_result", type: "message", description: "Roleinfo result. Variables: {trigger} = name, {reason} = ID, {count} = members, {expires_at} = color, {new_reason} = mentionable" },
          { key: "messages.roleinfo_not_found", type: "message", description: "When the role can't be found. Variable: {trigger} = input" },
          { key: "messages.membercount_result", type: "message", description: "Membercount result. Variables: {server}, {server.member_count}, {trigger} = humans, {reason} = bots" },
          { key: "messages.botstats_result", type: "message", description: "Botstats result. Variables: {trigger} = uptime, {reason} = ping ms, {count} = servers, {expires_at} = users, {new_reason} = memory MB" },
          { key: "messages.inviteinfo_result", type: "message", description: "Inviteinfo result. Variables: {trigger} = code, {reason} = guild, {count} = channel, {expires_at} = inviter" },
          { key: "messages.snowflake_result", type: "message", description: "Snowflake result. Variables: {trigger} = ID, {reason} = creation date" },
          { key: "messages.inrole_result", type: "message", description: "Inrole result. Variables: {trigger} = member list, {reason} = role name, {count} = member count" },
          { key: "messages.inrole_empty", type: "message", description: "When no members have the role. Variable: {trigger} = role name" },
          { key: "messages.charcount_result", type: "message", description: "Charcount result. Variables: {trigger} = chars, {reason} = words, {count} = lines" },
        ],
        content: `The **Utility** plugin provides informational and quality-of-life commands for your server.

Every response can be customised to a plain text string or a rich embed via \`plugins.utility.messages\`. If no message template is configured for a command, the bot uses a built-in embed as the default.

---

### Quick reference

| Command | Usage | What it does |
|---------|-------|--------------|
| \`!ping\` | \`!ping\` | WebSocket + API latency |
| \`!userinfo\` | \`!userinfo [@user]\` | Full user profile |
| \`!avatar\` | \`!avatar [@user]\` | Avatar at full size |
| \`!banner\` | \`!banner [@user]\` | Profile banner |
| \`!roles\` | \`!roles [@user]\` | User roles or all server roles |
| \`!joined\` | \`!joined [@user]\` | Join date + position |
| \`!firstmsg\` | \`!firstmsg [@user] [#channel]\` | First message in a channel |
| \`!casesearch\` | \`!casesearch <keyword>\` | Search mod cases |
| \`!warncount\` | \`!warncount [@user]\` | Total warning count |
| \`!modstats\` | \`!modstats [@mod]\` | Moderator action stats |
| \`!serverinfo\` | \`!serverinfo\` | Server details |
| \`!channelinfo\` | \`!channelinfo [#channel]\` | Channel details |
| \`!roleinfo\` | \`!roleinfo <@role>\` | Role details |
| \`!membercount\` | \`!membercount\` | Members / humans / bots |
| \`!botstats\` | \`!botstats\` | Uptime, ping, memory |
| \`!botinfo\` | \`!botinfo\` | Bot version and links |
| \`!inviteinfo\` | \`!inviteinfo <code>\` | Invite link details |
| \`!snowflake\` | \`!snowflake <id>\` | Decode any Discord ID |
| \`!inrole\` | \`!inrole <@role>\` | List members with a role |
| \`!charcount\` | \`!charcount <text>\` | Count chars / words / lines |
| \`!embed\` | \`!embed <json>\` | Send a custom embed |

---

### Customising responses

Any command response can be overridden with a plain string or a full embed. All three formats are supported:

\`\`\`yaml
plugins:
  utility:
    enabled: true
    messages:

      # Plain text
      ping_result: "🏓 Pong! WS: {trigger}ms | API: {reason}ms"

      # Embed only
      userinfo_result:
        embed:
          title: "👤 {user}"
          color: "#5865F2"
          thumbnail: "{user.avatar}"
          fields:
            - name: "ID"
              value: "{user.id}"
              inline: true
            - name: "Created"
              value: "{user.created_at}"
              inline: true
            - name: "Joined"
              value: "{user.joined_at}"
              inline: true
            - name: "Roles"
              value: "{count}"
              inline: true
          footer: "Requested by {mod}"

      # Content + embed
      warncount_result:
        content: "<@{user.id}>"
        embed:
          title: "⚠️ {count} warnings"
          color: "#FF8800"
\`\`\`

---

### Variable reference

**Shared across all commands**
\`{mod}\` — username of the person who ran the command
\`{timestamp}\` — ISO timestamp when the command ran

**!ping**
\`{trigger}\` — WebSocket latency (ms)
\`{reason}\` — API round-trip latency (ms)

**!userinfo**
\`{user}\` — username, \`{user.id}\` — user ID, \`{user.mention}\` — mention
\`{user.avatar}\` — avatar URL, \`{user.created_at}\` — account age, \`{user.joined_at}\` — join date
\`{count}\` — role count, \`{reason}\` — top role name

**!avatar / !banner**
\`{user}\` — username, \`{trigger}\` — image URL

**!roles**
\`{user}\` — username, \`{trigger}\` — role mention list, \`{count}\` — role count, \`{reason}\` — top role name

**!joined**
\`{user}\` — username, \`{server}\` — server name
\`{trigger}\` — join date, \`{reason}\` — relative time, \`{count}\` — join position

**!firstmsg**
\`{user}\` — username, \`{channel}\` — channel mention
\`{trigger}\` — jump link URL, \`{reason}\` — message content, \`{count}\` — message timestamp

**!bansearch**
\`{trigger}\` — user ID searched, \`{user}\` — username, \`{reason}\` — ban reason

**!casesearch**
\`{trigger}\` — search keyword, \`{count}\` — number of results

**!warncount**
\`{user}\` — username, \`{user.id}\` — user ID, \`{count}\` — warning count

**!modstats**
\`{mod}\` — moderator username, \`{trigger}\` — bans, \`{reason}\` — kicks
\`{count}\` — mutes, \`{expires_at}\` — warns, \`{success_count}\` — total actions

**!serverinfo**
\`{server}\` — name, \`{server.id}\` — ID, \`{server.member_count}\` — total members
\`{trigger}\` — creation date

**!channelinfo**
\`{channel}\` — name, \`{channel.id}\` — ID, \`{trigger}\` — type, \`{reason}\` — creation date

**!roleinfo**
\`{trigger}\` — role name, \`{reason}\` — role ID, \`{count}\` — member count
\`{expires_at}\` — hex color, \`{new_reason}\` — mentionable (Yes/No)

**!membercount**
\`{server}\` — server name, \`{server.member_count}\` — total
\`{trigger}\` — human count, \`{reason}\` — bot count

**!botstats**
\`{trigger}\` — uptime string (e.g. "3d 4h 12m")
\`{reason}\` — WebSocket ping ms, \`{count}\` — server count
\`{expires_at}\` — cached user count, \`{new_reason}\` — memory usage MB

**!snowflake**
\`{trigger}\` — snowflake ID, \`{reason}\` — creation date

**!inrole**
\`{trigger}\` — member list, \`{reason}\` — role name, \`{count}\` — member count

**!charcount**
\`{trigger}\` — character count, \`{reason}\` — word count, \`{count}\` — line count

---

### Custom help entries

You can add entries to \`!help\` for commands the bot doesn't manage itself:

\`\`\`yaml
plugins:
  utility:
    custom_help_entries:
      - command: "/giveaway"
        description: "Start a giveaway"
        category: "Fun"
        usage: "/giveaway duration:<time> prize:<text>"
\`\`\`

---

### !embed — JSON format

The \`!embed\` command accepts a raw JSON object inline:

\`\`\`
!embed {"title":"Server Rules","description":"Be respectful.","color":"#FF0000"}
\`\`\`

Supported fields: \`title\`, \`description\`, \`color\` (hex), \`thumbnail\` (URL), \`image\` (URL), \`footer\` (text), \`url\`, \`fields\` (array of \`{name, value, inline}\`).`,
      },
    ],
  },
];

# NightPigeon

> A self-hostable, feature-rich Discord moderation and utility bot. All behaviour is configured per-server through a YAML file or a web dashboard — no code changes required.

Built with **Node.js**, **TypeScript**, **discord.js v14**, **PostgreSQL**, and a **React/Vite** dashboard.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io)

---

## Table of Contents

1. [Features](#features)
2. [YAML Configuration](#yaml-configuration)
   - [Prefix & Levels](#prefix--levels)
   - [Tags](#tags)
   - [Plugins](#plugins)
   - [YAML Logging](#yaml-logging)
   - [YAML Automod Rules](#yaml-automod-rules)
3. [Messages Reference](#messages-reference)
   - [How Messages Work](#how-messages-work)
   - [Template Variables](#template-variables)
   - [Action Success Messages](#action-success-messages)
   - [DM Messages](#dm-messages)
   - [Error Messages](#error-messages)
   - [Reaction Roles Messages](#reaction-roles-messages)
4. [Punishment Escalation](#punishment-escalation)
5. [Automod Escalation](#automod-escalation)
6. [Anti-Nuke](#anti-nuke)
7. [Anti-Raid](#anti-raid)
8. [Server Logging](#server-logging)
9. [Dashboard](#dashboard)
10. [Self-Hosting Guide](#self-hosting-guide)
11. [Environment Variables](#environment-variables)
12. [Data Storage](#data-storage)
13. [Project Structure](#project-structure)

---

## Features

- 🔨 Moderation — warn, mute, kick, ban, tempban, softban, forceban
- 📋 Cases & Notes — full case log, manual cases, private staff notes, exports
- ⚡ Mass Actions — apply mod actions to multiple users at once
- 📈 Punishment Escalation — auto-escalate punishments on repeated warnings
- 🤖 Automod Escalation — auto-escalate on repeated YAML automod violations
- 🛡️ YAML Automod — declarative rules engine (spam, word filter, invite links, caps, zalgo, and more)
- 💣 Anti-Nuke — detect and reverse destructive admin actions in real time
- 🌊 Anti-Raid — detect mass joins and auto-enter raid mode
- 📝 Server Logging — 40+ gateway events, dual legacy + YAML logging systems
- 🎫 Tickets — panels, categories, claim, close, transcript, auto-close
- ⭐ Starboard — highlight popular messages to a dedicated channel
- 🎭 Reaction Roles — button-based role panels
- 🏷️ Tags — custom canned responses with embed and template variable support
- ⏰ Reminders & Timezones — per-user timezone and DM reminders
- 🔄 Autoclean / Autoreaction / Autoreply — scheduled and trigger-based auto-utilities
- 🌐 Web Dashboard — React/Vite UI with Discord OAuth2 login
- 🧠 Assistant — built-in YAML config assistant, no external AI required

---

## YAML Configuration

Each guild can have a YAML config stored in the database (editable via the dashboard or API). The config is merged additively on top of defaults.

### Prefix & Levels

```yaml
prefix: "!"

levels:
  # Numeric levels: 0 = everyone, 100 = owner. Higher number = more restricted.
  users:
    "123456789012345678": 50    # Give a specific user level 50
  roles:
    "987654321098765432": 30    # Give a role level 30
  commands:
    help: 0         # Everyone can use help
    ban: 30         # Requires level 30+
    purge: 20
```

### Tags

Tags are defined at the **top level** of your YAML config (not under `plugins:`). Each key is the tag name users type; the value is what the bot posts.

**Three formats are supported:**

---

#### Format 1 — Plain string

```yaml
tags:
  rules: "Please read the rules in <#CHANNEL_ID> before participating!"
  invite: "Invite link: https://discord.gg/yourserver"
```

Multi-line plain strings use the YAML `|` block scalar:

```yaml
tags:
  apply: |
    **📋 Staff Applications**

    Fill out the form here: https://forms.example.com/apply

    Requirements:
    • Must be 16 years or older
    • Must have no active infractions
```

---

#### Format 2 — Embed only

```yaml
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
```

---

#### Format 3 — Content + embed combined

The `content` line is sent as plain text above the embed. Useful for @mentions or context:

```yaml
tags:
  rules_full:
    content: "Here are the rules, {user.mention}:"
    embed:
      title: "📜 {server} Rules"
      description: "By participating you agree to these rules."
      color: "#FF0000"
      fields:
        - name: "Rule 1 — Respect"
          value: "Treat all members with respect."
          inline: false
```

---

#### Template variables

All variables work inside **every** tag field (content, title, description, field names/values, footer, etc.):

| Variable | Replaced with |
|---|---|
| `{user}` | Username of the person who triggered the tag |
| `{user.mention}` | @mention of the triggering user |
| `{user.id}` | User ID of the triggering user |
| `{server}` | Server name |
| `{server.id}` | Server ID |
| `{server.member_count}` | Current member count |
| `{server.icon}` | Server icon URL (use in `thumbnail` or `image`) |
| `{timestamp}` | Current date and time |
| `{timestamp.date}` | Current date only |
| `{timestamp.time}` | Current time only |
| `{trigger}` | The tag name that was searched (useful in error messages) |

---

#### Commands

| Trigger | What it does |
|---|---|
| `!tag <name>` | Display a tag |
| `!tag list` | List all available tags |
| `!<name>` | Shortcut — triggers the tag directly without typing `tag` |

---

#### Configurable error messages

Customise the bot's responses when a tag is not found or the tag list is empty. These live under `plugins.utility.messages`:

```yaml
plugins:
  utility:
    messages:
      tag_not_found: "Tag **{trigger}** not found. Use `!tag list` to see all available tags."
      tag_list_empty: "No tags have been created yet. Ask an admin to add some in the dashboard."
```

### Plugins

```yaml
plugins:
  command_aliases:
    config:
      aliases:
        b2: "ban"       # !b2 now works like !ban
        mute5: "mute"

  preset_reasons:
    config:
      presets:
        spam: "Spamming in chat"
        toxicity: "Toxic behaviour"

  moderation:
    enabled: true
    mute_role: "ROLE_ID"        # Optional: use a mute role instead of Discord timeout
    dm_on_action: true          # DM users when a mod action is taken
    messages:
      ban_success: "{user} has been banned | Case: {case_id}"
      kick_success: "{user} has been kicked | Case: {case_id}"
      mute_success: "{user} has been muted | Case: {case_id}"
      warn_success: "{user} has been warned | Case: {case_id}"
```

### YAML Logging

Logging is configured under the top-level `logging.config` key. Three categories:

| Category | Purpose |
|---|---|
| `server` | Gateway events (message edits/deletes, member join/leave, role/channel changes, voice, etc.) |
| `moderation` | Mod command events (ban, kick, mute, warn, etc.) |
| `mass_action` | Bulk operation events |

**Channel resolution order:**
1. Category must have `enabled: true`
2. Event must not have `enabled: false`
3. Use `event.channel` key → look up in `channels` map → fall back to `default_channels.all` → skip silently

**Example:**

```yaml
logging:
  config:
    server:
      enabled: true
      default_channels:
        all: "LOG_CHANNEL_ID"
      channels:
        message_logs: "MESSAGE_LOG_CHANNEL_ID"
        member_logs: "MEMBER_LOG_CHANNEL_ID"
      events:
        message_delete:
          enabled: true
          channel: message_logs
          message:
            embed:
              title: "Message Deleted"
              color: "#e74c3c"
              description: "{user} deleted a message in {channel}"
        member_join:
          enabled: true
          channel: member_logs

    moderation:
      enabled: true
      default_channels:
        all: "MOD_LOG_CHANNEL_ID"
      events:
        member_ban:
          enabled: true
          attach_file: true     # Send full details as a .txt file
```

**Embed message placeholders** — any unmatched placeholder becomes an empty string:

| Placeholder | Description |
|---|---|
| `{user}` | User mention |
| `{user_tag}` | User tag (name#0000) |
| `{user_id}` | User ID |
| `{moderator}` | Moderator mention |
| `{moderator_tag}` | Moderator tag |
| `{channel}` | Channel mention |
| `{reason}` | Action reason |
| `{case_id}` | Case number |
| `{timestamp}` | ISO timestamp |
| `{timestamp.date}` | Date only |
| `{timestamp.time}` | Time only |

### YAML Automod Rules

Configured under `automod.config.rules`. Each rule has triggers (AND logic — all must fire), conditions, and actions (executed in order).

```yaml
automod:
  config:
    enabled: true
    rules:
      no_spam:
        triggers:
          - type: message_spam
            limit: 5
            window: 5s
        conditions:
          ignore_roles:
            - "MOD_ROLE_ID"
          ignore_channels:
            - "BOT_CHANNEL_ID"
        actions:
          - type: delete_message
          - type: mute
            duration: 10m
            reason: "Spamming"
          - type: log

      no_invites:
        triggers:
          - type: invite_link
            allow_own_server: true
        actions:
          - type: delete_message
          - type: warn
            reason: "No invite links"

      word_filter:
        triggers:
          - type: word_filter
            words: ["badword1", "badword2"]
            match_type: word      # word | substring | regex
        actions:
          - type: delete_message
          - type: add_message_to_channel
            channel: "LOG_CHANNEL_ID"
            message: "{user} triggered word filter in {channel}"
```

**Trigger types:**

| Type | Key Parameters |
|---|---|
| `message_spam` | `limit`, `window` (e.g. `5s`, `1m`) |
| `word_filter` | `words[]`, `match_type` (word/substring/regex) |
| `invite_link` | `allow_own_server` (bool) |
| `link_filter` | `domains[]`, `mode` (blacklist/whitelist), `block_all` |
| `mention_spam` | `threshold` |
| `caps_filter` | `min_length`, `percentage` (0–100) |
| `emoji_spam` | `max_emojis` |
| `attachment_filter` | `blocked_extensions[]` (e.g. `["exe","zip"]`) |
| `member_join` | `min_account_age` (e.g. `7d`) — fires if account is newer |
| `zalgo_filter` | _(no params — detects zalgo/combining characters)_ |
| `repeated_characters` | `max_repeats`, `min_length` |

**Conditions:**

```yaml
conditions:
  ignore_roles: ["ROLE_ID"]
  ignore_channels: ["CHANNEL_ID"]
  only_channels: ["CHANNEL_ID"]
  ignore_users: ["USER_ID"]
  only_users: ["USER_ID"]
```

**Action types:**

| Type | Parameters |
|---|---|
| `delete_message` | _(none)_ |
| `clean` | `count` (default 10, max 100) |
| `warn` | `reason` |
| `mute` | `duration`, `reason` |
| `kick` | `reason` |
| `ban` | `duration` (optional), `reason` |
| `add_role` | `role` (role ID) |
| `remove_role` | `role` (role ID) |
| `add_message_to_channel` | `channel` (channel ID), `message` |
| `log` | `channel` (optional extra channel ID) |
| `set_nickname` | `nickname` |

---

---

## Messages Reference

Every success message, error message, and DM notification sent by the moderation system is fully customizable through your guild's YAML config. See `data/default-config.yaml` for a complete annotated copy of every key with its default value.

### How Messages Work

All messages live under `plugins.moderation.messages` (or `plugins.reaction_roles.messages` for reaction role messages). Each key accepts:

**Plain string:**
```yaml
plugins:
  moderation:
    messages:
      ban_success: "**{user}** was banned by {mod}. Case: #{case_id}"
```

**Embed only:**
```yaml
plugins:
  moderation:
    messages:
      ban_success:
        embed:
          title: "🔨 Member Banned"
          color: "#e74c3c"
          fields:
            - name: "User"
              value: "{user}"
              inline: true
            - name: "Moderator"
              value: "{mod}"
              inline: true
            - name: "Reason"
              value: "{reason}"
              inline: false
            - name: "Case"
              value: "#{case_id}"
              inline: true
```

**Content + embed combined:**
```yaml
plugins:
  moderation:
    messages:
      ban_success:
        content: "Action logged in <#CHANNEL_ID>."
        embed:
          title: "🔨 {user} banned"
          color: "#e74c3c"
          description: "**Reason:** {reason}"
```

### Template Variables

These variables are available in every message field (content, title, description, field values, footer, etc.):

| Variable | Replaced with |
|---|---|
| `{user}` | Target's `username#discriminator` |
| `{user.mention}` | `<@user_id>` mention |
| `{user.id}` | Target user ID |
| `{user.name}` | Target username (no discriminator) |
| `{mod}` | Moderator's `username#discriminator` |
| `{mod.mention}` | `<@mod_id>` mention |
| `{reason}` | Reason string |
| `{case_id}` | Case number |
| `{duration}` | Duration label (e.g. `7d`, `Indefinite`) |
| `{expires_at}` | Discord timestamp for expiry |
| `{server}` | Server name |
| `{channel}` | Channel mention (`<#channel_id>`) |
| `{count}` | Numeric count (purge amount, lock count, etc.) |
| `{role}` | Role name |
| `{nickname}` | New nickname |
| `{note_id}` | Note ID number |

---

### Action Success Messages

| Key | When sent | Key variables |
|---|---|---|
| `ban_success` | Member banned | `{user}`, `{mod}`, `{reason}`, `{case_id}` |
| `tempban_success` | Member temp banned | `{user}`, `{mod}`, `{reason}`, `{duration}`, `{expires_at}`, `{case_id}` |
| `softban_success` | Member softbanned | `{user}`, `{mod}`, `{reason}`, `{case_id}` |
| `unban_success` | Member unbanned | `{user}`, `{mod}`, `{reason}`, `{case_id}` |
| `kick_success` | Member kicked | `{user}`, `{mod}`, `{reason}`, `{case_id}` |
| `mute_success` | Member muted | `{user}`, `{mod}`, `{reason}`, `{duration}`, `{case_id}` |
| `unmute_success` | Member unmuted | `{user}`, `{mod}`, `{reason}`, `{case_id}` |
| `warn_success` | Member warned | `{user}`, `{mod}`, `{reason}`, `{case_id}` |
| `purge_success` | Messages purged | `{count}` |
| `slowmode_success` | Slowmode set | `{count}`, `{channel}`, `{mod}` |
| `slowmode_off` | Slowmode removed | `{channel}`, `{mod}` |
| `lock_success` | Channel locked (mod reply) | `{channel}`, `{reason}`, `{mod}` |
| `lock_channel_notice` | Lock notice in the channel | `{channel}`, `{reason}`, `{mod}` |
| `unlock_success` | Channel unlocked (mod reply) | `{channel}`, `{reason}`, `{mod}` |
| `unlock_channel_notice` | Unlock notice in the channel | `{channel}`, `{mod}` |
| `hide_success` | Channel hidden from @everyone | `{channel}`, `{reason}`, `{mod}` |
| `unhide_success` | Channel made visible | `{channel}`, `{mod}` |
| `nick_success` | Nickname set | `{user}`, `{nickname}`, `{mod}`, `{case_id}` |
| `resetnick_success` | Nickname reset | `{user}`, `{mod}` |
| `locknick_success` | Nickname locked | `{user}`, `{nickname}`, `{mod}` |
| `unlocknick_success` | Nickname lock removed | `{user}`, `{mod}` |
| `addrole_success` | Role added | `{user}`, `{role}`, `{reason}`, `{mod}` |
| `removerole_success` | Role removed | `{user}`, `{role}`, `{reason}`, `{mod}` |
| `temprole_success` | Temp role given | `{user}`, `{role}`, `{duration}`, `{expires_at}`, `{mod}`, `{reason}` |
| `roleban_success` | Role ban applied | `{user}`, `{role}`, `{reason}`, `{case_id}`, `{mod}` |
| `unroleban_success` | Role ban lifted | `{user}`, `{role}`, `{mod}` |
| `watch_success` | User added to watchlist | `{user}`, `{reason}`, `{mod}` |
| `unwatch_success` | User removed from watchlist | `{user}`, `{mod}` |
| `note_success` | Note added | `{user}`, `{note_id}`, `{mod}` |
| `deletenote_success` | Note deleted | `{user}`, `{note_id}`, `{mod}` |
| `raidmode_on_success` | Raid mode activated | `{mod}`, `{count}` |
| `raidmode_off_success` | Raid mode deactivated | `{mod}` |
| `massrole_success` | Mass role given | `{role}`, `{count}`, `{mod}`, `{reason}` |
| `massremoverole_success` | Mass role removed | `{role}`, `{count}`, `{mod}`, `{reason}` |
| `masstemprole_success` | Mass temp role given | `{role}`, `{count}`, `{duration}`, `{mod}`, `{reason}` |

**Informational / empty-state messages** — shown when a list command has nothing to display, or a status command reports an inactive state:

| Key | When shown | Key variables |
|---|---|---|
| `raidmode_inactive` | `!raidmode status` and raid mode is off | — |
| `banlist_empty` | `!banlist` has no bans | — |
| `mutelist_empty` | `!mutelist` has no muted members | — |
| `temproles_empty` | `!temproles` has no active entries | — |
| `watchlist_empty` | `!watchlist` is empty | — |
| `watchlist_no_entry` | Target not on watchlist | `{user}` |
| `rolebanned_empty` | `!rolebanned` has no entries server-wide | — |
| `rolebanned_user_empty` | `!rolebanned @user` has no entries | `{user}` |
| `no_notes` | `!viewnotes @user` returns no notes | `{user}` |
| `seen_no_data` | `!seen @user` has no tracking data | `{user}` |
| `modnick_not_enabled` | `!modnick` is run but plugin disabled | — |
| `modnick_clean` | `!modnick @user` finds no violations | `{user}` |

---

### DM Messages

Sent privately to the user when a mod action is taken (only if `dm_on_action: true`).

| Key | When sent |
|---|---|
| `ban_dm` | User is banned |
| `tempban_dm` | User is temp banned |
| `softban_dm` | User is softbanned |
| `kick_dm` | User is kicked |
| `mute_dm` | User is muted |
| `unmute_dm` | User is unmuted |
| `warn_dm` | User is warned |
| `tempmute_dm` | User is temp muted |

All DM messages support the same template variables as action success messages plus `{server}`.

---

### Error Messages

Every error message is customizable. All support plain string or embed format.

| Key | When shown |
|---|---|
| **Generic** | |
| `err_no_permission` | Command level check fails |
| `err_user_not_found` | Cannot resolve the target user |
| `err_not_in_server` | Target is not a member of the server |
| `err_invalid_id` | Provided ID is not a valid snowflake |
| `err_invalid_duration` | Duration string cannot be parsed |
| `err_provide_role` | No role argument given |
| `err_hierarchy` | Target has equal or higher level than executor |
| **Ban** | |
| `err_cannot_ban_self` | Mod tries to ban themselves |
| `err_cannot_ban_bot` | Mod tries to ban the bot |
| `err_cannot_softban_self` | Mod tries to softban themselves |
| `err_bot_cannot_ban` | Bot lacks permission to ban the target |
| `err_not_banned` | Unban target is not currently banned |
| **Kick** | |
| `err_bot_cannot_kick` | Bot lacks permission to kick |
| `err_cannot_kick_self` | Mod tries to kick themselves |
| **Mute** | |
| `err_cannot_mute_self` | Mod tries to mute themselves |
| `err_bot_cannot_mute` | Bot lacks permission to mute |
| **Warn** | |
| `err_cannot_warn_self` | Mod tries to warn themselves |
| `err_cannot_warn_bot` | Mod tries to warn a bot |
| **Purge** | |
| `err_purge_invalid` | Amount is out of range |
| **Slowmode** | |
| `err_slowmode_usage` | No arguments provided to slowmode command |
| `err_slowmode_invalid` | Duration string cannot be parsed for slowmode |
| **Nick** | |
| `err_nick_cannot_manage` | Bot cannot manage target's nickname |
| `err_nick_required` | No nickname text provided |
| `err_nick_no_lock` | `unlocknick` target has no lock — vars: `{user}` |
| **Role** | |
| `err_role_not_found` | Role cannot be resolved |
| `err_role_managed` | Role is bot/integration-managed |
| `err_role_above_bot` | Role is above the bot's highest role |
| `err_role_already_has` | Target already has the role — vars: `{user}`, `{role}` |
| `err_role_does_not_have` | Target does not have the role — vars: `{user}`, `{role}` |
| `err_temprole_usage` | Wrong temprole arguments |
| `err_unroleban_not_found` | No matching role ban — vars: `{user}`, `{role}` |
| **Mass Role** | |
| `err_massrole_not_found` | Role cannot be resolved for mass role command |
| `err_massrole_no_targets` | No valid targets provided |
| **Watch** | |
| `err_watch_already` | User is already on the watchlist — vars: `{user}` |
| `err_watch_not_found` | User is not on the watchlist — vars: `{user}` |
| **Notes** | |
| `err_note_required` | No note text provided |
| `err_note_invalid_id` | Note ID is not a valid number |
| `err_note_not_found` | Note ID not found — vars: `{note_id}` |
| **Raidmode** | |
| `err_raidmode_usage` | Invalid subcommand |
| `err_raidmode_already_on` | Raid mode is already active |
| `err_raidmode_already_off` | Raid mode is not active |

---

### Reaction Roles Messages

These live under `plugins.reaction_roles.messages`.

| Key | When shown | Key variables |
|---|---|---|
| `rr_role_given` | User receives a role | `{trigger}` |
| `rr_role_removed` | User's role is removed | `{trigger}` |
| `rr_max_reached` | User hits panel role limit | `{count}` |
| `rr_missing_required` | User missing required role | `{trigger}` |
| `rr_assign_dm` | DM on role assign | `{trigger}`, `{server}` |
| `rr_remove_dm` | DM on role remove | `{trigger}`, `{server}` |
| `rr_created` | Panel created | `{trigger}` |
| `rr_already_exists` | Panel name conflicts | `{trigger}` |
| `rr_entry_added` | Role added to panel | `{reason}` |
| `rr_entry_removed` | Role removed from panel | `{reason}` |
| `rr_entry_not_found` | Role not found in panel | `{reason}` |
| `rr_max_entries_reached` | Panel is full | `{trigger}`, `{count}` |
| `rr_no_entries` | Panel has no entries yet | `{trigger}` |
| `rr_posted` | Panel posted to channel | `{trigger}`, `{channel}` |
| `rr_edited` | Panel updated | `{trigger}` |

> **Tip:** See [`data/default-config.yaml`](data/default-config.yaml) for a complete annotated copy of every configurable key with its default value. Copy-paste sections directly into your guild's YAML config.

---

## Punishment Escalation

Punishment escalation automatically applies a configurable action (mute, kick, or ban) when a user accumulates a set number of **manual warnings** from `!warn` or `!forcewarn`. It is completely separate from automod — only human-issued warnings feed it.

**YAML key:** `punishment_escalation.config`  
**DB tables:** `escalation_executed`, `mod_cases`

### How It Works

1. **Only warnings trigger escalation** — no other mod actions, no automod actions feed into this system at all. Every time the `!warn` or `!forcewarn` command is successfully used, the escalation system checks the user's active warning count.

2. **Warning count resolution** — the system queries all active (non-expired) warnings for the user in the guild from the `mod_cases` table. It counts them, checks if the count matches any configured step's `warnings` value, and if that step hasn't been executed yet at this count, it executes the action.

3. **Step execution** — each step fires **exactly once** per warning threshold. If a user is at 3 warnings and receives a 4th, the system checks whether the 3-warning step has already fired. It only fires the 5-warning step when the user actually reaches 5 warnings.

4. **Actions available** — only `mute`, `kick`, and `ban`. No warns, no notes, no other actions. Mute uses Discord timeout. Ban with a `duration` is a temp-ban that auto-unbans after the duration. Ban with `duration: null` is permanent.

**Example config:**

```yaml
punishment_escalation:
  config:
    enabled: true
    warn_expiry: 30d       # Warnings older than this are excluded from the count
    steps:
      - warnings: 3
        action: mute
        duration: 1h
        reason: "Reached 3 warnings (auto-escalation)"
      - warnings: 5
        action: kick
        reason: "Reached 5 warnings (auto-escalation)"
      - warnings: 7
        action: ban
        duration: null     # Permanent
        reason: "Reached 7 warnings (auto-escalation)"
```

---

## Automod Escalation

Automod escalation automatically steps up punishments when a user triggers the same YAML automod **rule group** repeatedly. Each named rule in `automod.config.rules` is treated as its own escalation group.

**YAML key:** `automod_escalation.config`  
**DB tables:** `automod_violations`, `automod_escalation_executed`

### How It Works

1. **Each YAML automod rule is a group** — violations from `no_spam` and `no_invites` are tracked separately. A user's spam count does not affect their invite-link escalation.

2. **Violation expiry** — each violation record has a timestamp. The count only includes violations within the configured `violation_expiry` window.

3. **Steps fire once per threshold** — same as punishment escalation. A step only fires when the count first hits the threshold; it won't re-fire if the count stays at or above it.

**Example config:**

```yaml
automod_escalation:
  config:
    enabled: true
    violation_expiry: 7d
    groups:
      no_spam:
        steps:
          - violations: 3
            action: mute
            duration: 10m
            reason: "Repeated spam (auto-escalation)"
          - violations: 6
            action: kick
            reason: "Excessive spam (auto-escalation)"
      no_invites:
        steps:
          - violations: 2
            action: warn
            reason: "Posting invite links"
          - violations: 4
            action: mute
            duration: 1h
            reason: "Repeated invite links (auto-escalation)"
```

---

## Anti-Nuke

Anti-nuke detects rapid destructive server changes and automatically reverses or punishes the responsible admin.

**YAML key:** `antinuke.config`

**Monitored actions:**

| Action | What triggers it |
|---|---|
| `channel_delete` | Too many channels deleted in the time window |
| `channel_create` | Too many channels created |
| `channel_update` | Too many channel permission overwrites changed |
| `role_delete` | Too many roles deleted |
| `role_create` | Too many roles created |
| `role_update` | Too many role permission changes |
| `ban` | Too many members banned |
| `kick` | Too many members removed |
| `member_update` | Too many role-strip operations |
| `webhook_update` | Too many webhook changes |
| `guild_update` | Server settings changed (icon, name, verification level) |
| `emoji_delete` | Too many emojis deleted |
| `emoji_create` | Too many emojis created |
| `sticker_delete` | Too many stickers deleted |
| `integrations_update` | Integration changes |
| `bot_add` | Unauthorized bot added to the server |

**Example config:**

```yaml
antinuke:
  config:
    enabled: true
    whitelist:
      - "YOUR_USER_ID"       # Owner — never actioned
    action: ban              # ban | kick | strip_roles
    threshold: 5             # Actions within the window before triggering
    window: 10s              # Time window for counting actions
    bot_add:
      enabled: true
      whitelist_bots: []     # Bot IDs allowed to be added without triggering
```

---

## Anti-Raid

Anti-raid detects sudden mass-join events and applies configurable protections.

**YAML key:** `antiraid.config`

**Example config:**

```yaml
antiraid:
  config:
    enabled: true
    threshold: 10            # Joins within the window to trigger raid mode
    window: 10s
    action: kick             # kick | ban
    min_account_age: 7d      # New accounts younger than this are actioned
    auto_exit: true          # Automatically exit raid mode after the flood stops
    auto_exit_after: 5m
```

Staff can toggle raid mode manually with `!raidmode on` / `!raidmode off`.

---

## Server Logging

Two logging systems run side-by-side:

### Legacy (DB-backed)
Set a channel via the dashboard's Logging tab. Events are split into categories (messages, members, roles, channels, server, voice, invites, threads, emoji, bots) and can be routed to different channels per category.

### YAML-driven
Configured under `logging.config` in the guild YAML (see [YAML Logging](#yaml-logging) above). Provides full embed customization, named channels, per-event enable/disable, and optional `.txt` file attachments for detailed logs.

**Both systems run simultaneously.** A guild can use either or both. The YAML system includes automatic duplicate suppression — when a mod command fires the moderation log, the matching gateway event is suppressed from the server log to prevent double-posting.

**Covered events:**

`messageDelete` · `messageEdit` · `messageBulkDelete` · `messagePinned` · `memberJoin` · `memberLeave` · `memberKick` · `memberBan` · `memberUnban` · `nicknameChange` · `usernameChange` · `avatarChange` · `rolesChange` · `memberTimeout` · `timeoutRemoved` · `roleCreate` · `roleDelete` · `roleUpdate` · `channelCreate` · `channelDelete` · `channelUpdate` · `serverUpdate` · `boostChange` · `voiceJoin` · `voiceLeave` · `voiceMove` · `voiceMuteDeafen` · `inviteCreate` · `inviteDelete` · `threadCreate` · `threadDelete` · `threadUpdate` · `emojiCreate` · `emojiDelete` · `emojiUpdate` · `stickerCreate` · `stickerDelete` · `botAdded` · `botRemoved` · `webhookCreate` · `webhookDelete`

---

## Dashboard

A React/Vite web UI for managing all guild settings without touching YAML directly.

**Tabs:**

| Tab | Manages |
|---|---|
| Overview | Guild summary, quick stats |
| Moderation | Mod plugin config, DM messages |
| Logging | Server log channels per category |
| Anti-Nuke | Nuke protection thresholds and action |
| Anti-Raid | Raid protection levels and filters |
| Tickets | Ticket panels, categories, settings |
| Starboard | Starboard channel and threshold |
| Autoclean | Scheduled channel cleanup rules |
| YAML Editor | Raw YAML config editor |
| Settings | Prefix, log channel, mute role, etc. |

---

## Self-Hosting Guide

See **[SETUP_GUIDE.md](SETUP_GUIDE.md)** for the full self-hosting guide. Covers:

- Discord application setup
- Local / VPS hosting (Ubuntu/Debian)
- Railway one-click deploy
- Render web services
- Required environment variables and Discord intents

---

## Environment Variables

### Bot

| Variable | Required | Description |
|---|---|---|
| `DISCORD_BOT_TOKEN` | ✅ | Bot token from the Discord Developer Portal |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `PORT` | No | HTTP port (default: `3000`) |

### Dashboard

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Same PostgreSQL database as the bot |
| `DISCORD_CLIENT_ID` | ✅ | Application client ID |
| `DISCORD_CLIENT_SECRET` | ✅ | Application client secret |
| `SESSION_SECRET` | ✅ | Random string for signing session cookies |
| `DASHBOARD_URL` | ✅ | Full public URL of the dashboard (e.g. `https://yourdomain.com`) |
| `DISCORD_BOT_TOKEN` | Recommended | Used to fetch channels, roles, and audit log |
| `BOT_API_URL` | No | Internal URL of the bot API server (default: `http://localhost:3000`) |
| `DASHBOARD_PORT` | No | Dashboard port (default: `5000`) |
| `NODE_ENV` | No | Set to `production` in production deployments |

---

## Data Storage

All data is stored in **PostgreSQL**.

| Table / Store | Contents |
|---|---|
| `guild_configs` | Per-guild YAML configuration |
| `bot_store` (key: `settings`) | Per-guild settings (log channel, mute role, etc.) |
| `bot_store` (key: `serverlog`) | Legacy server logging config |
| `bot_store` (key: `antinuke`) | Anti-nuke config |
| `bot_store` (key: `antiraid`) | Anti-raid config |
| `bot_store` (key: `mod_cases`) | Moderation cases |
| `bot_store` (key: `case_counter`) | Case ID counter per guild |
| `bot_store` (key: `tickets`) | Ticket data |
| `bot_store` (key: `ticketPanels`) | Ticket panel configs |
| `bot_store` (key: `starboard`) | Starboard config and starred messages |
| `bot_store` (key: `autoclean`) | Autoclean rules |
| `bot_store` (key: `autoreaction`) | Autoreaction triggers |
| `bot_store` (key: `autoreply`) | Autoreply triggers |
| `bot_store` (key: `ticketConfig`) | Ticket open/close messages |
| `session` | Dashboard OAuth2 sessions |
| `escalation_executed` | Tracks which punishment escalation steps have fired per user |
| `automod_violations` | Per-violation log with expiry timestamps for automod escalation |
| `automod_escalation_executed` | Tracks which automod escalation steps have fired per group per user |

---

## Project Structure

```
.
├── bot/                     # Bot process + HTTP API
│   └── src/
│       ├── bot/
│       │   ├── commands/
│       │   │   ├── mod/     # Moderation commands
│       │   │   └── util/    # Utility commands
│       │   ├── handlers/    # Discord event handlers
│       │   ├── lib/         # Core logic (modlog, serverlog, automod, escalation…)
│       │   └── store/       # Data layer (DB, guildConfig, antinuke…)
│       └── index.ts         # HTTP server + bot entry point
├── dashboard/               # React/Vite dashboard
│   ├── src/
│   │   ├── components/      # UI components
│   │   └── pages/           # Dashboard pages/tabs
│   └── server/              # Dashboard Express server + OAuth2
├── lib/
│   └── db/                  # Drizzle ORM schema + connection pool
├── SETUP_GUIDE.md           # Self-hosting instructions
└── README.md
```

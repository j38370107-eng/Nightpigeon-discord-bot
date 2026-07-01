export default function Docs() {
  return (
    <div style={{ padding: "36px 32px", maxWidth: 860 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
        Documentation
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 40, lineHeight: 1.6 }}>
        NightPigeon is configured entirely through a single YAML file per server.
        Edit it in the <b>Config</b> tab or via the <code style={code}>{">"}</code>config Discord command.
        Changes apply within seconds — no restart needed.
      </p>

      <Section title="Bot Command">
        <p>NightPigeon has one command:</p>
        <Pre>{`>config               — downloads current config as a .yaml file
>config (+ .yaml file) — uploads and applies new config`}</Pre>
        <p>Requires <b>Administrator</b> permission.</p>
      </Section>

      <Section title="Top-level keys">
        <Table rows={[
          ["prefix", "string", `">"`, "Command prefix for the bot"],
          ["levels", "object", "—", "Permission level assignments for users, roles, and commands"],
          ["tags", "object", "—", "Custom text responses triggered by tag name"],
          ["logging", "object", "—", "YAML-driven server logging configuration"],
          ["automod", "object", "—", "YAML-driven automod rules engine"],
          ["plugins", "object", "—", "Plugin-specific configuration blocks"],
        ]} />
      </Section>

      <Section title="levels">
        <p>Controls who can use which commands. Each command has a required level (0–100). Assign levels to users or roles to grant access.</p>
        <Pre>{`levels:
  users:
    "123456789012345678": 100   # user ID → level
  roles:
    "987654321098765432": 50    # role ID → level
  commands:
    ban: 50        # override default level for a command
    kick: 25`}</Pre>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 8 }}>
          Level 0 = everyone · Level 100 = bot owner only. Default levels are set per-command automatically.
        </p>
      </Section>

      <Section title="tags">
        <p>
          Custom commands per server. Tags live at the <b>top level</b> of your config — not under <code style={code}>plugins:</code>.
          Trigger with <code style={code}>!tag &lt;name&gt;</code>, <code style={code}>!tag list</code>, or the shortcut <code style={code}>!&lt;name&gt;</code>.
        </p>

        <SubSection title="Format 1 — Plain string">
          <Pre>{`tags:
  rules: "Please read <#CHANNEL_ID> before chatting!"
  invite: "https://discord.gg/yourserver"
  apply: |
    **📋 Staff Applications**
    Apply at: https://forms.example.com/apply`}</Pre>
        </SubSection>

        <SubSection title="Format 2 — Embed only">
          <Pre>{`tags:
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
      footer: "Use !tag list to see all tags • {timestamp.date}"`}</Pre>
        </SubSection>

        <SubSection title="Format 3 — Content + embed">
          <Pre>{`tags:
  rules_full:
    content: "Here are the rules, {user.mention}:"
    embed:
      title: "📜 {server} Rules"
      description: "By participating you agree to these rules."
      color: "#FF0000"`}</Pre>
        </SubSection>

        <SubSection title="Template variables">
          <Table rows={[
            ["{user}", "Username of the person who triggered the tag"],
            ["{user.mention}", "@mention of the triggering user"],
            ["{user.id}", "User ID of the triggering user"],
            ["{server}", "Server name"],
            ["{server.id}", "Server ID"],
            ["{server.member_count}", "Current member count"],
            ["{server.icon}", "Server icon URL (use in thumbnail/image)"],
            ["{timestamp}", "Current date and time"],
            ["{timestamp.date}", "Current date only"],
            ["{timestamp.time}", "Current time only"],
            ["{trigger}", "Tag name searched (useful in error messages)"],
          ]} />
        </SubSection>

        <SubSection title="Configurable error messages">
          <Pre>{`plugins:
  utility:
    messages:
      tag_not_found: "Tag **{trigger}** not found. Use \`!tag list\` to see all tags."
      # tag_not_found: null   ← set to null for silent behaviour
      tag_list_empty: "No tags have been created yet."`}</Pre>
        </SubSection>
      </Section>

      <Section title="logging">
        <p>
          The YAML logging system routes Discord events to channels you define.
          It sits alongside the legacy server-log system — configure either or both.
        </p>

        <SubSection title="Schema overview">
          <Pre>{`logging:
  config:
    default_log_channel: "CHANNEL_ID"   # fallback for unmapped events
    channels:
      mod_logs:     "CHANNEL_ID"        # named channel aliases
      message_logs: "CHANNEL_ID"
      server_logs:  "CHANNEL_ID"
      voice_logs:   "CHANNEL_ID"
    events:
      message_delete:  message_logs     # eventKey → channel alias
      message_edit:    message_logs
      message_bulk_delete: message_logs
      member_ban:      mod_logs
      member_kick:     mod_logs
      member_timeout:  mod_logs
      member_join:     server_logs
      member_leave:    server_logs
      voice_join:      voice_logs
      voice_leave:     voice_logs
      voice_move:      voice_logs
    enabled:
      avatar_change: false              # set false to suppress any event`}</Pre>
        </SubSection>

        <SubSection title="Channel resolution order">
          <p>For each event the bot checks in order:</p>
          <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
            <li>If <code style={code}>enabled[event]</code> is <code style={code}>false</code> → skip entirely</li>
            <li>If <code style={code}>events[event]</code> maps to a name in <code style={code}>channels</code> → send there</li>
            <li>If <code style={code}>default_log_channel</code> is set → send there</li>
            <li>Otherwise → skip silently</li>
          </ol>
        </SubSection>

        <SubSection title="Supported event keys">
          <Table rows={[
            ["message_delete", "Message was deleted"],
            ["message_edit", "Message was edited"],
            ["message_bulk_delete", "Bulk purge (attaches .txt log)"],
            ["message_pinned", "Message pinned or unpinned"],
            ["member_join", "Member joined the server"],
            ["member_leave", "Member left the server"],
            ["member_ban", "Member was banned"],
            ["member_unban", "Member was unbanned"],
            ["member_kick", "Member was kicked"],
            ["member_timeout", "Member was timed out"],
            ["timeout_removed", "Timeout was removed"],
            ["nickname_change", "Nickname changed"],
            ["username_change", "Username/display name changed"],
            ["avatar_change", "Avatar changed"],
            ["roles_change", "Roles added or removed from member"],
            ["role_create", "Role created"],
            ["role_delete", "Role deleted"],
            ["role_update", "Role name/color/perms changed"],
            ["channel_create", "Channel created"],
            ["channel_delete", "Channel deleted"],
            ["channel_update", "Channel name/topic/slowmode changed"],
            ["server_update", "Server name/icon/verification changed"],
            ["boost_change", "Server boost status changed"],
            ["voice_join", "Joined a voice channel"],
            ["voice_leave", "Left a voice channel"],
            ["voice_move", "Moved between voice channels"],
            ["voice_mute_deafen", "Server muted or deafened"],
            ["stage_event", "Stage channel started or ended"],
            ["invite_create", "Invite created"],
            ["invite_delete", "Invite deleted"],
            ["thread_create", "Thread created"],
            ["thread_delete", "Thread deleted"],
            ["thread_update", "Thread archived or renamed"],
            ["emoji_create", "Emoji added"],
            ["emoji_delete", "Emoji deleted"],
            ["emoji_update", "Emoji renamed"],
            ["sticker_create", "Sticker added"],
            ["sticker_delete", "Sticker deleted"],
            ["webhook_create", "Webhook created"],
            ["webhook_delete", "Webhook deleted"],
            ["bot_added", "Bot added to server"],
            ["bot_removed", "Bot removed from server"],
            ["integration_change", "Integration added or removed"],
          ]} />
        </SubSection>

        <SubSection title="Embed colours">
          <Table rows={[
            ["🔴 #ED4245", "Delete / ban / kick / leave"],
            ["🟡 #FEE75C", "Edit / update / timeout / role change"],
            ["🟢 #57F287", "Join / create / unban"],
          ]} />
        </SubSection>
      </Section>

      <Section title="automod">
        <p>
          The YAML automod engine evaluates named rules on every message and on member joins.
          Rules use <b>AND logic</b> for triggers — all listed triggers must fire before actions run.
        </p>

        <SubSection title="Schema overview">
          <Pre>{`automod:
  config:
    enabled: true
    rules:
      my_spam_rule:
        enabled: true
        triggers:
          - type: message_spam
            max_messages: 5
            within_seconds: 5
            per_channel: false
        conditions:
          ignore_roles: ["MOD_ROLE_ID"]
          ignore_channels: ["BOT_COMMANDS_CHANNEL_ID"]
        actions:
          - type: delete_message
          - type: mute
            duration: 10m
          - type: warn`}</Pre>
        </SubSection>

        <SubSection title="Trigger types">
          <Table rows={[
            ["message_spam", "max_messages, within_seconds, per_channel — rate-limit on messages sent"],
            ["word_filter", "words[], match_type (word/substring/regex), case_sensitive"],
            ["invite_link", "allow_own_server (bool) — blocks Discord invite links"],
            ["link_filter", "block_all, allowed_domains[], blocked_domains[] — URL filter"],
            ["mention_spam", "max_mentions, max_unique_mentions, global_max_mentions, within_seconds"],
            ["caps_filter", "min_length, percent — minimum message length and caps threshold (%)"],
            ["emoji_spam", "max_emojis — maximum emoji per message"],
            ["attachment_filter", "blocked_extensions[] — e.g. [exe, sh, bat]"],
            ["member_join", "account_age_below — e.g. 7d (fires for new accounts on join)"],
            ["zalgo_filter", "(no options) — detects zalgo / combining-character abuse"],
            ["repeated_characters", "max_repeats, min_length — max consecutive identical chars"],
          ]} />
        </SubSection>

        <SubSection title="Conditions (all optional)">
          <Table rows={[
            ["ignore_roles", "List of role IDs — skip rule for members with these roles"],
            ["only_roles", "List of role IDs — only apply rule to members with these roles"],
            ["ignore_channels", "List of channel IDs — skip rule in these channels"],
            ["only_channels", "List of channel IDs — only apply rule in these channels"],
            ["ignore_users", "List of user IDs — skip rule for these users"],
            ["only_users", "List of user IDs — only apply rule to these users"],
          ]} />
        </SubSection>

        <SubSection title="Action types">
          <Table rows={[
            ["delete_message", "Delete the triggering message (only runs once even if listed twice)"],
            ["clean", "count — bulk-delete the user's recent messages in the channel"],
            ["warn", "Add a warning case to the user's mod history"],
            ["mute", "duration (e.g. 10m, 1h, 7d) — timeout or mute-role the user"],
            ["kick", "Kick the user from the server"],
            ["ban", "duration (optional) — ban the user; omit for permanent"],
            ["add_role", "role — add a role ID to the user"],
            ["remove_role", "role — remove a role ID from the user"],
            ["add_message_to_channel", "channel, message — send a message to a channel"],
            ["log", "channel (optional) — log via YAML logging + optional explicit channel"],
            ["set_nickname", "nickname — set the user's server nickname"],
            ["add_to_blacklist", "Mark the user (logged; implement blacklist store as needed)"],
          ]} />
        </SubSection>

        <SubSection title="Placeholders in action messages">
          <Table rows={[
            ["{user}", "User mention (<@ID>)"],
            ["{userId}", "User ID"],
            ["{userTag}", "Username#discriminator"],
            ["{channel}", "Channel mention (<#ID>)"],
            ["{guild}", "Server name"],
            ["{rule}", "Rule name"],
            ["{reason}", "Trigger description"],
          ]} />
        </SubSection>

        <SubSection title="Full example">
          <Pre>{`automod:
  config:
    enabled: true
    rules:

      # Block invite links everywhere except #partnerships
      no_invites:
        enabled: true
        triggers:
          - type: invite_link
            allow_own_server: true
        conditions:
          ignore_roles: ["MOD_ROLE_ID", "TRUSTED_ROLE_ID"]
          ignore_channels: ["PARTNERSHIPS_CHANNEL_ID"]
        actions:
          - type: delete_message
          - type: warn

      # Mute spammers after 6 messages in 5 seconds
      anti_spam:
        enabled: true
        triggers:
          - type: message_spam
            max_messages: 6
            within_seconds: 5
        conditions:
          ignore_roles: ["MOD_ROLE_ID"]
        actions:
          - type: delete_message
          - type: mute
            duration: 10m
          - type: log

      # Kick brand-new accounts on join
      new_account_gate:
        enabled: true
        triggers:
          - type: member_join
            account_age_below: 3d
        actions:
          - type: kick`}</Pre>
        </SubSection>
      </Section>

      <Section title="plugins">
        <p>Plugin config blocks live under <code style={code}>plugins:</code>. Each plugin has a <code style={code}>config:</code> sub-key.</p>

        <SubSection title="command_aliases">
          <Pre>{`plugins:
  command_aliases:
    config:
      aliases:
        b: ban
        k: kick
        m: mute`}</Pre>
        </SubSection>

        <SubSection title="preset_reasons">
          <Pre>{`plugins:
  preset_reasons:
    config:
      presets:
        spam: "Spamming in chat"
        toxic: "Toxic behavior"`}</Pre>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Use preset names as reasons in moderation commands, e.g. <code style={code}>{">ban @user spam"}</code>
          </p>
        </SubSection>

        <SubSection title="moderation">
          <Pre>{`plugins:
  moderation:
    enabled: true
    mute_role: null          # role ID or null for Discord timeout
    dm_on_action: true       # DM the user when a mod action is taken
    messages:
      ban_success: "{user} has been banned | Case: {case_id}"
      kick_success: "{user} has been kicked | Case: {case_id}"
      mute_success: "{user} has been muted | Duration: {duration}"
      warn_success: "{user} has been warned | Case: {case_id}"`}</Pre>
        </SubSection>
      </Section>

      <Section title="Template variables">
        <Table rows={[
          ["{user}", "The target user's mention (@User)"],
          ["{user_tag}", "The target user's tag (User#0000)"],
          ["{moderator}", "The moderator's mention"],
          ["{case_id}", "The case number"],
          ["{duration}", "Formatted duration (e.g. 1h 30m)"],
          ["{reason}", "The reason provided"],
          ["{count}", "Generic count (purge, slowmode)"],
          ["{channel}", "Channel mention"],
        ]} />
      </Section>

      <Section title="Full example config">
        <Pre>{`prefix: ">"

levels:
  users: {}
  roles:
    "MOD_ROLE_ID_HERE": 50
    "ADMIN_ROLE_ID_HERE": 100
  commands: {}

tags:
  rules: "Read <#RULES_CHANNEL_ID> before chatting!"
  invite: "https://discord.gg/yourserver"

logging:
  config:
    default_log_channel: "GENERAL_LOG_CHANNEL_ID"
    channels:
      mod_logs:     "MOD_LOG_CHANNEL_ID"
      message_logs: "MESSAGE_LOG_CHANNEL_ID"
      server_logs:  "SERVER_LOG_CHANNEL_ID"
      voice_logs:   "VOICE_LOG_CHANNEL_ID"
    events:
      message_delete:      message_logs
      message_edit:        message_logs
      message_bulk_delete: message_logs
      member_ban:          mod_logs
      member_kick:         mod_logs
      member_timeout:      mod_logs
      member_unban:        mod_logs
      member_join:         server_logs
      member_leave:        server_logs
      voice_join:          voice_logs
      voice_leave:         voice_logs
      voice_move:          voice_logs
    enabled:
      avatar_change: false
      boost_change: false

automod:
  config:
    enabled: true
    rules:
      no_invites:
        enabled: true
        triggers:
          - type: invite_link
            allow_own_server: true
        conditions:
          ignore_roles: ["MOD_ROLE_ID_HERE"]
        actions:
          - type: delete_message
          - type: warn
      anti_spam:
        enabled: true
        triggers:
          - type: message_spam
            max_messages: 6
            within_seconds: 5
        conditions:
          ignore_roles: ["MOD_ROLE_ID_HERE"]
        actions:
          - type: delete_message
          - type: mute
            duration: 10m

plugins:
  command_aliases:
    config:
      aliases:
        b: ban
        k: kick
        m: mute
        w: warn
        p: purge

  preset_reasons:
    config:
      presets:
        spam: "Spamming in chat"
        toxic: "Toxic behavior"
        ads: "Advertising without permission"

  moderation:
    enabled: true
    mute_role: null
    dm_on_action: true`}</Pre>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
        {title}
      </h2>
      <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, fontFamily: "monospace" }}>{title}</div>
      {children}
    </div>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre style={{
      background: "var(--yaml-bg)", border: "1px solid var(--border)", borderRadius: 6,
      padding: "14px 16px", fontFamily: "'JetBrains Mono','Fira Code',Consolas,monospace",
      fontSize: 12, color: "var(--text-primary)", overflowX: "auto", lineHeight: 1.65,
      margin: 0,
    }}>
      {children}
    </pre>
  );
}

const code: React.CSSProperties = {
  background: "var(--bg-card)", padding: "1px 6px", borderRadius: 4,
  fontFamily: "monospace", fontSize: 12, color: "var(--accent)",
};

function Table({ rows }: { rows: string[][] }) {
  const isThreeCol = rows[0]?.length === 3;
  const isTwoCol = rows[0]?.length === 2;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <th style={th}>Key / Type</th>
          {isThreeCol && <th style={th}>Type</th>}
          {isThreeCol && <th style={th}>Default</th>}
          <th style={th}>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
            {row.map((cell, j) => (
              <td key={j} style={{ ...tdStyle, ...(j === 0 ? { fontFamily: "monospace", color: "var(--accent)", fontWeight: 600 } : {}) }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "6px 12px", color: "var(--text-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", color: "var(--text-secondary)", verticalAlign: "top" };

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, Toggle, PageHeader, Spinner, useToast, SaveBar, Select } from "../../components/ui";
import { ChevronDown, ChevronRight, Split, Radio } from "lucide-react";

// ── Category + event definitions ─────────────────────────────────────────────

type LogCategory =
  | "messages" | "members" | "roles" | "channels"
  | "server" | "voice" | "invites" | "threads"
  | "emoji" | "bots";

interface LogEvent { key: string; label: string; }
interface CategoryDef {
  id: LogCategory;
  label: string;
  emoji: string;
  color: string;
  events: LogEvent[];
}

const CATEGORIES: CategoryDef[] = [
  {
    id: "messages", label: "Message Logs", emoji: "💬", color: "#3498db",
    events: [
      { key: "messageDelete",     label: "Message Deleted" },
      { key: "messageEdit",       label: "Message Edited" },
      { key: "messageBulkDelete", label: "Bulk Delete (Purge)" },
      { key: "messagePinned",     label: "Message Pinned / Unpinned" },
    ],
  },
  {
    id: "members", label: "Member Logs", emoji: "👥", color: "#2ecc71",
    events: [
      { key: "memberJoin",      label: "Member Joined" },
      { key: "memberLeave",     label: "Member Left" },
      { key: "memberBan",       label: "Member Banned" },
      { key: "memberUnban",     label: "Member Unbanned" },
      { key: "nicknameChange",  label: "Nickname Changed" },
      { key: "usernameChange",  label: "Username Changed" },
      { key: "avatarChange",    label: "Avatar Changed" },
      { key: "rolesChange",     label: "Roles Added / Removed" },
      { key: "memberTimeout",   label: "Member Timed Out" },
      { key: "timeoutRemoved",  label: "Timeout Removed" },
    ],
  },
  {
    id: "roles", label: "Role Logs", emoji: "🎭", color: "#9b59b6",
    events: [
      { key: "roleCreate", label: "Role Created" },
      { key: "roleDelete", label: "Role Deleted" },
      { key: "roleUpdate", label: "Role Updated (name / color / perms / hoist / mentionable)" },
    ],
  },
  {
    id: "channels", label: "Channel Logs", emoji: "📢", color: "#e67e22",
    events: [
      { key: "channelCreate", label: "Channel Created" },
      { key: "channelDelete", label: "Channel Deleted" },
      { key: "channelUpdate", label: "Channel Updated (name / topic / slowmode / NSFW / category)" },
    ],
  },
  {
    id: "server", label: "Server Logs", emoji: "🏠", color: "#1abc9c",
    events: [
      { key: "serverUpdate", label: "Server Updated (name / icon / banner / verification)" },
      { key: "boostChange",  label: "Boost Status Changed" },
    ],
  },
  {
    id: "voice", label: "Voice Logs", emoji: "🔊", color: "#2ecc71",
    events: [
      { key: "voiceJoin",        label: "Joined Voice Channel" },
      { key: "voiceLeave",       label: "Left Voice Channel" },
      { key: "voiceMove",        label: "Moved Voice Channel" },
      { key: "voiceMuteDeafen",  label: "Server Muted / Deafened" },
      { key: "stageEvent",       label: "Stage Channel Started / Ended" },
    ],
  },
  {
    id: "invites", label: "Invite Logs", emoji: "🔗", color: "#3498db",
    events: [
      { key: "inviteCreate", label: "Invite Created" },
      { key: "inviteDelete", label: "Invite Deleted" },
      { key: "inviteUsed",   label: "Invite Used (tracked via join)" },
    ],
  },
  {
    id: "threads", label: "Thread Logs", emoji: "🧵", color: "#9b59b6",
    events: [
      { key: "threadCreate",       label: "Thread Created" },
      { key: "threadDelete",       label: "Thread Deleted" },
      { key: "threadUpdate",       label: "Thread Archived / Renamed" },
      { key: "threadMemberAdd",    label: "Member Added to Thread" },
      { key: "threadMemberRemove", label: "Member Removed from Thread" },
    ],
  },
  {
    id: "emoji", label: "Emoji & Sticker Logs", emoji: "😀", color: "#e74c3c",
    events: [
      { key: "emojiCreate",   label: "Emoji Added" },
      { key: "emojiDelete",   label: "Emoji Deleted" },
      { key: "emojiUpdate",   label: "Emoji Renamed" },
      { key: "stickerCreate", label: "Sticker Added" },
      { key: "stickerDelete", label: "Sticker Deleted" },
    ],
  },
  {
    id: "bots", label: "Bot & Integration Logs", emoji: "⚙️", color: "#95a5a6",
    events: [
      { key: "botAdded",          label: "Bot Added to Server" },
      { key: "botRemoved",        label: "Bot Removed from Server" },
      { key: "webhookCreate",     label: "Webhook Created" },
      { key: "webhookDelete",     label: "Webhook Deleted" },
      { key: "integrationChange", label: "Integration Added / Removed" },
    ],
  },
];

const ALL_EVENT_KEYS = CATEGORIES.flatMap((c) => c.events.map((e) => e.key));

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServerlogConfig {
  enabled: boolean;
  splitChannels: boolean;
  combinedChannelId: string;
  categoryChannels: Partial<Record<LogCategory, string>>;
  disabledEvents: string[];
  ignoredChannels: string[];
  ignoredRoles: string[];
  ignoredUsers: string[];
  logBotActions: boolean;
}

type FormState = {
  logChannelId: string;
  serverlog: ServerlogConfig;
};

const DEFAULT_SERVERLOG: ServerlogConfig = {
  enabled: false,
  splitChannels: false,
  combinedChannelId: "",
  categoryChannels: {},
  disabledEvents: [],
  ignoredChannels: [],
  ignoredRoles: [],
  ignoredUsers: [],
  logBotActions: false,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ChannelSelect({
  value, onChange, channels, placeholder = "— Use combined channel —",
}: {
  value: string;
  onChange: (v: string) => void;
  channels: any[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "6px 10px",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        color: "var(--text-primary)",
        fontSize: 12,
        outline: "none",
        cursor: "pointer",
        minWidth: 180,
      }}
    >
      <option value="">{placeholder}</option>
      {channels.map((c) => (
        <option key={c.id} value={c.id}>#{c.name}</option>
      ))}
    </select>
  );
}

function CategoryCard({
  cat, channels, splitChannels,
  disabledEvents, onToggleEvent,
  categoryChannel, onCategoryChannelChange,
}: {
  cat: CategoryDef;
  channels: any[];
  splitChannels: boolean;
  disabledEvents: string[];
  onToggleEvent: (key: string, enabled: boolean) => void;
  categoryChannel: string;
  onCategoryChannelChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const enabledCount = cat.events.filter((e) => !disabledEvents.includes(e.key)).length;
  const allEnabled = enabledCount === cat.events.length;
  const allDisabled = enabledCount === 0;

  const toggleAll = (val: boolean) => {
    cat.events.forEach((e) => onToggleEvent(e.key, val));
  };

  return (
    <div style={{
      border: "1px solid var(--border)",
      borderRadius: 10,
      overflow: "hidden",
      background: "var(--bg-card)",
    }}>
      {/* Header row */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", cursor: "pointer",
          background: open ? "var(--bg-input)" : "transparent",
          transition: "background 0.15s",
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ fontSize: 18, flexShrink: 0 }}>{cat.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{cat.label}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            {enabledCount}/{cat.events.length} events enabled
          </div>
        </div>

        {/* category channel when split */}
        {splitChannels && (
          <div onClick={(e) => e.stopPropagation()}>
            <ChannelSelect
              value={categoryChannel}
              onChange={onCategoryChannelChange}
              channels={channels}
            />
          </div>
        )}

        {/* quick enable/disable */}
        <div
          onClick={(e) => { e.stopPropagation(); toggleAll(!allEnabled); }}
          style={{
            fontSize: 11, fontWeight: 600, padding: "4px 10px",
            borderRadius: 6, cursor: "pointer", border: "1px solid",
            borderColor: allEnabled ? "rgba(240,165,0,0.3)" : "var(--border)",
            background: allEnabled ? "var(--accent-dim)" : "var(--bg-input)",
            color: allEnabled ? "var(--accent)" : "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {allEnabled ? "All on" : allDisabled ? "All off" : `${enabledCount} on`}
        </div>

        <div style={{ color: "var(--text-muted)", flexShrink: 0 }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {/* Event list */}
      {open && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
            <button
              onClick={() => toggleAll(true)}
              style={{ fontSize: 11, color: "var(--success)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
            >
              Enable all
            </button>
            <span style={{ color: "var(--border)" }}>|</span>
            <button
              onClick={() => toggleAll(false)}
              style={{ fontSize: 11, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
            >
              Disable all
            </button>
          </div>
          {cat.events.map(({ key, label }) => {
            const enabled = !disabledEvents.includes(key);
            return (
              <div
                key={key}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 8,
                  background: enabled ? "var(--accent-dim)" : "var(--bg-input)",
                  border: `1px solid ${enabled ? "rgba(240,165,0,0.2)" : "var(--border)"}`,
                  transition: "all 0.15s",
                }}
              >
                <Toggle checked={enabled} onChange={(v) => onToggleEvent(key, v)} />
                <span style={{ fontSize: 12, color: enabled ? "var(--text-primary)" : "var(--text-secondary)", flex: 1 }}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Logging() {
  const { guildId } = useParams<{ guildId: string }>();
  const [channels, setChannels] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { show, ToastEl } = useToast();

  const [form, setForm] = useState<FormState>({
    logChannelId: "",
    serverlog: { ...DEFAULT_SERVERLOG },
  });

  const saved = useRef<FormState>({
    logChannelId: "",
    serverlog: { ...DEFAULT_SERVERLOG },
  });

  const dirty = JSON.stringify(form) !== JSON.stringify(saved.current);

  useEffect(() => {
    if (!guildId) return;
    Promise.all([
      api.guild.logging(guildId),
      api.guild.channels(guildId),
      api.guild.roles(guildId),
    ]).then(([log, ch, rl]) => {
      setChannels(ch.filter((c: any) => c.type === 0));
      setRoles(rl);
      const initial: FormState = {
        logChannelId: log.logChannelId ?? "",
        serverlog: {
          enabled: log.serverlog?.enabled ?? false,
          splitChannels: log.serverlog?.splitChannels ?? false,
          combinedChannelId: log.serverlog?.combinedChannelId ?? "",
          categoryChannels: log.serverlog?.categoryChannels ?? {},
          disabledEvents: log.serverlog?.disabledEvents ?? [],
          ignoredChannels: log.serverlog?.ignoredChannels ?? [],
          ignoredRoles: log.serverlog?.ignoredRoles ?? [],
          ignoredUsers: log.serverlog?.ignoredUsers ?? [],
          logBotActions: log.serverlog?.logBotActions ?? false,
        },
      };
      setForm(initial);
      saved.current = JSON.parse(JSON.stringify(initial));
    }).catch(console.error).finally(() => setLoading(false));
  }, [guildId]);

  const patch = (partial: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...partial }));

  const patchServerlog = (partial: Partial<ServerlogConfig>) =>
    setForm((f) => ({ ...f, serverlog: { ...f.serverlog, ...partial } }));

  const toggleEvent = (key: string, enabled: boolean) => {
    patchServerlog({
      disabledEvents: enabled
        ? form.serverlog.disabledEvents.filter((k) => k !== key)
        : [...form.serverlog.disabledEvents, key],
    });
  };

  const enableAllEvents = () => patchServerlog({ disabledEvents: [] });
  const disableAllEvents = () => patchServerlog({ disabledEvents: [...ALL_EVENT_KEYS] });

  const setCategoryChannel = (catId: LogCategory, channelId: string) => {
    patchServerlog({
      categoryChannels: { ...form.serverlog.categoryChannels, [catId]: channelId },
    });
  };

  const discard = () => setForm(JSON.parse(JSON.stringify(saved.current)));

  const save = async () => {
    if (!guildId) return;
    setSaving(true);
    try {
      await api.guild.updateLogging(guildId, {
        logChannelId: form.logChannelId || undefined,
        serverlog: form.serverlog,
      });
      saved.current = JSON.parse(JSON.stringify(form));
      show("Logging settings saved!", "success");
    } catch (e: any) {
      show(e.message ?? "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  const sl = form.serverlog;

  return (
    <div style={{ padding: "32px 32px 96px", maxWidth: 820 }}>
      {ToastEl}
      <PageHeader title="Server Logging" subtitle="Configure what gets logged and where logs are sent" />

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Mod Log ── */}
        <Card>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            📋 Moderation Log
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
            Where bans, kicks, mutes, warns, and other mod actions are posted.
          </p>
          <Select label="Mod Log Channel" value={form.logChannelId} onChange={(v) => patch({ logChannelId: v })}>
            <option value="">— Disabled —</option>
            {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </Select>
        </Card>

        {/* ── Server Log Master Toggle ── */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                📡 Server Logging
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Track server events — messages, members, roles, channels, voice, and more.
              </p>
            </div>
            <Toggle
              checked={sl.enabled}
              onChange={(v) => patchServerlog({ enabled: v })}
            />
          </div>

          {sl.enabled && (
            <>
              {/* ── Channel mode toggle ── */}
              <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                {/* Combined channel button */}
                <button
                  onClick={() => patchServerlog({ splitChannels: false })}
                  style={{
                    flex: 1, padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                    border: `2px solid ${!sl.splitChannels ? "var(--accent)" : "var(--border)"}`,
                    background: !sl.splitChannels ? "var(--accent-dim)" : "var(--bg-input)",
                    display: "flex", alignItems: "center", gap: 12, transition: "all 0.2s",
                    fontFamily: "inherit",
                  }}
                >
                  <Radio size={18} color={!sl.splitChannels ? "var(--accent)" : "var(--text-muted)"} />
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: !sl.splitChannels ? "var(--accent)" : "var(--text-primary)" }}>
                      One combined channel
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      All log types go to a single channel
                    </div>
                  </div>
                </button>

                {/* Split channels button */}
                <button
                  onClick={() => patchServerlog({ splitChannels: true })}
                  style={{
                    flex: 1, padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                    border: `2px solid ${sl.splitChannels ? "var(--accent)" : "var(--border)"}`,
                    background: sl.splitChannels ? "var(--accent-dim)" : "var(--bg-input)",
                    display: "flex", alignItems: "center", gap: 12, transition: "all 0.2s",
                    fontFamily: "inherit",
                  }}
                >
                  <Split size={18} color={sl.splitChannels ? "var(--accent)" : "var(--text-muted)"} />
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: sl.splitChannels ? "var(--accent)" : "var(--text-primary)" }}>
                      Separate channel per category
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      Route each log type to its own channel
                    </div>
                  </div>
                </button>
              </div>

              {/* Combined channel picker */}
              <div style={{ marginTop: 16 }}>
                <Select
                  label={sl.splitChannels ? "Fallback Channel (used when category has no channel set)" : "Log Channel"}
                  value={sl.combinedChannelId}
                  onChange={(v) => patchServerlog({ combinedChannelId: v })}
                >
                  <option value="">— Disabled —</option>
                  {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </Select>
              </div>

              {/* Extra options */}
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Log bot actions</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      Include messages / actions performed by bots
                    </div>
                  </div>
                  <Toggle checked={sl.logBotActions} onChange={(v) => patchServerlog({ logBotActions: v })} />
                </div>
              </div>
            </>
          )}
        </Card>

        {/* ── Category cards ── */}
        {sl.enabled && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                Log Categories
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={enableAllEvents} style={{ fontSize: 12, color: "var(--success)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  Enable all
                </button>
                <button onClick={disableAllEvents} style={{ fontSize: 12, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  Disable all
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CATEGORIES.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  cat={cat}
                  channels={channels}
                  splitChannels={sl.splitChannels}
                  disabledEvents={sl.disabledEvents}
                  onToggleEvent={toggleEvent}
                  categoryChannel={sl.categoryChannels[cat.id] ?? ""}
                  onCategoryChannelChange={(v) => setCategoryChannel(cat.id, v)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Ignored lists ── */}
        {sl.enabled && (
          <Card>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
              🔕 Ignore Lists
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
              Events from these channels / roles / users will never be logged.
            </p>

            {/* Ignored channels */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Ignored Channels
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {sl.ignoredChannels.map((id) => {
                  const ch = channels.find((c) => c.id === id);
                  return (
                    <span key={id} style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "3px 10px", background: "var(--bg-input)", border: "1px solid var(--border)",
                      borderRadius: 20, fontSize: 12, color: "var(--text-primary)",
                    }}>
                      #{ch?.name ?? id}
                      <button
                        onClick={() => patchServerlog({ ignoredChannels: sl.ignoredChannels.filter((c) => c !== id) })}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0, lineHeight: 1, fontSize: 14 }}
                      >×</button>
                    </span>
                  );
                })}
              </div>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value && !sl.ignoredChannels.includes(e.target.value)) {
                    patchServerlog({ ignoredChannels: [...sl.ignoredChannels, e.target.value] });
                  }
                  e.target.value = "";
                }}
                style={{ padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", fontSize: 12, outline: "none", cursor: "pointer" }}
              >
                <option value="">+ Add channel to ignore list</option>
                {channels.filter((c) => !sl.ignoredChannels.includes(c.id)).map((c) => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
              </select>
            </div>

            {/* Ignored roles */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Ignored Roles
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {sl.ignoredRoles.map((id) => {
                  const role = roles.find((r) => r.id === id);
                  return (
                    <span key={id} style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "3px 10px", background: "var(--bg-input)", border: "1px solid var(--border)",
                      borderRadius: 20, fontSize: 12, color: "var(--text-primary)",
                    }}>
                      @{role?.name ?? id}
                      <button
                        onClick={() => patchServerlog({ ignoredRoles: sl.ignoredRoles.filter((r) => r !== id) })}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0, lineHeight: 1, fontSize: 14 }}
                      >×</button>
                    </span>
                  );
                })}
              </div>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value && !sl.ignoredRoles.includes(e.target.value)) {
                    patchServerlog({ ignoredRoles: [...sl.ignoredRoles, e.target.value] });
                  }
                  e.target.value = "";
                }}
                style={{ padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text-primary)", fontSize: 12, outline: "none", cursor: "pointer" }}
              >
                <option value="">+ Add role to ignore list</option>
                {roles.filter((r) => !sl.ignoredRoles.includes(r.id) && r.name !== "@everyone").map((r) => (
                  <option key={r.id} value={r.id}>@{r.name}</option>
                ))}
              </select>
            </div>
          </Card>
        )}

      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={discard} />
    </div>
  );
}

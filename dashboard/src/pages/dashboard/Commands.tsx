import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, Toggle, PageHeader, Badge, Spinner, useToast, SaveBar } from "../../components/ui";
import { Bot, Search } from "lucide-react";

const COMMAND_GROUPS: Record<string, string[]> = {
  "Moderation": [
    "ban", "unban", "kick", "mute", "unmute", "warn",
    "purge", "slowmode", "lock", "unlock", "lockdown", "modnick", "nick",
  ],
  "Cases & Records": [
    "warnings", "note", "viewnote", "delnote", "editnote",
    "case", "delcase", "reason",
    "baninfo", "duration", "activeactions", "modstats",
  ],
  "AutoMod": [
    "automod",
  ],
  "Security": [
    "antinuke", "antiraid",
  ],
  "Permissions": [
    "modrole", "protectedrole",
  ],
  "Role Management": [
    "addrole", "removerole",
  ],
  "Configuration": [
    "setmodlogs", "setserverlogs", "changeprefix",
    "additionalinformation", "backup", "resetconfig",
  ],
  "Tickets": [
    "ticket", "tblacklist", "tunblacklist",
    "setup", "close", "delete", "reopen",
    "add", "remove", "claim", "transcript", "stats",
  ],
  "Invite Tracking": [
    "invites", "inviteleaderboard",
  ],
  "Shortcuts & Aliases": [
    "shortcut", "alias",
  ],
  "Utility": [
    "ping", "botinfo", "userinfo", "serverinfo",
    "afk", "afkreset", "remind",
    "alt", "clearalt", "alts",
    "snipe", "editsnipe", "clearsnipe",
    "dashboard", "help",
  ],
};

const ALL_COMMANDS = Object.values(COMMAND_GROUPS).flat();

export default function Commands() {
  const { guildId } = useParams<{ guildId: string }>();
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const { show, ToastEl } = useToast();
  const savedDisabled = useRef<Set<string>>(new Set());

  const dirty = JSON.stringify([...disabled].sort()) !== JSON.stringify([...savedDisabled.current].sort());

  useEffect(() => {
    if (!guildId) return;
    api.guild.commands(guildId).then(d => {
      const s = new Set<string>(d.disabled);
      setDisabled(s);
      savedDisabled.current = new Set(s);
    }).catch(console.error).finally(() => setLoading(false));
  }, [guildId]);

  const toggle = (cmd: string) => {
    setDisabled(prev => {
      const next = new Set(prev);
      next.has(cmd) ? next.delete(cmd) : next.add(cmd);
      return next;
    });
  };

  const discard = () => setDisabled(new Set(savedDisabled.current));

  const save = async () => {
    if (!guildId) return;
    setSaving(true);
    try {
      await api.guild.updateCommands(guildId, Array.from(disabled));
      savedDisabled.current = new Set(disabled);
      show("Command settings saved!", "success");
    } catch (e: any) {
      show(e.message ?? "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  const filtered = search.trim().toLowerCase();

  return (
    <div style={{ padding:"32px 32px 96px" }}>
      {ToastEl}
      <PageHeader title="Command Modules" subtitle="Enable or disable individual commands for this server" />

      {disabled.size > 0 && (
        <div style={{ padding:"10px 16px", background:"var(--danger-dim)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, marginBottom:20, fontSize:13, color:"var(--danger)", display:"flex", alignItems:"center", gap:8 }}>
          <Bot size={14} />
          {disabled.size} command{disabled.size !== 1 ? "s" : ""} currently disabled in this server.
        </div>
      )}

      <div style={{ position:"relative", marginBottom:20 }}>
        <Search size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)" }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search commands…"
          style={{ width:"100%", padding:"10px 14px 10px 36px", background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-primary)", fontSize:13, outline:"none" }}
          onFocus={e => (e.target.style.borderColor = "var(--accent)")}
          onBlur={e => (e.target.style.borderColor = "var(--border)")}
        />
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
        {Object.entries(COMMAND_GROUPS).map(([group, cmds]) => {
          const shown = filtered ? cmds.filter(c => c.includes(filtered)) : cmds;
          if (shown.length === 0) return null;
          const disabledCount = shown.filter(c => disabled.has(c)).length;
          return (
            <Card key={group}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <h3 style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)" }}>{group}</h3>
                  <Badge color="muted">{shown.length}</Badge>
                  {disabledCount > 0 && <Badge color="danger">{disabledCount} disabled</Badge>}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => { const s = new Set(disabled); shown.forEach(c => s.delete(c)); setDisabled(s); }}
                    style={{ fontSize:11, color:"var(--success)", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit" }}>Enable all</button>
                  <button onClick={() => { const s = new Set(disabled); shown.forEach(c => s.add(c)); setDisabled(s); }}
                    style={{ fontSize:11, color:"var(--danger)", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit" }}>Disable all</button>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10 }}>
                {shown.map(cmd => (
                  <div key={cmd} style={{
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"10px 12px", background: disabled.has(cmd) ? "var(--danger-dim)" : "var(--bg-input)",
                    border:`1px solid ${disabled.has(cmd) ? "rgba(239,68,68,0.25)" : "var(--border)"}`,
                    borderRadius:8, transition:"all 0.15s",
                  }}>
                    <code style={{ fontSize:12, fontWeight:600, color: disabled.has(cmd) ? "var(--danger)" : "var(--text-primary)" }}>{cmd}</code>
                    <Toggle checked={!disabled.has(cmd)} onChange={() => toggle(cmd)} />
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={discard} />
    </div>
  );
}

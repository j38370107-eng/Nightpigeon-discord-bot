import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, Button, Select, PageHeader, Badge, Spinner, Modal, useToast } from "../../components/ui";
import { Lock, Plus, Trash2, Search } from "lucide-react";

const ALL_COMMANDS = [
  // Moderation
  "ban","unban","kick","mute","unmute","warn","warnings","purge","slowmode","lock","unlock","lockdown","modnick","nick",
  // Cases & Records
  "case","delcase","reason","note","viewnote","delnote","editnote","baninfo","duration","activeactions","modstats",
  // AutoMod
  "automod",
  // Security
  "antinuke","antiraid",
  // Role & Permissions
  "modrole","protectedrole","addrole","removerole",
  // Configuration
  "setmodlogs","setserverlogs","changeprefix","additionalinformation","backup","resetconfig",
  // Tickets
  "ticket","tblacklist","tunblacklist",
  // Invite Tracking
  "invites","inviteleaderboard",
  // Shortcuts & Aliases
  "shortcut","alias",
  // Utility
  "ping","botinfo","userinfo","serverinfo","afk","afkreset","remind","alt","clearalt","altslist","snipe","editsnipe","clearsnipe","dashboard","help",
];

export default function CommandPerms() {
  const { guildId } = useParams<{ guildId: string }>();
  const [perms, setPerms] = useState<Record<string, any>>({});
  const [channels, setChannels] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { show, ToastEl } = useToast();

  useEffect(() => {
    if (!guildId) return;
    Promise.all([
      api.guild.commandPerms(guildId),
      api.guild.channels(guildId),
      api.guild.roles(guildId),
    ]).then(([p, ch, ro]) => {
      setPerms(p ?? {});
      setChannels(ch);
      setRoles(ro);
    }).catch(console.error).finally(() => setLoading(false));
  }, [guildId]);

  const getPerm = (cmd: string) => perms[cmd] ?? { allowedRoles:[], deniedRoles:[], allowedChannels:[], deniedChannels:[] };

  const updatePerm = (cmd: string, field: string, value: string[]) => {
    setPerms(p => ({ ...p, [cmd]: { ...getPerm(cmd), [field]: value } }));
  };

  const addItem = (cmd: string, field: string, id: string) => {
    if (!id) return;
    const current: string[] = getPerm(cmd)[field] ?? [];
    if (current.includes(id)) return;
    updatePerm(cmd, field, [...current, id]);
  };

  const removeItem = (cmd: string, field: string, id: string) => {
    const current: string[] = getPerm(cmd)[field] ?? [];
    updatePerm(cmd, field, current.filter(x => x !== id));
  };

  const clearPerm = (cmd: string) => {
    const { [cmd]: _, ...rest } = perms;
    setPerms(rest);
  };

  const save = async () => {
    if (!guildId) return;
    setSaving(true);
    try {
      await api.guild.updateCommandPerm(guildId, perms);
      show("Permission settings saved!", "success");
    } catch (e: any) {
      show(e.message ?? "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const configuredCommands = Object.keys(perms).filter(k => {
    const p = perms[k];
    return (p.allowedRoles?.length || p.deniedRoles?.length || p.allowedChannels?.length || p.deniedChannels?.length);
  });

  const nameOf = (id: string) => roles.find(r => r.id === id)?.name ?? id;
  const chanOf = (id: string) => {
    const c = channels.find(c => c.id === id);
    return c ? `#${c.name}` : id;
  };

  if (loading) return <Spinner />;

  const selectedPerm = selected ? getPerm(selected) : null;
  const filteredCmds = ALL_COMMANDS.filter(c => c.includes(search.toLowerCase()));

  return (
    <div style={{ padding:"32px 32px 48px" }}>
      {ToastEl}
      <PageHeader title="Command Permissions" subtitle="Restrict commands to specific roles or channels">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
      </PageHeader>

      <div style={{ padding:"10px 16px", background:"var(--accent-dim)", border:"1px solid rgba(240,165,0,0.2)", borderRadius:8, marginBottom:20, fontSize:13, color:"var(--accent)" }}>
        ℹ️ Permissions only apply to non-admin users. Server administrators and mod-role holders bypass these restrictions.
      </div>

      {/* Configured commands */}
      {configuredCommands.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <h2 style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)", marginBottom:12 }}>Configured Commands ({configuredCommands.length})</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {configuredCommands.map(cmd => {
              const p = getPerm(cmd);
              return (
                <Card key={cmd} style={{ padding:"14px 16px" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                      <code style={{ fontSize:13, fontWeight:700, color:"var(--accent)", background:"var(--accent-dim)", padding:"3px 10px", borderRadius:6 }}>{cmd}</code>
                      {p.allowedRoles?.map((id: string) => <Badge key={id} color="success">✓ {nameOf(id)}</Badge>)}
                      {p.deniedRoles?.map((id: string) => <Badge key={id} color="danger">✗ {nameOf(id)}</Badge>)}
                      {p.allowedChannels?.map((id: string) => <Badge key={id} color="info">✓ {chanOf(id)}</Badge>)}
                      {p.deniedChannels?.map((id: string) => <Badge key={id} color="warning">✗ {chanOf(id)}</Badge>)}
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <Button size="sm" variant="secondary" onClick={() => setSelected(cmd)}>Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => clearPerm(cmd)}><Trash2 size={12} /></Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Command picker */}
      <Card>
        <h2 style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
          <Lock size={16} color="var(--accent)" /> Set Permissions for a Command
        </h2>
        <div style={{ position:"relative", marginBottom:14 }}>
          <Search size={13} style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search commands…"
            style={{ width:"100%", padding:"9px 14px 9px 32px", background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-primary)", fontSize:13, outline:"none" }}
            onFocus={e => (e.target.style.borderColor = "var(--accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")} />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:8 }}>
          {filteredCmds.map(cmd => {
            const hasConfig = configuredCommands.includes(cmd);
            return (
              <button key={cmd} onClick={() => setSelected(cmd)} style={{
                padding:"8px 12px", background: hasConfig ? "var(--accent-dim)" : "var(--bg-input)",
                border:`1px solid ${hasConfig ? "rgba(240,165,0,0.3)" : "var(--border)"}`,
                borderRadius:8, color: hasConfig ? "var(--accent)" : "var(--text-secondary)",
                fontSize:12, fontWeight:600, cursor:"pointer", textAlign:"left", fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"space-between",
              }}>
                <code>{cmd}</code>
                {hasConfig && <Lock size={11} />}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Edit modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Permissions: ${selected}`} width={560}>
        {selected && selectedPerm && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <div style={{ padding:"10px 14px", background:"var(--bg-input)", borderRadius:8, fontSize:12, color:"var(--text-secondary)", lineHeight:1.5 }}>
              <strong style={{ color:"var(--text-primary)" }}>Allowed Roles</strong> — only listed roles can use this command (blank = everyone)<br/>
              <strong style={{ color:"var(--text-primary)" }}>Denied Roles</strong> — these roles are blocked<br/>
              <strong style={{ color:"var(--text-primary)" }}>Allowed Channels</strong> — only these channels (blank = all channels)<br/>
              <strong style={{ color:"var(--text-primary)" }}>Denied Channels</strong> — blocked channels
            </div>

            {[
              { field:"allowedRoles", label:"✓ Allowed Roles", items:roles, getName:(r: any)=>r.name, color:"success" },
              { field:"deniedRoles", label:"✗ Denied Roles", items:roles, getName:(r: any)=>r.name, color:"danger" },
              { field:"allowedChannels", label:"✓ Allowed Channels", items:channels, getName:(c: any)=>`#${c.name}`, color:"info" },
              { field:"deniedChannels", label:"✗ Denied Channels", items:channels, getName:(c: any)=>`#${c.name}`, color:"warning" },
            ].map(({ field, label, items, getName, color }) => (
              <div key={field}>
                <div style={{ fontSize:12, fontWeight:700, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>{label}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
                  {(selectedPerm[field] ?? []).map((id: string) => (
                    <span key={id} style={{ padding:"3px 10px", background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:6, fontSize:12, color:"var(--text-primary)", display:"inline-flex", alignItems:"center", gap:4 }}>
                      {field.includes("Role") ? nameOf(id) : chanOf(id)}
                      <button onClick={() => removeItem(selected, field, id)} style={{ background:"none", border:"none", color:"var(--danger)", cursor:"pointer", padding:0, fontSize:14, lineHeight:1 }}>×</button>
                    </span>
                  ))}
                  {(selectedPerm[field] ?? []).length === 0 && <span style={{ fontSize:12, color:"var(--text-muted)" }}>None</span>}
                </div>
                <select onChange={e => { addItem(selected, field, e.target.value); e.target.value = ""; }} defaultValue=""
                  style={{ width:"100%", padding:"8px 12px", background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-primary)", fontSize:13, outline:"none", cursor:"pointer" }}>
                  <option value="">Add {field.includes("Role") ? "role" : "channel"}…</option>
                  {items.filter(item => !(selectedPerm[field] ?? []).includes(item.id)).map((item: any) => (
                    <option key={item.id} value={item.id}>{getName(item)}</option>
                  ))}
                </select>
              </div>
            ))}

            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <Button variant="secondary" onClick={() => setSelected(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, Button, Input, Select, PageHeader, Modal, Badge, Spinner, EmptyState, useToast } from "../../components/ui";
import { Plus, Trash2, Edit2, Zap } from "lucide-react";

const TYPES = ["warn","mute","kick","ban"] as const;

const RESERVED_NAMES = new Set([
  "warn","kick","ban","unban","mute","timeout","unmute","untimeout",
  "purge","clear","prune","slowmode","slow","sm","lock","unlock","lockdown","ld",
  "note","addnote","staffnote","viewnote","shownote","getnote","notes",
  "editnote","updatenote","notereason","reason","case",
  "delcase","deletecase","removecase","rmcase","delnote","deletenote","removenote","rmnote",
  "shortcut","sc","automod","am","userinfo","ui","whois","serverinfo","si","guildinfo",
  "modnick","mn","moderatenick","modrole","mr","ping","latency","nick","nickname",
  "afk","afkreset","alt","clearalt","alts","altlist","linkedalts","altslist",
  "addrole","ar","removerole","rr","remind","reminder","remindme","alias",
  "setmodlogs","setlogchannel","setlogs","logchannel","setserverlogs","serverlogs","serverlogchannel",
  "antinuke","an","nuke","antiraid","raid",
  "ticket","tickets","tblacklist","ticketblacklist","tblist","tunblacklist","ticketunblacklist","tbunlist",
  "setup","tsetup","close","tclose","delete","tdelete","reopen","treopen",
  "add","tadd","remove","tremove","claim","tclaim","transcript","ttranscript","stats","tstats","ticketstats",
  "baninfo","binfo","botinfo","bot","about","duration","setduration","changeduration","eval","ev",
  "serverblacklist","sbl","guildblacklist","userblacklist","ubl","globalban","backup","bk",
  "additionalinformation","addinfo","ai","punishinfo","activeactions","activemutes","activebans","active","timed",
  "modstats","moderatorstats","modleaderboard","modlb","resetconfig","configreset","resetbot","factoryreset",
  "muteconfig","mutesettings","dashboard","dash","panel",
  "snipe","s","editsnipe","es","clearsnipe","cs","protectedrole","protrole",
  "help","h","commands","changeprefix","setprefix","prefix",
  "warnings","warns","modlogs","infractions","punishments","cases","hist","history","warnsa","invites",
]);

export default function Shortcuts() {
  const { guildId } = useParams<{ guildId: string }>();
  const [shortcuts, setShortcuts] = useState<any[]>([]);
  const [muteMode, setMuteMode] = useState<"timeout" | "role">("timeout");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open:boolean; editing?:any }>({ open:false });
  const { show, ToastEl } = useToast();

  const [form, setForm] = useState({ name:"", type:"warn", reason:"", duration:"" });

  const load = () => {
    if (!guildId) return;
    Promise.all([
      api.guild.shortcuts(guildId),
      api.guild.moderationConfig(guildId),
    ]).then(([sc, cfg]) => {
      setShortcuts(sc);
      setMuteMode((cfg.muteConfig?.mode ?? "timeout") as "timeout" | "role");
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [guildId]);

  const LIMIT = 50;

  const openCreate = () => {
    if (shortcuts.length >= LIMIT) return show(`Shortcut limit reached (${LIMIT}/${LIMIT}). Delete one to add more.`, "error");
    setForm({ name:"", type:"warn", reason:"", duration:"" });
    setModal({ open:true });
  };

  const openEdit = (s: any) => {
    setForm({ name:s.name, type:s.type, reason:s.reason, duration:s.duration ?? "" });
    setModal({ open:true, editing:s });
  };

  const isPermanentMuteBlocked = form.type === "mute" && !form.duration.trim() && muteMode === "timeout";

  const parseDurSeconds = (d: string): number | null => {
    const m = d.trim().match(/^(\d+)(s|m|h|d)$/i);
    if (!m) return null;
    const mult: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return parseInt(m[1]!, 10) * (mult[m[2]!.toLowerCase()] ?? 1);
  };
  const isBanDurationExceeded = form.type === "ban" && !!form.duration.trim() &&
    (parseDurSeconds(form.duration) ?? 0) > 30 * 24 * 3600;

  const newName = form.name.trim().toLowerCase();
  const isReserved = newName !== "" && RESERVED_NAMES.has(newName);
  const isDuplicateShortcut = newName !== "" && !isReserved &&
    shortcuts.some(s => s.name === newName && s.name !== modal.editing?.name);

  const save = async () => {
    if (!guildId || !form.name.trim() || !form.reason.trim()) return show("Name and reason are required", "error");
    if (isPermanentMuteBlocked) {
      return show("Permanent mute shortcuts aren't supported in Timeout mode. Add a duration or switch to Mute Role mode in Moderation Config.", "error");
    }
    if (isReserved) return show(`"${newName}" is a built-in bot command and cannot be used as a shortcut name.`, "error");
    if (isDuplicateShortcut) return show(`A shortcut named "${newName}" already exists.`, "error");
    if (isBanDurationExceeded) return show("Max ban duration is 30 days. Leave duration empty for a permanent ban.", "error");
    try {
      await api.guild.createShortcut(guildId, {
        ...form,
        name: newName,
        originalName: modal.editing?.name ?? undefined,
      });
      show(modal.editing ? "Shortcut updated!" : "Shortcut created!", "success");
      setModal({ open:false });
      load();
    } catch (e: any) {
      show(e.message ?? "Failed to save", "error");
    }
  };

  const del = async (name: string) => {
    if (!guildId) return;
    if (!confirm(`Delete shortcut "${name}"?`)) return;
    try {
      await api.guild.deleteShortcut(guildId, name);
      show("Shortcut deleted", "success");
      load();
    } catch (e: any) {
      show(e.message ?? "Failed to delete", "error");
    }
  };

  const typeColor: Record<string,any> = { warn:"warning", mute:"accent", kick:"info", ban:"danger" };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding:"32px 32px 48px" }}>
      {ToastEl}
      <PageHeader title="Shortcuts" subtitle="Create one-word command shortcuts for common punishments">
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:12, color: shortcuts.length >= LIMIT ? "var(--danger)" : "var(--text-muted)", fontWeight:600 }}>
            {shortcuts.length}/{LIMIT}
          </span>
          <Button onClick={openCreate} disabled={shortcuts.length >= LIMIT}><Plus size={14} /> New Shortcut</Button>
        </div>
      </PageHeader>

      {shortcuts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Zap size={40} />}
            title="No shortcuts yet"
            description="Create shortcuts like 'spam' → mute 1h | Spamming, or 'toxic' → ban | Toxic behaviour."
            action={<Button onClick={openCreate}><Plus size={14} /> Create First Shortcut</Button>}
          />
        </Card>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:14 }}>
          {shortcuts.map(s => (
            <Card key={s.name} style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <code style={{ fontSize:15, fontWeight:800, color:"var(--accent)", background:"var(--accent-dim)", padding:"3px 10px", borderRadius:6 }}>{s.name}</code>
                  <Badge color={typeColor[s.type] ?? "muted"}>{s.type.toUpperCase()}</Badge>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={() => openEdit(s)} style={{ background:"none", border:"none", color:"var(--text-muted)", padding:4, cursor:"pointer", borderRadius:4 }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}><Edit2 size={14} /></button>
                  <button onClick={() => del(s.name)} style={{ background:"none", border:"none", color:"var(--text-muted)", padding:4, cursor:"pointer", borderRadius:4 }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--danger)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}><Trash2 size={14} /></button>
                </div>
              </div>
              <div style={{ fontSize:13, color:"var(--text-secondary)" }}>
                <span style={{ color:"var(--text-muted)" }}>Reason: </span>{s.reason}
              </div>
              {s.duration && (
                <div style={{ fontSize:12, color:"var(--text-muted)" }}>Duration: {s.duration}</div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={modal.open} onClose={() => setModal({ open:false })} title={modal.editing ? "Edit Shortcut" : "Create Shortcut"}>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div>
            <Input label="Shortcut Name" value={form.name} onChange={v => setForm(f=>({...f,name:v.toLowerCase().replace(/\s+/g,"")}))}
              placeholder="e.g. spam, toxic, caps"
              hint={modal.editing ? "Rename by changing the name — the old shortcut will be replaced" : "Users type this word as a command"} />
            {isReserved && (
              <div style={{ marginTop:8, padding:"8px 12px", background:"var(--danger-dim)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, fontSize:12, color:"var(--danger)" }}>
                ⛔ <strong>{newName}</strong> is a built-in bot command — choose a different name.
              </div>
            )}
            {isDuplicateShortcut && (
              <div style={{ marginTop:8, padding:"8px 12px", background:"var(--danger-dim)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, fontSize:12, color:"var(--danger)" }}>
                ⛔ A shortcut named <strong>{newName}</strong> already exists. Delete it first.
              </div>
            )}
          </div>
          <Select label="Punishment Type" value={form.type} onChange={v => setForm(f=>({...f,type:v}))}>
            {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </Select>
          <Input label="Reason" value={form.reason} onChange={v => setForm(f=>({...f,reason:v}))}
            placeholder="e.g. Spamming in chat" hint="Pre-filled reason for the punishment" />
          {(form.type === "mute" || form.type === "ban") && (
            <div>
              <Input label="Duration (optional)" value={form.duration} onChange={v => setForm(f=>({...f,duration:v}))}
                placeholder="e.g. 1h, 7d, 30m"
                hint={form.type === "mute" && muteMode === "timeout" ? undefined : "Leave blank for permanent"} />
              {isPermanentMuteBlocked && (
                <div style={{ marginTop:8, padding:"8px 12px", background:"var(--danger-dim)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, fontSize:12, color:"var(--danger)" }}>
                  ⚠️ Your server uses <strong>Timeout mode</strong> — permanent mutes aren't supported. Add a duration, or switch to Mute Role mode in <strong>Moderation Config</strong>.
                </div>
              )}
              {isBanDurationExceeded && (
                <div style={{ marginTop:8, padding:"8px 12px", background:"var(--danger-dim)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:7, fontSize:12, color:"var(--danger)" }}>
                  ⛔ Max ban duration is <strong>30 days</strong>. Leave duration empty for a permanent ban.
                </div>
              )}
            </div>
          )}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <Button variant="secondary" onClick={() => setModal({ open:false })}>Cancel</Button>
            <Button onClick={save} disabled={isPermanentMuteBlocked || isReserved || isDuplicateShortcut || isBanDurationExceeded}>{modal.editing ? "Update Shortcut" : "Create Shortcut"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

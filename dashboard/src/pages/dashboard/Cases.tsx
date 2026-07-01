import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, PageHeader, Badge, Spinner, EmptyState, Modal, Button, useToast } from "../../components/ui";
import { FileText, Search, Eye, Trash2, StickyNote } from "lucide-react";

const TYPE_COLOR: Record<string, any> = {
  Ban:"danger", Unban:"success", Kick:"warning", Mute:"accent",
  Unmute:"success", Warn:"warning", Note:"info",
};

function timeSince(ts: number) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
  return `${Math.floor(sec/86400)}d ago`;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function Cases() {
  const { guildId } = useParams<{ guildId: string }>();
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const { show, ToastEl } = useToast();

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    api.guild.cases(guildId).then(setCases).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [guildId]);

  const deleteCase = async (c: any) => {
    if (!guildId || !confirm(`Delete this ${c.type} case?`)) return;
    setDeleting(true);
    try {
      await api.guild.deleteCase(guildId, c.id);
      show("Case deleted", "success");
      setSelected(null);
      load();
    } catch (e: any) {
      show(e.message ?? "Failed to delete", "error");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = cases.filter(c => {
    const matchFilter = filter === "all" || c.type.toLowerCase() === filter.toLowerCase();
    const matchSearch = !search.trim() || c.userId?.includes(search) || c.moderatorId?.includes(search) || c.reason?.toLowerCase().includes(search.toLowerCase()) || c.id?.includes(search);
    return matchFilter && matchSearch;
  });

  const notes = cases.filter(c => c.type === "Note");

  if (loading) return <Spinner />;

  return (
    <div style={{ padding:"32px 32px 48px" }}>
      {ToastEl}
      <PageHeader title="Case Log" subtitle={`${cases.length} total cases · ${notes.length} note${notes.length !== 1 ? "s" : ""}`} />

      {/* Filters */}
      <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ position:"relative", flex:1, minWidth:200 }}>
          <Search size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)" }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by user ID, mod ID, reason, case ID…"
            style={{ width:"100%", padding:"9px 14px 9px 34px", background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-primary)", fontSize:13, outline:"none" }}
            onFocus={e => (e.target.style.borderColor = "var(--accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          style={{ padding:"9px 14px", background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-primary)", fontSize:13, outline:"none", cursor:"pointer" }}>
          <option value="all">All types</option>
          {["Ban","Unban","Kick","Mute","Unmute","Warn","Note"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Notes quick-view section */}
      {filter === "all" && notes.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <StickyNote size={16} style={{ color: "#4faaff" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Staff Notes</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>— private staff records</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {notes.slice(0, 5).map(n => (
              <div key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", background: "var(--bg-input)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3, flexWrap: "wrap" }}>
                    <code style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>#{n.id?.slice(-6)}</code>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>User: <code style={{ fontSize: 11 }}>{n.userId}</code></span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>by {n.moderatorTag ?? n.moderatorId}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeSince(n.timestamp)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{n.reason}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setSelected(n)} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, fontFamily: "inherit" }}>
                    <Eye size={11} /> View
                  </button>
                  <button onClick={() => deleteCase(n)} style={{ background: "rgba(237,66,69,0.08)", border: "1px solid rgba(237,66,69,0.25)", borderRadius: 6, padding: "4px 8px", color: "#ed4245", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 3, fontFamily: "inherit" }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
            {notes.length > 5 && (
              <button onClick={() => setFilter("Note")} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 12, cursor: "pointer", textAlign: "left", padding: "4px 0", fontFamily: "inherit" }}>
                Show all {notes.length} notes →
              </button>
            )}
          </div>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<FileText size={40} />} title="No cases found" description="No moderation cases match your filters." />
        </Card>
      ) : (
        <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--bg-secondary)" }}>
                  {["Case ID","Type","User","Moderator","Reason","When",""].map(h => (
                    <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontSize:11, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.05em", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: i < filtered.length-1 ? "1px solid var(--border)" : "none", transition:"background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-card-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <td style={{ padding:"12px 16px" }}>
                      <code style={{ fontSize:11, color:"var(--text-muted)", fontFamily:"monospace" }}>#{c.id?.slice(-6) ?? "—"}</code>
                    </td>
                    <td style={{ padding:"12px 16px" }}><Badge color={TYPE_COLOR[c.type] ?? "muted"}>{c.type}</Badge></td>
                    <td style={{ padding:"12px 16px" }}>
                      <code style={{ fontSize:12, color:"var(--text-secondary)" }}>{c.userId ?? "—"}</code>
                    </td>
                    <td style={{ padding:"12px 16px" }}>
                      <div style={{ fontSize:12, color:"var(--text-secondary)" }}>{c.moderatorTag ?? c.moderatorId ?? "—"}</div>
                    </td>
                    <td style={{ padding:"12px 16px", maxWidth:200 }}>
                      <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"var(--text-primary)", fontSize:12 }}>{c.reason ?? "—"}</div>
                    </td>
                    <td style={{ padding:"12px 16px", whiteSpace:"nowrap", color:"var(--text-muted)", fontSize:12 }}>{timeSince(c.timestamp)}</td>
                    <td style={{ padding:"12px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setSelected(c)}
                          style={{ background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:6, padding:"5px 10px", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:4, fontFamily:"inherit" }}>
                          <Eye size={12} /> View
                        </button>
                        {c.type === "Note" && (
                          <button onClick={() => deleteCase(c)}
                            style={{ background:"rgba(237,66,69,0.08)", border:"1px solid rgba(237,66,69,0.25)", borderRadius:6, padding:"5px 8px", color:"#ed4245", fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", fontFamily:"inherit" }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Case detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Case Details" width={520}>
        {selected && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <Badge color={TYPE_COLOR[selected.type] ?? "muted"}>{selected.type}</Badge>
              {selected.automod && <Badge color="info">AutoMod</Badge>}
            </div>
            {[
              ["Case ID", <code style={{ fontFamily:"monospace", fontSize:12 }}>{selected.id}</code>],
              ["User ID", <code style={{ fontFamily:"monospace", fontSize:12 }}>{selected.userId}</code>],
              ["Moderator", selected.moderatorTag ?? selected.moderatorId],
              ["Reason", selected.reason ?? "—"],
              ["Date", formatDate(selected.timestamp)],
              selected.expiresAt && ["Expires", formatDate(selected.expiresAt)],
            ].filter(Boolean).map(([label, value]: any) => (
              <div key={label} style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</div>
                <div style={{ fontSize:13, color:"var(--text-primary)" }}>{value}</div>
              </div>
            ))}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
              <Button variant="danger" onClick={() => deleteCase(selected)} disabled={deleting}>
                <Trash2 size={13} /> {deleting ? "Deleting…" : "Delete Case"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

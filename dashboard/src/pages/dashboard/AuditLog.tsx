import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, PageHeader, Badge, Spinner, EmptyState } from "../../components/ui";
import { Search, RefreshCw, BookOpen } from "lucide-react";

const ACTION_CATEGORY: Record<number, string> = {
  1:"Server", 10:"Channel", 11:"Channel", 12:"Channel", 13:"Channel", 14:"Channel", 15:"Channel",
  20:"Member", 21:"Member", 22:"Member", 23:"Member", 24:"Member", 25:"Member", 26:"Member", 27:"Member", 28:"Member",
  30:"Role", 31:"Role", 32:"Role",
  40:"Invite", 41:"Invite", 42:"Invite",
  50:"Webhook", 51:"Webhook", 52:"Webhook",
  60:"Emoji", 61:"Emoji", 62:"Emoji",
  72:"Message", 73:"Message", 74:"Message", 75:"Message",
  80:"Integration", 81:"Integration", 82:"Integration",
  90:"Stage", 91:"Stage", 92:"Stage",
  100:"Sticker", 101:"Sticker", 102:"Sticker",
  110:"Thread", 111:"Thread", 112:"Thread",
  121:"Command", 140:"AutoMod", 141:"AutoMod", 142:"AutoMod", 143:"AutoMod",
};

const CATEGORY_COLOR: Record<string, any> = {
  Member:"accent", Role:"info", Channel:"success", Message:"warning",
  Server:"muted", Invite:"info", AutoMod:"danger",
};

function timeSince(id: string): string {
  try {
    const ms = (BigInt(id) >> 22n) + 1420070400000n;
    const sec = Math.floor((Date.now() - Number(ms)) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
    return `${Math.floor(sec/86400)}d ago`;
  } catch { return "—"; }
}

export default function AuditLog() {
  const { guildId } = useParams<{ guildId: string }>();
  const [entries, setEntries] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    api.guild.auditLog(guildId).then(d => {
      setEntries(d.entries ?? []);
      setUsers(d.users ?? []);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [guildId]);

  const userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u]));

  const categories = ["all", ...Array.from(new Set(entries.map(e => ACTION_CATEGORY[e.action_type] ?? "Other"))).sort()];

  const filtered = entries.filter(e => {
    const cat = ACTION_CATEGORY[e.action_type] ?? "Other";
    const matchCat = categoryFilter === "all" || cat === categoryFilter;
    const matchSearch = !search.trim() || e.actionName?.toLowerCase().includes(search.toLowerCase()) || e.user_id?.includes(search) || e.target_id?.includes(search);
    return matchCat && matchSearch;
  });

  if (loading) return <Spinner />;

  return (
    <div style={{ padding:"32px 32px 48px" }}>
      <PageHeader title="Audit Log" subtitle="Recent Discord audit log entries for this server">
        <button onClick={load} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-secondary)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </PageHeader>

      {/* Filters */}
      <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
        <div style={{ position:"relative", flex:1, minWidth:200 }}>
          <Search size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text-muted)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search action, user ID, target ID…"
            style={{ width:"100%", padding:"9px 14px 9px 34px", background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-primary)", fontSize:13, outline:"none" }}
            onFocus={e => (e.target.style.borderColor = "var(--accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")} />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          style={{ padding:"9px 14px", background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-primary)", fontSize:13, outline:"none", cursor:"pointer" }}>
          {categories.map(c => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<BookOpen size={40} />} title="No audit log entries" description="No entries found. The bot may need View Audit Log permission." />
        </Card>
      ) : (
        <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--bg-secondary)" }}>
                  {["Action","Category","Executor","Target","Reason","When"].map(h => (
                    <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontSize:11, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.05em", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, i) => {
                  const executor = userMap[entry.user_id];
                  const cat = ACTION_CATEGORY[entry.action_type] ?? "Other";
                  return (
                    <tr key={entry.id} style={{ borderBottom: i < filtered.length-1 ? "1px solid var(--border)" : "none" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-card-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "")}>
                      <td style={{ padding:"12px 16px" }}>
                        <span style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)" }}>{entry.actionName}</span>
                      </td>
                      <td style={{ padding:"12px 16px" }}>
                        <Badge color={CATEGORY_COLOR[cat] ?? "muted"}>{cat}</Badge>
                      </td>
                      <td style={{ padding:"12px 16px" }}>
                        {executor ? (
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            {executor.avatar && (
                              <img src={`https://cdn.discordapp.com/avatars/${executor.id}/${executor.avatar}.png`} alt="" style={{ width:20, height:20, borderRadius:"50%" }} />
                            )}
                            <span style={{ fontSize:12, color:"var(--text-secondary)" }}>
                              {executor.global_name ?? executor.username}
                            </span>
                          </div>
                        ) : entry.user_id ? (
                          <code style={{ fontSize:11, color:"var(--text-muted)" }}>{entry.user_id}</code>
                        ) : <span style={{ color:"var(--text-muted)" }}>—</span>}
                      </td>
                      <td style={{ padding:"12px 16px" }}>
                        {entry.target_id ? <code style={{ fontSize:11, color:"var(--text-muted)" }}>{entry.target_id}</code> : <span style={{ color:"var(--text-muted)" }}>—</span>}
                      </td>
                      <td style={{ padding:"12px 16px", maxWidth:200 }}>
                        <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontSize:12, color:"var(--text-secondary)" }}>
                          {entry.reason ?? <span style={{ color:"var(--text-muted)" }}>—</span>}
                        </div>
                      </td>
                      <td style={{ padding:"12px 16px", whiteSpace:"nowrap", color:"var(--text-muted)", fontSize:12 }}>
                        {timeSince(entry.id)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

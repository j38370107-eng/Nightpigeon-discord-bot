import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, PageHeader, Badge, Spinner, EmptyState } from "../../components/ui";
import { Ban, Shield } from "lucide-react";

function formatRemaining(ms: number | null | undefined): string {
  if (ms == null) return "Permanent";
  if (ms <= 0) return "Expiring soon…";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m remaining`;
  if (h > 0) return `${h}h ${m}m remaining`;
  return `${m}m ${s % 60}s remaining`;
}

function formatExpiry(ts: number | null | undefined): string {
  if (!ts) return "Never";
  return new Date(ts).toLocaleString();
}

export default function Punishments() {
  const { guildId } = useParams<{ guildId: string }>();
  const [punishments, setPunishments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "ban" | "mute">("all");

  useEffect(() => {
    if (!guildId) return;
    api.guild.punishments(guildId).then(setPunishments).catch(console.error).finally(() => setLoading(false));
  }, [guildId]);

  // Re-render every 30s to update remaining times
  useEffect(() => {
    const t = setInterval(() => setPunishments(p => [...p]), 30_000);
    return () => clearInterval(t);
  }, []);

  const filtered = filter === "all" ? punishments : punishments.filter(p => p.type === filter);
  const bans = punishments.filter(p => p.type === "ban");
  const mutes = punishments.filter(p => p.type === "mute");

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: "32px 32px 48px" }}>
      <PageHeader title="Active Punishments" subtitle="Currently active timed bans and mutes" />

      {/* Summary */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:14, marginBottom:24 }}>
        {[
          { label:"Active Bans", value:bans.length, icon:<Ban size={20} />, color:"danger" },
          { label:"Active Mutes", value:mutes.length, icon:<Shield size={20} />, color:"warning" },
        ].map(({ label, value, icon, color }) => {
          const c = color === "danger" ? "var(--danger)" : "var(--warning)";
          return (
            <Card key={label} style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:`${c}20`, border:`1px solid ${c}40`, display:"flex", alignItems:"center", justifyContent:"center", color:c, flexShrink:0 }}>
                {icon}
              </div>
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:"var(--text-primary)" }}>{value}</div>
                <div style={{ fontSize:12, color:"var(--text-secondary)" }}>{label}</div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Filter tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        {(["all","ban","mute"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding:"7px 16px", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer",
            background: filter === f ? "var(--accent)" : "var(--bg-card)",
            color: filter === f ? "#000" : "var(--text-secondary)",
            border:`1px solid ${filter === f ? "var(--accent)" : "var(--border)"}`,
            fontFamily:"inherit",
          }}>
            {f === "all" ? `All (${punishments.length})` : f === "ban" ? `Bans (${bans.length})` : `Mutes (${mutes.length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Shield size={40} />}
            title="No active punishments"
            description={filter === "all" ? "No timed bans or mutes are currently active in this server." : `No active ${filter}s.`}
          />
        </Card>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {filtered.map((p, i) => {
            const isBan = p.type === "ban";
            const accentColor = isBan ? "var(--danger)" : "var(--warning)";
            const remaining = p.expiresAt ? p.expiresAt - Date.now() : null;
            const percentLeft = (p.expiresAt && remaining != null && remaining > 0) ? Math.min(100, (remaining / (24 * 60 * 60 * 1000)) * 100) : 0;

            return (
              <Card key={i} style={{ borderLeftWidth:3, borderLeftColor:accentColor }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <Badge color={isBan ? "danger" : "warning"}>{isBan ? "Ban" : "Mute"}</Badge>
                      <span style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)" }}>
                        {p.userTag ?? `User ${p.userId}`}
                      </span>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:8 }}>
                      <div>
                        <div style={{ fontSize:11, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:2 }}>User ID</div>
                        <code style={{ fontSize:12, color:"var(--text-secondary)" }}>{p.userId}</code>
                      </div>
                      {p.moderatorTag && (
                        <div>
                          <div style={{ fontSize:11, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:2 }}>Moderator</div>
                          <div style={{ fontSize:12, color:"var(--text-secondary)" }}>{p.moderatorTag}</div>
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize:11, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:2 }}>Reason</div>
                        <div style={{ fontSize:12, color:"var(--text-secondary)" }}>{p.reason ?? "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize:11, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:2 }}>Expires</div>
                        <div style={{ fontSize:12, color:"var(--text-secondary)" }}>{formatExpiry(p.expiresAt)}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign:"right", minWidth:160 }}>
                    <div style={{ fontSize:13, fontWeight:700, color: remaining != null && remaining < 3600000 ? "var(--danger)" : accentColor }}>
                      {formatRemaining(remaining)}
                    </div>
                    {remaining != null && remaining > 0 && (
                      <div style={{ marginTop:8, height:4, background:"var(--bg-input)", borderRadius:2, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${percentLeft}%`, background:accentColor, borderRadius:2, transition:"width 0.3s" }} />
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

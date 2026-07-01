import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, StatCard, PageHeader, Badge, Spinner } from "../../components/ui";
import { FileText, Ban, Zap, Bot, Shield, Settings, ChevronRight, ExternalLink, BookOpen, Activity } from "lucide-react";

export default function Overview() {
  const { guildId } = useParams<{ guildId: string }>();
  const [data, setData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!guildId) return;
    Promise.all([
      api.guild.overview(guildId),
      api.stats(),
    ]).then(([overview, botStats]) => {
      setData(overview);
      setStats(botStats);
    }).catch(console.error).finally(() => setLoading(false));
  }, [guildId]);

  if (loading) return <Spinner />;
  if (!data) return null;

  const statusColor = stats?.status === "online" ? "var(--success)" : stats?.status === "degraded" ? "var(--warning)" : "var(--danger)";

  function formatUptime(ms: number) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  const guild = data.guild;
  const s = data.stats;

  return (
    <div style={{ padding: "32px 32px 48px" }}>
      <PageHeader title="Overview" subtitle={`Dashboard for ${guild?.name}`} />

      {/* Bot status bar */}
      <Card style={{ marginBottom: 24, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:10, height:10, borderRadius:"50%", background:statusColor }} className="pulse-ring" />
          <span style={{ fontSize:14, fontWeight:600, color:"var(--text-primary)" }}>
            Bot Status: <span style={{ color:statusColor, textTransform:"capitalize" }}>{stats?.status ?? "Unknown"}</span>
          </span>
          {stats?.uptimeMs > 0 && (
            <span style={{ fontSize:13, color:"var(--text-muted)" }}>· Uptime: {formatUptime(stats.uptimeMs)}</span>
          )}
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <a href={`https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot`}
            target="_blank" rel="noreferrer"
            style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"7px 14px", background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:8, fontSize:12, fontWeight:600, color:"var(--text-secondary)" }}>
            <ExternalLink size={13} /> Invite Bot
          </a>
          <a href="https://discord.gg/your-support" target="_blank" rel="noreferrer"
            style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"7px 14px", background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:8, fontSize:12, fontWeight:600, color:"var(--text-secondary)" }}>
            <BookOpen size={13} /> Support
          </a>
        </div>
      </Card>

      {/* Bot-wide stats */}
      {stats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:16, marginBottom:24 }}>
          <StatCard label="Total Servers" value={stats.guildCount?.toLocaleString() ?? "—"} icon={<Activity size={20} />} color="accent" />
          <StatCard label="Total Users" value={stats.userCount?.toLocaleString() ?? "—"} icon={<Bot size={20} />} color="info" />
          <StatCard label="Commands Available" value={stats.commandCount ?? "60+"} icon={<Zap size={20} />} color="success" />
          <StatCard label="Uptime" value={stats.uptimeMs > 0 ? formatUptime(stats.uptimeMs) : "—"} icon={<Activity size={20} />} color="success" />
        </div>
      )}

      {/* Server-specific stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:16, marginBottom:32 }}>
        <StatCard label="Total Cases" value={s.totalCases} icon={<FileText size={20} />} color="accent" />
        <StatCard label="Active Bans" value={s.activeBans} icon={<Ban size={20} />} color="danger" />
        <StatCard label="Active Mutes" value={s.activeMutes} icon={<Shield size={20} />} color="warning" />
        <StatCard label="Shortcuts" value={s.shortcuts} icon={<Zap size={20} />} color="info" />
        <StatCard label="Disabled Commands" value={s.disabledCommands} icon={<Bot size={20} />} color={s.disabledCommands > 0 ? "warning" : "success"} />
      </div>

      {/* Quick actions */}
      <h2 style={{ fontSize:16, fontWeight:700, color:"var(--text-primary)", marginBottom:12 }}>Quick Actions</h2>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12 }}>
        {[
          { to:"shortcuts", label:"Manage Shortcuts", desc:"Create & edit command shortcuts", icon:<Zap size={18} />, color:"var(--accent)" },
          { to:"commands", label:"Command Modules", desc:"Enable or disable commands", icon:<Bot size={18} />, color:"var(--info)" },
          { to:"cases", label:"Case Log", desc:"View all moderation cases", icon:<FileText size={18} />, color:"var(--warning)" },
          { to:"settings", label:"Server Settings", desc:"Prefix, logging & more", icon:<Settings size={18} />, color:"var(--text-secondary)" },
        ].map(({ to, label, desc, icon, color }) => (
          <Link key={to} to={to} style={{ display:"block", textDecoration:"none" }}>
            <Card style={{ cursor:"pointer", transition:"all 0.15s", borderColor:"var(--border)" }}
              className="quick-action-card">
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
                <div style={{ color, flexShrink:0 }}>{icon}</div>
                <span style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)" }}>{label}</span>
                <ChevronRight size={14} color="var(--text-muted)" style={{ marginLeft:"auto" }} />
              </div>
              <div style={{ fontSize:12, color:"var(--text-secondary)" }}>{desc}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

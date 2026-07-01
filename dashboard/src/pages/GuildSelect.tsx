import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../App";
import { RefreshCw } from "lucide-react";

const OWNER_ID = "1216140996463689810";
const INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1507550967275458660&permissions=6293600228863223&integration_type=0&scope=bot";

function GuildRow({ guild, navigate }: { guild: any; navigate: (path: string) => void }) {
  const icon = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
      {icon
        ? <img src={icon} alt="" style={{ width: 48, height: 48, borderRadius: "50%", flexShrink: 0 }} />
        : <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--bg-card)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "var(--text-secondary)", flexShrink: 0 }}>
            {guild.name[0]}
          </div>
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{guild.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>{guild.id}</div>
      </div>
      <button
        onClick={() => navigate(`/dashboard/${guild.id}/config`)}
        style={{ padding: "6px 16px", borderRadius: 4, fontSize: 13, fontWeight: 500, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "inherit", flexShrink: 0, transition: "border-color 0.15s" }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--text-secondary)")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
      >
        Config
      </button>
    </div>
  );
}

export default function GuildSelect() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [guilds, setGuilds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  const isOwner = user?.id === OWNER_ID;

  useEffect(() => {
    api.auth.refreshGuilds()
      .then(({ guilds: fresh }) => setGuilds(fresh))
      .catch(() => api.auth.guilds().then(setGuilds).catch(() => {}))
      .finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { guilds: fresh } = await api.auth.refreshGuilds();
      setGuilds(fresh);
    } catch {
      window.location.href = "/api/auth/login";
    } finally {
      setRefreshing(false);
    }
  };

  const avatarUrl = user?.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  const normalGuilds = isOwner ? guilds.filter((g) => !g.debug) : guilds;
  const debugGuilds = isOwner ? guilds.filter((g) => g.debug) : [];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Top nav */}
      <header style={{
        height: 52, display: "flex", alignItems: "center", padding: "0 24px",
        gap: 24, background: "var(--bg-nav)", borderBottom: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginRight: 8 }}>
          NightPigeon Dashboard
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <button
            style={{ padding: "5px 12px", borderRadius: 5, fontSize: 14, fontWeight: 500, color: "var(--text-primary)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            Guilds
          </button>
          <button
            onClick={async () => { await api.auth.logout(); window.location.href = "/"; }}
            style={{ padding: "5px 12px", borderRadius: 5, fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            Log out
          </button>
          <img src={avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: "50%", marginLeft: 8 }} />
        </div>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 740, padding: "48px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 36 }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, color: "var(--text-primary)" }}>Guilds</h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh"
            style={{
              marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 5, fontSize: 13,
              background: "none", border: "1px solid var(--border)",
              color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit",
              opacity: refreshing ? 0.6 : 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--text-secondary)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <RefreshCw size={12} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading…</div>
        ) : guilds.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>
            No servers found. <a href="/api/auth/login" style={{ color: "var(--accent)" }}>Re-authenticate</a>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {normalGuilds.map(guild => (
                <GuildRow key={guild.id} guild={guild} navigate={navigate} />
              ))}
            </div>

            {isOwner && debugGuilds.length > 0 && (
              <div style={{ marginTop: 40 }}>
                <button
                  onClick={() => setDebugOpen(o => !o)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, background: "none",
                    border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit",
                    marginBottom: debugOpen ? 8 : 0,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                    Debug
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 10,
                    background: "rgba(255,255,255,0.06)", color: "var(--text-muted)",
                  }}>
                    {debugGuilds.length}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 2 }}>
                    {debugOpen ? "▲" : "▼"}
                  </span>
                </button>

                {debugOpen && (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {debugGuilds.map(guild => (
                      <GuildRow key={guild.id} guild={guild} navigate={navigate} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {guilds.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <a href={INVITE_URL} target="_blank" rel="noreferrer"
              style={{ fontSize: 13, color: "var(--text-muted)" }}
              onMouseEnter={e => ((e.target as HTMLElement).style.color = "var(--text-secondary)")}
              onMouseLeave={e => ((e.target as HTMLElement).style.color = "var(--text-muted)")}
            >
              + Add bot to another server
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

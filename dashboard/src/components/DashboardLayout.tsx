import { useEffect, useState, useCallback } from "react";
import { Outlet, useParams, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import { api } from "../lib/api";
import { Shield, Menu, X } from "lucide-react";

import BotAssistant from "./BotAssistant";

const INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1513348523242950736&permissions=8543205347819511&integration_type=0&scope=bot";

export default function DashboardLayout() {
  const { guildId } = useParams<{ guildId: string }>();
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const [guild, setGuild] = useState<any>(null);
  const [botChecked, setBotChecked] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [myRole, setMyRole] = useState<"bot-owner" | "owner" | "staff" | null>(null);

  useEffect(() => {
    if (!guildId) return;
    api.guild.myAccess(guildId)
      .then((data) => {
        setMyRole(data.role as any);
        setAccessDenied(false);
      })
      .catch(() => {
        setAccessDenied(true);
      });
  }, [guildId]);

  useEffect(() => {
    api.auth.guilds().then((guilds) => {
      const g = guilds.find((g: any) => g.id === guildId);
      if (g) setGuild(g);
    }).catch(() => {});
  }, [guildId]);

  useEffect(() => {
    if (!guildId) return;
    api.guild.botStatus(guildId).then(({ present }) => {
      if (!present) {
        window.location.href = `${INVITE_URL}&guild_id=${guildId}&disable_guild_select=true`;
      } else {
        setBotChecked(true);
      }
    }).catch(() => setBotChecked(true));
  }, [guildId]);

  const handleLogout = useCallback(async () => {
    await api.auth.logout();
    refetch();
    navigate("/");
  }, [refetch, navigate]);

  useEffect(() => { setMenuOpen(false); }, [guildId]);

  const isOwner = myRole === "bot-owner" || myRole === "owner";

  if (accessDenied) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", flexDirection:"column", gap:16, padding:24 }}>
        <Shield size={48} color="var(--danger)" style={{ opacity:0.7 }} />
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:18, fontWeight:700, color:"var(--text-primary)", marginBottom:8 }}>Access Denied</div>
          <div style={{ fontSize:14, color:"var(--text-secondary)", maxWidth:360 }}>
            You don't have access to this server's dashboard. Contact the server owner to request access.
          </div>
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
          <button onClick={() => navigate("/servers")} style={{ padding:"9px 20px", background:"var(--accent)", border:"none", borderRadius:6, color:"#000", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            Back to Servers
          </button>
          <button onClick={() => window.location.href = "/api/auth/login"} style={{ padding:"9px 20px", background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:6, color:"var(--text-primary)", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            Re-authenticate
          </button>
        </div>
      </div>
    );
  }

  if (!botChecked) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", color:"var(--text-muted)", fontSize:14 }}>
        Checking bot status…
      </div>
    );
  }

  const guildIconUrl = guild?.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null;

  return (
    <div className="dash-root">
      <header className="dash-nav">
        <span className="dash-nav-brand">NightPigeon</span>

        <div className="dash-nav-guild">
          {guildIconUrl
            ? <img src={guildIconUrl} alt="" style={{ width:20, height:20, borderRadius:4, flexShrink:0 }} />
            : <div style={{ width:20, height:20, borderRadius:4, background:"var(--bg-card)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"var(--text-muted)", flexShrink:0 }}>
                {guild?.name?.[0] ?? "?"}
              </div>
          }
          <span className="dash-nav-guild-name">{guild?.name ?? "…"}</span>
        </div>

        <div className="dash-nav-links">
          <NavLink to="config" className={({ isActive }) => `dash-nav-link${isActive ? " active" : ""}`}>Config</NavLink>
          {isOwner && (
            <NavLink to="access" className={({ isActive }) => `dash-nav-link${isActive ? " active" : ""}`}>Access</NavLink>
          )}
          <a href="/docs" className="dash-nav-link">Docs</a>
          <button className="dash-nav-link" onClick={() => navigate("/servers")}>Guilds</button>
          <button className="dash-nav-link" onClick={handleLogout}>Log out</button>
        </div>

        <button
          className="dash-nav-hamburger"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {menuOpen && (
        <div className="dash-mobile-menu">
          <NavLink to="config" className="dash-mobile-link" onClick={() => setMenuOpen(false)}>Config</NavLink>
          {isOwner && (
            <NavLink to="access" className="dash-mobile-link" onClick={() => setMenuOpen(false)}>Access</NavLink>
          )}
          <a href="/docs" className="dash-mobile-link" onClick={() => setMenuOpen(false)}>Docs</a>
          <button className="dash-mobile-link" onClick={() => { setMenuOpen(false); navigate("/servers"); }}>Guilds</button>
          <button className="dash-mobile-link dash-mobile-link--danger" onClick={() => { setMenuOpen(false); handleLogout(); }}>Log out</button>
        </div>
      )}

      <main className="dash-main">
        <Outlet />
      </main>

      <BotAssistant />
    </div>
  );
}

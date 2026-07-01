import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import { Zap } from "lucide-react";

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/servers");
  }, [user, loading]);

  if (loading) return null;

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg-primary)" }} className="hex-bg">
      <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:16, padding:48, textAlign:"center", width:"100%", maxWidth:400 }}>
        <div style={{ width:56, height:56, borderRadius:12, background:"var(--accent-dim)", border:"2px solid var(--accent)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px" }}>
          <Zap size={24} color="var(--accent)" />
        </div>
        <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text-primary)", marginBottom:8 }}>Welcome Back</h1>
        <p style={{ color:"var(--text-secondary)", fontSize:14, marginBottom:32, lineHeight:1.6 }}>
          Log in with your Discord account to manage your servers.
        </p>
        <a href="/api/auth/login" style={{
          display:"block", padding:"13px 24px", background:"#5865F2", color:"#fff",
          borderRadius:10, fontWeight:700, fontSize:15, transition:"opacity 0.2s",
        }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          Log in with Discord
        </a>
      </div>
    </div>
  );
}

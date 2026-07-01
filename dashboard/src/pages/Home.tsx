import { Link } from "react-router-dom";
import { useAuth } from "../App";


export default function Home() {
  const { user } = useAuth();

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      {/* Night sky background */}
      <div style={{
        position: "fixed",
        inset: 0,
        backgroundImage: "url(/nightsky.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        zIndex: 0,
      }} />

      {/* Overlay for depth */}
      <div style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 18, 35, 0.55)",
        zIndex: 1,
      }} />

      {/* Content */}
      <div style={{
        position: "relative",
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        textAlign: "center",
        maxWidth: 480,
        width: "100%",
      }}>
        {/* Pigeon logo */}
        <img
          src="/pigeon.jpeg"
          alt="NightPigeon"
          style={{
            width: 200,
            height: 200,
            objectFit: "cover",
            borderRadius: "50%",
            marginBottom: 36,
            filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.6))",
            border: "2px solid rgba(255,255,255,0.10)",
          }}
        />

        {/* Title */}
        <h1 style={{
          fontSize: 56,
          fontWeight: 700,
          color: "#ffffff",
          margin: "0 0 16px",
          letterSpacing: "-1px",
          lineHeight: 1,
          textShadow: "0 2px 24px rgba(0,0,0,0.5)",
        }}>
          NightPigeon
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 16,
          color: "rgba(255,255,255,0.75)",
          margin: "0 0 40px",
          lineHeight: 1.6,
          maxWidth: 360,
        }}>
          NightPigeon is a moderation bot that was built to fulfills all moderation needs in your server large or small. All for free and without whitelist.
        </p>

        {/* Buttons */}
        <div style={{
          display: "flex",
          gap: 14,
          justifyContent: "center",
          flexWrap: "wrap",
          marginBottom: 48,
        }}>
          {user ? (
            <Link to="/servers" style={{
              padding: "12px 32px",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 500,
              color: "#ffffff",
              border: "1.5px solid rgba(255,255,255,0.55)",
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
              textDecoration: "none",
              letterSpacing: "0.01em",
              transition: "background 0.2s, border-color 0.2s",
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.16)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.8)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.08)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.55)";
              }}
            >
              Dashboard
            </Link>
          ) : (
            <a href="/api/auth/login" style={{
              padding: "12px 32px",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 500,
              color: "#ffffff",
              border: "1.5px solid rgba(255,255,255,0.55)",
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
              textDecoration: "none",
              letterSpacing: "0.01em",
              transition: "background 0.2s, border-color 0.2s",
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.16)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.8)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.08)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.55)";
              }}
            >
              Dashboard
            </a>
          )}

          <Link
            to="/docs"
            style={{
              padding: "12px 32px",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 500,
              color: "#ffffff",
              border: "1.5px solid rgba(255,255,255,0.55)",
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
              textDecoration: "none",
              letterSpacing: "0.01em",
              transition: "background 0.2s, border-color 0.2s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.16)";
              (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.8)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.55)";
            }}
          >
            Documentation
          </Link>
        </div>

        {/* Footer links */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "rgba(255,255,255,0.50)",
          flexWrap: "wrap",
          justifyContent: "center",
        }}>
          <a
            href="https://discord.gg/3geJHbfuYs"
            target="_blank"
            rel="noreferrer"
            style={{
              color: "rgba(255,255,255,0.50)",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.9)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.50)"; }}
          >
            Official Discord Server
          </a>
          <span style={{ opacity: 0.4 }}>·</span>
          <a
            href="/privacy"
            style={{
              color: "rgba(255,255,255,0.50)",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.9)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.50)"; }}
          >
            Privacy Policy
          </a>
          <span style={{ opacity: 0.4 }}>·</span>
          <a
            href="/terms"
            style={{
              color: "rgba(255,255,255,0.50)",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.9)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.50)"; }}
          >
            Terms of Service
          </a>
        </div>
      </div>
    </div>
  );
}

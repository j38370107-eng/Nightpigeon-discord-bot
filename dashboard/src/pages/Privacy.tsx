import { Link } from "react-router-dom";

const EFFECTIVE_DATE = "June 14, 2025";
const SUPPORT_SERVER = "https://discord.gg/3geJHbfuYs";

export default function Privacy() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f1223",
      color: "#e0e0e0",
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      padding: "48px 24px",
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link to="/" style={{ color: "#7289da", textDecoration: "none", fontSize: 14, display: "inline-block", marginBottom: 32 }}>
          ← Back to home
        </Link>

        <h1 style={{ fontSize: 32, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginBottom: 40 }}>Effective date: {EFFECTIVE_DATE}</p>

        <Section title="1. Overview">
          NightPigeon ("the Bot", "we", "us") is a Discord moderation bot. This Privacy Policy explains what information we
          collect when you use the Bot and its dashboard, how we use that information, and what rights you have regarding your data.
          By using NightPigeon you agree to the practices described here.
        </Section>

        <Section title="2. Information We Collect">
          <p>We collect only the minimum data required to operate the Bot:</p>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li><strong>Discord user IDs and usernames</strong> — stored as part of moderation case records (e.g. who was warned, by whom).</li>
            <li><strong>Guild (server) IDs</strong> — used to store your server's configuration and cases.</li>
            <li><strong>Moderation records</strong> — cases, notes, and warnings created by moderators in your server.</li>
            <li><strong>Server YAML configuration</strong> — the config you write in the dashboard, stored per guild.</li>
            <li><strong>OAuth2 session data</strong> — your Discord user ID and access token, used to authenticate you on the dashboard. Tokens are stored only for the duration of your session.</li>
          </ul>
          <p>We do <strong>not</strong> read, store, or process the content of your server's messages beyond what is explicitly required for commands you trigger (e.g. purge, automod).</p>
        </Section>

        <Section title="3. How We Use Your Information">
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>To operate moderation features (cases, warnings, mutes, bans, etc.)</li>
            <li>To display your server's configuration and case history in the dashboard</li>
            <li>To authenticate you via Discord OAuth2 on the dashboard</li>
            <li>To enforce automod rules you configure for your server</li>
          </ul>
          <p>We do <strong>not</strong> sell, share, or monetise your data in any way.</p>
        </Section>

        <Section title="4. Data Retention">
          <p>
            Moderation records (cases, notes) are retained indefinitely unless a moderator deletes them via bot commands or the dashboard.
            Server YAML configuration is retained until you delete it or remove the Bot from your server.
            Session tokens are stored only for the duration of your login session.
          </p>
          <p>
            If you remove NightPigeon from your server, your server's data is not automatically deleted. You may request deletion by joining our <a href={SUPPORT_SERVER} target="_blank" rel="noreferrer" style={{ color: "#7289da" }}>support server</a>.
          </p>
        </Section>

        <Section title="5. Data Sharing">
          We do not share your data with any third parties. All data is stored in our own database and is not accessible to external services.
          We may disclose data if required by law or to protect the safety of our users.
        </Section>

        <Section title="6. Security">
          We take reasonable steps to protect your data, including encrypted connections (TLS) and access controls on our database.
          However, no system is perfectly secure. Use the Bot at your own risk.
        </Section>

        <Section title="7. Children's Privacy">
          NightPigeon is not directed at children under 13. We do not knowingly collect data from children under 13.
          If you believe a child under 13 has provided us data, please contact us and we will delete it promptly.
        </Section>

        <Section title="8. Your Rights">
          <p>You may request access to, correction of, or deletion of your data at any time by reaching us via our <a href={SUPPORT_SERVER} target="_blank" rel="noreferrer" style={{ color: "#7289da" }}>support server</a>.</p>
          <p>Server administrators may delete cases and configuration at any time using bot commands or the dashboard.</p>
        </Section>

        <Section title="9. Changes to This Policy">
          We may update this Privacy Policy from time to time. We will update the effective date at the top of this page when we do.
          Continued use of the Bot after changes constitutes acceptance of the updated policy.
        </Section>

        <Section title="10. Contact">
          If you have any questions about this Privacy Policy, please reach us via our{" "}
          <a href={SUPPORT_SERVER} target="_blank" rel="noreferrer" style={{ color: "#7289da" }}>support server</a>.
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#fff", marginBottom: 12 }}>{title}</h2>
      <div style={{ color: "rgba(255,255,255,0.70)", lineHeight: 1.75, fontSize: 15 }}>{children}</div>
    </div>
  );
}

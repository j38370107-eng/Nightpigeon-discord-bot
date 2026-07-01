import { Link } from "react-router-dom";

const EFFECTIVE_DATE = "June 14, 2025";
const SUPPORT_SERVER = "https://discord.gg/3geJHbfuYs";

export default function Terms() {
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

        <h1 style={{ fontSize: 32, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Terms of Service</h1>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginBottom: 40 }}>Effective date: {EFFECTIVE_DATE}</p>

        <Section title="1. Acceptance of Terms">
          By adding NightPigeon to your Discord server or using the NightPigeon dashboard, you agree to be bound by these Terms of Service
          ("Terms"). If you do not agree to these Terms, do not use the Bot or dashboard.
          These Terms apply to all users, including server administrators and members of servers that use NightPigeon.
        </Section>

        <Section title="2. Description of Service">
          NightPigeon is a free Discord moderation bot. It provides features including but not limited to: moderation commands,
          case tracking, automod, logging, reaction roles, tickets, and configurable per-server YAML settings.
          The service is provided free of charge with no whitelist requirement.
        </Section>

        <Section title="3. Eligibility">
          You must comply with Discord's{" "}
          <a href="https://discord.com/terms" target="_blank" rel="noreferrer" style={{ color: "#7289da" }}>Terms of Service</a>{" "}
          and{" "}
          <a href="https://discord.com/guidelines" target="_blank" rel="noreferrer" style={{ color: "#7289da" }}>Community Guidelines</a>{" "}
          to use NightPigeon. You must be at least 13 years old.
        </Section>

        <Section title="4. Acceptable Use">
          <p>You agree <strong>not</strong> to use NightPigeon to:</p>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>Harass, abuse, threaten, or harm other users</li>
            <li>Violate Discord's Terms of Service or Community Guidelines</li>
            <li>Attempt to exploit, reverse-engineer, or disrupt the Bot or its infrastructure</li>
            <li>Use the Bot for any unlawful purpose</li>
            <li>Abuse mass-action commands (mass ban, mass kick, etc.) to harm communities</li>
            <li>Circumvent any access controls or limitations imposed by the service</li>
          </ul>
          <p>We reserve the right to remove the Bot from any server that violates these Terms at any time without notice.</p>
        </Section>

        <Section title="5. Server Administrator Responsibilities">
          Server administrators who add NightPigeon are responsible for:
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>Configuring the Bot appropriately for their community</li>
            <li>Ensuring moderators use the Bot's features in a fair and lawful manner</li>
            <li>Complying with applicable laws regarding data processing in their jurisdiction</li>
            <li>Informing their members that a moderation bot is in use</li>
          </ul>
        </Section>

        <Section title="6. Availability and Modifications">
          NightPigeon is provided on an "as-is" and "as-available" basis. We do not guarantee that the service will be available
          at all times, uninterrupted, or error-free. We reserve the right to modify, suspend, or discontinue the service at any
          time without notice. We may also update these Terms at any time; continued use after changes constitutes acceptance.
        </Section>

        <Section title="7. Intellectual Property">
          NightPigeon and all associated code, designs, and content are the property of NightPigeon's developers.
          You may not copy, modify, distribute, or create derivative works without explicit written permission.
        </Section>

        <Section title="8. Disclaimer of Warranties">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, NIGHTPIGEON IS PROVIDED "AS IS" WITHOUT ANY WARRANTIES OF ANY KIND,
          EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          OR NON-INFRINGEMENT. WE MAKE NO WARRANTY THAT THE BOT WILL MEET YOUR REQUIREMENTS OR OPERATE WITHOUT INTERRUPTION OR ERROR.
        </Section>

        <Section title="9. Limitation of Liability">
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL NIGHTPIGEON'S DEVELOPERS BE LIABLE FOR ANY
          INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF DATA, ARISING OUT OF OR IN
          CONNECTION WITH YOUR USE OF THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
        </Section>

        <Section title="10. Governing Law">
          These Terms are governed by and construed in accordance with applicable laws, without regard to conflict of law principles.
          Any disputes shall be resolved through good-faith negotiation before pursuing formal legal action.
        </Section>

        <Section title="11. Contact">
          If you have questions about these Terms, please reach us via our{" "}
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

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, Button, TextArea, PageHeader, Spinner, useToast, Badge } from "../../components/ui";
import { Info } from "lucide-react";

const TYPES = [
  { key: "warn", label: "Warn", emoji: "⚠️", color: "warning", desc: "Appended to the DM sent when a member is warned." },
  { key: "mute", label: "Mute", emoji: "🔇", color: "accent", desc: "Appended to the DM sent when a member is muted." },
  { key: "kick", label: "Kick", emoji: "👢", color: "info", desc: "Appended to the DM sent when a member is kicked." },
  { key: "ban", label: "Ban", emoji: "🔨", color: "danger", desc: "Appended to the DM sent when a member is banned." },
] as const;

export default function PunishmentInfo() {
  const { guildId } = useParams<{ guildId: string }>();
  const [info, setInfo] = useState<Record<string, string>>({ warn: "", mute: "", kick: "", ban: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { show, ToastEl } = useToast();

  useEffect(() => {
    if (!guildId) return;
    api.guild.additionalInfo(guildId)
      .then(d => setInfo({ warn: d.warn ?? "", mute: d.mute ?? "", kick: d.kick ?? "", ban: d.ban ?? "" }))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [guildId]);

  const save = async () => {
    if (!guildId) return;
    setSaving(true);
    try {
      await api.guild.updateAdditionalInfo(guildId, {
        warn: info.warn.trim() || null,
        mute: info.mute.trim() || null,
        kick: info.kick.trim() || null,
        ban: info.ban.trim() || null,
      });
      show("Punishment info saved!", "success");
    } catch (e: any) { show(e.message ?? "Failed", "error"); }
    finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: "32px 32px 48px", maxWidth: 720 }}>
      {ToastEl}
      <PageHeader title="Punishment Info" subtitle="Custom text appended to DMs when members are punished">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save All"}</Button>
      </PageHeader>

      <div style={{ padding: "12px 16px", background: "var(--accent-dim)", border: "1px solid rgba(240,165,0,0.25)", borderRadius: 10, marginBottom: 20, fontSize: 13, color: "var(--accent)", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>These messages are automatically added to the end of punishment DMs. For example, you could add rules links, appeal info, or contact details. Leave blank to disable for that punishment type.</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {TYPES.map(({ key, label, emoji, color, desc }) => (
          <Card key={key}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>{emoji}</span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{label}</span>
                  {info[key]?.trim()
                    ? <Badge color="success">Set</Badge>
                    : <Badge color="muted">Not set</Badge>
                  }
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{desc}</div>
              </div>
            </div>
            <TextArea
              value={info[key]}
              onChange={v => setInfo(i => ({ ...i, [key]: v }))}
              placeholder={`e.g. If you'd like to appeal, visit discord.gg/yourserver and open a ticket.`}
              rows={3}
            />
            {info[key]?.trim() && (
              <button onClick={() => setInfo(i => ({ ...i, [key]: "" }))}
                style={{ marginTop: 8, background: "none", border: "none", color: "var(--danger)", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                Clear {label.toLowerCase()} info
              </button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

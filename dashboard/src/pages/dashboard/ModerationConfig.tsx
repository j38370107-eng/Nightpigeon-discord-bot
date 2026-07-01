import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, Input, Select, Toggle, PageHeader, Spinner, useToast, SaveBar, Button } from "../../components/ui";
import { Plus, Trash2, ShieldCheck, Users, Lock, Hash } from "lucide-react";

const DAY_MS = 24 * 60 * 60 * 1000;

const STEP_CAP = 10;

function ChipSelector({
  label, hint, items, selected, onAdd, onRemove, getName, getId, prefix,
}: {
  label: string; hint?: string;
  items: any[]; selected: string[];
  onAdd: (id: string) => void; onRemove: (id: string) => void;
  getName: (item: any) => string; getId: (item: any) => string;
  prefix?: string;
}) {
  const available = items.filter((i) => !selected.includes(getId(i)));
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{label}</div>
      {hint && <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{hint}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: selected.length > 0 ? 10 : 0 }}>
        {selected.map((id) => {
          const item = items.find((i) => getId(i) === id);
          const name = item ? getName(item) : id;
          return (
            <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "var(--accent-dim)", border: "1px solid rgba(240,165,0,0.25)", borderRadius: 6, fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
              {prefix}{name}
              <button onClick={() => onRemove(id)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1, display: "flex" }}>×</button>
            </span>
          );
        })}
        {selected.length === 0 && <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>None selected</span>}
      </div>
      {available.length > 0 && (
        <select
          onChange={(e) => { if (e.target.value) { onAdd(e.target.value); e.target.value = ""; } }}
          style={{ padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 13, outline: "none", cursor: "pointer", width: "100%", marginTop: 4 }}
        >
          <option value="">— Add {label.toLowerCase()} —</option>
          {available.map((i) => <option key={getId(i)} value={getId(i)}>{prefix}{getName(i)}</option>)}
        </select>
      )}
    </div>
  );
}

const defaultMute = { mode: "timeout" as "timeout" | "role", muteRoleId: "" as string | null, stripRoles: false };

export default function ModerationConfig() {
  const { guildId } = useParams<{ guildId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { show, ToastEl } = useToast();

  const [roles, setRoles] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [lockdownChannelList, setLockdownChannelList] = useState<any[]>([]);
  const [shortcuts, setShortcuts] = useState<any[]>([]);

  const [modRoles, setModRoles] = useState<string[]>([]);
  const [protectedRoles, setProtectedRoles] = useState<string[]>([]);
  const [lockdownChannels, setLockdownChannels] = useState<string[]>([]);
  const [logChannelId, setLogChannelId] = useState("");
  const [warnExpiryDays, setWarnExpiryDays] = useState("30");
  const [automodWarnExpiryDays, setAutomodWarnExpiryDays] = useState("7");
  const [warnEscalation, setWarnEscalation] = useState<{ steps: any[] }>({ steps: [] });
  const [muteConfig, setMuteConfig] = useState(defaultMute);

  const saved = useRef({
    modRoles: [] as string[], protectedRoles: [] as string[], lockdownChannels: [] as string[],
    logChannelId: "", warnExpiryDays: "30", automodWarnExpiryDays: "7",
    warnEscalation: { steps: [] as any[] }, muteConfig: defaultMute,
  });

  const dirty =
    JSON.stringify(modRoles) !== JSON.stringify(saved.current.modRoles) ||
    JSON.stringify(protectedRoles) !== JSON.stringify(saved.current.protectedRoles) ||
    JSON.stringify(lockdownChannels) !== JSON.stringify(saved.current.lockdownChannels) ||
    logChannelId !== saved.current.logChannelId ||
    warnExpiryDays !== saved.current.warnExpiryDays ||
    automodWarnExpiryDays !== saved.current.automodWarnExpiryDays ||
    JSON.stringify(warnEscalation) !== JSON.stringify(saved.current.warnEscalation) ||
    JSON.stringify(muteConfig) !== JSON.stringify(saved.current.muteConfig);

  useEffect(() => {
    if (!guildId) return;
    Promise.all([
      api.guild.moderationConfig(guildId),
      api.guild.roles(guildId),
      api.guild.channels(guildId),
      api.guild.shortcuts(guildId),
      api.guild.channelsWithVoice(guildId),
    ]).then(([cfg, rl, ch, sc, allCh]) => {
      setRoles(rl);
      setChannels(ch);
      setLockdownChannelList(allCh);
      setShortcuts(sc);
      setModRoles(cfg.modRoles ?? []);
      setProtectedRoles(cfg.protectedRoles ?? []);
      setLockdownChannels(cfg.lockdownChannels ?? []);
      setLogChannelId(cfg.logChannelId ?? "");
      setWarnExpiryDays(cfg.warnExpiryDays ?? "30");
      setAutomodWarnExpiryDays(cfg.automodWarnExpiryDays ?? "7");
      setWarnEscalation(cfg.warnEscalation ?? { steps: [] });
      setMuteConfig({
        mode: (cfg.muteConfig?.mode ?? "timeout") as "timeout" | "role",
        muteRoleId: cfg.muteConfig?.muteRoleId ?? "",
        stripRoles: cfg.muteConfig?.stripRoles ?? false,
      });
      const snap = {
        modRoles: cfg.modRoles ?? [],
        protectedRoles: cfg.protectedRoles ?? [],
        lockdownChannels: cfg.lockdownChannels ?? [],
        logChannelId: cfg.logChannelId ?? "",
        warnExpiryDays: cfg.warnExpiryDays ?? "30",
        automodWarnExpiryDays: cfg.automodWarnExpiryDays ?? "7",
        warnEscalation: cfg.warnEscalation ?? { steps: [] },
        muteConfig: { mode: cfg.muteConfig?.mode ?? "timeout", muteRoleId: cfg.muteConfig?.muteRoleId ?? "", stripRoles: cfg.muteConfig?.stripRoles ?? false },
      };
      saved.current = JSON.parse(JSON.stringify(snap));
    }).catch(console.error).finally(() => setLoading(false));
  }, [guildId]);

  // Poll every 10s so bot-command changes show up without a manual page refresh.
  // Only overwrite a field if the user hasn't locally edited it yet.
  useEffect(() => {
    if (!guildId) return;
    const interval = setInterval(async () => {
      try {
        const cfg = await api.guild.moderationConfig(guildId);
        const remoteWarn = cfg.warnExpiryDays ?? "30";
        const remoteAutomod = cfg.automodWarnExpiryDays ?? "7";
        if (remoteWarn !== saved.current.warnExpiryDays) {
          setWarnExpiryDays(remoteWarn);
          saved.current.warnExpiryDays = remoteWarn;
        }
        if (remoteAutomod !== saved.current.automodWarnExpiryDays) {
          setAutomodWarnExpiryDays(remoteAutomod);
          saved.current.automodWarnExpiryDays = remoteAutomod;
        }
      } catch {
        // silent — background poll, don't show errors
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [guildId]);

  const warnError = Number(warnExpiryDays) > 90;
  const automodWarnError = Number(automodWarnExpiryDays) > 30;

  const addStep = () => {
    if (warnEscalation.steps.length >= STEP_CAP) return show(`Maximum ${STEP_CAP} escalation steps allowed.`, "error");
    const steps = [...warnEscalation.steps];
    const lastStrikes = steps.length > 0 ? steps[steps.length - 1].strikes : 2;
    steps.push({ strikes: lastStrikes + 1, action: "mute" });
    setWarnEscalation({ steps });
  };

  const removeStep = (i: number) => {
    const steps = [...warnEscalation.steps];
    steps.splice(i, 1);
    setWarnEscalation({ steps });
  };

  const updateStep = (i: number, patch: any) => {
    const steps = [...warnEscalation.steps];
    steps[i] = { ...steps[i], ...patch };
    setWarnEscalation({ steps });
  };

  const discard = () => {
    const s = saved.current;
    setModRoles([...s.modRoles]);
    setProtectedRoles([...s.protectedRoles]);
    setLockdownChannels([...s.lockdownChannels]);
    setLogChannelId(s.logChannelId);
    setWarnExpiryDays(s.warnExpiryDays);
    setAutomodWarnExpiryDays(s.automodWarnExpiryDays);
    setWarnEscalation(JSON.parse(JSON.stringify(s.warnEscalation)));
    setMuteConfig({ ...s.muteConfig });
  };

  const save = async () => {
    if (!guildId) return;
    if (warnError) return show("Warning expiry cannot exceed 90 days.", "error");
    if (automodWarnError) return show("AutoMod warning expiry cannot exceed 30 days.", "error");
    setSaving(true);
    try {
      const warnDays = Math.max(0, Number(warnExpiryDays) || 0);
      const automodDays = Math.max(0, Number(automodWarnExpiryDays) || 0);
      await api.guild.updateModerationConfig(guildId, {
        modRoles, protectedRoles, lockdownChannels, logChannelId,
        warnExpiryDays: String(warnDays),
        automodWarnExpiryDays: String(automodDays),
        warnEscalation,
        muteConfig: { ...muteConfig, muteRoleId: muteConfig.muteRoleId || null },
      });
      saved.current = JSON.parse(JSON.stringify({
        modRoles, protectedRoles, lockdownChannels, logChannelId,
        warnExpiryDays: String(warnDays),
        automodWarnExpiryDays: String(automodDays),
        warnEscalation, muteConfig,
      }));
      show("Moderation settings saved!", "success");
    } catch (e: any) {
      show(e.message ?? "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: "32px 32px 96px", maxWidth: 800 }}>
      {ToastEl}
      <PageHeader title="Moderation Config" subtitle="Roles, channels, escalation and mute configuration" />

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Staff Roles */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <Users size={15} color="var(--accent)" />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Staff Roles</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <ChipSelector
              label="Moderator Roles"
              hint="Members with these roles can use moderation commands. Also configurable with >modrole."
              items={roles} selected={modRoles}
              onAdd={(id) => setModRoles((p) => [...p, id])}
              onRemove={(id) => setModRoles((p) => p.filter((r) => r !== id))}
              getName={(r) => r.name} getId={(r) => r.id} prefix="@"
            />
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }}>
              <ChipSelector
                label="Protected Roles"
                hint={<>Members with these roles cannot be warned, muted, kicked, or banned. Also configurable with <code style={{ color: "var(--accent)" }}>&gt;protectedrole</code>.</> as any}
                items={roles} selected={protectedRoles}
                onAdd={(id) => setProtectedRoles((p) => [...p, id])}
                onRemove={(id) => setProtectedRoles((p) => p.filter((r) => r !== id))}
                getName={(r) => r.name} getId={(r) => r.id} prefix="@"
              />
            </div>
          </div>
        </Card>

        {/* Lockdown Channels */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Lock size={15} color="var(--accent)" />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Lockdown Channels</h2>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
            Channels locked when <code style={{ color: "var(--accent)" }}>&gt;lockdown</code> is used. Add or remove channels here or with <code style={{ color: "var(--accent)" }}>&gt;lockdown add/remove #channel</code>.
          </p>
          <ChipSelector
            label="Channels"
            items={lockdownChannelList} selected={lockdownChannels}
            onAdd={(id) => setLockdownChannels((p) => [...p, id])}
            onRemove={(id) => setLockdownChannels((p) => p.filter((c) => c !== id))}
            getName={(c) => `${c.type === 2 || c.type === 13 ? "🔊 " : "# "}${c.name}`}
            getId={(c) => c.id}
          />
        </Card>

        {/* Mod Log */}
        <Card>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>📋 Moderation Log</h2>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>Where bans, kicks, mutes, warns, and other mod actions are posted.</p>
          <Select label="Mod Log Channel" value={logChannelId} onChange={setLogChannelId}>
            <option value="">— Disabled —</option>
            {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </Select>
        </Card>

        {/* Warning Expiry */}
        <Card>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>⏱ Manual Warning Expiry</h2>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
            How long manually-issued warnings count toward escalation. Enter <strong>0</strong> for warnings that never expire. Also configurable with <code style={{ color: "var(--accent)" }}>&gt;setexpiredate</code>.
          </p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Input
                label="Warnings expire after (days)"
                type="number" value={warnExpiryDays}
                onChange={(v) => setWarnExpiryDays(v.replace(/[^0-9]/g, ""))}
                placeholder="e.g. 30"
                hint="Enter 0 for permanent (never expire). Maximum: 90 days."
              />
            </div>
            {warnExpiryDays !== "" && (
              <div style={{ paddingBottom: 22, fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                {warnExpiryDays === "0" ? "Never expires" : `= ${warnExpiryDays} day${warnExpiryDays === "1" ? "" : "s"}`}
              </div>
            )}
          </div>
          {warnError && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--danger-dim)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 7, fontSize: 12, color: "var(--danger)" }}>
              ❌ Maximum is 90 days (3 months).
            </div>
          )}
          {warnExpiryDays === "0" && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(240,165,0,0.08)", border: "1px solid rgba(240,165,0,0.25)", borderRadius: 7, fontSize: 12, color: "var(--accent)" }}>
              ⚠️ Warnings will never expire — punishment thresholds escalate indefinitely.
            </div>
          )}
        </Card>

        {/* AutoMod Warning Expiry */}
        <Card>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>🤖 AutoMod Warning Expiry</h2>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
            How long AutoMod-issued warnings count toward escalation. Enter <strong>0</strong> for warnings that never expire. Also configurable with <code style={{ color: "var(--accent)" }}>&gt;setautomodwarnexpiry</code>.
          </p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Input
                label="AutoMod warnings expire after (days)"
                type="number" value={automodWarnExpiryDays}
                onChange={(v) => setAutomodWarnExpiryDays(v.replace(/[^0-9]/g, ""))}
                placeholder="e.g. 7"
                hint="Enter 0 for permanent (never expire). Maximum: 30 days."
              />
            </div>
            {automodWarnExpiryDays !== "" && (
              <div style={{ paddingBottom: 22, fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                {automodWarnExpiryDays === "0" ? "Never expires" : `= ${automodWarnExpiryDays} day${automodWarnExpiryDays === "1" ? "" : "s"}`}
              </div>
            )}
          </div>
          {automodWarnError && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--danger-dim)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 7, fontSize: 12, color: "var(--danger)" }}>
              ❌ Maximum is 30 days (1 month).
            </div>
          )}
          {automodWarnExpiryDays === "0" && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(240,165,0,0.08)", border: "1px solid rgba(240,165,0,0.25)", borderRadius: 7, fontSize: 12, color: "var(--accent)" }}>
              ⚠️ AutoMod warnings will never expire — thresholds escalate indefinitely.
            </div>
          )}
        </Card>

        {/* Manual Warn Escalation */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>⚠️ Manual Warn Escalation</h2>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                Automatically punish a member when they reach a warning threshold. Max {STEP_CAP} steps.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: warnEscalation.steps.length >= STEP_CAP ? "var(--danger)" : "var(--text-muted)" }}>
                {warnEscalation.steps.length}/{STEP_CAP}
              </span>
              <Button size="sm" onClick={addStep} disabled={warnEscalation.steps.length >= STEP_CAP}>
                <Plus size={13} /> Add Step
              </Button>
            </div>
          </div>
          {warnEscalation.steps.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "20px 0", borderTop: "1px solid var(--border)", marginTop: 12 }}>
              No escalation steps. Warnings are only logged until you add steps here.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12, borderTop: "1px solid var(--border)", marginTop: 12 }}>
              {warnEscalation.steps.map((step: any, i: number) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ flex: 0, fontSize: 12, fontWeight: 700, color: "var(--text-muted)", minWidth: 20 }}>#{i + 1}</div>
                  <input type="number" value={step.strikes} min={1}
                    onChange={(e) => updateStep(i, { strikes: Number(e.target.value) })}
                    style={{ width: 60, padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, outline: "none", textAlign: "center" }} />
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>warns →</span>
                  <select value={step.action}
                    onChange={(e) => updateStep(i, { action: e.target.value })}
                    style={{ padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, outline: "none", cursor: "pointer", flex: 1 }}>
                    {["mute", "kick", "ban"].map((a) => <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
                  </select>
                  {(step.action === "mute") && (
                    <input value={step.duration ?? ""}
                      onChange={(e) => updateStep(i, { duration: e.target.value })}
                      placeholder="e.g. 1h, 7d"
                      style={{ width: 90, padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, outline: "none" }} />
                  )}
                  <button onClick={() => removeStep(i)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Mute Config */}
        <Card>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>🔇 Mute Configuration</h2>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 20 }}>Configure how the bot applies mutes — Discord timeout or a custom mute role.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Select label="Mute Mode" value={muteConfig.mode} onChange={(v) => {
              const next = v as "timeout" | "role";
              if (next === "timeout" && muteConfig.mode === "role") {
                const permMutes = shortcuts.filter((s: any) => s.type === "mute" && !s.duration);
                if (permMutes.length > 0) {
                  const names = permMutes.map((s: any) => `"${s.name}"`).join(", ");
                  show(`Can't switch to Timeout mode — permanent mute shortcuts exist: ${names}. Edit or delete them first in Shortcuts.`, "error");
                  return;
                }
              }
              setMuteConfig((c) => ({ ...c, mode: next }));
            }}>
              <option value="timeout">⏱️ Discord Timeout (recommended, no role needed)</option>
              <option value="role">🎭 Mute Role (assign a role to mute members)</option>
            </Select>
            {muteConfig.mode === "role" && (
              <>
                <Select label="Mute Role" value={muteConfig.muteRoleId ?? ""} onChange={(v) => setMuteConfig((c) => ({ ...c, muteRoleId: v }))}>
                  <option value="">— Select a role —</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}
                </Select>
                <div style={{ padding: "10px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-muted)" }}>
                  💡 To create a Muted role with correct channel overrides automatically, use <code style={{ color: "var(--accent)" }}>&gt;muteconfig role create</code> in Discord.
                </div>
              </>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderTop: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Strip Roles on Mute</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>Remove all roles from a muted member and restore on unmute. Only applies in Mute Role mode.</div>
              </div>
              <Toggle checked={muteConfig.stripRoles} onChange={(v) => setMuteConfig((c) => ({ ...c, stripRoles: v }))} label="" />
            </div>
          </div>
        </Card>

      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={discard} />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, Input, Select, Toggle, PageHeader, Spinner, useToast, SaveBar, Badge, Button } from "../../components/ui";
import { Users, Shield, Plus, Zap, Bot, AlertTriangle, Filter, Eye } from "lucide-react";

const ACTION_LEVEL_INFO: Record<number, { label: string; color: string; desc: string }> = {
  1: { label: "Level 1 — Alert Only",       color: "#3b82f6", desc: "Log the raid and DM the server owner. No users are punished automatically." },
  2: { label: "Level 2 — Timeout Raiders",  color: "#f59e0b", desc: "Timeout all raid joiners for 1 hour." },
  3: { label: "Level 3 — Kick Raiders",     color: "#f97316", desc: "Kick all users who joined during the raid window." },
  4: { label: "Level 4 — Ban + Lockdown",   color: "#ef4444", desc: "Ban all raid joiners and lock all configured channels." },
};

const DEFAULTS = {
  enabled: false,
  joinThreshold: 10,
  joinWindowMs: 10000,
  joinScope: "all" as "all" | "suspicious",
  actionLevel: 3,
  action: "kick",
  lockdown: false,
  newAccountEnabled: false,
  newAccountAgeDays: 7,
  newAccountAction: "flag",
  noAvatarEnabled: false,
  noAvatarAction: "flag",
  defaultUsernameEnabled: false,
  defaultUsernameAction: "flag",
  usernameFilterEnabled: false,
  usernameFilterPatterns: [] as string[],
  usernameFilterAction: "flag",
  suspiciousEnabled: false,
  suspiciousThreshold: 2,
  suspiciousAction: "kick",
  botGuardEnabled: false,
  botGuardRemoveBot: true,
  botGuardPunishAdder: true,
  botGuardAdderAction: "kick",
  botGuardAllowedBots: [] as string[],
  whitelist: [] as string[],
  whitelistRoles: [] as string[],
  logChannel: "",
  alertChannelId: "",
};

const ACTION_OPTIONS = (
  <>
    <option value="flag">Flag only (log alert)</option>
    <option value="timeout">Timeout for 1 hour</option>
    <option value="kick">Kick from server</option>
    <option value="ban">Ban from server</option>
  </>
);

export default function AntiRaid() {
  const { guildId } = useParams<{ guildId: string }>();
  const [config, setConfig] = useState<any>(DEFAULTS);
  const [channels, setChannels] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const [newUserId, setNewUserId] = useState("");
  const [newRoleId, setNewRoleId] = useState("");
  const [newPattern, setNewPattern] = useState("");
  const [newAllowedBot, setNewAllowedBot] = useState("");
  const { show, ToastEl } = useToast();
  const savedConfig = useRef<any>(DEFAULTS);

  const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig.current);

  useEffect(() => {
    if (!guildId) return;
    Promise.all([
      api.guild.antiraid(guildId),
      api.guild.channels(guildId),
      api.guild.roles(guildId),
      api.guild.securityAccess(guildId),
    ]).then(([cfg, chs, rs, access]) => {
      const built = {
        ...DEFAULTS, ...cfg,
        whitelist: cfg.whitelist ?? [],
        whitelistRoles: cfg.whitelistRoles ?? [],
        usernameFilterPatterns: cfg.usernameFilterPatterns ?? [],
        botGuardAllowedBots: cfg.botGuardAllowedBots ?? [],
      };
      setConfig(built);
      savedConfig.current = JSON.parse(JSON.stringify(built));
      setChannels(chs);
      setRoles(rs ?? []);
      setCanEdit(access.canEditAntiraid);
    }).catch(console.error).finally(() => setLoading(false));
  }, [guildId]);

  const set = (key: string, value: any) => setConfig((c: any) => ({ ...c, [key]: value }));
  const discard = () => setConfig(JSON.parse(JSON.stringify(savedConfig.current)));

  const addUser = () => {
    const id = newUserId.trim();
    if (!id || !/^\d{17,20}$/.test(id)) return show("Enter a valid Discord user ID", "error");
    if (config.whitelist.includes(id)) return show("Already whitelisted", "error");
    set("whitelist", [...config.whitelist, id]);
    setNewUserId("");
  };
  const addRole = () => {
    const id = newRoleId.trim();
    if (!id || !/^\d{17,20}$/.test(id)) return show("Enter a valid Discord role ID", "error");
    if (config.whitelistRoles.includes(id)) return show("Already whitelisted", "error");
    set("whitelistRoles", [...config.whitelistRoles, id]);
    setNewRoleId("");
  };
  const addPattern = () => {
    const p = newPattern.trim();
    if (!p) return show("Enter a pattern", "error");
    if (config.usernameFilterPatterns.includes(p)) return show("Pattern already exists", "error");
    set("usernameFilterPatterns", [...config.usernameFilterPatterns, p]);
    setNewPattern("");
  };
  const addAllowedBot = () => {
    const id = newAllowedBot.trim();
    if (!id || !/^\d{17,20}$/.test(id)) return show("Enter a valid bot user ID", "error");
    if (config.botGuardAllowedBots.includes(id)) return show("Already in list", "error");
    set("botGuardAllowedBots", [...config.botGuardAllowedBots, id]);
    setNewAllowedBot("");
  };

  const save = async () => {
    if (!guildId) return;
    setSaving(true);
    try {
      await api.guild.updateAntiraid(guildId, config);
      savedConfig.current = JSON.parse(JSON.stringify(config));
      show("Anti-Raid settings saved!", "success");
    } catch (e: any) { show(e.message ?? "Failed", "error"); }
    finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  const levelInfo = ACTION_LEVEL_INFO[config.actionLevel] ?? ACTION_LEVEL_INFO[3];

  return (
    <div style={{ padding: "32px 32px 96px", maxWidth: 860 }}>
      {ToastEl}
      <PageHeader title="Anti-Raid" subtitle="Multi-layer raid detection with action levels, account screening, and bot guard" />

      {!canEdit && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 18px", marginBottom: 16,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 10, fontSize: 13, color: "var(--text-secondary)",
        }}>
          <span style={{ fontSize: 18 }}>🔒</span>
          <div>
            <span style={{ fontWeight: 700, color: "#ef4444" }}>View only — </span>
            Anti-Raid settings can only be changed by the server owner or users they have whitelisted.
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16, ...(canEdit ? {} : { pointerEvents: "none", opacity: 0.6 }) }}>

        {/* ── Enable ─────────────────────────────────────────────────────── */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <Users size={16} color="var(--accent)" /> Anti-Raid Protection
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                Detects mass-join raids and individual suspicious accounts (new accounts, no avatar, username patterns, bot additions).
              </div>
            </div>
            <Toggle checked={config.enabled} onChange={v => set("enabled", v)} label="" />
          </div>
        </Card>

        {/* ── Action Level ───────────────────────────────────────────────── */}
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={14} color="var(--accent)" /> Action Level
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
            {[1, 2, 3, 4].map((lvl) => {
              const info = ACTION_LEVEL_INFO[lvl];
              const active = config.actionLevel === lvl;
              return (
                <button key={lvl} onClick={() => set("actionLevel", lvl)} style={{
                  padding: "10px 8px", borderRadius: 8, border: `2px solid ${active ? info.color : "var(--border)"}`,
                  background: active ? `${info.color}22` : "var(--bg-input)",
                  color: active ? info.color : "var(--text-secondary)", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 12, fontWeight: active ? 700 : 500, textAlign: "center",
                }}>
                  Level {lvl}
                </button>
              );
            })}
          </div>
          <div style={{ padding: "12px 16px", background: `${levelInfo.color}15`, border: `1px solid ${levelInfo.color}40`, borderRadius: 8, fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: levelInfo.color, marginBottom: 4 }}>{levelInfo.label}</div>
            <div style={{ color: "var(--text-secondary)" }}>{levelInfo.desc}</div>
          </div>
          {config.actionLevel === 4 && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Auto-Lockdown Channels</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Uses the channels from your Lockdown config. Set them with <code style={{ fontSize: 11 }}>&gt;lockdown add #channel</code>.</div>
              </div>
              <Toggle checked={config.lockdown} onChange={v => set("lockdown", v)} label="" />
            </div>
          )}
        </Card>

        {/* ── Mass-Join Detection ───────────────────────────────────────── */}
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>Mass-Join Detection</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>Join Threshold</label>
              <select value={config.joinThreshold} onChange={e => set("joinThreshold", Number(e.target.value))}
                style={{ width: "100%", padding: "10px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none", cursor: "pointer" }}>
                {[5, 8, 10, 15, 20, 25, 30, 40, 50].map(n => <option key={n} value={n}>{n} joins</option>)}
              </select>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>Number of joins to declare a raid.</div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>Detection Window</label>
              <select value={config.joinWindowMs} onChange={e => set("joinWindowMs", Number(e.target.value))}
                style={{ width: "100%", padding: "10px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none", cursor: "pointer" }}>
                <option value={5000}>5 seconds</option>
                <option value={10000}>10 seconds</option>
                <option value={15000}>15 seconds</option>
                <option value={30000}>30 seconds</option>
                <option value={60000}>1 minute</option>
              </select>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>Time window to count joins in.</div>
            </div>
          </div>

          {/* Join Scope */}
          <div style={{ marginTop: 16, padding: "14px 16px", background: "var(--bg-input)", borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Join Scope</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 12 }}>
              Controls which joins count toward the raid threshold.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(["all", "suspicious"] as const).map(v => {
                const active = config.joinScope === v;
                return (
                  <button key={v} onClick={() => set("joinScope", v)} style={{
                    padding: "10px 12px", borderRadius: 8, border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    background: active ? "rgba(88,101,242,0.12)" : "var(--bg-card)",
                    color: active ? "var(--accent)" : "var(--text-secondary)", cursor: "pointer",
                    fontFamily: "inherit", fontSize: 12, fontWeight: active ? 700 : 500, textAlign: "left",
                  }}>
                    <div style={{ fontWeight: 700 }}>{v === "all" ? "All Joins" : "Suspicious Only"}</div>
                    <div style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>
                      {v === "all" ? "Every join counts toward the threshold." : "Only flagged accounts count toward the threshold."}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(88,101,242,0.06)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)" }}>
            ⚡ Raid triggers when <strong>{config.joinThreshold} {config.joinScope === "suspicious" ? "suspicious " : ""}join{config.joinThreshold !== 1 ? "s" : ""}</strong> happen within <strong>{config.joinWindowMs / 1000}s</strong>.
          </div>
        </Card>

        {/* ── New Account Detection ─────────────────────────────────────── */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: config.newAccountEnabled ? 16 : 0 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <Shield size={14} color="var(--accent)" /> New Account Detection
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                Flag, timeout, kick, or ban accounts that were created too recently.
              </div>
            </div>
            <Toggle checked={config.newAccountEnabled} onChange={v => set("newAccountEnabled", v)} label="" />
          </div>
          {config.newAccountEnabled && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 4 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>Minimum Account Age</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={config.newAccountAgeDays}
                    onChange={e => {
                      const v = Math.min(100, Math.max(1, Number(e.target.value) || 1));
                      set("newAccountAgeDays", v);
                    }}
                    style={{ width: "100%", padding: "10px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none" }}
                  />
                  <span style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>day{config.newAccountAgeDays !== 1 ? "s" : ""}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>1–100 days. Accounts younger than this are flagged.</div>
              </div>
              <Select label="Action on new account" value={config.newAccountAction} onChange={v => set("newAccountAction", v)}>
                {ACTION_OPTIONS}
              </Select>
            </div>
          )}
        </Card>

        {/* ── No-Avatar & Default Username ──────────────────────────────── */}
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <Eye size={14} color="var(--accent)" /> Avatar & Username Filters
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
            Target accounts with missing avatars or auto-generated/default usernames — common in bot accounts used for raids.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* No Avatar */}
            <div style={{ padding: "14px 16px", background: "var(--bg-input)", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: config.noAvatarEnabled ? 12 : 0 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>No Avatar Filter</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                    Action members who join without a profile picture.
                  </div>
                </div>
                <Toggle checked={config.noAvatarEnabled} onChange={v => set("noAvatarEnabled", v)} label="" />
              </div>
              {config.noAvatarEnabled && (
                <Select label="Action" value={config.noAvatarAction} onChange={v => set("noAvatarAction", v)}>
                  {ACTION_OPTIONS}
                </Select>
              )}
            </div>

            {/* Default Username */}
            <div style={{ padding: "14px 16px", background: "var(--bg-input)", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: config.defaultUsernameEnabled ? 12 : 0 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Default Username Filter</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                    Catches Discord auto-generated usernames like <code style={{ fontSize: 11 }}>user123456789</code>.
                  </div>
                </div>
                <Toggle checked={config.defaultUsernameEnabled} onChange={v => set("defaultUsernameEnabled", v)} label="" />
              </div>
              {config.defaultUsernameEnabled && (
                <Select label="Action" value={config.defaultUsernameAction} onChange={v => set("defaultUsernameAction", v)}>
                  {ACTION_OPTIONS}
                </Select>
              )}
            </div>
          </div>
        </Card>

        {/* ── Custom Username Filter ────────────────────────────────────── */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <Filter size={14} color="var(--accent)" /> Custom Username Filter
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                Block accounts whose usernames match any of your patterns. Supports plain text and regex.
              </div>
            </div>
            <Toggle checked={config.usernameFilterEnabled} onChange={v => set("usernameFilterEnabled", v)} label="" />
          </div>

          {config.usernameFilterEnabled && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <Select label="Action on match" value={config.usernameFilterAction} onChange={v => set("usernameFilterAction", v)}>
                {ACTION_OPTIONS}
              </Select>

              {config.usernameFilterPatterns.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {config.usernameFilterPatterns.map((p: string) => (
                    <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}>
                      <code style={{ color: "var(--accent)" }}>{p}</code>
                      <button onClick={() => set("usernameFilterPatterns", config.usernameFilterPatterns.filter((x: string) => x !== p))}
                        style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                    </span>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <input value={newPattern} onChange={e => setNewPattern(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addPattern()}
                  placeholder="e.g.  raider  or  ^bot\d+$"
                  style={{ flex: 1, padding: "9px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none", fontFamily: "monospace" }} />
                <Button size="sm" onClick={addPattern}><Plus size={13} /> Add</Button>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Plain text = substring match. Wrap in <code style={{ fontSize: 11 }}>^ $</code> for regex anchors. Case-insensitive.
              </div>
            </div>
          )}
        </Card>

        {/* ── Suspicious Account Detection ──────────────────────────────── */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: config.suspiciousEnabled ? 16 : 4 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={14} color="#f59e0b" /> Suspicious Account Detection
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                Triggers when an account accumulates enough suspicious signals at once.
              </div>
            </div>
            <Toggle checked={config.suspiciousEnabled} onChange={v => set("suspiciousEnabled", v)} label="" />
          </div>

          {config.suspiciousEnabled && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
                  Signals Required to Trigger
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {[1, 2, 3, 4].map(n => {
                    const active = config.suspiciousThreshold === n;
                    return (
                      <button key={n} onClick={() => set("suspiciousThreshold", n)} style={{
                        padding: "10px 8px", borderRadius: 8, border: `2px solid ${active ? "#f59e0b" : "var(--border)"}`,
                        background: active ? "rgba(245,158,11,0.12)" : "var(--bg-input)",
                        color: active ? "#f59e0b" : "var(--text-secondary)", cursor: "pointer",
                        fontFamily: "inherit", fontSize: 13, fontWeight: active ? 700 : 500, textAlign: "center",
                      }}>
                        {n} signal{n !== 1 ? "s" : ""}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                  Signals: new account • no avatar • default username • username matches filter
                </div>
              </div>

              <Select label="Action on suspicious account" value={config.suspiciousAction} onChange={v => set("suspiciousAction", v)}>
                {ACTION_OPTIONS}
              </Select>
            </div>
          )}
        </Card>

        {/* ── Bot Guard ─────────────────────────────────────────────────── */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: config.botGuardEnabled ? 16 : 4 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <Bot size={14} color="var(--accent)" /> Bot Guard
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                Only whitelisted users may add bots to the server. Unauthorized bot additions are flagged and actioned instantly.
              </div>
            </div>
            <Toggle checked={config.botGuardEnabled} onChange={v => set("botGuardEnabled", v)} label="" />
          </div>

          {config.botGuardEnabled && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { key: "botGuardRemoveBot", label: "Kick unauthorized bot", desc: "Automatically removes the bot that was added without authorization." },
                  { key: "botGuardPunishAdder", label: "Punish the user who added the bot", desc: "Takes action against the server member who added the unauthorized bot." },
                ].map(({ key, label, desc }) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "var(--bg-input)", borderRadius: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{desc}</div>
                    </div>
                    <Toggle checked={!!config[key]} onChange={v => set(key, v)} label="" />
                  </div>
                ))}
              </div>

              {config.botGuardPunishAdder && (
                <Select label="Action on unauthorized bot adder" value={config.botGuardAdderAction} onChange={v => set("botGuardAdderAction", v)}>
                  <option value="flag">Flag only (log alert)</option>
                  <option value="kick">Kick from server</option>
                  <option value="ban">Ban from server</option>
                  <option value="strip">Strip all roles</option>
                </Select>
              )}

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  Always-Allowed Bot IDs
                  {config.botGuardAllowedBots.length > 0 && <Badge color="muted" style={{ marginLeft: 8 }}>{config.botGuardAllowedBots.length}</Badge>}
                </div>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
                  These specific bots can be added by anyone, bypassing the guard. Add any bots you always want to allow.
                </p>
                {config.botGuardAllowedBots.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {config.botGuardAllowedBots.map((id: string) => (
                      <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}>
                        <code style={{ color: "var(--accent)" }}>{id}</code>
                        <button onClick={() => set("botGuardAllowedBots", config.botGuardAllowedBots.filter((x: string) => x !== id))}
                          style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={newAllowedBot} onChange={e => setNewAllowedBot(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addAllowedBot()}
                    placeholder="Bot user ID (17-20 digits)"
                    style={{ flex: 1, padding: "9px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none" }} />
                  <Button size="sm" onClick={addAllowedBot}><Plus size={13} /> Add</Button>
                </div>
              </div>

              <div style={{ padding: "10px 14px", background: "rgba(88,101,242,0.06)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                💡 To allow specific users to add bots, add them to the <strong>Whitelist</strong> below.
              </div>
            </div>
          )}
        </Card>

        {/* ── Whitelist ─────────────────────────────────────────────────── */}
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            Whitelist
            {(config.whitelist.length + config.whitelistRoles.length) > 0 && (
              <Badge color="muted" style={{ marginLeft: 8 }}>{config.whitelist.length + config.whitelistRoles.length}</Badge>
            )}
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>
            Whitelisted users and roles are exempt from all Anti-Raid checks. Whitelisted users can also add bots when Bot Guard is enabled.
          </p>
          {config.whitelist.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {config.whitelist.map((id: string) => (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}>
                  <code style={{ color: "var(--accent)" }}>{id}</code>
                  <button onClick={() => set("whitelist", config.whitelist.filter((w: string) => w !== id))} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input value={newUserId} onChange={e => setNewUserId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addUser()}
              placeholder="User ID (17-20 digits)"
              style={{ flex: 1, padding: "9px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none" }} />
            <Button size="sm" onClick={addUser}><Plus size={13} /> User</Button>
          </div>
          {config.whitelistRoles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {config.whitelistRoles.map((id: string) => (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}>
                  <code style={{ color: "#a78bfa" }}>{id}</code>
                  <button onClick={() => set("whitelistRoles", config.whitelistRoles.filter((w: string) => w !== id))} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={newRoleId} onChange={e => setNewRoleId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addRole()}
              placeholder="Role ID (17-20 digits)"
              style={{ flex: 1, padding: "9px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none" }} />
            <Button size="sm" onClick={addRole}><Plus size={13} /> Role</Button>
          </div>
        </Card>

        {/* ── Channels ─────────────────────────────────────────────────── */}
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>Channels</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <Select label="Log Channel" value={config.logChannel ?? ""} onChange={v => set("logChannel", v)}>
                <option value="">— None (mod log fallback) —</option>
                {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </Select>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>Full raid event logs.</div>
            </div>
            <div>
              <Select label="Alert Channel" value={config.alertChannelId ?? ""} onChange={v => set("alertChannelId", v)}>
                <option value="">— Same as log channel —</option>
                {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </Select>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>Individual join flagging alerts (if separate).</div>
            </div>
          </div>
        </Card>

      </div>
      {canEdit && <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={discard} />}
    </div>
  );
}

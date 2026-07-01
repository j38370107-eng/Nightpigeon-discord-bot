import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, Button, Input, Select, Toggle, PageHeader, Spinner, useToast, Badge, SaveBar } from "../../components/ui";
import { ShieldAlert, Plus, Eye, RotateCcw, ShieldCheck } from "lucide-react";

const THRESHOLD_KEYS = [
  { key: "channelDelete",  label: "Channel Deletions" },
  { key: "channelCreate",  label: "Channel Creations" },
  { key: "roleDelete",     label: "Role Deletions" },
  { key: "roleCreate",     label: "Role Creations" },
  { key: "ban",            label: "Mass Bans" },
  { key: "kick",           label: "Mass Kicks" },
  { key: "webhookCreate",  label: "Webhook Creations" },
  { key: "webhookDelete",  label: "Webhook Deletions" },
  { key: "massTimeout",    label: "Mass Timeouts" },
  { key: "channelRename",  label: "Channel Renames" },
  { key: "roleRename",     label: "Role Renames" },
] as const;

const DEFAULTS = {
  enabled: false,
  action: "ban",
  thresholds: {
    channelDelete: 3, channelCreate: 5,
    roleDelete: 3,    roleCreate: 5,
    ban: 3,           kick: 5,
    webhookCreate: 3, webhookDelete: 3,
    massTimeout: 5,   channelRename: 3,
    roleRename: 3,
  },
  windowMs: 10000,
  whitelist: [] as string[],
  whitelistRoles: [] as string[],
  logChannel: "",
  dmOwner: true,
  watchRolePerms: true,
  watchServerUpdate: true,
  watchEveryonePerms: true,
  revertRolePerms: false,
  punishRolePerms: false,
  restoreEnabled: false,
  antiPruneEnabled: false,
  antiVanityEnabled: false,
  antiServerRenameEnabled: false,
  antiServerIconEnabled: false,
  antiRoleRenameEnabled: false,
  antiChannelRenameEnabled: false,
  revertServerRename: true,
  revertRoleRename: true,
  revertChannelRename: true,
};

export default function AntiNuke() {
  const { guildId } = useParams<{ guildId: string }>();
  const [config, setConfig] = useState<any>(DEFAULTS);
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const [newUserId, setNewUserId] = useState("");
  const [newRoleId, setNewRoleId] = useState("");
  const { show, ToastEl } = useToast();

  const savedState = useRef<any>(null);
  const dirty = savedState.current !== null && JSON.stringify(config) !== JSON.stringify(savedState.current);

  const load = async () => {
    if (!guildId) return;
    const [c, chs] = await Promise.all([
      api.guild.antinuke(guildId).catch(() => null),
      api.guild.channels(guildId).catch(() => []),
    ]);
    setChannels(chs);
    if (c) {
      const merged = { ...DEFAULTS, ...c, thresholds: { ...DEFAULTS.thresholds, ...(c.thresholds ?? {}) } };
      setConfig(merged);
      savedState.current = JSON.parse(JSON.stringify(merged));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [guildId]);

  const set = (key: string, val: any) => setConfig((prev: any) => ({ ...prev, [key]: val }));
  const setThreshold = (key: string, val: number) =>
    setConfig((prev: any) => ({ ...prev, thresholds: { ...prev.thresholds, [key]: val } }));

  const addWhitelist = () => {
    const id = newUserId.trim();
    if (!id || config.whitelist.includes(id)) return;
    set("whitelist", [...config.whitelist, id]);
    setNewUserId("");
  };
  const removeWhitelist = (id: string) => set("whitelist", config.whitelist.filter((x: string) => x !== id));

  const addWhitelistRole = () => {
    const id = newRoleId.trim();
    if (!id || config.whitelistRoles.includes(id)) return;
    set("whitelistRoles", [...config.whitelistRoles, id]);
    setNewRoleId("");
  };
  const removeWhitelistRole = (id: string) => set("whitelistRoles", config.whitelistRoles.filter((x: string) => x !== id));

  const save = async () => {
    if (!guildId) return;
    setSaving(true);
    try {
      await api.guild.updateAntinuke(guildId, config);
      savedState.current = JSON.parse(JSON.stringify(config));
      show("Anti-Nuke settings saved!", "success");
    } catch (e: any) { show(e.message ?? "Failed to save", "error"); }
    finally { setSaving(false); }
  };

  const discard = () => {
    if (savedState.current) {
      setConfig(JSON.parse(JSON.stringify(savedState.current)));
    }
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 0 80px" }}>
      {ToastEl}
      <PageHeader
        icon={<ShieldAlert size={20} color="var(--danger)" />}
        title="Anti-Nuke"
        subtitle="Protect your server from mass-destruction attacks"
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Master Enable ─────────────────────────────────────────────── */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Anti-Nuke Protection</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                Detects and stops mass destruction events. Enable to activate all protections below.
              </div>
            </div>
            <Toggle checked={!!config.enabled} onChange={v => set("enabled", v)} label="" />
          </div>
        </Card>

        {/* ── Action & Window ───────────────────────────────────────────── */}
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Punishment</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Select label="Action" value={config.action} onChange={v => set("action", v)}>
              <option value="ban">Ban</option>
              <option value="kick">Kick</option>
              <option value="strip">Strip Roles</option>
            </Select>
            <Input label="Detection Window (ms)" type="number"
              value={config.windowMs?.toString() ?? "10000"}
              onChange={v => set("windowMs", Math.max(1000, parseInt(v) || 10000))} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
            The action is applied when a non-whitelisted user hits the threshold within the detection window.
          </div>
        </Card>

        {/* ── Behaviour Toggles ─────────────────────────────────────────── */}
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Behaviour & Alerts</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { key: "dmOwner",           label: "DM Server Owner on trigger",              desc: "Sends a direct message to the server owner whenever the anti-nuke fires." },
              { key: "watchRolePerms",    label: "Alert on dangerous role permission grants", desc: "Fires an alert when Admin, Ban Members, Manage Channels, or similar perms are added to any role by a non-whitelisted user." },
              { key: "watchServerUpdate", label: "Alert on server security downgrades",      desc: "Detects if someone lowers the verification level or removes the 2FA requirement." },
              { key: "restoreEnabled",    label: "Cache deleted channels/roles for recovery", desc: "Stores deleted channel and role data for 30 min so they can be restored via >antinuke recover." },
            ].map(({ key, label, desc }) => (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{desc}</div>
                </div>
                <Toggle checked={!!config[key]} onChange={v => set(key, v)} label="" />
              </div>
            ))}
          </div>
        </Card>

        {/* ── Role Permission Protection ─────────────────────────────────── */}
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={14} color="var(--accent)" /> Role Permission Protection
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
            Prevents non-whitelisted users from granting dangerous permissions to any role, including <strong>@everyone</strong>.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Protect @everyone role</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  Any attempt to give @everyone dangerous permissions by a non-whitelisted user is detected instantly and reverted.
                </div>
              </div>
              <Toggle checked={!!config.watchEveryonePerms} onChange={v => set("watchEveryonePerms", v)} label="" />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "var(--bg-input)", borderRadius: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Auto-revert unauthorized permission changes</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  Immediately reverts any dangerous permission grant on any role by a non-whitelisted user.
                </div>
              </div>
              <Toggle checked={!!config.revertRolePerms} onChange={v => set("revertRolePerms", v)} label="" />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "var(--bg-input)", borderRadius: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Punish the executor</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  Apply the configured action (<code style={{ fontSize: 11 }}>{config.action}</code>) to any non-whitelisted user who grants dangerous permissions to a role.
                </div>
              </div>
              <Toggle checked={!!config.punishRolePerms} onChange={v => set("punishRolePerms", v)} label="" />
            </div>
            {(config.revertRolePerms || config.punishRolePerms || config.watchEveryonePerms) && (
              <div style={{ padding: "10px 14px", background: "rgba(88,101,242,0.06)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                💡 Dangerous permissions watched: <strong>Administrator, Manage Server, Manage Channels, Manage Roles, Ban Members, Kick Members, Manage Webhooks, Manage Nicknames, Mention Everyone</strong>.
                Add trusted admins to the whitelist below to exempt them.
              </div>
            )}
          </div>
        </Card>

        {/* ── Advanced Event Protections ────────────────────────────────── */}
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            Advanced Event Protections
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
            Instant or threshold-based protection for server structure changes and rename events. The configured <strong>action</strong> is applied to any non-whitelisted executor.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Non-rename protections */}
            {[
              { key: "antiPruneEnabled",     label: "Anti-Prune",              desc: "Alert and punish any non-whitelisted user who prunes inactive members from the server." },
              { key: "antiVanityEnabled",    label: "Anti-Vanity Change",       desc: "Alert and punish any non-whitelisted user who changes the server's vanity invite URL." },
              { key: "antiServerIconEnabled",label: "Anti-Server Icon Change",  desc: "Alert and punish any non-whitelisted user who changes the server icon." },
            ].map(({ key, label, desc }) => (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{desc}</div>
                </div>
                <Toggle checked={!!config[key]} onChange={v => set(key, v)} label="" />
              </div>
            ))}

            {/* Server Rename — with auto-revert sub-option */}
            <div style={{ padding: "12px 14px", background: "var(--bg-input)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Anti-Server Rename</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Alert and punish any non-whitelisted user who renames the server.</div>
                </div>
                <Toggle checked={!!config.antiServerRenameEnabled} onChange={v => set("antiServerRenameEnabled", v)} label="" />
              </div>
              {config.antiServerRenameEnabled && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Auto-revert server name</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Immediately restores the original server name when a rename is detected.</div>
                  </div>
                  <Toggle checked={!!config.revertServerRename} onChange={v => set("revertServerRename", v)} label="" />
                </div>
              )}
            </div>

            {/* Role Rename — with auto-revert sub-option */}
            <div style={{ padding: "12px 14px", background: "var(--bg-input)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Anti-Role Rename</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Threshold-based ({config.thresholds?.roleRename ?? 3} renames in window). Flags non-whitelisted users who rapidly rename roles.</div>
                </div>
                <Toggle checked={!!config.antiRoleRenameEnabled} onChange={v => set("antiRoleRenameEnabled", v)} label="" />
              </div>
              {config.antiRoleRenameEnabled && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Auto-revert role names</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Immediately restores the original role name on every unauthorized rename — not just at threshold.</div>
                  </div>
                  <Toggle checked={!!config.revertRoleRename} onChange={v => set("revertRoleRename", v)} label="" />
                </div>
              )}
            </div>

            {/* Channel Rename — with auto-revert sub-option */}
            <div style={{ padding: "12px 14px", background: "var(--bg-input)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Anti-Channel Rename</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Threshold-based ({config.thresholds?.channelRename ?? 3} renames in window). Flags non-whitelisted users who rapidly rename channels.</div>
                </div>
                <Toggle checked={!!config.antiChannelRenameEnabled} onChange={v => set("antiChannelRenameEnabled", v)} label="" />
              </div>
              {config.antiChannelRenameEnabled && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Auto-revert channel names</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Immediately restores the original channel name on every unauthorized rename — not just at threshold.</div>
                  </div>
                  <Toggle checked={!!config.revertChannelRename} onChange={v => set("revertChannelRename", v)} label="" />
                </div>
              )}
            </div>

          </div>
        </Card>

        {/* ── Thresholds ────────────────────────────────────────────────── */}
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Action Thresholds</h3>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
            How many of each action triggers punishment within the detection window.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 12 }}>
            {THRESHOLD_KEYS.map(({ key, label }) => (
              <Input key={key} label={label} type="number"
                value={config.thresholds[key]?.toString() ?? "3"}
                onChange={v => setThreshold(key, Math.max(1, parseInt(v) || 1))} />
            ))}
          </div>
        </Card>

        {/* ── Log Channel ───────────────────────────────────────────────── */}
        <Card>
          <Select label="Log Channel" value={config.logChannel ?? ""} onChange={v => set("logChannel", v)}>
            <option value="">— None (falls back to mod log) —</option>
            {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </Select>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
            Anti-Nuke alerts, threshold warnings, dangerous perm alerts, @everyone changes, and server update alerts all go here.
          </div>
        </Card>

        {/* ── Whitelisted Users ─────────────────────────────────────────── */}
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            Whitelisted Users
            {config.whitelist.length > 0 && <Badge color="muted" style={{ marginLeft: 8 }}>{config.whitelist.length}</Badge>}
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>
            These users are exempt from all Anti-Nuke checks, including role permission protection. Add trusted admins here. The server owner is always exempt.
          </p>
          {config.whitelist.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {config.whitelist.map((id: string) => (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}>
                  <code style={{ color: "var(--accent)" }}>{id}</code>
                  <button onClick={() => removeWhitelist(id)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={newUserId} onChange={e => setNewUserId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addWhitelist()}
              placeholder="User ID (17-20 digits)"
              style={{ flex: 1, padding: "9px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none" }} />
            <Button size="sm" onClick={addWhitelist}><Plus size={13} /> Add</Button>
          </div>
        </Card>

        {/* ── Whitelisted Roles ─────────────────────────────────────────── */}
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            Whitelisted Roles
            {config.whitelistRoles.length > 0 && <Badge color="muted" style={{ marginLeft: 8 }}>{config.whitelistRoles.length}</Badge>}
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>
            Members with any of these roles are exempt from Anti-Nuke checks.
          </p>
          {config.whitelistRoles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {config.whitelistRoles.map((id: string) => (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}>
                  <code style={{ color: "var(--accent)" }}>{id}</code>
                  <button onClick={() => removeWhitelistRole(id)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={newRoleId} onChange={e => setNewRoleId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addWhitelistRole()}
              placeholder="Role ID (17-20 digits)"
              style={{ flex: 1, padding: "9px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none" }} />
            <Button size="sm" onClick={addWhitelistRole}><Plus size={13} /> Add</Button>
          </div>
        </Card>

        {/* ── Recovery Info ─────────────────────────────────────────────── */}
        {config.restoreEnabled && (
          <div style={{ padding: "14px 18px", background: "var(--accent-dim)", border: "1px solid rgba(240,165,0,0.25)", borderRadius: 10, fontSize: 13, color: "var(--accent)", display: "flex", alignItems: "flex-start", gap: 10 }}>
            <RotateCcw size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Recovery mode is active.</strong> When a channel or role is deleted, its settings are cached for 30 minutes.
              Run <code style={{ fontSize: 12 }}>&gt;antinuke recover channels</code> or <code style={{ fontSize: 12 }}>&gt;antinuke recover roles</code> to restore them.
            </div>
          </div>
        )}

        {/* ── What it monitors ─────────────────────────────────────────── */}
        <div style={{ padding: "14px 18px", background: "rgba(88,101,242,0.08)", border: "1px solid rgba(88,101,242,0.2)", borderRadius: 10, fontSize: 12, color: "var(--text-secondary)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Eye size={13} />
            <strong style={{ color: "var(--text-primary)" }}>What Anti-Nuke monitors</strong>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Channel &amp; role creates/deletes above the threshold</li>
            <li>Channel &amp; role renames above the threshold (configurable)</li>
            <li>Mass bans, kicks, and timeouts</li>
            <li>Webhook creates &amp; deletes</li>
            <li>Dangerous permission grants on any role — with optional auto-revert &amp; punishment</li>
            <li>@everyone role permission changes — always reverted when protection is enabled</li>
            <li>Server verification level being lowered or 2FA being removed</li>
            <li>Member prune, vanity URL change, server rename &amp; icon change (instant triggers)</li>
          </ul>
        </div>

      </div>
      {canEdit && <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={discard} />}
    </div>
  );
}

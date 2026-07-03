import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import {
  Card, Button, Input, Select, Toggle, PageHeader,
  Badge, Modal, Spinner, EmptyState, useToast,
} from "../../components/ui";
import { Plus, Trash2, Edit2, Ticket, Hash, ChevronRight, ShieldOff, Send } from "lucide-react";

type Tab = "panels" | "tickets" | "settings" | "blacklist";

const statusColor: Record<string, any> = {
  open: "success",
  closed: "muted",
  pending: "warning",
};

const EMOJIS = ["🎫", "🔧", "❓", "🚨", "💬", "📩", "⭐", "🛡️", "💰", "🎮"];

function generateId() { return Math.random().toString(36).slice(2, 9); }

export default function Tickets() {
  const { guildId } = useParams<{ guildId: string }>();
  const [tab, setTab] = useState<Tab>("panels");
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [panels, setPanels] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({
    categoryId: "",
    logChannelId: "",
    supportRoleIds: [],
    closeAction: "close",
    transcripts: false,
    claimEnabled: true,
    openMessage: "",
    blacklist: [],
    cooldownMinutes: 0,
    autoCloseHours: 0,
    alertNoResponseHours: 0,
    alertWaitingHours: 0,
    dmOnClose: false,
    dmOnStaffResponse: false,
    feedbackEnabled: false,
  });
  const [savedConfig, setSavedConfig] = useState<any>({});
  const [panelModal, setPanelModal] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [panelDraft, setPanelDraft] = useState<any>({ name: "", description: "", emoji: "🎫", supportRoleIds: [], panelChannelId: "", openMessage: "", categories: [] });
  const [newCatName, setNewCatName] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("🎫");
  const [newCatCategoryId, setNewCatCategoryId] = useState("");
  const [newCatSupportRoleIds, setNewCatSupportRoleIds] = useState<string[]>([]);
  const [newCatOpenMessage, setNewCatOpenMessage] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatData, setEditingCatData] = useState<any>({});
  const [ticketDetail, setTicketDetail] = useState<any>(null);
  const [blInput, setBlInput] = useState("");
  const { show, ToastEl } = useToast();

  const load = () => {
    if (!guildId) return;
    Promise.all([
      api.guild.ticketConfig(guildId),
      api.guild.ticketPanels(guildId),
      api.guild.tickets(guildId),
      api.guild.channels(guildId),
      api.guild.ticketCategories(guildId),
      api.guild.roles(guildId),
    ]).then(([cfg, pnls, tkts, chs, cats, rls]) => {
      setConfig({ blacklist: [], ...config, ...cfg });
      setSavedConfig(cfg);
      setPanels(pnls);
      setTickets(tkts);
      setChannels(chs);
      setCategories(cats);
      setRoles(rls);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [guildId]);

  const saveConfig = async () => {
    if (!guildId) return;
    try {
      await api.guild.updateTicketConfig(guildId, config);
      setSavedConfig(config);
      show("Settings saved!", "success");
    } catch (e: any) { show(e.message ?? "Failed", "error"); }
  };

  const resetNewCat = () => {
    setNewCatName(""); setNewCatEmoji("🎫"); setNewCatCategoryId(""); setNewCatSupportRoleIds([]); setNewCatOpenMessage("");
  };

  const openCreatePanel = () => {
    setPanelDraft({ name: "", description: "", emoji: "🎫", supportRoleIds: [], panelChannelId: "", openMessage: "", categories: [] });
    resetNewCat(); setEditingCatId(null);
    setPanelModal({ open: true });
  };

  const openEditPanel = (panel: any) => {
    setPanelDraft({ openMessage: "", categories: [], ...panel });
    resetNewCat(); setEditingCatId(null);
    setPanelModal({ open: true, editing: panel });
  };

  const addCategory = () => {
    const name = newCatName.trim();
    if (!name) return show("Category name required", "error");
    const cats = panelDraft.categories ?? [];
    if (cats.some((c: any) => c.name.toLowerCase() === name.toLowerCase())) return show("Category already exists", "error");
    const id = Math.random().toString(36).slice(2, 8);
    setPanelDraft((d: any) => ({
      ...d,
      categories: [...(d.categories ?? []), {
        id, name, emoji: newCatEmoji,
        categoryId: newCatCategoryId || undefined,
        supportRoleIds: newCatSupportRoleIds.length > 0 ? newCatSupportRoleIds : undefined,
        openMessage: newCatOpenMessage.trim() || undefined,
      }],
    }));
    resetNewCat();
  };

  const removeCategory = (id: string) => {
    setPanelDraft((d: any) => ({ ...d, categories: (d.categories ?? []).filter((c: any) => c.id !== id) }));
    if (editingCatId === id) setEditingCatId(null);
  };

  const startEditCategory = (cat: any) => {
    setEditingCatId(cat.id);
    setEditingCatData({ ...cat, categoryId: cat.categoryId ?? "", supportRoleIds: cat.supportRoleIds ?? [] });
  };

  const saveEditCategory = () => {
    setPanelDraft((d: any) => ({
      ...d,
      categories: (d.categories ?? []).map((c: any) =>
        c.id === editingCatId ? {
          ...c,
          name: editingCatData.name?.trim() || c.name,
          emoji: editingCatData.emoji || c.emoji,
          categoryId: editingCatData.categoryId || undefined,
          supportRoleIds: (editingCatData.supportRoleIds ?? []).length > 0 ? editingCatData.supportRoleIds : undefined,
          openMessage: editingCatData.openMessage?.trim() || undefined,
        } : c
      ),
    }));
    setEditingCatId(null);
  };

  const toggleNewCatRole = (roleId: string) => {
    setNewCatSupportRoleIds(prev => prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]);
  };

  const toggleEditCatRole = (roleId: string) => {
    setEditingCatData((d: any) => {
      const arr: string[] = d.supportRoleIds ?? [];
      return { ...d, supportRoleIds: arr.includes(roleId) ? arr.filter((r: string) => r !== roleId) : [...arr, roleId] };
    });
  };

  const savePanel = async () => {
    if (!guildId || !panelDraft.name.trim()) return show("Panel name required", "error");
    try {
      if (panelModal.editing) {
        await api.guild.updateTicketPanel(guildId, panelModal.editing.id, panelDraft);
        show("Panel updated!", "success");
      } else {
        await api.guild.createTicketPanel(guildId, { ...panelDraft, id: generateId() });
        show("Panel created!", "success");
      }
      setPanelModal({ open: false });
      load();
    } catch (e: any) { show(e.message ?? "Failed", "error"); }
  };

  const deletePanel = async (id: string) => {
    if (!guildId || !confirm("Delete this ticket panel?")) return;
    try {
      await api.guild.deleteTicketPanel(guildId, id);
      show("Panel deleted", "success");
      load();
    } catch (e: any) { show(e.message ?? "Failed", "error"); }
  };

  const sendPanel = async (panel: any) => {
    if (!guildId) return;
    if (!panel.panelChannelId) return show("Edit this panel and select a channel before sending.", "error");
    const channelName = channels.find(c => c.id === panel.panelChannelId)?.name ?? panel.panelChannelId;
    if (!confirm(`Post "${panel.name}" to #${channelName}?`)) return;
    try {
      await api.guild.sendTicketPanel(guildId, panel.id);
      show(`Panel posted to #${channelName}!`, "success");
    } catch (e: any) { show(e.message ?? "Failed to send panel", "error"); }
  };

  const closeTicket = async (ticketId: string) => {
    if (!guildId || !confirm("Mark this ticket as closed?")) return;
    try {
      await api.guild.updateTicket(guildId, ticketId, { status: "closed" });
      setTickets(t => t.map(x => x.id === ticketId ? { ...x, status: "closed" } : x));
      if (ticketDetail?.id === ticketId) setTicketDetail((t: any) => ({ ...t, status: "closed" }));
      show("Ticket closed", "success");
    } catch (e: any) { show(e.message ?? "Failed", "error"); }
  };

  const toggleRole = (roleId: string) => {
    setConfig((c: any) => {
      const arr: string[] = c.supportRoleIds ?? [];
      return { ...c, supportRoleIds: arr.includes(roleId) ? arr.filter((r: string) => r !== roleId) : [...arr, roleId] };
    });
  };

  const togglePanelRole = (roleId: string) => {
    setPanelDraft((d: any) => {
      const arr: string[] = d.supportRoleIds ?? [];
      return { ...d, supportRoleIds: arr.includes(roleId) ? arr.filter((r: string) => r !== roleId) : [...arr, roleId] };
    });
  };

  const addBlacklist = () => {
    const uid = blInput.trim();
    if (!uid || !/^\d{17,20}$/.test(uid)) return show("Enter a valid Discord user ID (17–20 digits)", "error");
    const bl: string[] = config.blacklist ?? [];
    if (bl.includes(uid)) return show("Already blacklisted", "error");
    setConfig((c: any) => ({ ...c, blacklist: [...bl, uid] }));
    setBlInput("");
  };

  const removeBlacklist = async (uid: string) => {
    const bl: string[] = (config.blacklist ?? []).filter((x: string) => x !== uid);
    const updated = { ...config, blacklist: bl };
    setConfig(updated);
    try {
      await api.guild.updateTicketConfig(guildId!, updated);
      show("Removed from blacklist", "success");
    } catch (e: any) { show(e.message ?? "Failed", "error"); }
  };

  if (loading) return <Spinner />;

  const openTickets = tickets.filter(t => t.status === "open");
  const closedTickets = tickets.filter(t => t.status === "closed");

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    background: active ? "var(--accent-dim)" : "transparent",
    color: active ? "var(--accent)" : "var(--text-secondary)",
    border: active ? "1px solid rgba(240,165,0,0.25)" : "1px solid transparent",
    cursor: "pointer", transition: "all 0.15s",
  });

  return (
    <div style={{ padding: "32px 32px 48px" }}>
      {ToastEl}
      <PageHeader title="Ticket System" subtitle="Configure ticket panels, categories and manage open tickets" />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, background: "var(--bg-secondary)", borderRadius: 10, padding: 4, width: "fit-content", border: "1px solid var(--border)", flexWrap: "wrap" }}>
        {([["panels", "🎫 Panels"], ["tickets", "📋 Tickets"], ["settings", "⚙️ Settings"], ["blacklist", "🚫 Blacklist"]] as const).map(([key, label]) => (
          <button key={key} style={TAB_STYLE(tab === key)} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {/* ── PANELS TAB ─────────────────────────────────────────────────────── */}
      {tab === "panels" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Panels are posted in a channel with a button users click to open a ticket.
            </p>
            <Button onClick={openCreatePanel}><Plus size={14} /> New Panel</Button>
          </div>

          {panels.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Ticket size={40} />}
                title="No panels yet"
                description="Create a ticket panel to let users open support tickets in your server."
                action={<Button onClick={openCreatePanel}><Plus size={14} /> Create Panel</Button>}
              />
            </Card>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
              {panels.map(panel => {
                const panelChannel = channels.find(c => c.id === panel.panelChannelId);
                const panelRoles = roles.filter(r => (panel.supportRoleIds ?? []).includes(r.id));
                return (
                  <Card key={panel.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 28, lineHeight: 1 }}>{panel.emoji ?? "🎫"}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{panel.name}</div>
                        {panel.description && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{panel.description}</div>}
                      </div>
                    </div>
                    {panelChannel && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                        <Hash size={11} /> #{panelChannel.name}
                      </div>
                    )}
                    {panelRoles.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {panelRoles.map(r => (
                          <span key={r.id} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid rgba(240,165,0,0.2)" }}>@{r.name}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button size="sm" variant="secondary" onClick={() => openEditPanel(panel)}><Edit2 size={12} /> Edit</Button>
                      <Button size="sm" onClick={() => sendPanel(panel)}><Send size={12} /> Send</Button>
                      <Button size="sm" variant="danger" onClick={() => deletePanel(panel.id)}><Trash2 size={12} /></Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── TICKETS TAB ────────────────────────────────────────────────────── */}
      {tab === "tickets" && (
        <>
          {ticketDetail ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <button onClick={() => setTicketDetail(null)} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>← Back</button>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>Ticket #{ticketDetail.number ?? ticketDetail.id.slice(0, 6)}</h2>
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Opened by {ticketDetail.userTag}</p>
                </div>
                <Badge color={statusColor[ticketDetail.status] ?? "muted"}>{ticketDetail.status}</Badge>
              </div>
              <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>User</div>
                    <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{ticketDetail.userTag}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Panel</div>
                    <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{ticketDetail.panelName ?? "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Opened</div>
                    <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{new Date(ticketDetail.createdAt).toLocaleString()}</div>
                  </div>
                  {ticketDetail.closedAt && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Closed</div>
                      <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{new Date(ticketDetail.closedAt).toLocaleString()}</div>
                    </div>
                  )}
                  {ticketDetail.claimedBy && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Claimed By</div>
                      <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{ticketDetail.claimedBy}</div>
                    </div>
                  )}
                  {ticketDetail.topic && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Topic</div>
                      <div style={{ fontSize: 14, color: "var(--text-primary)", background: "var(--bg-input)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>{ticketDetail.topic}</div>
                    </div>
                  )}
                </div>
                {ticketDetail.status === "open" && (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button variant="danger" size="sm" onClick={() => closeTicket(ticketDetail.id)}>Close Ticket</Button>
                  </div>
                )}
              </Card>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Card style={{ flex: 1, minWidth: 120, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--success)" }}>{openTickets.length}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Open Tickets</div>
                </Card>
                <Card style={{ flex: 1, minWidth: 120, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-secondary)" }}>{closedTickets.length}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Closed</div>
                </Card>
                <Card style={{ flex: 1, minWidth: 120, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--accent)" }}>{tickets.length}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Total</div>
                </Card>
              </div>

              {tickets.length === 0 ? (
                <Card>
                  <EmptyState icon={<Ticket size={40} />} title="No tickets yet" description="Tickets will appear here once users start opening them in your server." />
                </Card>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {tickets.map(ticket => (
                    <Card key={ticket.id} style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                      onClick={() => setTicketDetail(ticket)}>
                      <div style={{ fontSize: 20 }}>{panels.find(p => p.id === ticket.panelId)?.emoji ?? "🎫"}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                            #{ticket.number ?? ticket.id.slice(0, 6)} — {ticket.panelName ?? "Ticket"}
                          </span>
                          <Badge color={statusColor[ticket.status] ?? "muted"}>{ticket.status}</Badge>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ticket.userTag} · {new Date(ticket.createdAt).toLocaleDateString()}
                          {ticket.topic && ` · ${ticket.topic}`}
                        </div>
                      </div>
                      <ChevronRight size={16} color="var(--text-muted)" />
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── SETTINGS TAB ───────────────────────────────────────────────────── */}
      {tab === "settings" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <Button onClick={saveConfig}>Save Settings</Button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Channel Configuration</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Select label="Ticket Category (where channels are created)" value={config.categoryId ?? ""} onChange={v => setConfig((c: any) => ({ ...c, categoryId: v }))}>
                  <option value="">— Not set —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <Select label="Log Channel" value={config.logChannelId ?? ""} onChange={v => setConfig((c: any) => ({ ...c, logChannelId: v }))}>
                  <option value="">— None —</option>
                  {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </Select>
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Support Roles</div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>These roles can see and respond to all tickets.</p>
              {roles.length === 0
                ? <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No roles found — make sure the bot is in your server.</div>
                : <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {roles.map(role => {
                      const active = (config.supportRoleIds ?? []).includes(role.id);
                      return (
                        <button key={role.id} onClick={() => toggleRole(role.id)} style={{
                          padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: active ? "var(--accent-dim)" : "var(--bg-input)",
                          color: active ? "var(--accent)" : "var(--text-secondary)",
                          border: active ? "1px solid rgba(240,165,0,0.3)" : "1px solid var(--border)",
                          transition: "all 0.15s",
                        }}>@{role.name}</button>
                      );
                    })}
                  </div>
              }
            </Card>

            <Card>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Behaviour</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Select label="When ticket is closed" value={config.closeAction ?? "close"} onChange={v => setConfig((c: any) => ({ ...c, closeAction: v }))}>
                  <option value="close">Close channel (keep it)</option>
                  <option value="delete">Delete channel</option>
                </Select>
                <Toggle label="Save transcripts on close" checked={!!config.transcripts} onChange={v => setConfig((c: any) => ({ ...c, transcripts: v }))} />
                <Toggle label="Allow staff to claim tickets" checked={!!config.claimEnabled} onChange={v => setConfig((c: any) => ({ ...c, claimEnabled: v }))} />
                <Toggle label="DM user when their ticket is closed" checked={!!config.dmOnClose} onChange={v => setConfig((c: any) => ({ ...c, dmOnClose: v }))} />
                <Toggle label="DM user when staff first responds" checked={!!config.dmOnStaffResponse} onChange={v => setConfig((c: any) => ({ ...c, dmOnStaffResponse: v }))} />
                <Toggle label="Send feedback rating request after close (1–5 ⭐)" checked={!!config.feedbackEnabled} onChange={v => setConfig((c: any) => ({ ...c, feedbackEnabled: v }))} />
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Ticket Cooldown</div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>Prevent users from opening tickets too frequently. Set to 0 to disable.</p>
              <Input
                label="Cooldown between tickets (minutes, 0 = off)"
                type="number"
                value={String(config.cooldownMinutes ?? 0)}
                onChange={v => setConfig((c: any) => ({ ...c, cooldownMinutes: Math.max(0, parseInt(v) || 0) }))}
                placeholder="0"
              />
            </Card>

            <Card>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Automation & Alerts</div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
                Auto-close inactive tickets and alert staff about unattended tickets. Set any value to 0 to disable that feature.
                Alerts are sent to the <strong>Log Channel</strong> configured above.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Input
                  label="Auto-close ticket after inactivity (hours, 0 = off)"
                  type="number"
                  value={String(config.autoCloseHours ?? 0)}
                  onChange={v => setConfig((c: any) => ({ ...c, autoCloseHours: Math.max(0, parseInt(v) || 0) }))}
                  placeholder="0"
                />
                <Input
                  label="Alert if no staff response within (hours, 0 = off)"
                  type="number"
                  value={String(config.alertNoResponseHours ?? 0)}
                  onChange={v => setConfig((c: any) => ({ ...c, alertNoResponseHours: Math.max(0, parseInt(v) || 0) }))}
                  placeholder="0"
                />
                <Input
                  label="Alert if ticket waiting too long (hours, 0 = off)"
                  type="number"
                  value={String(config.alertWaitingHours ?? 0)}
                  onChange={v => setConfig((c: any) => ({ ...c, alertWaitingHours: Math.max(0, parseInt(v) || 0) }))}
                  placeholder="0"
                />
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Opening Message</div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>The message shown in the welcome embed when a ticket is first opened. Leave blank for the default message.</p>
              <textarea
                value={config.openMessage ?? ""}
                onChange={e => setConfig((c: any) => ({ ...c, openMessage: e.target.value }))}
                placeholder="Thanks for creating a ticket! We'll be with you as quickly as possible…"
                rows={4}
                style={{ width: "100%", padding: "10px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </Card>
          </div>
        </>
      )}

      {/* ── BLACKLIST TAB ──────────────────────────────────────────────────── */}
      {tab === "blacklist" && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Ticket Blacklist</div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
              Blacklisted users cannot open new tickets. Add their Discord user ID (right-click → Copy User ID).
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                value={blInput}
                onChange={e => setBlInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addBlacklist()}
                placeholder="Discord User ID (e.g. 123456789012345678)"
                style={{ flex: 1, padding: "9px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none" }}
              />
              <Button onClick={addBlacklist}><Plus size={14} /> Add</Button>
            </div>

            {(config.blacklist ?? []).length === 0 ? (
              <EmptyState icon={<ShieldOff size={32} />} title="No users blacklisted" description="Add user IDs above to prevent them from opening tickets." />
            ) : (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                  {(config.blacklist ?? []).length} blacklisted user{(config.blacklist ?? []).length !== 1 ? "s" : ""}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(config.blacklist ?? []).map((uid: string) => (
                    <div key={uid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8 }}>
                      <span style={{ fontSize: 13, color: "var(--text-primary)", fontFamily: "monospace" }}>{uid}</span>
                      <button onClick={() => removeBlacklist(uid)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                  <Button onClick={saveConfig}>Save Blacklist</Button>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {/* Panel modal */}
      <Modal open={panelModal.open} onClose={() => setPanelModal({ open: false })} title={panelModal.editing ? "Edit Panel" : "Create Panel"} width={520}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Input label="Panel Name" value={panelDraft.name} onChange={v => setPanelDraft((d: any) => ({ ...d, name: v }))} placeholder="e.g. General Support, Billing" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>Emoji</label>
              <select value={panelDraft.emoji} onChange={e => setPanelDraft((d: any) => ({ ...d, emoji: e.target.value }))}
                style={{ padding: "9px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 18, outline: "none", cursor: "pointer", width: 72 }}>
                {EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <Input label="Description (shown on button)" value={panelDraft.description ?? ""} onChange={v => setPanelDraft((d: any) => ({ ...d, description: v }))} placeholder="Brief description of this panel" />
          <Select label="Post panel to channel" value={panelDraft.panelChannelId ?? ""} onChange={v => setPanelDraft((d: any) => ({ ...d, panelChannelId: v }))}>
            <option value="">— Select channel —</option>
            {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
          </Select>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>Opening Message (optional)</label>
            <textarea
              value={panelDraft.openMessage ?? ""}
              onChange={e => setPanelDraft((d: any) => ({ ...d, openMessage: e.target.value }))}
              placeholder="Custom message shown in the welcome embed when a ticket from this panel is opened. Leave blank to use the default message."
              rows={3}
              style={{ width: "100%", padding: "9px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 10 }}>Panel-specific Support Roles (optional)</label>
            {roles.length === 0
              ? <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No roles found.</div>
              : <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {roles.map(role => {
                    const active = (panelDraft.supportRoleIds ?? []).includes(role.id);
                    return (
                      <button key={role.id} onClick={() => togglePanelRole(role.id)} style={{
                        padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        background: active ? "var(--accent-dim)" : "var(--bg-input)",
                        color: active ? "var(--accent)" : "var(--text-secondary)",
                        border: active ? "1px solid rgba(240,165,0,0.3)" : "1px solid var(--border)",
                        transition: "all 0.15s",
                      }}>@{role.name}</button>
                    );
                  })}
                </div>
            }
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              Categories / Topics
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 8, textTransform: "none", letterSpacing: 0 }}>
                optional — each can route to a different channel category &amp; support role
              </span>
            </label>

            {(panelDraft.categories ?? []).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {(panelDraft.categories ?? []).map((cat: any) => {
                  const isEditing = editingCatId === cat.id;
                  const catChannelName = categories.find((c: any) => c.id === (isEditing ? editingCatData.categoryId : cat.categoryId))?.name;
                  const catRoles = roles.filter((r: any) => (isEditing ? editingCatData.supportRoleIds : cat.supportRoleIds ?? []).includes(r.id));
                  return (
                    <div key={cat.id} style={{ background: "var(--bg-input)", border: `1px solid ${isEditing ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, overflow: "hidden" }}>
                      {/* Header row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
                        {isEditing ? (
                          <select value={editingCatData.emoji ?? cat.emoji} onChange={e => setEditingCatData((d: any) => ({ ...d, emoji: e.target.value }))}
                            style={{ padding: "4px 6px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 16, outline: "none", cursor: "pointer", width: 52 }}>
                            {EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 16 }}>{cat.emoji}</span>
                        )}
                        {isEditing ? (
                          <input value={editingCatData.name ?? cat.name} onChange={e => setEditingCatData((d: any) => ({ ...d, name: e.target.value }))}
                            style={{ flex: 1, padding: "5px 9px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 13, outline: "none" }} />
                        ) : (
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{cat.name}</span>
                        )}
                        {!isEditing && catChannelName && (
                          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "rgba(88,101,242,0.15)", color: "#7289da", border: "1px solid rgba(88,101,242,0.25)" }}>📁 {catChannelName}</span>
                        )}
                        {!isEditing && catRoles.length > 0 && catRoles.map((r: any) => (
                          <span key={r.id} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid rgba(240,165,0,0.2)" }}>@{r.name}</span>
                        ))}
                        {isEditing ? (
                          <>
                            <button onClick={saveEditCategory} style={{ background: "var(--accent-dim)", border: "1px solid rgba(240,165,0,0.3)", color: "var(--accent)", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save</button>
                            <button onClick={() => setEditingCatId(null)} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => startEditCategory(cat)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }} title="Edit category">
                            <Edit2 size={13} />
                          </button>
                        )}
                        <button onClick={() => removeCategory(cat.id)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Inline edit fields */}
                      {isEditing && (
                        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--border)" }}>
                          <div style={{ paddingTop: 10 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Discord Channel Category (where tickets go)</label>
                            <select value={editingCatData.categoryId ?? ""} onChange={e => setEditingCatData((d: any) => ({ ...d, categoryId: e.target.value }))}
                              style={{ width: "100%", padding: "8px 10px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none" }}>
                              <option value="">— Use global default —</option>
                              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Support Roles for this Category</label>
                            {roles.length === 0
                              ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No roles found.</div>
                              : <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {roles.map((role: any) => {
                                    const active = (editingCatData.supportRoleIds ?? []).includes(role.id);
                                    return (
                                      <button key={role.id} onClick={() => toggleEditCatRole(role.id)} style={{
                                        padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                        background: active ? "var(--accent-dim)" : "var(--bg-card)",
                                        color: active ? "var(--accent)" : "var(--text-secondary)",
                                        border: active ? "1px solid rgba(240,165,0,0.3)" : "1px solid var(--border)",
                                      }}>@{role.name}</button>
                                    );
                                  })}
                                </div>
                            }
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Opening Message (optional)</label>
                            <textarea
                              value={editingCatData.openMessage ?? ""}
                              onChange={e => setEditingCatData((d: any) => ({ ...d, openMessage: e.target.value }))}
                              placeholder="Custom message shown when a ticket in this category is opened. Overrides the panel message."
                              rows={3}
                              style={{ width: "100%", padding: "8px 10px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new category form */}
            <div style={{ background: "var(--bg-secondary)", border: "1px dashed var(--border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Add Category</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={newCatEmoji} onChange={e => setNewCatEmoji(e.target.value)}
                  style={{ padding: "8px 8px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 16, outline: "none", cursor: "pointer", width: 56 }}>
                  {EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <input
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addCategory()}
                  placeholder="Category name (e.g. Billing, General, Report)"
                  style={{ flex: 1, padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Discord Channel Category (optional)</label>
                <select value={newCatCategoryId} onChange={e => setNewCatCategoryId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, outline: "none" }}>
                  <option value="">— Use global default —</option>
                  {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Support Roles (optional)</label>
                {roles.length === 0
                  ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No roles found.</div>
                  : <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {roles.map((role: any) => {
                        const active = newCatSupportRoleIds.includes(role.id);
                        return (
                          <button key={role.id} onClick={() => toggleNewCatRole(role.id)} style={{
                            padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            background: active ? "var(--accent-dim)" : "var(--bg-input)",
                            color: active ? "var(--accent)" : "var(--text-secondary)",
                            border: active ? "1px solid rgba(240,165,0,0.3)" : "1px solid var(--border)",
                          }}>@{role.name}</button>
                        );
                      })}
                    </div>
                }
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Opening Message (optional)</label>
                <textarea
                  value={newCatOpenMessage}
                  onChange={e => setNewCatOpenMessage(e.target.value)}
                  placeholder="Custom message shown when a ticket in this category is opened. Overrides the panel message."
                  rows={3}
                  style={{ width: "100%", padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button size="sm" onClick={addCategory} disabled={!newCatName.trim()}><Plus size={13} /> Add Category</Button>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setPanelModal({ open: false })}>Cancel</Button>
            <Button onClick={savePanel}>{panelModal.editing ? "Update" : "Create"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

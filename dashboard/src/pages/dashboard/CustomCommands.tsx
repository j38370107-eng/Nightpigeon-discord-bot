import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, Button, Input, TextArea, PageHeader, Badge, Modal, Spinner, EmptyState, useToast } from "../../components/ui";
import { Plus, Trash2, Edit2, Terminal, Hash, ShieldCheck, ShieldOff, Lock, Clock, Layout } from "lucide-react";

const CAP = 50;

const RESERVED_NAMES = new Set([
  "warn","kick","ban","unban","mute","timeout","unmute","untimeout",
  "purge","clear","prune","slowmode","slow","sm","lock","unlock","lockdown","ld",
  "note","addnote","staffnote","viewnote","shownote","getnote","notes",
  "editnote","updatenote","notereason","reason","case",
  "delcase","deletecase","removecase","rmcase","delnote","deletenote","removenote","rmnote",
  "shortcut","sc","automod","am","userinfo","ui","whois","serverinfo","si","guildinfo",
  "modnick","mn","moderatenick","modrole","mr","ping","latency","nick","nickname",
  "afk","afkreset","alt","clearalt","alts","altlist","linkedalts","altslist",
  "addrole","ar","removerole","rr","remind","reminder","remindme","alias",
  "setmodlogs","setlogchannel","setlogs","logchannel","setserverlogs","serverlogs","serverlogchannel",
  "antinuke","an","nuke","antiraid","raid",
  "ticket","tickets","tblacklist","ticketblacklist","tblist","tunblacklist","ticketunblacklist","tbunlist",
  "setup","tsetup","close","tclose","delete","tdelete","reopen","treopen",
  "add","tadd","remove","tremove","claim","tclaim","transcript","ttranscript","stats","tstats","ticketstats",
  "baninfo","binfo","botinfo","bot","about","duration","setduration","changeduration","eval","ev",
  "serverblacklist","sbl","guildblacklist","userblacklist","ubl","globalban","backup","bk",
  "additionalinformation","addinfo","ai","punishinfo","activeactions","activemutes","activebans","active","timed",
  "modstats","moderatorstats","modleaderboard","modlb","resetconfig","configreset","resetbot","factoryreset",
  "muteconfig","mutesettings","dashboard","dash","panel",
  "snipe","s","editsnipe","es","clearsnipe","cs","protectedrole","protrole",
  "help","h","commands","changeprefix","setprefix","prefix",
  "warnings","warns","modlogs","infractions","punishments","cases","hist","history","warnsa","invites",
]);

const PRESETS = [
  { trigger: "warm", response: "⚠️ **{user}** has been warned.\n**Reason:** Being too warm and friendly.", label: "warm (fake warn)" },
  { trigger: "bam", response: "🔨 **{user}** has been banned.\n**Reason:** Being absolutely bamboozled.", label: "bam (fake ban)" },
];

const EMPTY_EMBED = {
  enabled: false,
  title: "",
  description: "",
  color: "#5865f2",
  footer: "",
  imageUrl: "",
  thumbnailUrl: "",
  author: "",
};

const EMPTY_DRAFT = {
  trigger: "",
  response: "",
  embed: { ...EMPTY_EMBED },
  allowedRoles: [] as string[],
  allowedChannels: [] as string[],
  blockedRoles: [] as string[],
  blockedChannels: [] as string[],
  cooldown: 0,
  cooldownType: "user" as "user" | "channel" | "global",
};

function generateId() { return Math.random().toString(36).slice(2, 9); }

function PillToggle({ items, selected, onToggle, color }: {
  items: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  color: string;
}) {
  if (items.length === 0) return <div style={{ fontSize: 12, color: "var(--text-muted)" }}>None found in server.</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map(item => {
        const active = selected.includes(item.id);
        return (
          <button key={item.id} onClick={() => onToggle(item.id)} style={{
            padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
            background: active ? color + "22" : "var(--bg-input)",
            color: active ? color : "var(--text-secondary)",
            border: active ? `1px solid ${color}55` : "1px solid var(--border)",
            transition: "all 0.15s",
          }}>{item.name}</button>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function EmbedPreview({ embed, response }: { embed: typeof EMPTY_EMBED; response: string }) {
  const color = embed.color || "#5865f2";
  const hasContent = embed.title || embed.description || embed.footer || embed.author;
  if (!hasContent && !response) return null;
  return (
    <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Preview</div>
      {response && (
        <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: hasContent ? 8 : 0, whiteSpace: "pre-wrap" }}>{response}</div>
      )}
      {hasContent && (
        <div style={{ display: "flex", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
          <div style={{ width: 4, background: color, flexShrink: 0 }} />
          <div style={{ flex: 1, padding: "10px 12px", background: "var(--bg-card)" }}>
            {embed.author && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>{embed.author}</div>}
            {embed.title && <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{embed.title}</div>}
            {embed.description && <div style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{embed.description}</div>}
            {embed.footer && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 6 }}>{embed.footer}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function VarRef() {
  const c = (t: string) => (
    <code style={{ background: "var(--bg-card)", padding: "0 4px", borderRadius: 3, fontSize: 10 }}>{t}</code>
  );
  const row = (a: React.ReactNode, b: React.ReactNode) => (
    <>
      <div style={{ paddingBottom: 2 }}>{a}</div>
      <div style={{ paddingBottom: 2 }}>{b}</div>
    </>
  );
  const heading = (t: string) => (
    <>
      <div style={{ marginTop: 8, fontWeight: 700, color: "var(--text-primary)", fontSize: 11 }}>{t}</div>
      <div />
    </>
  );

  return (
    <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.9 }}>
      <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Available Variables</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>

        {heading("👤 Caller")}
        {row(<>{c("{user}")} — mention</>, <>{c("{user.name}")} — username</>)}
        {row(<>{c("{user.tag}")} — tag</>, <>{c("{user.id}")} — ID</>)}
        {row(<>{c("{user.nickname}")} — nick</>, <>{c("{user.avatar}")} — avatar URL</>)}
        {row(<>{c("{user.joinedAt}")} — joined</>, <>{c("{user.createdAt}")} — created</>)}
        {row(<>{c("{user.roles}")} — all roles</>, <>{c("{user.roleCount}")} — role count</>)}
        {row(<>{c("{user.topRole}")} — highest role</>, <>{c("{user.color}")} — role color hex</>)}

        {heading("🎯 Targeted Member ($1, $2 …)")}
        {row(<>{c("{$1}")} — mention them</>, <>{c("{$1.name}")} — username</>)}
        {row(<>{c("{$1.tag}")} — tag</>, <>{c("{$1.id}")} — ID</>)}
        {row(<>{c("{$1.nickname}")} — nick</>, <>{c("{$1.avatar}")} — avatar URL</>)}
        {row(<>{c("{$1.joinedAt}")} — joined</>, <>{c("{$1.createdAt}")} — created</>)}
        {row(<>{c("{$1.roles}")} — all roles</>, <>{c("{$1.roleCount}")} — role count</>)}
        {row(<>{c("{$1.topRole}")} — highest role</>, <>{c("{$1.color}")} — role color hex</>)}

        {heading("💬 Channel")}
        {row(<>{c("{channel}")} — #channel</>, <>{c("{channel.name}")} — name</>)}
        {row(<>{c("{channel.id}")} — ID</>, <>{c("{channel.topic}")} — topic</>)}
        {row(<>{c("{channel.position}")} — position</>, null)}

        {heading("🏠 Server")}
        {row(<>{c("{server}")} / {c("{server.name}")} — name</>, <>{c("{server.id}")} — ID</>)}
        {row(<>{c("{server.memberCount}")} — members</>, <>{c("{server.roleCount}")} — roles</>)}
        {row(<>{c("{server.channelCount}")} — channels</>, <>{c("{server.emojiCount}")} — emojis</>)}
        {row(<>{c("{server.boostCount}")} — boosts</>, <>{c("{server.boostLevel}")} — tier 0–3</>)}
        {row(<>{c("{server.owner}")} — owner mention</>, <>{c("{server.ownerId}")} — owner ID</>)}
        {row(<>{c("{server.createdAt}")} — created</>, <>{c("{server.description}")} — desc</>)}
        {row(<>{c("{server.icon}")} — icon URL</>, <>{c("{server.vanity}")} — vanity code</>)}

        {heading("🕐 Time")}
        {row(<>{c("{date}")} — date</>, <>{c("{time}")} — time</>)}
        {row(<>{c("{datetime}")} — date + time</>, <>{c("{relative}")} — relative</>)}
        {row(<>{c("{unix}")} — unix timestamp</>, null)}

        {heading("🔤 Text")}
        {row(<>{c("{upper:text}")} — UPPERCASE</>, <>{c("{lower:text}")} — lowercase</>)}
        {row(<>{c("{length:text}")} — char count</>, <>{c("{trim:text}")} — strip spaces</>)}
        {row(<>{c("{repeat:text;3}")} — repeat x3</>, null)}

        {heading("🎲 Random / Math")}
        {row(<>{c("{choose:a;b;c}")} — random pick</>, <>{c("{random:1;100}")} — random number</>)}
        {row(<>{c("{math:2*21}")} — math result</>, null)}

        {heading("📥 Arguments")}
        {row(<>{c("$1")} — 1st word</>, <>{c("$2")} — 2nd word</>)}
        {row(<>{c("$1+")} — 1st onward</>, <>{c("$*")} — all words</>)}

        {heading("⚙️ Flags")}
        {row(<>{c("{silent}")} — delete trigger message before responding</>, null)}
      </div>
    </div>
  );
}

export default function CustomCommands() {
  const { guildId } = useParams<{ guildId: string }>();
  const [commands, setCommands] = useState<any[]>([]);
  const [shortcuts, setShortcuts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [modal, setModal] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [tab, setTab] = useState<"response" | "embed" | "access">("response");
  const { show, ToastEl } = useToast();

  const load = () => {
    if (!guildId) return;
    Promise.all([
      api.guild.customCommands(guildId),
      api.guild.shortcuts(guildId).catch(() => []),
      api.guild.channels(guildId).catch(() => []),
      api.guild.roles(guildId).catch(() => []),
    ]).then(([cmds, scs, chs, rls]) => {
      setCommands(cmds);
      setShortcuts(scs);
      setChannels(chs);
      setRoles(rls);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [guildId]);

  const openCreate = (preset?: { trigger: string; response: string }) => {
    setDraft({ ...EMPTY_DRAFT, embed: { ...EMPTY_EMBED }, ...(preset ?? {}) });
    setTab("response");
    setModal({ open: true });
  };

  const openEdit = (cmd: any) => {
    setDraft({
      trigger: cmd.trigger,
      response: cmd.response,
      embed: cmd.embed ? { ...EMPTY_EMBED, ...cmd.embed } : { ...EMPTY_EMBED },
      allowedRoles: cmd.allowedRoles ?? [],
      allowedChannels: cmd.allowedChannels ?? [],
      blockedRoles: cmd.blockedRoles ?? [],
      blockedChannels: cmd.blockedChannels ?? [],
      cooldown: cmd.cooldown ?? 0,
      cooldownType: cmd.cooldownType ?? "user",
    });
    setTab("response");
    setModal({ open: true, editing: cmd });
  };

  const toggleArr = (key: keyof typeof EMPTY_DRAFT, id: string) => {
    setDraft(d => {
      const cur = d[key] as string[];
      return { ...d, [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
    });
  };

  const setEmbed = (key: keyof typeof EMPTY_EMBED, value: any) => {
    setDraft(d => ({ ...d, embed: { ...d.embed, [key]: value } }));
  };

  const liveTrigger = draft.trigger.trim().toLowerCase().replace(/\s+/g, "_");
  const isTriggerReserved = liveTrigger !== "" && RESERVED_NAMES.has(liveTrigger);
  const isTriggerShortcut = liveTrigger !== "" && !isTriggerReserved &&
    shortcuts.some(s => s.name === liveTrigger);
  const isTriggerDupeCC = liveTrigger !== "" && !isTriggerReserved && !isTriggerShortcut &&
    commands.some(c => c.trigger === liveTrigger && c.id !== modal.editing?.id);

  const save = async () => {
    const trigger = liveTrigger;
    const response = draft.response.trim();
    const embedFilled = draft.embed.enabled && (
      draft.embed.title.trim() || draft.embed.description.trim() ||
      (draft.embed.author ?? "").trim() || (draft.embed.footer ?? "").trim()
    );
    if (!trigger) return show("Trigger word is required", "error");
    if (!response && !embedFilled) return show("Response text is required — or enable the embed and fill in a title or description", "error");
    if (trigger.length > 32) return show("Trigger must be 32 chars or fewer", "error");
    if (response.length > 2000) return show("Response must be 2000 chars or fewer", "error");
    if (!modal.editing && commands.length >= CAP) return show(`Maximum ${CAP} custom commands`, "error");
    if (isTriggerReserved) return show(`"${trigger}" is a built-in bot command — choose a different trigger.`, "error");
    if (isTriggerShortcut) return show(`"${trigger}" is already a shortcut — delete the shortcut first or choose a different trigger.`, "error");
    if (isTriggerDupeCC) return show("A command with that trigger already exists", "error");

    const payload = {
      trigger,
      response,
      embed: draft.embed,
      allowedRoles: draft.allowedRoles,
      allowedChannels: draft.allowedChannels,
      blockedRoles: draft.blockedRoles,
      blockedChannels: draft.blockedChannels,
      cooldown: draft.cooldown,
      cooldownType: draft.cooldownType,
    };

    try {
      if (modal.editing) {
        await api.guild.updateCustomCommand(guildId!, modal.editing.id, payload);
        show("Command updated!", "success");
      } else {
        await api.guild.createCustomCommand(guildId!, { id: generateId(), ...payload });
        show("Command created!", "success");
      }
      setModal({ open: false });
      load();
    } catch (e: any) {
      show(e.message ?? "Failed", "error");
    }
  };

  const remove = async (cmd: any) => {
    if (!guildId || !confirm(`Delete command "${cmd.trigger}"?`)) return;
    try {
      await api.guild.deleteCustomCommand(guildId, cmd.id);
      show("Deleted", "success");
      load();
    } catch (e: any) {
      show(e.message ?? "Failed", "error");
    }
  };

  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? id;
  const channelName = (id: string) => channels.find(c => c.id === id)?.name ?? id;
  const cdLabel = (type: string) => ({ user: "per user", channel: "per channel", global: "server-wide" }[type] ?? type);

  if (loading) return <Spinner />;

  const TAB_STYLE = (active: boolean) => ({
    padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
    background: active ? "var(--accent-dim)" : "transparent",
    color: active ? "var(--accent)" : "var(--text-secondary)",
    border: active ? "1px solid rgba(240,165,0,0.3)" : "1px solid transparent",
    transition: "all 0.15s",
  });

  return (
    <div style={{ padding: "32px 32px 48px", maxWidth: 820 }}>
      {ToastEl}
      <PageHeader
        title="Custom Commands"
        subtitle={`${commands.length} / ${CAP} commands — triggered with the server prefix`}
      >
        {commands.length < CAP && <Button onClick={() => openCreate()}><Plus size={14} /> New Command</Button>}
      </PageHeader>

      {commands.length < CAP && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Quick Presets</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {PRESETS.filter(p => !commands.find(c => c.trigger === p.trigger)).map(p => (
              <Button key={p.trigger} size="sm" variant="secondary" onClick={() => openCreate(p)}>
                <Plus size={12} /> Add <code style={{ background: "var(--bg-input)", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>{p.trigger}</code> preset
              </Button>
            ))}
            {PRESETS.every(p => commands.find(c => c.trigger === p.trigger)) && (
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>All presets already added.</span>
            )}
          </div>
        </Card>
      )}

      {commands.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Terminal size={40} />}
            title="No custom commands"
            description={`Create up to ${CAP} custom commands that respond with a fixed message when triggered.`}
            action={<Button onClick={() => openCreate()}><Plus size={14} /> Create Command</Button>}
          />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {commands.map(cmd => {
            const hasAllow = (cmd.allowedRoles?.length > 0) || (cmd.allowedChannels?.length > 0);
            const hasBlock = (cmd.blockedRoles?.length > 0) || (cmd.blockedChannels?.length > 0);
            const hasCd = (cmd.cooldown ?? 0) > 0;
            const hasEmbed = cmd.embed?.enabled;
            return (
              <Card key={cmd.id} style={{ padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <Badge color="accent"><code style={{ fontSize: 12 }}>{cmd.trigger}</code></Badge>
                    {hasEmbed && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#5865f2", background: "rgba(88,101,242,0.12)", border: "1px solid rgba(88,101,242,0.25)", padding: "2px 7px", borderRadius: 10 }}>
                        <Layout size={10} /> Embed
                      </span>
                    )}
                    {hasCd && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#f0a500", background: "rgba(240,165,0,0.12)", border: "1px solid rgba(240,165,0,0.25)", padding: "2px 7px", borderRadius: 10 }}>
                        <Clock size={10} /> {cmd.cooldown}s {cdLabel(cmd.cooldownType)}
                      </span>
                    )}
                    {hasAllow && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#3ba55d", background: "rgba(59,165,93,0.12)", border: "1px solid rgba(59,165,93,0.25)", padding: "2px 7px", borderRadius: 10 }}>
                        <ShieldCheck size={10} /> Restricted
                      </span>
                    )}
                    {hasBlock && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#ed4245", background: "rgba(237,66,69,0.12)", border: "1px solid rgba(237,66,69,0.25)", padding: "2px 7px", borderRadius: 10 }}>
                        <ShieldOff size={10} /> Blacklisted
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "pre-wrap", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
                    {cmd.response || (hasEmbed ? `[Embed: ${cmd.embed?.title || cmd.embed?.description || "no title"}]` : "—")}
                  </div>
                  {(hasAllow || hasBlock) && (
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {(cmd.allowedRoles ?? []).map((id: string) => (
                        <span key={id} style={{ fontSize: 10, background: "rgba(59,165,93,0.1)", color: "#3ba55d", padding: "1px 6px", borderRadius: 8, border: "1px solid rgba(59,165,93,0.2)" }}>✅ @{roleName(id)}</span>
                      ))}
                      {(cmd.allowedChannels ?? []).map((id: string) => (
                        <span key={id} style={{ fontSize: 10, background: "rgba(59,165,93,0.1)", color: "#3ba55d", padding: "1px 6px", borderRadius: 8, border: "1px solid rgba(59,165,93,0.2)" }}>✅ #{channelName(id)}</span>
                      ))}
                      {(cmd.blockedRoles ?? []).map((id: string) => (
                        <span key={id} style={{ fontSize: 10, background: "rgba(237,66,69,0.1)", color: "#ed4245", padding: "1px 6px", borderRadius: 8, border: "1px solid rgba(237,66,69,0.2)" }}>🚫 @{roleName(id)}</span>
                      ))}
                      {(cmd.blockedChannels ?? []).map((id: string) => (
                        <span key={id} style={{ fontSize: 10, background: "rgba(237,66,69,0.1)", color: "#ed4245", padding: "1px 6px", borderRadius: 8, border: "1px solid rgba(237,66,69,0.2)" }}>🚫 #{channelName(id)}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <Button size="sm" variant="secondary" onClick={() => openEdit(cmd)}><Edit2 size={12} /></Button>
                  <Button size="sm" variant="danger" onClick={() => remove(cmd)}><Trash2 size={12} /></Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modal.open} onClose={() => setModal({ open: false })} title={modal.editing ? "Edit Command" : "New Custom Command"} width={660}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Trigger */}
          <div>
            <Input
              label="Trigger (without prefix)"
              value={draft.trigger}
              onChange={v => setDraft(d => ({ ...d, trigger: v }))}
              placeholder="e.g. rules, hello, warm"
            />
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Letters, numbers, underscores only. Max 32 chars. Spaces become underscores.</div>
            {isTriggerReserved && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--danger-dim)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 7, fontSize: 12, color: "var(--danger)" }}>
                ⛔ <strong>{liveTrigger}</strong> is a built-in bot command — choose a different trigger.
              </div>
            )}
            {isTriggerShortcut && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--danger-dim)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 7, fontSize: 12, color: "var(--danger)" }}>
                ⛔ <strong>{liveTrigger}</strong> is already a shortcut. Delete the shortcut first or choose a different trigger.
              </div>
            )}
            {isTriggerDupeCC && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--danger-dim)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 7, fontSize: 12, color: "var(--danger)" }}>
                ⛔ A custom command with trigger <strong>{liveTrigger}</strong> already exists.
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
            <button onClick={() => setTab("response")} style={TAB_STYLE(tab === "response")}>💬 Response</button>
            <button onClick={() => setTab("embed")} style={TAB_STYLE(tab === "embed")}>
              <Layout size={11} style={{ display: "inline", marginRight: 4 }} />
              Embed {draft.embed.enabled && <span style={{ marginLeft: 4, background: "#5865f222", color: "#5865f2", border: "1px solid #5865f255", borderRadius: 8, padding: "0 5px", fontSize: 10 }}>ON</span>}
            </button>
            <button onClick={() => setTab("access")} style={TAB_STYLE(tab === "access")}>
              <Lock size={11} style={{ display: "inline", marginRight: 4 }} />
              Access & Cooldown
            </button>
          </div>

          {/* Response Tab */}
          {tab === "response" && (
            <div>
              <TextArea
                label="Response"
                value={draft.response}
                onChange={v => setDraft(d => ({ ...d, response: v }))}
                placeholder={draft.embed.enabled ? "Optional plain text shown above the embed…" : "What the bot replies with…"}
                rows={4}
              />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                <span>Supports Discord markdown. Variables work here too.</span>
                <span style={{ color: draft.response.length > 2000 ? "var(--danger)" : "var(--text-muted)" }}>{draft.response.length}/2000</span>
              </div>
              <VarRef />
            </div>
          )}

          {/* Embed Tab */}
          {tab === "embed" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg-input)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Enable Embed</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Bot sends a rich Discord embed for this command</div>
                </div>
                <button
                  onClick={() => setEmbed("enabled", !draft.embed.enabled)}
                  style={{
                    width: 42, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                    background: draft.embed.enabled ? "var(--accent)" : "var(--bg-secondary)",
                    position: "relative", transition: "background 0.2s", flexShrink: 0,
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    position: "absolute", top: 3, transition: "left 0.2s",
                    left: draft.embed.enabled ? 21 : 3,
                  }} />
                </button>
              </div>

              {draft.embed.enabled && (
                <>
                  {/* Color + Author row */}
                  <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 10 }}>
                    <div>
                      <SectionLabel>Color</SectionLabel>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="color"
                          value={draft.embed.color || "#5865f2"}
                          onChange={e => setEmbed("color", e.target.value)}
                          style={{ width: 38, height: 34, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-input)", cursor: "pointer", padding: 2 }}
                        />
                        <input
                          value={draft.embed.color || "#5865f2"}
                          onChange={e => setEmbed("color", e.target.value)}
                          style={{ flex: 1, padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, outline: "none", fontFamily: "monospace" }}
                          placeholder="#5865f2"
                        />
                      </div>
                    </div>
                    <div>
                      <SectionLabel>Author Text</SectionLabel>
                      <input
                        value={draft.embed.author}
                        onChange={e => setEmbed("author", e.target.value)}
                        placeholder="Small text above the title (supports variables)"
                        style={{ width: "100%", padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <SectionLabel>Title</SectionLabel>
                    <input
                      value={draft.embed.title}
                      onChange={e => setEmbed("title", e.target.value)}
                      placeholder="Embed title (supports variables)"
                      maxLength={256}
                      style={{ width: "100%", padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <SectionLabel>Description</SectionLabel>
                    <textarea
                      value={draft.embed.description}
                      onChange={e => setEmbed("description", e.target.value)}
                      placeholder="Main body text (supports variables and Discord markdown)"
                      rows={4}
                      maxLength={4096}
                      style={{ width: "100%", padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                  </div>

                  {/* Footer */}
                  <div>
                    <SectionLabel>Footer Text</SectionLabel>
                    <input
                      value={draft.embed.footer}
                      onChange={e => setEmbed("footer", e.target.value)}
                      placeholder="Small text at the bottom (supports variables)"
                      maxLength={2048}
                      style={{ width: "100%", padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  {/* Image / Thumbnail */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <SectionLabel>Image URL</SectionLabel>
                      <input
                        value={draft.embed.imageUrl}
                        onChange={e => setEmbed("imageUrl", e.target.value)}
                        placeholder="https://… (large image)"
                        style={{ width: "100%", padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <SectionLabel>Thumbnail URL</SectionLabel>
                      <input
                        value={draft.embed.thumbnailUrl}
                        onChange={e => setEmbed("thumbnailUrl", e.target.value)}
                        placeholder="https://… (small corner image)"
                        style={{ width: "100%", padding: "7px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-primary)", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>

                  <EmbedPreview embed={draft.embed} response={draft.response} />
                </>
              )}
            </div>
          )}

          {/* Access & Cooldown Tab */}
          {tab === "access" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Cooldown */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Clock size={14} style={{ color: "var(--text-secondary)" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Cooldown</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— 0 = disabled</span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 110 }}>
                    <Input
                      label="Seconds"
                      value={String(draft.cooldown)}
                      onChange={v => setDraft(d => ({ ...d, cooldown: Math.max(0, Math.min(3600, Number(v) || 0)) }))}
                      placeholder="0"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>Scope</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {(["user", "channel", "global"] as const).map(t => (
                        <button key={t} onClick={() => setDraft(d => ({ ...d, cooldownType: t }))} style={{
                          padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: draft.cooldownType === t ? "var(--accent-dim)" : "var(--bg-input)",
                          color: draft.cooldownType === t ? "var(--accent)" : "var(--text-secondary)",
                          border: draft.cooldownType === t ? "1px solid rgba(240,165,0,0.3)" : "1px solid var(--border)",
                          transition: "all 0.15s",
                        }}>
                          {t === "user" ? "Per User" : t === "channel" ? "Per Channel" : "Server-wide"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Access Control */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <Lock size={14} style={{ color: "var(--text-secondary)" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Access Control</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— leave all blank for everyone</span>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <SectionLabel><ShieldCheck size={10} style={{ display: "inline", marginRight: 4 }} />Allowed Roles <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(whitelist)</span></SectionLabel>
                  <PillToggle items={roles.map(r => ({ id: r.id, name: `@${r.name}` }))} selected={draft.allowedRoles} onToggle={id => toggleArr("allowedRoles", id)} color="#3ba55d" />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <SectionLabel><Hash size={10} style={{ display: "inline", marginRight: 4 }} />Allowed Channels <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(whitelist)</span></SectionLabel>
                  <PillToggle items={channels.map(c => ({ id: c.id, name: `#${c.name}` }))} selected={draft.allowedChannels} onToggle={id => toggleArr("allowedChannels", id)} color="#3ba55d" />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <SectionLabel><ShieldOff size={10} style={{ display: "inline", marginRight: 4 }} />Blocked Roles <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(blacklist)</span></SectionLabel>
                  <PillToggle items={roles.map(r => ({ id: r.id, name: `@${r.name}` }))} selected={draft.blockedRoles} onToggle={id => toggleArr("blockedRoles", id)} color="#ed4245" />
                </div>

                <div>
                  <SectionLabel><Hash size={10} style={{ display: "inline", marginRight: 4 }} />Blocked Channels <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(blacklist)</span></SectionLabel>
                  <PillToggle items={channels.map(c => ({ id: c.id, name: `#${c.name}` }))} selected={draft.blockedChannels} onToggle={id => toggleArr("blockedChannels", id)} color="#ed4245" />
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <Button variant="secondary" onClick={() => setModal({ open: false })}>Cancel</Button>
            <Button onClick={save} disabled={isTriggerReserved || isTriggerShortcut || isTriggerDupeCC}>{modal.editing ? "Update" : "Create"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

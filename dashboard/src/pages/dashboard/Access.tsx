import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, Button, Input, PageHeader, Spinner, useToast } from "../../components/ui";
import { Trash2, UserPlus, Eye, Pencil } from "lucide-react";

interface AccessEntry {
  id: string;
  tag: string;
  avatar: string | null;
  permission: "view" | "edit";
}

export default function Access() {
  const { guildId } = useParams<{ guildId: string }>();
  const { show, ToastEl } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [newUserId, setNewUserId] = useState("");
  const [newPermission, setNewPermission] = useState<"view" | "edit">("view");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!guildId) return;
    api.guild.dashboardAccess(guildId)
      .then(setEntries)
      .catch(() => show("Failed to load access list", "error"))
      .finally(() => setLoading(false));
  }, [guildId]);

  const handleAdd = async () => {
    if (!guildId || !newUserId.trim()) return;
    setAdding(true);
    try {
      const entry = await api.guild.addDashboardAccess(guildId, newUserId.trim(), newPermission);
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === entry.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = entry;
          return next;
        }
        return [...prev, entry];
      });
      setNewUserId("");
      show(`Added ${entry.tag}`, "success");
    } catch (e: any) {
      show(e.message ?? "Failed to add user", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleChangePermission = async (userId: string, permission: "view" | "edit") => {
    if (!guildId) return;
    try {
      await api.guild.updateDashboardAccess(guildId, userId, permission);
      setEntries((prev) =>
        prev.map((e) => (e.id === userId ? { ...e, permission } : e))
      );
      show("Permission updated", "success");
    } catch (e: any) {
      show(e.message ?? "Failed to update", "error");
    }
  };

  const handleRemove = async (userId: string, tag: string) => {
    if (!guildId) return;
    try {
      await api.guild.removeDashboardAccess(guildId, userId);
      setEntries((prev) => prev.filter((e) => e.id !== userId));
      show(`Removed ${tag}`, "success");
    } catch (e: any) {
      show(e.message ?? "Failed to remove", "error");
    }
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: "32px 32px 96px", maxWidth: 720 }}>
      {ToastEl}
      <PageHeader
        title="Dashboard Access"
        subtitle="Grant staff members access to this server's dashboard. Only you (the server owner) can manage access."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Card>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>
            <UserPlus size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Add Staff Member
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input
              label="Discord User ID"
              value={newUserId}
              onChange={setNewUserId}
              placeholder="123456789012345678"
              hint="Right-click a user in Discord → Copy User ID (enable Developer Mode in settings)"
            />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Permission Level</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["view", "edit"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setNewPermission(p)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: `2px solid ${newPermission === p ? "var(--accent)" : "var(--border)"}`,
                      background: newPermission === p ? "rgba(99,102,241,0.15)" : "var(--bg-input)",
                      color: newPermission === p ? "var(--accent)" : "var(--text-secondary)",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: "inherit",
                    }}
                  >
                    {p === "view" ? <Eye size={14} /> : <Pencil size={14} />}
                    {p === "view" ? "View Only" : "Can Edit"}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                {newPermission === "view"
                  ? "Can read all configuration but cannot make changes."
                  : "Can read and modify all configuration."}
              </div>
            </div>
            <div>
              <Button onClick={handleAdd} disabled={adding || !newUserId.trim()}>
                {adding ? "Adding…" : "Add User"}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>
            Staff with Access ({entries.length})
          </h2>
          {entries.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "16px 0" }}>
              No staff members have been granted access yet. Add someone above.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                >
                  {entry.avatar ? (
                    <img
                      src={`https://cdn.discordapp.com/avatars/${entry.id}/${entry.avatar}.png?size=32`}
                      alt=""
                      style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%", background: "var(--bg-card)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, fontWeight: 700, color: "var(--text-muted)", flexShrink: 0,
                    }}>
                      {entry.tag[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.tag}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{entry.id}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <select
                      value={entry.permission}
                      onChange={(e) => handleChangePermission(entry.id, e.target.value as "view" | "edit")}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--bg-card)",
                        color: "var(--text-primary)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <option value="view">View Only</option>
                      <option value="edit">Can Edit</option>
                    </select>
                    <button
                      onClick={() => handleRemove(entry.id, entry.tag)}
                      title="Remove access"
                      style={{
                        padding: 6,
                        borderRadius: 6,
                        border: "1px solid rgba(239,68,68,0.3)",
                        background: "var(--danger-dim)",
                        color: "var(--danger)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div style={{ padding: "12px 16px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)" }}>
          💡 Staff members need to <strong>log into the dashboard</strong> with their Discord account to access this server. They will only see servers where they have been granted access.
        </div>
      </div>
    </div>
  );
}

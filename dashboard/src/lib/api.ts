async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error((err as any).error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    me: () => request<{ id: string; tag: string; avatar?: string }>("/auth/me"),
    guilds: () => request<any[]>("/auth/guilds"),
    refreshGuilds: () => request<{ guilds: any[] }>("/auth/refresh-guilds", { method: "POST" }),
    logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  },
  stats: () => request<any>("/stats"),
  assistant: {
    history: () => request<{ messages: any[]; memory: any }>("/assistant"),
    send: (message: string, history: any[]) =>
      request<{ reply: string; memory: any }>("/assistant", {
        method: "POST",
        body: JSON.stringify({ message, history }),
      }),
    clear: () => request<{ ok: boolean }>("/assistant", { method: "DELETE" }),
  },
  guild: {
    overview: (id: string) => request<any>(`/guilds/${id}/overview`),
    settings: (id: string) => request<any>(`/guilds/${id}/settings`),
    updateSettings: (id: string, data: any) =>
      request<any>(`/guilds/${id}/settings`, { method: "PUT", body: JSON.stringify(data) }),
    channels: (id: string) => request<any[]>(`/guilds/${id}/channels`),
    channelsWithVoice: (id: string) => request<any[]>(`/guilds/${id}/channels?voice=true`),
    roles: (id: string) => request<any[]>(`/guilds/${id}/roles`),
    shortcuts: (id: string) => request<any[]>(`/guilds/${id}/shortcuts`),
    createShortcut: (id: string, data: any) =>
      request<any>(`/guilds/${id}/shortcuts`, { method: "POST", body: JSON.stringify(data) }),
    deleteShortcut: (id: string, name: string) =>
      request<any>(`/guilds/${id}/shortcuts/${encodeURIComponent(name)}`, { method: "DELETE" }),
    commands: (id: string) => request<{ disabled: string[] }>(`/guilds/${id}/commands`),
    updateCommands: (id: string, disabled: string[]) =>
      request<any>(`/guilds/${id}/commands`, { method: "PUT", body: JSON.stringify({ disabled }) }),
    commandPerms: (id: string) => request<Record<string, any>>(`/guilds/${id}/command-perms`),
    updateCommandPerm: (id: string, data: Record<string, any>) =>
      request<any>(`/guilds/${id}/command-perms`, { method: "PUT", body: JSON.stringify(data) }),
    cases: (id: string) => request<any[]>(`/guilds/${id}/cases`),
    caseDetail: (id: string, caseId: string) => request<any>(`/guilds/${id}/cases/${caseId}`),
    punishments: (id: string) => request<any[]>(`/guilds/${id}/punishments`),
    logging: (id: string) => request<any>(`/guilds/${id}/logging`),
    updateLogging: (id: string, data: any) =>
      request<any>(`/guilds/${id}/logging`, { method: "PUT", body: JSON.stringify(data) }),
    auditLog: (id: string) => request<any>(`/guilds/${id}/audit-log`),
    muteConfig: (id: string) => request<any>(`/guilds/${id}/mute-config`),
    updateMuteConfig: (id: string, data: any) =>
      request<any>(`/guilds/${id}/mute-config`, { method: "PUT", body: JSON.stringify(data) }),
    additionalInfo: (id: string) => request<any>(`/guilds/${id}/additional-info`),
    updateAdditionalInfo: (id: string, data: any) =>
      request<any>(`/guilds/${id}/additional-info`, { method: "PUT", body: JSON.stringify(data) }),
    securityAccess: (id: string) => request<{ canEditAntiraid: boolean; canEditAntinuke: boolean }>(`/guilds/${id}/security-access`),
    antinuke: (id: string) => request<any>(`/guilds/${id}/antinuke`),
    updateAntinuke: (id: string, data: any) =>
      request<any>(`/guilds/${id}/antinuke`, { method: "PUT", body: JSON.stringify(data) }),
    antiraid: (id: string) => request<any>(`/guilds/${id}/antiraid`),
    updateAntiraid: (id: string, data: any) =>
      request<any>(`/guilds/${id}/antiraid`, { method: "PUT", body: JSON.stringify(data) }),
    ticketCategories: (id: string) => request<any[]>(`/guilds/${id}/ticket-categories`),
    ticketConfig: (id: string) => request<any>(`/guilds/${id}/ticket-config`),
    updateTicketConfig: (id: string, data: any) =>
      request<any>(`/guilds/${id}/ticket-config`, { method: "PUT", body: JSON.stringify(data) }),
    ticketPanels: (id: string) => request<any[]>(`/guilds/${id}/ticket-panels`),
    createTicketPanel: (id: string, data: any) =>
      request<any>(`/guilds/${id}/ticket-panels`, { method: "POST", body: JSON.stringify(data) }),
    updateTicketPanel: (id: string, panelId: string, data: any) =>
      request<any>(`/guilds/${id}/ticket-panels/${panelId}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteTicketPanel: (id: string, panelId: string) =>
      request<any>(`/guilds/${id}/ticket-panels/${panelId}`, { method: "DELETE" }),
    sendTicketPanel: (id: string, panelId: string) =>
      request<any>(`/guilds/${id}/ticket-panels/${panelId}/send`, { method: "POST" }),
    tickets: (id: string) => request<any[]>(`/guilds/${id}/tickets`),
    updateTicket: (id: string, ticketId: string, data: any) =>
      request<any>(`/guilds/${id}/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify(data) }),
    botStatus: (id: string) => request<{ present: boolean }>(`/guilds/${id}/bot-status`),
    moderationConfig: (id: string) => request<any>(`/guilds/${id}/moderation`),
    updateModerationConfig: (id: string, data: any) =>
      request<any>(`/guilds/${id}/moderation`, { method: "PUT", body: JSON.stringify(data) }),
    customCommands: (id: string) => request<any[]>(`/guilds/${id}/custom-commands`),
    createCustomCommand: (id: string, data: any) =>
      request<any>(`/guilds/${id}/custom-commands`, { method: "POST", body: JSON.stringify(data) }),
    updateCustomCommand: (id: string, cmdId: string, data: any) =>
      request<any>(`/guilds/${id}/custom-commands/${cmdId}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteCustomCommand: (id: string, cmdId: string) =>
      request<any>(`/guilds/${id}/custom-commands/${cmdId}`, { method: "DELETE" }),
    deleteCase: (id: string, caseId: string) =>
      request<any>(`/guilds/${id}/cases/${caseId}`, { method: "DELETE" }),
    yamlConfig: (id: string) => request<{ yaml: string }>(`/guilds/${id}/yaml-config`),
    updateYamlConfig: (id: string, yamlText: string) =>
      request<any>(`/guilds/${id}/yaml-config`, { method: "PUT", body: JSON.stringify({ yaml: yamlText }) }),
    myAccess: (id: string) => request<{ role: string; permission: "view" | "edit" }>(`/guilds/${id}/my-access`),
    dashboardAccess: (id: string) => request<any[]>(`/guilds/${id}/dashboard-access`),
    addDashboardAccess: (id: string, userId: string, permission: "view" | "edit") =>
      request<any>(`/guilds/${id}/dashboard-access`, { method: "POST", body: JSON.stringify({ userId, permission }) }),
    updateDashboardAccess: (id: string, userId: string, permission: "view" | "edit") =>
      request<any>(`/guilds/${id}/dashboard-access/${userId}`, { method: "PATCH", body: JSON.stringify({ permission }) }),
    removeDashboardAccess: (id: string, userId: string) =>
      request<any>(`/guilds/${id}/dashboard-access/${userId}`, { method: "DELETE" }),
  },
};

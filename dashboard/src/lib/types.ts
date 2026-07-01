export interface User {
  id: string;
  tag: string;
  avatar?: string;
}

export interface Guild {
  id: string;
  name: string;
  icon?: string;
  owner: boolean;
  permissions: string;
}

export interface BotStats {
  guildCount: number;
  userCount: number;
  uptimeMs: number;
  status: "online" | "degraded" | "offline";
  commandCount: number;
}

export interface GuildSettings {
  prefix: string;
  logChannelId?: string;
  serverLogChannelId?: string;
  warnExpiryMonths?: number;
}

export interface AutomodConfig {
  filter?: { enabled: boolean; words: string[] };
  invite?: { enabled: boolean };
  mention?: { enabled: boolean; threshold: number };
  spam?: { enabled: boolean; limit: number; windowMs: number };
  duplicate?: { enabled: boolean; count: number };
  charFlood?: { enabled: boolean; maxRepeat: number; maxEmoji: number };
  linkSpam?: { enabled: boolean; limit: number; windowMs: number };
  urlFilter?: { enabled: boolean; mode: "whitelist" | "blacklist"; domains: string[] };
  wallText?: { enabled: boolean; maxLength: number; maxLines: number };
  exemptRoles?: string[];
  exemptChannels?: string[];
  silent?: boolean;
  punishment?: { steps: PunishmentStep[] };
}

export interface PunishmentStep {
  strikes: number;
  action: "warn" | "mute" | "kick" | "ban";
  duration?: string;
}

export interface Shortcut {
  name: string;
  type: "warn" | "mute" | "kick" | "ban";
  reason: string;
  duration?: string;
}

export interface Case {
  id: string;
  type: string;
  reason: string;
  moderatorId: string;
  moderatorTag: string;
  timestamp: number;
  expiresAt?: number;
  userId: string;
  automod?: boolean;
}

export interface ActivePunishment {
  type: "ban" | "mute";
  guildId: string;
  userId: string;
  userTag: string;
  reason: string;
  expiresAt?: number;
  remainingMs?: number;
  moderatorId?: string;
  moderatorTag?: string;
}

export interface Channel {
  id: string;
  name: string;
  type: number;
  position?: number;
}

export interface Role {
  id: string;
  name: string;
  color: number;
  position: number;
}

export interface CommandPerm {
  allowedRoles: string[];
  deniedRoles: string[];
  allowedChannels: string[];
  deniedChannels: string[];
}

export interface FormQuestion {
  id: string;
  label: string;
  type: "short" | "long" | "choice";
  required: boolean;
  choices?: string[];
}

export interface ApplicationForm {
  id: string;
  title: string;
  description: string;
  questions: FormQuestion[];
  responseChannelId?: string;
  active: boolean;
  createdAt: number;
}

export interface FormSubmission {
  id: string;
  formId: string;
  formTitle: string;
  userId: string;
  userTag: string;
  answers: Record<string, string>;
  submittedAt: number;
  status: "pending" | "approved" | "denied";
  reviewNote?: string;
}

export interface AuditLogEntry {
  id: string;
  action_type: number;
  actionName: string;
  user_id?: string;
  target_id?: string;
  reason?: string;
}

export interface AuditLogUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string;
  avatar?: string;
}

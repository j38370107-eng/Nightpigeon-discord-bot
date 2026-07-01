import { getCachedConfig } from "../store/guildConfig";

// YAML schema types
export interface TicketEmbedConfig {
  title?: string;
  description?: string;
  color?: string;
  footer?: string;
  thumbnail?: string;
  image?: string;
}

export interface TicketOpeningQuestion {
  label: string;
  placeholder?: string;
  style: "short" | "paragraph";
  required?: boolean;
  max_length?: number;
}

export interface TicketOpeningForm {
  enabled: boolean;
  questions: TicketOpeningQuestion[];
}

export interface TicketCategoryConfig {
  name: string;
  channel_name: string;
  channel_category: string;
  ping_roles?: string[];
  support_roles?: string[];
  max_open_per_user?: number;
  cooldown?: string;
  auto_close_after?: string;
  auto_close_warning?: string;
  welcome_message?: TicketEmbedConfig;
  opening_form?: TicketOpeningForm;
}

export interface TicketPanelButtonConfig {
  label: string;
  emoji?: string;
  style?: "PRIMARY" | "SECONDARY" | "SUCCESS" | "DANGER";
}

export interface TicketPanelSelectOption {
  label: string;
  description?: string;
  emoji?: string;
  value: string;
}

export interface TicketPanelConfig {
  channel: string;
  message?: TicketEmbedConfig;
  button?: TicketPanelButtonConfig;
  select_menu?: {
    placeholder?: string;
    options: TicketPanelSelectOption[];
  };
}

export interface TicketButtonConfig {
  enabled?: boolean;
  label?: string;
  emoji?: string;
  style?: "PRIMARY" | "SECONDARY" | "SUCCESS" | "DANGER";
  require_reason?: boolean;
  reason_placeholder?: string;
  confirm?: boolean;
  confirm_message?: string;
  restrict_on_claim?: boolean;
}

export interface TicketButtonsConfig {
  close?: TicketButtonConfig;
  claim?: TicketButtonConfig;
  unclaim?: TicketButtonConfig;
  add_user?: TicketButtonConfig;
  remove_user?: TicketButtonConfig;
  transcript?: TicketButtonConfig;
}

export interface TicketCloseConfig {
  action?: "archive" | "delete";
  archive_category?: string;
  delete_after?: string;
  dm_on_close?: boolean;
  dm_message?: TicketEmbedConfig;
  send_transcript_on_close?: boolean;
  close_message?: TicketEmbedConfig;
}

export interface TicketTranscriptConfig {
  enabled?: boolean;
  channel?: string;
  format?: "html" | "txt";
  include_attachments?: boolean;
  message?: TicketEmbedConfig;
}

export interface TicketFeedbackRating {
  emoji: string;
  label: string;
  value: number;
}

export interface TicketFeedbackConfig {
  enabled?: boolean;
  dm_user?: boolean;
  channel?: string;
  dm_message?: TicketEmbedConfig;
  ratings?: TicketFeedbackRating[];
  result_message?: TicketEmbedConfig;
}

export interface TicketLoggingConfig {
  channel?: string;
  events?: Record<string, boolean>;
  messages?: Record<string, TicketEmbedConfig>;
}

export interface TicketCommandsConfig {
  prefix?: string;
  allowed_roles?: string[];
}

export interface TicketPluginConfig {
  panels?: Record<string, TicketPanelConfig>;
  categories?: Record<string, TicketCategoryConfig>;
  buttons?: TicketButtonsConfig;
  close?: TicketCloseConfig;
  transcripts?: TicketTranscriptConfig;
  feedback?: TicketFeedbackConfig;
  logging?: TicketLoggingConfig;
  commands?: TicketCommandsConfig;
}

// Accessor helpers
export function getTicketConfig(guildId: string): TicketPluginConfig | null {
  const cfg = getCachedConfig(guildId);
  const raw = (cfg as any)?.tickets?.config as TicketPluginConfig | undefined;
  return raw ?? null;
}

export function getCategoryConfig(guildId: string, categoryKey: string): TicketCategoryConfig | null {
  return getTicketConfig(guildId)?.categories?.[categoryKey] ?? null;
}

export function isStaffMember(guildId: string, userId: string, roleIds: string[]): boolean {
  const cfg = getTicketConfig(guildId);
  if (!cfg) return false;
  const allowedRoles = cfg.commands?.allowed_roles ?? [];
  return roleIds.some((r) => allowedRoles.includes(r));
}

// Duration parser
// Parses strings like "5m", "2h", "24h", "7d" into milliseconds.
// Returns 0 if the value is "0" or falsy.

export function parseDuration(raw?: string): number {
  if (!raw || raw === "0") return 0;
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)$/i);
  if (!match) return 0;
  const n = parseFloat(match[1]!);
  switch (match[2]!.toLowerCase()) {
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 3600 * 1000;
    case "d": return n * 86400 * 1000;
    case "w": return n * 7 * 86400 * 1000;
    default:  return 0;
  }
}

export function formatDuration(ms: number): string {
  if (ms < 60_000)            return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000)         return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000)        return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

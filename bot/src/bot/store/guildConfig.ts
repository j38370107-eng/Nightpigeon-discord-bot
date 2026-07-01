import yaml from "js-yaml";
import { pool } from "./db";
import { logger } from "../../lib/logger";

// Basic embed / message types
export interface YamlEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface YamlEmbed {
  title?: string;
  description?: string;
  color?: string;
  thumbnail?: string;
  image?: string;
  footer?: string;
  fields?: YamlEmbedField[];
}

export type YamlMessage = string | { embed: YamlEmbed } | { content?: string; embed: YamlEmbed };

// Levels
export interface LevelsConfig {
  users: Record<string, number>;
  roles: Record<string, number>;
  commands: Record<string, number>;
}

// Logging config types (3-category schema)
//
// logging:
//   config:
//     default_channels:
//       server: "CHANNEL_ID"
//       moderation: "CHANNEL_ID"
//       mass_action: "CHANNEL_ID"
//     channels:                          # named aliases referenced in events maps
//       message_logs: "CHANNEL_ID"
//       mod_logs: "CHANNEL_ID"
//     server:
//       events:
//         message_delete: message_logs   # ← alias from channels above
//       enabled:
//         message_delete: true
//       messages:
//         message_delete:
//           title: "Message Deleted"
//           description: "..."
//           color: "ED4245"
//     moderation:
//       events:
//         ban: mod_logs
//       enabled:
//         ban: true
//       messages:
//         ban:
//           title: "Member Banned"
//           description: "..."
//     mass_action:
//       events:
//         massban: mod_logs
//       enabled:
//         massban: true
//       messages:
//         massban:
//           title: "Mass Ban"
//           description: "..."

export interface YamlLoggingCategoryConfig {
  /** eventKey → channel alias (name in channels{}) or raw channel ID */
  events?: Record<string, string>;
  /** eventKey → enabled toggle; defaults to true when absent */
  enabled?: Record<string, boolean>;
  /** eventKey → inline embed template (title/description/color/fields) */
  messages?: Record<string, YamlEmbed>;
}

export interface YamlLoggingConfig {
  // New 3-category schema
  /** Per-category fallback channel IDs */
  default_channels?: {
    server?: string;
    moderation?: string;
    mass_action?: string;
  };
  /** Named channel aliases: alias → Discord channel ID */
  channels?: Record<string, string>;
  /** Server events (messages, members, voice, threads, roles, channels) */
  server?: YamlLoggingCategoryConfig;
  /** Single-target moderation actions (ban, kick, warn, mute, etc.) */
  moderation?: YamlLoggingCategoryConfig;
  /** Bulk operations (massban, massrole, prune, etc.) */
  mass_action?: YamlLoggingCategoryConfig;

  // Legacy flat schema (backward compat)
  /** @deprecated Use default_channels.server instead */
  default_log_channel?: string;
  /** @deprecated Use server.events instead */
  events?: Record<string, string>;
  /** @deprecated Use server.enabled instead */
  enabled?: Record<string, boolean>;
}

// Automod config types
export interface YamlAutomodConditions {
  ignore_roles?: string[];
  ignore_channels?: string[];
  only_channels?: string[];
  ignore_users?: string[];
  only_users?: string[];
}

export interface YamlAutomodTrigger {
  type: string;

  // message_spam — new field names
  max_messages?: number;
  within_seconds?: number;
  per_channel?: boolean;
  // message_spam — legacy field names (backward compat)
  limit?: number;
  window?: string;

  // word_filter
  words?: string[];
  match_type?: "word" | "substring" | "regex";
  case_sensitive?: boolean;

  // invite_link
  allow_own_server?: boolean;

  // link_filter — new field names
  block_all?: boolean;
  allowed_domains?: string[];
  blocked_domains?: string[];
  // link_filter — legacy field names (backward compat)
  domains?: string[];
  mode?: "blacklist" | "whitelist";

  // mention_spam — new field names
  max_mentions?: number;
  max_unique_mentions?: number;
  global_max_mentions?: number;
  // mention_spam — legacy field name (backward compat)
  threshold?: number;

  // caps_filter
  min_length?: number;
  percent?: number;
  percentage?: number; // legacy backward compat

  // emoji_spam
  max_emojis?: number;

  // attachment_filter
  blocked_extensions?: string[];

  // member_join — new field name
  account_age_below?: string;
  // member_join — legacy field name (backward compat)
  min_account_age?: string;

  // repeated_characters
  max_repeats?: number;

  // repeated_text
  max_duplicates?: number;
  normalize?: boolean;

  // newline_spam
  max_newlines?: number;

  // phishing
  custom_domains?: string[];

  // ghost_ping — no extra fields

  // wall_text
  max_length?: number;
}

export interface YamlAutomodAction {
  type: string;
  /** Duration string for mute/ban (e.g. "10m", "1h", "1d") */
  duration?: string;
  /** Role ID for add_role / remove_role */
  role?: string;
  /** Channel ID for send_message / log */
  channel?: string;
  /** Message content — preferred field name (send_message, dm_user, log) */
  content?: string;
  /** Alias for content — legacy field name kept for backward compatibility */
  message?: string;
  /** New nickname for set_nickname */
  nickname?: string;
  /** Number of messages to clean for clean action */
  count?: number;
  /** Reason string */
  reason?: string;
}

export interface YamlAutomodRule {
  enabled?: boolean;
  /** All triggers must fire (AND logic) */
  triggers: YamlAutomodTrigger[];
  conditions?: YamlAutomodConditions;
  actions: YamlAutomodAction[];
}

export interface YamlAutomodPluginConfig {
  enabled?: boolean;
  /** Role IDs whose members are exempt from ALL automod rules in this guild. */
  immunity_roles?: string[];
  rules?: Record<string, YamlAutomodRule>;
}

// Full guild config
// Tag system types
/**
 * A tag value can be:
 *   1. A plain string (including multi-line via YAML `|`)
 *   2. An embed-only object: `{ embed: { title, description, color, … } }`
 *   3. Content + embed: `{ content: "…", embed: { … } }`
 */
export type YamlTag =
  | string
  | { embed: YamlEmbed }
  | { content?: string; embed: YamlEmbed };

// Full guild config
// Welcome plugin config types
export interface WelcomeInviteTrackingConfig {
  enabled?: boolean;
  log_channel?: string | null;
  unknown_invite_label?: string;
  log_message?: YamlMessage;
  subtract_left?: boolean;
  subtract_banned?: boolean;
  leaderboard?: { enabled?: boolean };
  rewards?: {
    enabled?: boolean;
    milestones?: Array<{
      invites: number;
      role?: string | null;
      message?: YamlMessage | null;
    }>;
  };
  messages?: {
    invite_log?: YamlMessage;
    inviter_dm?: YamlMessage | null;
    milestone_reached?: YamlMessage;
    [key: string]: unknown;
  };
}

export interface WelcomePluginConfig {
  enabled?: boolean;
  invite_tracking?: WelcomeInviteTrackingConfig;
  welcome?: {
    enabled?: boolean;
    channel?: string | null;
    ping?: boolean;
    delete_after?: number | null;
    message?: YamlMessage;
  };
  goodbye?: {
    enabled?: boolean;
    channel?: string | null;
    delete_after?: number | null;
    message?: YamlMessage;
  };
  join_dm?: {
    enabled?: boolean;
    message?: YamlMessage;
  };
  welcome_role?: {
    enabled?: boolean;
    role?: string | null;
    roles?: string[];
    delay_seconds?: number;
    dm_on_assign?: boolean;
    messages?: {
      autorole_assigned?: YamlMessage;
      autorole_failed?: YamlMessage;
      [key: string]: unknown;
    };
  };
  rejoin_restore_roles?: {
    enabled?: boolean;
    ignore_roles?: string[];
    restore_nickname?: boolean;
    dm_on_restore?: boolean;
    messages?: {
      roles_restored?: YamlMessage;
      roles_restored_dm?: YamlMessage;
      [key: string]: unknown;
    };
  };
  member_count_channel?: {
    enabled?: boolean;
    channel?: string | null;
    format?: string;
    update_on?: "join" | "leave" | "both";
    extra_channels?: Array<{ channel?: string | null; format?: string }>;
  };
  welcome_back?: {
    enabled?: boolean;
    channel?: string | null;
    delete_after?: number | null;
    message?: YamlMessage;
  };
  messages?: {
    welcome_test_sent?: string;
    goodbye_test_sent?: string;
    welcomedm_test_sent?: string;
    test_failed?: string;
    [key: string]: unknown;
  };
}

export interface GuildConfig {
  prefix: string;
  levels: LevelsConfig;
  tags: Record<string, YamlTag>;
  /** Top-level `logging` key in YAML */
  logging?: {
    config?: YamlLoggingConfig;
  };
  /** Top-level `automod` key in YAML */
  automod?: {
    config?: YamlAutomodPluginConfig;
  };
  plugins: {
    command_aliases?: {
      config: { aliases: Record<string, string> };
    };
    preset_reasons?: {
      config: { presets: Record<string, string> };
    };
    moderation?: {
      enabled?: boolean;
      mute_role?: string | null;
      dm_on_action?: boolean;
      ban_day_delete?: number;
      messages?: Record<string, YamlMessage>;
      [key: string]: unknown;
    };
    utility?: {
      messages?: {
        tag_not_found?: YamlMessage | null;
        tag_list_empty?: YamlMessage | null;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    welcome?: WelcomePluginConfig;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Default config
export const DEFAULT_CONFIG: GuildConfig = {
  prefix: "!",
  levels: {
    users: {},
    roles: {},
    commands: {
      help: 0,
    },
  },
  tags: {},
  plugins: {
    command_aliases: {
      config: {
        aliases: {},
      },
    },
    preset_reasons: {
      config: { presets: {} },
    },
    moderation: {
      enabled: false,
      mute_role: null,
      dm_on_action: true,
      messages: {
        ban_success: "{user} has been banned | Case: {case_id}",
        unban_success: "{user} has been unbanned | Case: {case_id}",
        kick_success: "{user} has been kicked | Case: {case_id}",
        mute_success: "{user} has been muted | Case: {case_id}",
        unmute_success: "{user} has been unmuted | Case: {case_id}",
        warn_success: "{user} has been warned | Case: {case_id}",
        purge_success: "{count} messages deleted",
        slowmode_success: "Slowmode set to {count}s in {channel}",
        slowmode_off: "Slowmode removed in {channel}",
      },
    },
  },
};

// DB helpers
async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_configs (
      guild_id TEXT PRIMARY KEY,
      config   TEXT NOT NULL DEFAULT ''
    )
  `);
}

export async function getRawYaml(guildId: string): Promise<string | null> {
  const res = await pool.query(
    "SELECT config FROM guild_configs WHERE guild_id = $1",
    [guildId]
  );
  return (res.rows[0]?.config as string) ?? null;
}

export async function setRawYaml(guildId: string, rawYaml: string): Promise<void> {
  await pool.query(
    `INSERT INTO guild_configs (guild_id, config)
     VALUES ($1, $2)
     ON CONFLICT (guild_id) DO UPDATE SET config = EXCLUDED.config`,
    [guildId, rawYaml]
  );
}

// Cache
const CACHE_TTL_MS = 30_000;
const configCache = new Map<string, { data: GuildConfig; ts: number }>();

function deepMerge(target: any, source: any): any {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      out[key] = deepMerge(target[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

function parseAndMerge(rawYaml: string): GuildConfig {
  try {
    let parsed = yaml.load(rawYaml) as any;
    if (!parsed || typeof parsed !== "object") return DEFAULT_CONFIG;

    // Normalize root-level plugin blocks → `plugins.<key>`
    // YAML docs and the dashboard template allow these to be written at the
    // root of the file rather than nested under `plugins:`.  Every command
    // reads from cfg.plugins.<key>, so we lift any root-level blocks into the
    // correct slot before merging.  If both exist we deepMerge them (root
    // wins).
    const ROOT_PLUGIN_KEYS = [
      "moderation", "welcome", "antiraid", "antinuke",
      "command_aliases", "duration_roles", "escalation",
      "preset_reasons", "starboard",
    ] as const;

    for (const key of ROOT_PLUGIN_KEYS) {
      if (parsed[key] && typeof parsed[key] === "object") {
        const existing = parsed.plugins?.[key] ?? {};
        parsed = {
          ...parsed,
          plugins: {
            ...(parsed.plugins ?? {}),
            [key]: deepMerge(existing, parsed[key]),
          },
        };
        delete parsed[key];
      }
    }

    return deepMerge(DEFAULT_CONFIG, parsed) as GuildConfig;
  } catch (err) {
    logger.warn({ err }, "Failed to parse guild YAML config — using defaults");
    return DEFAULT_CONFIG;
  }
}

export async function loadGuildConfig(guildId: string): Promise<GuildConfig> {
  const raw = await getRawYaml(guildId);
  const config = raw ? parseAndMerge(raw) : DEFAULT_CONFIG;
  configCache.set(guildId, { data: config, ts: Date.now() });
  return config;
}

export function getCachedConfig(guildId: string): GuildConfig {
  const entry = configCache.get(guildId);
  if (entry) return entry.data;
  return DEFAULT_CONFIG;
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const entry = configCache.get(guildId);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  return loadGuildConfig(guildId);
}

export function invalidateCache(guildId: string): void {
  configCache.delete(guildId);
}

// Initialise
export async function initGuildConfigStore(): Promise<void> {
  await ensureTable();
  logger.info("guild_configs table ensured");
}

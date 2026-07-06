import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import yaml from "js-yaml";
import CodeMirror from "@uiw/react-codemirror";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { Extension } from "@codemirror/state";

type SaveState = "idle" | "saving" | "saved" | "error";
type CopyState = "idle" | "copied";

// ── Built-in command names + their bot-level aliases ─────────────────────────
const BUILTIN_COMMANDS = new Set([
  "addcase","addrole","ar","autoclean","automod-escalation","autoreaction",
  "autoreply","av","avatar","ban","baninfo","banlist","banner","botinfo",
  "botstats","case","casecount","cases","casesearch","cc","channelinfo",
  "charcount","ci","deletecase","deletenote","delreminder","editcase",
  "editnote","embed","escalation","exportcases","firstmsg","forceban",
  "forcemute","forcenote","forceunmute","forcewarn","goodbye","guildinfo",
  "help","hide","inrole","inviteinfo","inviteleaderboard","invitereset",
  "invites","joined","kick","level","levels","lock","locknick","massban",
  "massforceban","massforcemute","massforcewarn","masskick","massmute",
  "massremoverole","massrole","masstemprole","massunban","massunmute",
  "masswarn","mc","membercount","mn","modnick","modstats","mute","muteinfo",
  "mutelist","nick","note","notesearch","pfp","ping","purge","raidmode",
  "remind","reminders","removerole","resetnick","ri","roleban","rolebanned",
  "roleinfo","roles","rr","seen","servercases","serverinfo","si","slowmode",
  "slowmodeinfo","snowflake","softban","starboard","tag","tempban","tempmute",
  "temprole","temproles","ticket","time","timeconvert","timefor","timezone",
  "ui","unban","unhide","unlock","unlocknick","unmute","unroleban","unwatch",
  "userinfo","viewnote","viewnotes","warn","warncount","watch","watchlist",
  "welcome","welcomedm","whois",
]);

/**
 * Checks tag names and command alias names for conflicts with:
 *  - Built-in bot commands
 *  - Each other (a tag name used as an alias name or vice-versa)
 * Returns a human-readable error string, or "" if all clear.
 */
function findNameConflicts(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return "";
  const cfg = parsed as Record<string, unknown>;

  const rawTags = cfg.tags;
  const tagNames: string[] = rawTags && typeof rawTags === "object" && !Array.isArray(rawTags)
    ? Object.keys(rawTags as Record<string, unknown>)
    : [];

  const plugins = cfg.plugins as Record<string, unknown> | undefined;
  const aliasPlugin = plugins?.command_aliases as Record<string, unknown> | undefined;
  const aliasConfig = aliasPlugin?.config as Record<string, unknown> | undefined;
  const rawAliases = aliasConfig?.aliases;
  const aliasNames: string[] = rawAliases && typeof rawAliases === "object" && !Array.isArray(rawAliases)
    ? Object.keys(rawAliases as Record<string, unknown>)
    : [];

  const aliasSet = new Set(aliasNames.map(n => n.toLowerCase()));
  const tagSet   = new Set(tagNames.map(n => n.toLowerCase()));

  // Check tags
  for (const name of tagNames) {
    const lower = name.toLowerCase();
    if (BUILTIN_COMMANDS.has(lower))
      return `Tag "${name}" conflicts with a built-in bot command.`;
    if (aliasSet.has(lower))
      return `Tag "${name}" conflicts with a command alias of the same name.`;
  }

  // Check aliases
  for (const name of aliasNames) {
    const lower = name.toLowerCase();
    if (BUILTIN_COMMANDS.has(lower))
      return `Command alias "${name}" conflicts with a built-in bot command.`;
    if (tagSet.has(lower))
      return `Command alias "${name}" conflicts with a tag of the same name.`;
  }

  return "";
}

/**
 * Returns true if a YAML key name corresponds to a user-facing DM message
 * that must include a server name variable.
 *
 * Matches:
 *  - dm_message          (escalation thresholds, ticket close/feedback)
 *  - anything ending in _dm  (nickname_changed_dm, inviter_dm,
 *                             roles_restored_dm, rr_assign_dm, rr_remove_dm …)
 *
 * String values only — boolean dm_on_* flags are skipped automatically.
 */
function isDmMessageKey(key: string): boolean {
  return key === "dm_message" || key.endsWith("_dm");
}

/**
 * Recursively walks a parsed YAML object and collects the dotted path of
 * every DM message field that does not contain {server} or {guild}.
 */
function findDmViolations(obj: unknown, path = ""): string[] {
  if (obj === null || obj === undefined) return [];
  const errors: string[] = [];

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      errors.push(...findDmViolations(item, `${path}[${i}]`));
    });
  } else if (typeof obj === "object") {
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const cur = path ? `${path}.${key}` : key;
      if (isDmMessageKey(key)) {
        if (typeof val === "string" && val.trim() !== "") {
          if (!val.includes("{server}") && !val.includes("{guild}")) {
            errors.push(cur);
          }
        }
        // If it's an object (embed block) or boolean, skip — booleans pass
        // silently; embed blocks are checked when their string children are reached
        if (typeof val === "object" && val !== null) {
          errors.push(...findDmViolations(val, cur));
        }
      } else {
        errors.push(...findDmViolations(val, cur));
      }
    }
  }

  return errors;
}

const STARTER_YAML = `prefix: "!"

# All commands are open to everyone by default.
# Use levels to RESTRICT who can run specific commands.
# 0 = everyone  |  25 = trusted  |  50 = mod  |  75 = admin  |  100 = owner
#
# levels:
#   roles:
#     "YOUR_MOD_ROLE_ID": 50
#     "YOUR_ADMIN_ROLE_ID": 75
#   commands:
#     warn: 25
#     kick: 50
#     ban: 50
#     mute: 25
#     purge: 25
#     note: 25

# ============================================================
# PUNISHMENT ESCALATION
# Two independent systems — manual (human mods) and auto
# (automod rules). Counters never mix. Both fire IN ADDITION
# to the original action. Uncomment to enable.
# ============================================================
# plugins:
#   escalation:
#     enabled: true
#
#     # manual — counts cases from human moderators (!warn, !mute, !kick, !ban)
#     manual:
#       enabled: true
#       thresholds:
#         - tracked_type: "warn"
#           count: 3
#           action: mute
#           duration: "1h"
#           reason: "Escalation: 3 warnings reached"
#
#         - tracked_type: "warn"
#           count: 5
#           action: mute
#           duration: "12h"
#           reason: "Escalation: 5 warnings reached"
#
#         - tracked_type: "warn"
#           count: 7
#           action: kick
#           reason: "Escalation: 7 warnings reached"
#
#         - tracked_type: "warn"
#           count: 10
#           action: ban
#           duration: "perm"
#           reason: "Escalation: 10 warnings reached"
#
#       messages:
#         escalation_triggered: "{user} has been {action_past} due to repeated infractions | Case: {case_id}"
#         escalation_dm: "You have been {action_past} in {server} for the following reason: {reason}"
#
#     # auto — counts cases from automod rules only (type: warn actions)
#     auto:
#       enabled: true
#       thresholds:
#         - tracked_type: "warn"
#           count: 3
#           action: mute
#           duration: "1h"
#           reason: "Auto-Escalation: 3 automod warnings"
#
#         - tracked_type: "warn"
#           count: 5
#           action: mute
#           duration: "12h"
#           reason: "Auto-Escalation: 5 automod warnings"
#
#         - tracked_type: "warn"
#           count: 7
#           action: kick
#           reason: "Auto-Escalation: 7 automod warnings"
#
#         - tracked_type: "warn"
#           count: 10
#           action: ban
#           duration: "perm"
#           reason: "Auto-Escalation: 10 automod warnings"
#
#       messages:
#         escalation_triggered: "{user} has been {action_past} due to repeated automod infractions | Case: {case_id}"
#         escalation_dm: "You have been {action_past} in {server} for the following reason: {reason}"
`.trimStart();

const nightPigeonTheme = EditorView.theme({
  "&": {
    background: "#161c27",
    color: "#dce7f5",
    height: "100%",
    fontSize: "13px",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
  },
  ".cm-content": { padding: "14px 16px", lineHeight: "1.65", caretColor: "#57f287" },
  ".cm-gutters": {
    background: "#1c2333", color: "#3a4a63", border: "none",
    borderRight: "1px solid #2a3349", minWidth: "48px",
    padding: "14px 10px 14px 0",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    fontSize: "13px", lineHeight: "1.65",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 6px 0 0", lineHeight: "1.65", minWidth: "32px", textAlign: "right" },
  ".cm-activeLine": { background: "rgba(87,242,135,0.04)" },
  ".cm-activeLineGutter": { background: "rgba(87,242,135,0.07)", color: "#7a9abf" },
  ".cm-cursor": { borderLeftColor: "#57f287" },
  ".cm-selectionBackground, ::selection": { background: "rgba(87,242,135,0.18) !important" },
  ".cm-focused .cm-selectionBackground": { background: "rgba(87,242,135,0.18)" },
  ".cm-line": { padding: "0" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { overflow: "auto", lineHeight: "1.65" },
  ".cm-foldGutter": { display: "none" },
}, { dark: true });

const nightPigeonHighlight = HighlightStyle.define([
  { tag: tags.comment,           color: "#5c6f8a", fontStyle: "italic" },
  { tag: tags.keyword,           color: "#c678dd" },
  { tag: tags.string,            color: "#98c379" },
  { tag: tags.number,            color: "#d19a66" },
  { tag: tags.bool,              color: "#d19a66" },
  { tag: tags.null,              color: "#d19a66" },
  { tag: tags.atom,              color: "#d19a66" },
  { tag: tags.propertyName,      color: "#e06c75" },
  { tag: tags.punctuation,       color: "#7a8ba8" },
  { tag: tags.operator,          color: "#56b6c2" },
  { tag: tags.typeName,          color: "#e5c07b" },
  { tag: tags.variableName,      color: "#dce7f5" },
  { tag: tags.definition(tags.propertyName), color: "#e06c75", fontWeight: "600" },
]);

const extensions: Extension[] = [
  yamlLang(),
  nightPigeonTheme,
  syntaxHighlighting(nightPigeonHighlight),
  EditorView.lineWrapping,
];

export default function YamlConfig() {
  const { guildId } = useParams<{ guildId: string }>();
  const [guildName, setGuildName] = useState("");
  const [original, setOriginal] = useState("");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [validationError, setValidationError] = useState("");
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const load = useCallback(() => {
    if (!guildId) return;
    setLoading(true);
    Promise.all([
      api.guild.yamlConfig(guildId),
      api.auth.guilds(),
    ]).then(([res, guilds]) => {
      const raw: string = (res as any).yaml ?? "";
      setValue(raw || STARTER_YAML);
      setOriginal(raw);
      const g = guilds.find((g: any) => g.id === guildId);
      if (g) setGuildName(g.name);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [guildId]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (v: string) => {
    setValue(v);
    setSaveState("idle");
    setErrorMsg("");
    try {
      const parsed = yaml.load(v);

      const dmViolations = findDmViolations(parsed);
      if (dmViolations.length > 0) {
        const first = dmViolations[0];
        const extra = dmViolations.length > 1 ? ` (+${dmViolations.length - 1} more)` : "";
        setValidationError(`dm_message must include {server}: ${first}${extra}`);
        return;
      }

      const nameConflict = findNameConflicts(parsed);
      if (nameConflict) {
        setValidationError(nameConflict);
        return;
      }

      setValidationError("");
    } catch (e: any) {
      setValidationError(e.message ?? "Invalid YAML");
    }
  };

  const handleSave = useCallback(async () => {
    if (!guildId || validationError || saveState === "saving") return;
    setSaveState("saving");
    setErrorMsg("");
    try {
      await api.guild.updateYamlConfig(guildId, value);
      setOriginal(value);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 3000);
    } catch (e: any) {
      setErrorMsg(e.message ?? "Failed to save");
      setSaveState("error");
    }
  }, [guildId, validationError, saveState, value]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      // fallback: select all text (mobile)
      const ta = document.querySelector<HTMLTextAreaElement>(".cm-content");
      if (ta) {
        const range = document.createRange();
        range.selectNodeContents(ta);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  const lines = value.split("\n").length;
  const isDirty = value !== original;

  const saveLabel =
    saveState === "saving" ? "Saving…" :
    saveState === "saved"  ? "✓ Saved" :
    saveState === "error"  ? "Error" :
    "Save";

  const saveBg =
    saveState === "saved"  ? "#388040" :
    saveState === "error"  ? "#8b2020" :
    validationError        ? "#3a4a3a" :
    "#4a9e5c";

  return (
    <div className="yaml-page">
      <div className="yaml-page-header">
        <h1 className="yaml-page-title">
          {guildName ? `${guildName} — Config` : "Config"}
        </h1>
      </div>

      {/* Toolbar */}
      <div className="yaml-toolbar">
        <div className="yaml-toolbar-left">
          <button
            onClick={handleSave}
            disabled={!isDirty || !!validationError || saveState === "saving"}
            className="yaml-btn yaml-btn-save"
            style={{ background: saveBg, opacity: (!isDirty || !!validationError) ? 0.5 : 1 }}
          >
            {saveLabel}
          </button>

          {isDirty && !validationError && (
            <button
              onClick={() => { setValue(original); setSaveState("idle"); setValidationError(""); setErrorMsg(""); }}
              className="yaml-btn yaml-btn-ghost"
            >
              Reset
            </button>
          )}

          <button onClick={handleCopy} className="yaml-btn yaml-btn-ghost" title="Copy config to clipboard">
            {copyState === "copied" ? "✓ Copied" : "Copy"}
          </button>
        </div>

        <div className="yaml-toolbar-right">
          {validationError && (
            <span className="yaml-error-msg">⚠ {validationError}</span>
          )}
          {saveState === "error" && errorMsg && (
            <span className="yaml-error-msg">⚠ {errorMsg}</span>
          )}
          <span className="yaml-meta">
            <span className="yaml-meta-hint">Ctrl+S to save</span>
            <span> · {lines} lines</span>
            {isDirty && <span className="yaml-dirty-dot"> ● unsaved</span>}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="yaml-loading">Loading configuration…</div>
      ) : (
        <div className="yaml-cm-wrap yaml-editor-container">
          <CodeMirror
            value={value}
            onChange={handleChange}
            extensions={extensions}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
              autocompletion: false,
              searchKeymap: false,
              bracketMatching: true,
              indentOnInput: true,
              tabSize: 2,
            }}
            style={{ height: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

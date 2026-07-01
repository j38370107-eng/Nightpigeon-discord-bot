import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Bot, X, Trash2 } from "lucide-react";
import { api } from "../lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Memory {
  prefix?: string;
  style?: "quick" | "detailed";
  lastTopic?: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_, c) => `<code class="ba-code-inline">${esc(c)}</code>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

let _codeBlockIdx = 0;

function renderMarkdown(text: string): string {
  _codeBlockIdx = 0;
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      let code = "";
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        code += lines[i] + "\n";
        i++;
      }
      const trimmed = code.trimEnd();
      const encoded = encodeURIComponent(trimmed);
      const id = `ba-cb-${_codeBlockIdx++}`;
      out.push(
        `<div class="ba-code-wrap">` +
          `<div class="ba-code-header">${lang ? `<span class="ba-lang">${esc(lang)}</span>` : ""}<button class="ba-copy-btn" data-code="${encoded}" data-id="${id}" title="Copy"><span class="ba-copy-icon">⧉</span> Copy</button></div>` +
          `<pre class="ba-pre" id="${id}"><code>${esc(trimmed)}</code></pre>` +
          `</div>`
      );
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("> ")) {
        items.push(`<div class="ba-bq-line">${inline(lines[i]!.slice(2))}</div>`);
        i++;
      }
      out.push(`<div class="ba-blockquote">${items.join("")}</div>`);
      continue;
    }

    if (line.startsWith("## ")) {
      out.push(`<div class="ba-h2">${inline(line.slice(3))}</div>`);
      i++; continue;
    }
    if (line.startsWith("### ")) {
      out.push(`<div class="ba-h3">${inline(line.slice(4))}</div>`);
      i++; continue;
    }

    if (line.startsWith("|")) {
      const rows: string[] = [];
      let firstDataRow = true;
      while (i < lines.length && lines[i]!.startsWith("|")) {
        const raw = lines[i]!;
        i++;
        if (/^\|[\s\-:|]+\|/.test(raw)) continue;
        const cells = raw.split("|").slice(1, -1);
        const tag = firstDataRow ? "th" : "td";
        rows.push(
          `<tr>${cells
            .map((c) => `<${tag} class="ba-td">${inline(c.trim())}</${tag}>`)
            .join("")}</tr>`
        );
        firstDataRow = false;
      }
      out.push(`<table class="ba-table">${rows.join("")}</table>`);
      continue;
    }

    if (/^[-•*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-•*] /.test(lines[i]!)) {
        items.push(`<li class="ba-li">${inline(lines[i]!.replace(/^[-•*] /, ""))}</li>`);
        i++;
      }
      out.push(`<ul class="ba-ul">${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i]!)) {
        items.push(`<li class="ba-li ba-oli">${inline(lines[i]!.replace(/^\d+\. /, ""))}</li>`);
        i++;
      }
      out.push(`<ol class="ba-ol">${items.join("")}</ol>`);
      continue;
    }

    if (line.trim() === "") { i++; continue; }

    out.push(`<p class="ba-p">${inline(line)}</p>`);
    i++;
  }

  return out.join("");
}

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content: `## Hey! I'm Charles 👋

I'm your NightPigeon config expert — I know every plugin, field, and option inside out, and I'm here to help you get your bot set up exactly how you want it.

**Here's what I can do for you:**
- Build a complete config for any plugin from scratch
- Review your existing config and catch errors before they cause problems
- Explain what any field does in plain English
- Help you decide between options (e.g. timeout vs mute role, archive vs delete tickets)
- Suggest plugins you might not know about

> **Quick tip:** If something isn't working as expected, paste your config here and I'll read through it and tell you exactly what's wrong.

Tap one of the quick-starts below, ask me anything, or just paste your current YAML and I'll take a look!`,
};

const SUGGESTIONS = [
  "Starter config",
  "Set up logging",
  "AutoMod config",
  "Escalation config",
  "Add a ticket system",
  "Anti-Nuke YAML",
  "Anti-Raid YAML",
  "Welcome plugin",
  "Levels & permissions",
  "Full config example",
];

function MemoryBadge({ memory }: { memory: Memory }) {
  const parts: string[] = [];
  if (memory.prefix) parts.push(`prefix: ${memory.prefix}`);
  if (memory.style) parts.push(memory.style);
  if (memory.lastTopic) parts.push(`last: ${memory.lastTopic}`);
  if (!parts.length) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
      padding: "6px 14px", borderBottom: "1px solid var(--border)",
      background: "rgba(87,242,135,0.04)",
    }}>
      <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, opacity: 0.8 }}>
        CHARLES REMEMBERS
      </span>
      {parts.map((p) => (
        <span key={p} style={{
          fontSize: 10, padding: "1px 7px", borderRadius: 10,
          background: "rgba(87,242,135,0.1)", color: "var(--accent)",
          border: "1px solid rgba(87,242,135,0.2)", fontFamily: "monospace",
        }}>
          {p}
        </span>
      ))}
    </div>
  );
}

export default function BotAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [memory, setMemory] = useState<Memory>({});
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Load saved history once on open
  useEffect(() => {
    if (!open || historyLoaded) return;
    setHistoryLoading(true);
    api.assistant.history()
      .then(({ messages: saved, memory: savedMemory }) => {
        if (saved && saved.length > 0) {
          setMessages(saved.map((m: any) => ({ role: m.role, content: m.content })));
        }
        if (savedMemory) setMemory(savedMemory);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true))
      .finally(() => setHistoryLoading(false));
  }, [open, historyLoaded]);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, messages]);

  // Wire up copy buttons via event delegation
  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    function handleClick(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest(".ba-copy-btn") as HTMLElement | null;
      if (!btn) return;
      const encoded = btn.getAttribute("data-code");
      const id = btn.getAttribute("data-id");
      if (!encoded) return;
      const text = decodeURIComponent(encoded);
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
      });
    }
    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [messages]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.querySelectorAll(".ba-copy-btn").forEach((btn) => {
      const el = btn as HTMLElement;
      const id = el.getAttribute("data-id");
      if (id === copiedId) {
        el.innerHTML = '<span class="ba-copy-icon">✓</span> Copied!';
        el.style.color = "var(--accent)";
        el.style.borderColor = "var(--accent)";
      } else {
        el.innerHTML = '<span class="ba-copy-icon">⧉</span> Copy';
        el.style.color = "";
        el.style.borderColor = "";
      }
    });
  }, [copiedId, messages]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    const updated: Message[] = [...messages, { role: "user", content: msg }];
    setMessages(updated);
    setLoading(true);

    try {
      const data = await api.assistant.send(
        msg,
        messages.slice(-10).map((m) => ({ role: m.role, content: m.content }))
      );
      setMessages([...updated, { role: "assistant", content: data.reply ?? "Sorry, I couldn't get a response." }]);
      if (data.memory) setMemory(data.memory);
    } catch {
      setMessages([...updated, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  async function clearChat() {
    setClearing(true);
    try {
      await api.assistant.clear();
      setMessages([WELCOME_MESSAGE]);
      setMemory({});
    } catch {
      // silently ignore
    } finally {
      setClearing(false);
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const showSuggestions = messages.length <= 1 && !loading && !historyLoading;
  const hasMemory = !!(memory.prefix || memory.style || memory.lastTopic);

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Charles — NightPigeon Config Expert"
          style={{
            position: "fixed", bottom: 24, right: 24,
            width: 52, height: 52, borderRadius: "50%",
            background: "var(--accent)", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 20px rgba(87,242,135,0.35)", zIndex: 9999,
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 28px rgba(87,242,135,0.5)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(87,242,135,0.35)";
          }}
        >
          <Bot size={24} color="#000" strokeWidth={2.2} />
        </button>
      )}

      {open && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          width: 440, maxWidth: "calc(100vw - 32px)",
          height: 600, maxHeight: "calc(100vh - 80px)",
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", zIndex: 9999, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "14px 16px", borderBottom: "1px solid var(--border)",
            background: "var(--bg-nav)", flexShrink: 0,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "var(--accent-dim)", border: "1px solid var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Bot size={16} color="var(--accent)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                Charles
              </div>
              <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 500 }}>
                ● NightPigeon Config Expert
              </div>
            </div>

            {/* Clear chat button */}
            <button
              onClick={clearChat}
              disabled={clearing || messages.length <= 1}
              title="Clear chat history"
              style={{
                background: "none", border: "none",
                color: messages.length <= 1 ? "var(--border)" : "var(--text-muted)",
                cursor: messages.length <= 1 ? "default" : "pointer",
                padding: 4, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (messages.length > 1)
                  (e.currentTarget as HTMLButtonElement).style.color = "#ff7575";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color =
                  messages.length <= 1 ? "var(--border)" : "var(--text-muted)";
              }}
            >
              <Trash2 size={14} />
            </button>

            <button
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              style={{
                background: "none", border: "none",
                color: "var(--text-muted)", cursor: "pointer",
                padding: 4, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)")}
            >
              <X size={16} />
            </button>
          </div>

          {/* Memory badge */}
          {hasMemory && <MemoryBadge memory={memory} />}

          {/* Messages */}
          <div
            ref={messagesRef}
            style={{
              flex: 1, overflowY: "auto", padding: "12px 14px",
              display: "flex", flexDirection: "column", gap: 10,
            }}
          >
            {historyLoading ? (
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 24 }}>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: "var(--text-muted)",
                      animation: `ba-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                  <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>
                    Loading chat history…
                  </span>
                </div>
              </div>
            ) : (
              <>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "92%", padding: "9px 13px",
                      borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      background: m.role === "user" ? "var(--accent)" : "var(--bg-secondary)",
                      color: m.role === "user" ? "#000" : "var(--text-primary)",
                      fontSize: 13, lineHeight: 1.55,
                      border: m.role === "assistant" ? "1px solid var(--border)" : "none",
                      wordBreak: "break-word",
                    }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                    />
                  </div>
                ))}

                {loading && (
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <div style={{
                      padding: "10px 14px", borderRadius: "14px 14px 14px 4px",
                      background: "var(--bg-secondary)", border: "1px solid var(--border)",
                      display: "flex", gap: 5, alignItems: "center",
                    }}>
                      {[0, 1, 2].map((i) => (
                        <div key={i} style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: "var(--text-muted)",
                          animation: `ba-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }} />
                      ))}
                    </div>
                  </div>
                )}

                {showSuggestions && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        style={{
                          padding: "5px 10px", borderRadius: 20,
                          background: "var(--bg-primary)", border: "1px solid var(--border)",
                          color: "var(--text-secondary)", fontSize: 11,
                          cursor: "pointer", fontFamily: "inherit",
                          transition: "all 0.15s", whiteSpace: "nowrap",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "10px 12px", borderTop: "1px solid var(--border)",
            display: "flex", gap: 8, alignItems: "flex-end",
            background: "var(--bg-nav)", flexShrink: 0,
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask Charles anything, or paste your YAML for a review…"
              rows={1}
              style={{
                flex: 1, background: "var(--bg-input)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "8px 12px", color: "var(--text-primary)",
                fontSize: 13, fontFamily: "inherit", outline: "none", resize: "none",
                lineHeight: 1.5, maxHeight: 120, overflowY: "auto",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              onInput={(e) => {
                const el = e.target as HTMLTextAreaElement;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
              disabled={loading || historyLoading}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading || historyLoading}
              aria-label="Send message"
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: input.trim() && !loading ? "var(--accent)" : "var(--bg-input)",
                border: "1px solid var(--border)",
                cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "background 0.15s",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={input.trim() && !loading ? "#000" : "var(--text-muted)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ba-bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        .ba-p { margin: 0 0 6px; }
        .ba-p:last-child { margin-bottom: 0; }
        .ba-h2 { font-size: 14px; font-weight: 700; margin: 8px 0 5px; color: inherit; }
        .ba-h3 { font-size: 13px; font-weight: 600; margin: 6px 0 4px; color: inherit; }
        .ba-code-inline {
          background: rgba(87,242,135,0.12);
          color: var(--accent, #57f287);
          padding: 1px 5px; border-radius: 4px;
          font-size: 12px; font-family: 'Courier New', monospace;
        }
        .ba-code-wrap {
          border: 1px solid rgba(87,242,135,0.2);
          border-radius: 8px; overflow: hidden; margin: 6px 0;
        }
        .ba-code-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 5px 10px; background: rgba(87,242,135,0.06);
          border-bottom: 1px solid rgba(87,242,135,0.15); min-height: 28px;
        }
        .ba-lang {
          font-size: 11px; color: var(--accent, #57f287);
          font-family: 'Courier New', monospace; opacity: 0.7;
        }
        .ba-copy-btn {
          background: none; border: 1px solid rgba(255,255,255,0.15);
          border-radius: 5px; color: var(--text-muted); font-size: 11px;
          padding: 2px 8px; cursor: pointer; font-family: inherit;
          display: flex; align-items: center; gap: 4px;
          transition: color 0.15s, border-color 0.15s; margin-left: auto;
        }
        .ba-copy-btn:hover { color: var(--accent, #57f287); border-color: var(--accent, #57f287); }
        .ba-copy-icon { font-size: 12px; }
        .ba-pre {
          background: rgba(0,0,0,0.35); padding: 10px 12px; margin: 0; overflow-x: auto;
        }
        .ba-pre code {
          font-size: 12px; font-family: 'Courier New', monospace;
          color: #c9d1d9; white-space: pre;
        }
        .ba-blockquote {
          border-left: 3px solid var(--accent, #57f287);
          background: rgba(87,242,135,0.06);
          border-radius: 0 6px 6px 0; padding: 8px 10px; margin: 6px 0;
          font-size: 12px; color: var(--text-secondary);
        }
        .ba-bq-line { margin: 2px 0; line-height: 1.5; }
        .ba-table { border-collapse: collapse; width: 100%; margin: 6px 0; font-size: 12px; }
        .ba-td { padding: 5px 8px; border: 1px solid rgba(255,255,255,0.1); vertical-align: top; }
        .ba-table tr:first-child .ba-td { background: rgba(87,242,135,0.08); font-weight: 600; }
        .ba-ul { list-style: none; padding: 0; margin: 6px 0; }
        .ba-ol { list-style: none; padding: 0; margin: 6px 0; counter-reset: ba-counter; }
        .ba-li { padding: 3px 0 3px 18px; position: relative; font-size: 13px; line-height: 1.5; }
        .ba-li::before { content: "•"; position: absolute; left: 3px; color: var(--accent, #57f287); font-weight: 700; }
        .ba-oli { counter-increment: ba-counter; }
        .ba-oli::before { content: counter(ba-counter) "."; font-weight: 700; color: var(--accent, #57f287); }
      `}</style>
    </>
  );
}

import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { docSections, DocPage, SchemaField } from "./docs/docContent";
import { ChevronDown, ChevronRight, BookOpen, Menu, X } from "lucide-react";

function CodeBlock({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <div style={{
      background: "#161c27", border: "1px solid #2a3349", borderRadius: 8,
      overflow: "hidden", fontFamily: "'JetBrains Mono','Fira Code',Consolas,monospace", fontSize: 13,
    }}>
      <div style={{ display: "flex" }}>
        <div style={{
          background: "#1c2333", color: "#3a4a63", textAlign: "right",
          padding: "14px 10px", userSelect: "none", minWidth: 42,
          borderRight: "1px solid #2a3349", lineHeight: 1.65,
        }}>
          {lines.map((_, i) => (
            <div key={i} style={{ display: "block" }}>{i + 1}</div>
          ))}
        </div>
        <pre style={{
          flex: 1, padding: "14px 16px", margin: 0, overflowX: "auto",
          color: "#dce7f5", lineHeight: 1.65, whiteSpace: "pre",
        }}>
          {lines.map((line, i) => <YamlLine key={i} line={line} />)}
        </pre>
      </div>
    </div>
  );
}

function YamlLine({ line }: { line: string }) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("#")) {
    return <div><span style={{ color: "#5c6f8a" }}>{line}</span>{"\n"}</div>;
  }
  const colonIdx = line.indexOf(":");
  if (colonIdx > -1 && !trimmed.startsWith("-")) {
    const key = line.slice(0, colonIdx + 1);
    const value = line.slice(colonIdx + 1);
    const coloredValue = value.match(/^\s*(true|false)/)
      ? <><span style={{ color: "#d19a66" }}>{value}</span></>
      : value.match(/^\s*"/)
      ? <><span style={{ color: "#98c379" }}>{value}</span></>
      : value.match(/^\s*\d/)
      ? <><span style={{ color: "#d19a66" }}>{value}</span></>
      : value.match(/^\s*null/)
      ? <><span style={{ color: "#5c6f8a" }}>{value}</span></>
      : <>{value}</>;
    return <div><span style={{ color: "#e06c75" }}>{key}</span>{coloredValue}{"\n"}</div>;
  }
  return <div>{line}{"\n"}</div>;
}

function SchemaTree({ fields, depth = 0 }: { fields: SchemaField[]; depth?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {fields.map((field) => (
        <SchemaRow key={field.key} field={field} depth={depth} />
      ))}
    </div>
  );
}

function SchemaRow({ field, depth }: { field: SchemaField; depth: number }) {
  const [open, setOpen] = useState(false);
  const hasChildren = field.children && field.children.length > 0;
  return (
    <div>
      <div
        onClick={() => hasChildren && setOpen(o => !o)}
        style={{
          display: "grid", gridTemplateColumns: "1fr 140px 120px 1fr",
          gap: 12, padding: "8px 12px", alignItems: "start",
          paddingLeft: 12 + depth * 20,
          background: depth % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
          cursor: hasChildren ? "pointer" : "default",
          borderRadius: 4, transition: "background 0.1s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
        onMouseLeave={e => (e.currentTarget.style.background = depth % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {hasChildren && (
            <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
          )}
          <code style={{ fontSize: 12, color: "#e06c75", fontFamily: "'JetBrains Mono',monospace" }}>{field.key}</code>
        </div>
        <code style={{ fontSize: 12, color: "#98c379", fontFamily: "'JetBrains Mono',monospace" }}>{field.type}</code>
        <code style={{ fontSize: 12, color: "#d19a66", fontFamily: "'JetBrains Mono',monospace" }}>{field.default ?? "—"}</code>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{field.description}</span>
      </div>
      {open && hasChildren && (
        <div style={{ borderLeft: "2px solid var(--border)", marginLeft: 12 + depth * 20 + 6 }}>
          <SchemaTree fields={field.children!} depth={depth + 1} />
        </div>
      )}
    </div>
  );
}

function InlineCode({ children }: { children: string }) {
  return (
    <code style={{
      background: "#1c2333", border: "1px solid #2a3349", borderRadius: 4,
      padding: "1px 6px", fontSize: "0.875em",
      fontFamily: "'JetBrains Mono','Fira Code',Consolas,monospace", color: "#e06c75",
    }}>{children}</code>
  );
}

function renderMarkdown(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(<CodeBlock key={i} code={codeLines.join("\n")} />);
      i++;
      continue;
    }

    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", marginBottom: 8, marginTop: elements.length > 0 ? 32 : 0 }}>{line.slice(2)}</h1>);
      i++; continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h2 key={i} style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12, marginTop: 28, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>{line.slice(3)}</h2>);
      i++; continue;
    }
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, marginTop: 20 }}>{line.slice(4)}</h3>);
      i++; continue;
    }

    if (line.startsWith("| ")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const headers = tableLines[0].split("|").slice(1, -1).map(h => h.trim());
      const rows = tableLines.slice(2).map(r => r.split("|").slice(1, -1).map(c => c.trim()));
      elements.push(
        <div key={i} style={{ overflowX: "auto", marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-card)" }}>
                {headers.map((h, j) => (
                  <th key={j} style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, j) => (
                <tr key={j} style={{ borderBottom: "1px solid rgba(42,51,73,0.5)" }}>
                  {row.map((cell, k) => (
                    <td key={k} style={{ padding: "8px 12px", color: "var(--text-primary)", verticalAlign: "top" }}>
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={i} style={{ marginBottom: 16, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((item, j) => (
            <li key={j} style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (line.trim() === "") {
      i++; continue;
    }

    elements.push(
      <p key={i} style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 12 }}>
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return elements;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "var(--text-primary)", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <InlineCode key={i}>{part.slice(1, -1)}</InlineCode>;
    }
    return part;
  });
}

function CommandTable({ commands }: { commands: NonNullable<DocPage["commands"]> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {commands.map((cmd) => (
        <div key={cmd.trigger} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <code style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)", fontFamily: "'JetBrains Mono',monospace" }}>{cmd.usage}</code>
            {cmd.permissions && (
              <span style={{ fontSize: 11, fontWeight: 600, background: "rgba(88,101,242,0.15)", color: "var(--info)", border: "1px solid rgba(88,101,242,0.3)", borderRadius: 5, padding: "2px 8px" }}>
                Level {cmd.permissions}+
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{cmd.description}</p>
          {cmd.examples && cmd.examples.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Examples</div>
              {cmd.examples.map((ex, i) => (
                <div key={i} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#98c379", background: "#161c27", border: "1px solid #2a3349", borderRadius: 5, padding: "4px 10px", marginBottom: 4 }}>{ex}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SchemaSection({ fields }: { fields: SchemaField[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
          padding: "12px 16px", cursor: "pointer", color: "var(--text-secondary)",
          fontSize: 13, fontWeight: 500, fontFamily: "inherit",
          transition: "border-color 0.15s",
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Click to {open ? "collapse" : "expand"}
      </button>
      {open && (
        <div style={{ marginTop: 8, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 120px 1fr", gap: 12, padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
            {["Property", "Type", "Default", "Description"].map((h) => (
              <div key={h} style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</div>
            ))}
          </div>
          <SchemaTree fields={fields} />
        </div>
      )}
    </div>
  );
}

function PluginPage({ page }: { page: DocPage }) {
  const [tab, setTab] = useState<"usage" | "configuration">("usage");
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px", fontSize: 14, fontWeight: 500, background: "none", border: "none",
    cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    marginBottom: -1,
  });

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", marginBottom: 16 }}>{page.title}</h1>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 24 }}>
        <button style={tabStyle(tab === "usage")} onClick={() => setTab("usage")}>Usage</button>
        <button style={tabStyle(tab === "configuration")} onClick={() => setTab("configuration")}>Configuration</button>
      </div>

      {tab === "usage" && (
        <div>
          <div style={{ marginBottom: 24 }}>
            {renderMarkdown(page.content)}
          </div>

          {page.commands && page.commands.length > 0 && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>Commands</h2>
              <CommandTable commands={page.commands} />
            </div>
          )}
        </div>
      )}

      {tab === "configuration" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Name in config:</span>
              <InlineCode>{page.configKey ?? ""}</InlineCode>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 0 }}>
              To enable this plugin with default configuration, add{" "}
              <InlineCode>{`${page.configKey}: {}`}</InlineCode>
              {" "}to the <InlineCode>plugins</InlineCode> list in config.
            </p>
          </div>

          {page.defaultConfig && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Default configuration</h2>
              <CodeBlock code={page.defaultConfig} />
            </div>
          )}

          {page.schema && page.schema.length > 0 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Config schema</h2>
              <SchemaSection fields={page.schema} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ArticlePage({ page }: { page: DocPage }) {
  return <div>{renderMarkdown(page.content)}</div>;
}

export default function Docs() {
  const { pageId } = useParams<{ pageId?: string }>();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const allPages = docSections.flatMap(s => s.pages);
  const currentPage: DocPage | undefined = pageId
    ? allPages.find(p => p.id === pageId)
    : allPages[0];

  useEffect(() => {
    setSidebarOpen(false);
  }, [pageId]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pageId]);

  const Sidebar = () => (
    <nav style={{
      width: 220, flexShrink: 0, background: "var(--bg-secondary)",
      borderRight: "1px solid var(--border)", overflowY: "auto", height: "100%",
      padding: "24px 0",
    }}>
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 20px", marginBottom: 24, textDecoration: "none" }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, background: "var(--accent-dim)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <BookOpen size={14} color="var(--accent)" />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>NightPigeon Docs</span>
      </Link>

      {docSections.map((section) => (
        <div key={section.id} style={{ marginBottom: 20 }}>
          <div style={{ padding: "0 20px", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {section.title}
            </span>
          </div>
          {section.pages.map((page) => {
            const isActive = page.id === currentPage?.id;
            return (
              <button
                key={page.id}
                onClick={() => navigate(`/docs/${page.id}`)}
                style={{
                  width: "100%", textAlign: "left", padding: "5px 20px",
                  background: isActive ? "var(--accent-dim)" : "none",
                  border: "none", borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  color: isActive ? "var(--accent)" : "var(--text-secondary)",
                  fontSize: 13, cursor: "pointer", transition: "all 0.1s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget.style.color = "var(--text-primary)"); }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget.style.color = "var(--text-secondary)"); }}
              >
                {page.title}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-primary)" }}>
      {/* Top bar */}
      <header style={{
        height: 52, flexShrink: 0, display: "flex", alignItems: "center",
        padding: "0 20px", gap: 16, background: "var(--bg-nav)",
        borderBottom: "1px solid var(--border)", zIndex: 50,
      }}>
        <button
          onClick={() => setSidebarOpen(o => !o)}
          style={{ background: "none", border: "none", color: "var(--text-secondary)", padding: 4, display: "none", cursor: "pointer" }}
          className="docs-hamburger"
        >
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <Link to="/" style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", textDecoration: "none" }}>
          ← NightPigeon
        </Link>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>/</span>
        <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Documentation</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Link to="/login" style={{ padding: "6px 14px", background: "var(--accent)", color: "#000", fontWeight: 700, fontSize: 13, borderRadius: 6, textDecoration: "none" }}>
            Dashboard
          </Link>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }}
          />
        )}

        {/* Sidebar — desktop always visible, mobile toggled */}
        <div style={{ display: "flex", flexShrink: 0, zIndex: 41 }} className="docs-sidebar-wrap">
          <Sidebar />
        </div>

        {/* Content */}
        <main style={{ flex: 1, overflowY: "auto", padding: "40px 48px", maxWidth: 860 }}>
          {currentPage ? (
            <>
              {/* Breadcrumb */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24, fontSize: 12, color: "var(--text-muted)" }}>
                {docSections.find(s => s.pages.some(p => p.id === currentPage.id))?.title}
                <ChevronRight size={12} />
                <span style={{ color: "var(--text-secondary)" }}>{currentPage.title}</span>
              </div>

              {currentPage.type === "plugin" ? (
                <PluginPage page={currentPage} />
              ) : (
                <ArticlePage page={currentPage} />
              )}

              {/* Prev / Next navigation */}
              <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 16 }}>
                {(() => {
                  const idx = allPages.findIndex(p => p.id === currentPage.id);
                  const prev = allPages[idx - 1];
                  const next = allPages[idx + 1];
                  return (
                    <>
                      {prev ? (
                        <button onClick={() => navigate(`/docs/${prev.id}`)} style={{ display: "flex", flexDirection: "column", gap: 4, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", flex: 1, maxWidth: 260, transition: "border-color 0.15s" }} onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                          <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>← Previous</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{prev.title}</span>
                        </button>
                      ) : <div />}
                      {next ? (
                        <button onClick={() => navigate(`/docs/${next.id}`)} style={{ display: "flex", flexDirection: "column", gap: 4, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", cursor: "pointer", fontFamily: "inherit", textAlign: "right", flex: 1, maxWidth: 260, marginLeft: "auto", transition: "border-color 0.15s" }} onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                          <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Next →</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{next.title}</span>
                        </button>
                      ) : <div />}
                    </>
                  );
                })()}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "64px 0" }}>
              <div style={{ fontSize: 16, color: "var(--text-muted)" }}>Page not found</div>
              <button onClick={() => navigate("/docs")} style={{ marginTop: 16, padding: "8px 16px", background: "var(--accent)", border: "none", borderRadius: 6, color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Go to Introduction</button>
            </div>
          )}
        </main>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .docs-hamburger { display: flex !important; }
          .docs-sidebar-wrap { position: absolute !important; top: 0; left: 0; height: 100%; transform: ${sidebarOpen ? "translateX(0)" : "translateX(-100%)"}; transition: transform 0.2s; }
        }
      `}</style>
    </div>
  );
}

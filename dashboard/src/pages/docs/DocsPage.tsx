import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { docSections, DocPage, SchemaField } from "./docContent";

// ── Simple inline markdown renderer ──────────────────────────────────────────

function renderContent(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={key++} style={codeBlockStyle} data-lang={lang}>
          {codeLines.join("\n")}
        </pre>
      );
      i++;
      continue;
    }

    // Headings (check longer prefixes first to avoid mis-matching)
    if (line.startsWith("### ")) {
      nodes.push(<h3 key={key++} style={h3Style}>{line.slice(4)}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<h2 key={key++} style={h2Style}>{line.slice(3)}</h2>);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      nodes.push(<h1 key={key++} style={h1Style}>{line.slice(2)}</h1>);
      i++;
      continue;
    }

    // Table
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines.filter(l => !l.match(/^\|[-| ]+\|$/));
      const parseRow = (r: string) => r.split("|").slice(1, -1).map(c => c.trim());
      const [header, ...body] = rows;
      nodes.push(
        <table key={key++} style={tableStyle}>
          <thead>
            <tr>{parseRow(header).map((h, j) => <th key={j} style={thStyle}>{renderInline(h)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: "1px solid var(--border)" }}>
                {parseRow(row).map((cell, ci) => (
                  <td key={ci} style={tdStyle}>{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    // Blank line → paragraph break
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Normal paragraph
    nodes.push(<p key={key++} style={pStyle}>{renderInline(line)}</p>);
    i++;
  }

  return nodes;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} style={inlineCodeStyle}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "var(--text-primary)" }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SchemaTable({ fields, depth = 0 }: { fields: SchemaField[]; depth?: number }) {
  return (
    <table style={{ ...tableStyle, marginBottom: depth === 0 ? 24 : 0 }}>
      {depth === 0 && (
        <thead>
          <tr>
            <th style={thStyle}>Key</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Default</th>
            <th style={thStyle}>Description</th>
          </tr>
        </thead>
      )}
      <tbody>
        {fields.map((field, i) => (
          <React.Fragment key={i}>
            <tr style={{ borderBottom: field.children ? "none" : "1px solid var(--border)", background: depth > 0 ? "rgba(255,255,255,0.02)" : undefined }}>
              <td style={{ ...tdStyle, paddingLeft: 12 + depth * 20, fontFamily: "monospace", color: "var(--accent)", fontSize: 12 }}>
                {depth > 0 && <span style={{ color: "var(--text-muted)", marginRight: 6 }}>└</span>}
                {field.key}
              </td>
              <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>{field.type}</td>
              <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)" }}>{field.default ?? "—"}</td>
              <td style={tdStyle}>{field.description}</td>
            </tr>
            {field.children && (
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <td colSpan={4} style={{ padding: 0 }}>
                  <SchemaTable fields={field.children} depth={depth + 1} />
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

function CommandTable({ commands }: { commands: NonNullable<DocPage["commands"]> }) {
  return (
    <table style={{ ...tableStyle, marginBottom: 24 }}>
      <thead>
        <tr>
          <th style={thStyle}>Command</th>
          <th style={thStyle}>Description</th>
          <th style={thStyle}>Examples</th>
        </tr>
      </thead>
      <tbody>
        {commands.map((cmd, i) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: "var(--accent)", minWidth: 200, verticalAlign: "top" }}>
              {cmd.usage}
            </td>
            <td style={{ ...tdStyle, verticalAlign: "top" }}>{cmd.description}</td>
            <td style={{ ...tdStyle, verticalAlign: "top" }}>
              {cmd.examples?.map((ex, j) => (
                <code key={j} style={{ ...inlineCodeStyle, display: "block", marginBottom: 4 }}>{ex}</code>
              )) ?? "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PageContent({ page }: { page: DocPage }) {
  return (
    <div>
      {page.type === "plugin" && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{page.title}</h1>
            {page.configKey && (
              <code style={{ ...inlineCodeStyle, fontSize: 12, background: "var(--accent)22", color: "var(--accent)", border: "1px solid var(--accent)44" }}>
                plugins.{page.configKey}
              </code>
            )}
          </div>
          <div style={{ width: 40, height: 2, background: "var(--accent)", borderRadius: 2 }} />
        </div>
      )}

      {page.content && (
        <div style={{ marginBottom: 32 }}>{renderContent(page.content)}</div>
      )}

      {page.commands && page.commands.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <SectionHeader>Commands</SectionHeader>
          <CommandTable commands={page.commands} />
        </section>
      )}

      {page.schema && page.schema.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <SectionHeader>Configuration reference</SectionHeader>
          <SchemaTable fields={page.schema} />
        </section>
      )}

      {page.defaultConfig && (
        <section style={{ marginBottom: 32 }}>
          <SectionHeader>Default config</SectionHeader>
          <pre style={{ ...codeBlockStyle, maxHeight: 480, overflow: "auto" }}>{page.defaultConfig}</pre>
        </section>
      )}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
      {children}
    </h3>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const navigate = useNavigate();
  const { pageId } = useParams<{ pageId?: string }>();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(docSections.map(s => s.id))
  );

  const allPages = docSections.flatMap(s => s.pages);
  const activePage = allPages.find(p => p.id === pageId) ?? allPages[0];

  useEffect(() => {
    if (!pageId && allPages[0]) {
      navigate(`/docs/${allPages[0].id}`, { replace: true });
    }
  }, [pageId, allPages, navigate]);

  useEffect(() => {
    // expand the section that contains the active page
    const section = docSections.find(s => s.pages.some(p => p.id === activePage?.id));
    if (section) setExpandedSections(prev => new Set([...prev, section.id]));
  }, [activePage?.id]);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)" }}>
      {/* Top nav */}
      <header style={{ height: 52, background: "var(--bg-nav)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 20px", gap: 16, flexShrink: 0 }}>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontWeight: 700, fontSize: 15, fontFamily: "inherit", padding: 0 }}>
          NightPigeon
        </button>
        <span style={{ color: "var(--border)", fontSize: 18 }}>/</span>
        <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>Documentation</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => navigate("/servers")} style={{ background: "var(--accent)", border: "none", color: "#000", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", padding: "6px 16px", borderRadius: 6 }}>
          Dashboard
        </button>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <aside style={{
          width: sidebarOpen ? 240 : 0, flexShrink: 0, overflowY: "auto", overflowX: "hidden",
          background: "var(--bg-nav)", borderRight: "1px solid var(--border)",
          transition: "width 0.2s", padding: sidebarOpen ? "16px 0" : 0,
        }}>
          {docSections.map(section => (
            <div key={section.id} style={{ marginBottom: 4 }}>
              <button
                onClick={() => toggleSection(section.id)}
                style={{ width: "100%", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "inherit" }}
              >
                {section.title}
                <span style={{ fontSize: 10, transition: "transform 0.15s", transform: expandedSections.has(section.id) ? "rotate(90deg)" : "none" }}>▶</span>
              </button>

              {expandedSections.has(section.id) && section.pages.map(page => (
                <button
                  key={page.id}
                  onClick={() => navigate(`/docs/${page.id}`)}
                  style={{
                    width: "100%", background: activePage?.id === page.id ? "var(--accent)18" : "none",
                    border: "none", borderLeft: activePage?.id === page.id ? "2px solid var(--accent)" : "2px solid transparent",
                    color: activePage?.id === page.id ? "var(--accent)" : "var(--text-secondary)",
                    cursor: "pointer", textAlign: "left", padding: "7px 16px 7px 18px",
                    fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap",
                  }}
                >
                  {page.title}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          style={{ position: "fixed", left: sidebarOpen ? 228 : 0, top: 68, zIndex: 10, background: "var(--bg-nav)", border: "1px solid var(--border)", borderLeft: sidebarOpen ? "1px solid var(--border)" : "none", color: "var(--text-muted)", cursor: "pointer", padding: "6px 5px", fontSize: 10, lineHeight: 1, transition: "left 0.2s", borderRadius: sidebarOpen ? "0 4px 4px 0" : "0 4px 4px 0" }}
        >
          {sidebarOpen ? "◀" : "▶"}
        </button>

        {/* Content */}
        <main style={{ flex: 1, overflowY: "auto", padding: "40px 48px", maxWidth: 900 }}>
          {activePage && <PageContent page={activePage} />}
        </main>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const codeBlockStyle: React.CSSProperties = {
  background: "var(--yaml-bg, #0d1117)", border: "1px solid var(--border)",
  borderRadius: 6, padding: "14px 16px",
  fontFamily: "'JetBrains Mono','Fira Code',Consolas,monospace",
  fontSize: 12, color: "var(--text-primary)", overflowX: "auto",
  lineHeight: 1.65, margin: "12px 0",
};
const inlineCodeStyle: React.CSSProperties = {
  background: "var(--bg-card, #1a1d23)", padding: "1px 6px", borderRadius: 4,
  fontFamily: "monospace", fontSize: "0.9em", color: "var(--accent)",
};
const h1Style: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "28px 0 8px" };
const h2Style: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "24px 0 8px", paddingBottom: 6, borderBottom: "1px solid var(--border)" };
const h3Style: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "var(--text-secondary)", margin: "20px 0 6px" };
const pStyle: React.CSSProperties = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, margin: "8px 0" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", color: "var(--text-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", background: "var(--bg-nav)", borderBottom: "1px solid var(--border)" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", color: "var(--text-secondary)", fontSize: 13 };

import { ReactNode, CSSProperties, useState } from "react";

interface CardProps { children: ReactNode; style?: CSSProperties; className?: string; onClick?: () => void; }
export function Card({ children, style, className, onClick }: CardProps) {
  return (
    <div className={className} onClick={onClick} style={{ cursor: onClick ? "pointer" : undefined,
      background:"var(--bg-card)", border:"1px solid var(--border)",
      borderRadius:12, padding:24, ...style
    }}>{children}</div>
  );
}

interface ButtonProps {
  children: ReactNode; onClick?: () => void; variant?: "primary"|"secondary"|"danger"|"ghost";
  size?: "sm"|"md"; disabled?: boolean; type?: "button"|"submit"; style?: CSSProperties; fullWidth?: boolean;
}
export function Button({ children, onClick, variant="primary", size="md", disabled, type="button", style, fullWidth }: ButtonProps) {
  const styles: Record<string, CSSProperties> = {
    primary: { background:"var(--accent)", color:"#000", fontWeight:700 },
    secondary: { background:"var(--bg-input)", color:"var(--text-primary)", border:"1px solid var(--border)" },
    danger: { background:"var(--danger-dim)", color:"var(--danger)", border:"1px solid rgba(239,68,68,0.3)" },
    ghost: { background:"transparent", color:"var(--text-secondary)", border:"1px solid transparent" },
  };
  const sizes: Record<string, CSSProperties> = {
    sm: { padding:"6px 12px", fontSize:12, borderRadius:6 },
    md: { padding:"10px 18px", fontSize:13, borderRadius:8 },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      fontFamily:"inherit", fontWeight:600, display:"inline-flex", alignItems:"center",
      gap:6, transition:"all 0.15s", outline:"none", width: fullWidth ? "100%" : undefined,
      justifyContent: fullWidth ? "center" : undefined,
      ...styles[variant], ...sizes[size], ...style
    }}>{children}</button>
  );
}

interface InputProps {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; style?: CSSProperties; label?: string; hint?: string; error?: string | null;
}
export function Input({ value, onChange, placeholder, type="text", style, label, hint, error }: InputProps) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {label && <label style={{ fontSize:12, fontWeight:600, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</label>}
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          background:"var(--bg-input)", border:`1px solid ${error ? "var(--danger, #f04747)" : "var(--border)"}`, borderRadius:8,
          padding:"10px 14px", color:"var(--text-primary)", fontSize:13, outline:"none",
          transition:"border-color 0.15s", width:"100%", ...style
        }}
        onFocus={e => (e.target.style.borderColor = error ? "var(--danger, #f04747)" : "var(--accent)")}
        onBlur={e => (e.target.style.borderColor = error ? "var(--danger, #f04747)" : "var(--border)")}
      />
      {error
        ? <div style={{ fontSize:11, color:"var(--danger, #f04747)", display:"flex", alignItems:"center", gap:4 }}>⚠ {error}</div>
        : hint && <div style={{ fontSize:11, color:"var(--text-muted)" }}>{hint}</div>
      }
    </div>
  );
}

interface TextAreaProps {
  value: string; onChange: (v: string) => void; placeholder?: string;
  rows?: number; style?: CSSProperties; label?: string;
}
export function TextArea({ value, onChange, placeholder, rows=4, style, label }: TextAreaProps) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {label && <label style={{ fontSize:12, fontWeight:600, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</label>}
      <textarea
        value={value} placeholder={placeholder} rows={rows}
        onChange={e => onChange(e.target.value)}
        style={{
          background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:8,
          padding:"10px 14px", color:"var(--text-primary)", fontSize:13, outline:"none",
          resize:"vertical", transition:"border-color 0.15s", width:"100%", ...style
        }}
        onFocus={e => (e.target.style.borderColor = "var(--accent)")}
        onBlur={e => (e.target.style.borderColor = "var(--border)")}
      />
    </div>
  );
}

interface SelectProps {
  value: string; onChange: (v: string) => void; label?: string; style?: CSSProperties;
  children: ReactNode;
}
export function Select({ value, onChange, label, style, children }: SelectProps) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {label && <label style={{ fontSize:12, fontWeight:600, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</label>}
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{
          background:"var(--bg-input)", border:"1px solid var(--border)", borderRadius:8,
          padding:"10px 14px", color:"var(--text-primary)", fontSize:13, outline:"none",
          cursor:"pointer", width:"100%", ...style
        }}
      >{children}</select>
    </div>
  );
}

interface ToggleProps { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean; }
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label style={{ display:"flex", alignItems:"center", gap:10, cursor: disabled ? "not-allowed" : "pointer" }}>
      <div
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width:40, height:22, borderRadius:11, position:"relative", transition:"background 0.2s",
          background: checked ? "var(--accent)" : "var(--bg-input)", border:"1px solid", flexShrink:0,
          borderColor: checked ? "var(--accent)" : "var(--border)", opacity: disabled ? 0.5 : 1,
        }}
      >
        <div style={{
          width:16, height:16, borderRadius:"50%", background:"#fff",
          position:"absolute", top:2, transition:"left 0.2s",
          left: checked ? 20 : 2,
        }} />
      </div>
      {label && <span style={{ fontSize:13, color:"var(--text-secondary)" }}>{label}</span>}
    </label>
  );
}

interface BadgeProps { children: ReactNode; color?: "accent"|"success"|"danger"|"warning"|"info"|"muted"; style?: CSSProperties; }
export function Badge({ children, color="muted", style }: BadgeProps) {
  const colors: Record<string, CSSProperties> = {
    accent: { background:"var(--accent-dim)", color:"var(--accent)", border:"1px solid rgba(240,165,0,0.3)" },
    success: { background:"var(--success-dim)", color:"var(--success)", border:"1px solid rgba(34,197,94,0.3)" },
    danger: { background:"var(--danger-dim)", color:"var(--danger)", border:"1px solid rgba(239,68,68,0.3)" },
    warning: { background:"rgba(245,158,11,0.15)", color:"var(--warning)", border:"1px solid rgba(245,158,11,0.3)" },
    info: { background:"rgba(59,130,246,0.15)", color:"var(--info)", border:"1px solid rgba(59,130,246,0.3)" },
    muted: { background:"var(--bg-input)", color:"var(--text-secondary)", border:"1px solid var(--border)" },
  };
  return (
    <span style={{ padding:"3px 8px", borderRadius:6, fontSize:11, fontWeight:600, display:"inline-flex", alignItems:"center", ...colors[color], ...style }}>
      {children}
    </span>
  );
}

interface PageHeaderProps { title: string; subtitle?: string; children?: ReactNode; }
export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, gap:12, flexWrap:"wrap" }}>
      <div>
        <h1 style={{ fontSize:22, fontWeight:800, color:"var(--text-primary)", marginBottom:4 }}>{title}</h1>
        {subtitle && <p style={{ color:"var(--text-secondary)", fontSize:13 }}>{subtitle}</p>}
      </div>
      {children && <div style={{ display:"flex", gap:8, alignItems:"center" }}>{children}</div>}
    </div>
  );
}

interface ToastProps { message: string; type?: "success"|"error"|"info"; onClose: () => void; }
export function Toast({ message, type="info", onClose }: ToastProps) {
  const colors = { success:"var(--success)", error:"var(--danger)", info:"var(--accent)" };
  return (
    <div style={{
      position:"fixed", bottom:24, right:24, zIndex:1000, background:"var(--bg-card)",
      border:`1px solid ${colors[type]}`, borderRadius:10, padding:"12px 16px", maxWidth:320,
      display:"flex", alignItems:"center", gap:10, boxShadow:"0 8px 32px rgba(0,0,0,0.4)",
    }}>
      <div style={{ width:8, height:8, borderRadius:"50%", background:colors[type], flexShrink:0 }} />
      <span style={{ fontSize:13, color:"var(--text-primary)", flex:1 }}>{message}</span>
      <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:16, lineHeight:1, padding:0 }}>×</button>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: "success"|"error"|"info" } | null>(null);
  const show = (message: string, type: "success"|"error"|"info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const ToastEl = toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null;
  return { show, ToastEl };
}

export function Spinner() {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:48 }}>
      <div style={{
        width:32, height:32, borderRadius:"50%", border:"3px solid var(--border)",
        borderTopColor:"var(--accent)", animation:"spin 0.7s linear infinite"
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

interface ModalProps { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number; }
export function Modal({ open, onClose, title, children, width=480 }: ModalProps) {
  if (!open) return null;
  return (
    <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.7)" }} />
      <div style={{
        position:"relative", background:"var(--bg-card)", border:"1px solid var(--border)",
        borderRadius:12, width:"100%", maxWidth:width, maxHeight:"90vh", overflow:"auto",
        boxShadow:"0 24px 64px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"20px 24px", borderBottom:"1px solid var(--border)" }}>
          <h2 style={{ fontSize:16, fontWeight:700, color:"var(--text-primary)" }}>{title}</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:20, lineHeight:1, padding:4 }}>×</button>
        </div>
        <div style={{ padding:24 }}>{children}</div>
      </div>
    </div>
  );
}

export function StatCard({ label, value, icon, color="accent" }: { label: string; value: string|number; icon: ReactNode; color?: string }) {
  const colors: Record<string, string> = { accent:"var(--accent)", success:"var(--success)", danger:"var(--danger)", info:"var(--info)" };
  const c = colors[color] ?? colors.accent;
  return (
    <Card style={{ display:"flex", alignItems:"center", gap:16 }}>
      <div style={{ width:44, height:44, borderRadius:10, background:`${c}20`, border:`1px solid ${c}40`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:c }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize:22, fontWeight:800, color:"var(--text-primary)" }}>{value}</div>
        <div style={{ fontSize:12, color:"var(--text-secondary)" }}>{label}</div>
      </div>
    </Card>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div style={{ textAlign:"center", padding:"48px 24px" }}>
      <div style={{ color:"var(--text-muted)", marginBottom:12, display:"flex", justifyContent:"center" }}>{icon}</div>
      <div style={{ fontSize:16, fontWeight:700, color:"var(--text-primary)", marginBottom:8 }}>{title}</div>
      {description && <div style={{ fontSize:13, color:"var(--text-secondary)", marginBottom:16 }}>{description}</div>}
      {action}
    </div>
  );
}

interface SaveBarProps { dirty: boolean; saving: boolean; onSave: () => void; onDiscard: () => void; disabled?: boolean; }
export function SaveBar({ dirty, saving, onSave, onDiscard, disabled }: SaveBarProps) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
      transform: dirty ? "translateY(0)" : "translateY(100%)",
      transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
      background: "var(--bg-card)",
      borderTop: "1px solid var(--accent)",
      boxShadow: "0 -4px 32px rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 32px", gap: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          Want to save your changes?
        </span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onDiscard}
          disabled={saving}
          style={{
            padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8,
            background: "var(--bg-input)", border: "1px solid var(--border)",
            color: "var(--text-secondary)", cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.5 : 1, fontFamily: "inherit",
          }}
        >
          Discard
        </button>
        <button
          onClick={onSave}
          disabled={saving || disabled}
          style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 700, borderRadius: 8,
            background: "var(--accent)", border: "none",
            color: "#000", cursor: (saving || disabled) ? "not-allowed" : "pointer",
            opacity: (saving || disabled) ? 0.5 : 1, fontFamily: "inherit",
          }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

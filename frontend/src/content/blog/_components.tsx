/**
 * Shared inline-style helpers for blog article content components.
 * All blog articles import from here to stay visually consistent
 * without adding any new CSS or library dependencies.
 */

import { Link } from "react-router-dom";
import { CSSProperties, ReactNode } from "react";

/* ─── Typography ───────────────────────────────────────────── */

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "clamp(20px, 3vw, 26px)",
        fontWeight: 700,
        color: "#fff",
        margin: "48px 0 16px",
        lineHeight: 1.25,
        letterSpacing: "-0.3px",
      }}
    >
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3
      style={{
        fontSize: 18,
        fontWeight: 600,
        color: "#e2e8f0",
        margin: "32px 0 12px",
        lineHeight: 1.3,
      }}
    >
      {children}
    </h3>
  );
}

export function P({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p
      style={{
        fontSize: 16,
        lineHeight: 1.75,
        color: "#c4cfe4",
        margin: "0 0 20px",
        ...style,
      }}
    >
      {children}
    </p>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontSize: 18,
        lineHeight: 1.7,
        color: "#94a3b8",
        margin: "0 0 32px",
        borderLeft: "3px solid #5B6AF0",
        paddingLeft: 20,
      }}
    >
      {children}
    </p>
  );
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul
      style={{
        margin: "0 0 24px 0",
        paddingLeft: 24,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {children}
    </ul>
  );
}

export function LI({ children }: { children: ReactNode }) {
  return (
    <li style={{ fontSize: 16, lineHeight: 1.65, color: "#c4cfe4" }}>{children}</li>
  );
}

export function OL({ children }: { children: ReactNode }) {
  return (
    <ol
      style={{
        margin: "0 0 24px 0",
        paddingLeft: 24,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {children}
    </ol>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong style={{ color: "#fff", fontWeight: 600 }}>{children}</strong>;
}

/* ─── Special blocks ───────────────────────────────────────── */

export function Callout({ children, type = "info" }: { children: ReactNode; type?: "info" | "tip" | "warning" }) {
  const colors = {
    info: { bg: "rgba(91,106,240,0.08)", border: "#5B6AF0", icon: "ℹ" },
    tip: { bg: "rgba(52,211,153,0.08)", border: "#34d399", icon: "✓" },
    warning: { bg: "rgba(251,191,36,0.08)", border: "#fbbf24", icon: "!" },
  }[type];

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${colors.border}`,
        borderRadius: 8,
        padding: "16px 20px",
        margin: "24px 0",
        fontSize: 15,
        lineHeight: 1.65,
        color: "#c4cfe4",
      }}
    >
      <span style={{ fontWeight: 700, marginRight: 8, color: colors.border }}>{colors.icon}</span>
      {children}
    </div>
  );
}

export function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre
      style={{
        background: "#0a0c18",
        border: "1px solid #1e2235",
        borderRadius: 8,
        padding: "16px 20px",
        margin: "0 0 24px",
        fontSize: 13,
        lineHeight: 1.6,
        color: "#93c5fd",
        overflowX: "auto",
        fontFamily: "'Fira Code', 'Courier New', monospace",
      }}
    >
      <code>{children}</code>
    </pre>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code
      style={{
        background: "#1e2235",
        color: "#93c5fd",
        padding: "2px 6px",
        borderRadius: 4,
        fontSize: "0.875em",
        fontFamily: "'Fira Code', 'Courier New', monospace",
      }}
    >
      {children}
    </code>
  );
}

/* ─── Comparison table ─────────────────────────────────────── */

interface CompareRow {
  feature: string;
  manual: string;
  datahub: string;
}

export function CompareTable({
  rows,
  colA = "Manual / Excel",
  colB = "DataHub",
}: {
  rows: CompareRow[];
  colA?: string;
  colB?: string;
}) {
  const th: CSSProperties = {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#64748b",
    borderBottom: "1px solid #1e2235",
  };
  const td: CSSProperties = {
    padding: "12px 14px",
    fontSize: 14,
    lineHeight: 1.5,
    color: "#c4cfe4",
    borderBottom: "1px solid #1a1e30",
    verticalAlign: "top",
  };

  return (
    <div
      style={{
        margin: "0 0 32px",
        border: "1px solid #1e2235",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ background: "#131520" }}>
          <tr>
            <th style={th}>Feature</th>
            <th style={th}>{colA}</th>
            <th style={th}>{colB}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#0d0f1a" : "#101320" }}>
              <td style={{ ...td, fontWeight: 600, color: "#e2e8f0" }}>{row.feature}</td>
              <td style={td}>{row.manual}</td>
              <td style={{ ...td, color: "#34d399" }}>{row.datahub}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Mid-article CTA ──────────────────────────────────────── */

export function MidCTA({ text = "Try this on your own data — free, no install needed." }: { text?: string }) {
  return (
    <div
      style={{
        margin: "40px 0",
        background: "#131a3e",
        border: "1px solid #2a3a80",
        borderRadius: 12,
        padding: "24px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        flexWrap: "wrap",
      }}
    >
      <p style={{ fontSize: 15, color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>{text}</p>
      <Link
        to="/signup"
        style={{
          display: "inline-block",
          background: "#5B6AF0",
          color: "#fff",
          padding: "10px 22px",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Start free →
      </Link>
    </div>
  );
}

/* ─── FAQ section ──────────────────────────────────────────── */

interface FAQItem {
  q: string;
  a: string;
}

export function FAQ({ items }: { items: FAQItem[] }) {
  return (
    <div style={{ margin: "0 0 40px" }}>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#fff",
          margin: "48px 0 24px",
          letterSpacing: "-0.3px",
        }}
      >
        Frequently asked questions
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              background: "#131520",
              border: "1px solid #1e2235",
              borderRadius: 10,
              padding: "20px 24px",
            }}
          >
            <p style={{ fontSize: 16, fontWeight: 600, color: "#e2e8f0", margin: "0 0 8px" }}>
              {item.q}
            </p>
            <p style={{ fontSize: 14, color: "#94a3b8", margin: 0, lineHeight: 1.65 }}>{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Article wrapper ──────────────────────────────────────── */

export function Article({ children }: { children: ReactNode }) {
  return <div style={{ paddingBottom: 24 }}>{children}</div>;
}

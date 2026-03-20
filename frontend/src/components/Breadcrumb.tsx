import { Link } from "react-router-dom";

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
}

/**
 * Horizontal breadcrumb bar.
 * All segments except the last are rendered as links.
 * Last segment is plain text (current page).
 */
export function Breadcrumb({ segments }: BreadcrumbProps) {
  return (
    <nav
      aria-label="breadcrumb"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 36,
        padding: "0 18px",
        borderBottom: "1px solid var(--bd)",
        background: "var(--bg1)",
        fontSize: 13,
        flexShrink: 0,
      }}
    >
      {segments.map((seg, idx) => {
        const isLast = idx === segments.length - 1;
        return (
          <span key={idx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {idx > 0 && (
              <span style={{ color: "var(--tx2, #666)", userSelect: "none" }}>/</span>
            )}
            {!isLast && seg.href ? (
              <Link
                to={seg.href}
                style={{
                  color: "var(--tx1)",
                  textDecoration: "none",
                  fontWeight: 450,
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--tx0)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--tx1)"; }}
              >
                {seg.label}
              </Link>
            ) : (
              <span
                style={{
                  color: isLast ? "var(--tx0)" : "var(--tx1)",
                  fontWeight: isLast ? 500 : 450,
                }}
              >
                {seg.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

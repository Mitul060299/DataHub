import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";

/**
 * SEO-friendly 404 page. Marked noindex so Google does not include it in
 * the search index. Provides helpful links so the visit isn't a dead end.
 *
 * Note: Vercel / Vite SPAs can only emit HTTP 200 here because the React
 * shell is served via the catch-all rewrite. To return a real 404 status
 * we'd need server-side routing — accepted trade-off for now. The noindex
 * meta + clear "Page not found" copy keeps Google away from this URL.
 */
export function NotFoundPage() {
  useSEO({
    title: "Page not found – datahub.org.in",
    description:
      "The page you are looking for does not exist. Visit the datahub.org.in homepage, pricing, or documentation.",
    canonical: "https://datahub.org.in/",
    noIndex: true,
  });

  return (
    <main
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "48px 24px",
        textAlign: "center",
        background: "#0f111a",
        color: "#e5e7eb",
      }}
    >
      <h1 style={{ fontSize: 64, margin: 0, fontWeight: 800 }}>404</h1>
      <h2 style={{ fontSize: 24, margin: 0, fontWeight: 600 }}>Page not found</h2>
      <p style={{ maxWidth: 520, color: "#9ca3af", lineHeight: 1.6 }}>
        The page you are looking for does not exist or may have been moved. Try one of the links below.
      </p>
      <nav
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          justifyContent: "center",
          marginTop: 12,
        }}
      >
        <Link
          to="/"
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            background: "#a78bfa",
            color: "#0f111a",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Go home
        </Link>
        <Link
          to="/pricing"
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "1px solid #374151",
            color: "#e5e7eb",
            textDecoration: "none",
          }}
        >
          See pricing
        </Link>
        <Link
          to="/docs"
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "1px solid #374151",
            color: "#e5e7eb",
            textDecoration: "none",
          }}
        >
          Documentation
        </Link>
      </nav>
    </main>
  );
}

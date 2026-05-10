import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";
import { BLOG_POSTS } from "../data/blogPosts";

export function BlogIndexPage() {
  useSEO({
    title: "Blog – DataHub | Data Cleaning, Excel & Analyst Guides",
    description:
      "Practical guides for data analysts: reconcile Excel files, remove CSV duplicates, automate data cleaning, and cut your prep time. No code required.",
    canonical: "https://datahub.org.in/blog",
    ogType: "website",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "DataHub Blog",
      url: "https://datahub.org.in/blog",
      description:
        "Practical guides for data analysts: reconcile Excel files, remove CSV duplicates, automate data cleaning, and cut your prep time.",
      publisher: {
        "@type": "Organization",
        name: "DataHub",
        url: "https://datahub.org.in",
        logo: {
          "@type": "ImageObject",
          url: "https://datahub.org.in/logo.png",
        },
      },
    },
  });

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        background: "#0d0f1a",
        color: "#e2e8f0",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          borderBottom: "1px solid #1e2235",
          padding: "0 24px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          background: "#0d0f1a",
          zIndex: 100,
        }}
      >
        <Link
          to="/"
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: 18,
            textDecoration: "none",
            letterSpacing: "-0.3px",
          }}
        >
          DataHub
        </Link>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link to="/pricing" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none" }}>
            Pricing
          </Link>
          <Link to="/docs" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none" }}>
            Docs
          </Link>
          <Link
            to="/signup"
            style={{
              background: "#5B6AF0",
              color: "#fff",
              padding: "7px 18px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Start free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "64px 24px 48px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: "#5B6AF0",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          DataHub Blog
        </p>
        <h1
          style={{
            fontSize: "clamp(28px, 5vw, 44px)",
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.5px",
            margin: "0 0 16px",
            color: "#fff",
          }}
        >
          Practical guides for data analysts
        </h1>
        <p style={{ fontSize: 18, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>
          Less time cleaning data. More time understanding it.
        </p>
      </div>

      {/* Article grid */}
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "0 24px 96px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 24,
        }}
      >
        {BLOG_POSTS.map((post) => (
          <Link
            key={post.slug}
            to={`/blog/${post.slug}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <article
              style={{
                background: "#131520",
                border: "1px solid #1e2235",
                borderRadius: 12,
                padding: "28px 24px",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                transition: "border-color 0.15s, transform 0.15s",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#5B6AF0";
                (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#1e2235";
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
              }}
            >
              {/* Tags */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#5B6AF0",
                      background: "rgba(91,106,240,0.12)",
                      padding: "2px 8px",
                      borderRadius: 4,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Title */}
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  color: "#fff",
                  margin: 0,
                  letterSpacing: "-0.2px",
                }}
              >
                {post.title}
              </h2>

              {/* Excerpt */}
              <p
                style={{
                  fontSize: 14,
                  color: "#94a3b8",
                  lineHeight: 1.65,
                  margin: 0,
                  flexGrow: 1,
                }}
              >
                {post.excerpt}
              </p>

              {/* Meta */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  fontSize: 12,
                  color: "#64748b",
                  marginTop: 4,
                }}
              >
                <span>
                  {new Date(post.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span>·</span>
                <span>{post.readTime} min read</span>
              </div>
            </article>
          </Link>
        ))}
      </div>

      {/* Footer CTA */}
      <div
        style={{
          borderTop: "1px solid #1e2235",
          padding: "48px 24px",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 16, color: "#94a3b8", marginBottom: 20 }}>
          Ready to spend less time on data cleaning?
        </p>
        <Link
          to="/signup"
          style={{
            display: "inline-block",
            background: "#5B6AF0",
            color: "#fff",
            padding: "12px 28px",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Start free — no install needed
        </Link>
      </div>
    </div>
  );
}

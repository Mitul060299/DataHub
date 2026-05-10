import { lazy, Suspense } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { useSEO } from "../hooks/useSEO";
import { BLOG_POSTS, getPostBySlug, getRelatedPosts } from "../data/blogPosts";

// Lazy-load each article component by slug
const ARTICLE_COMPONENTS: Record<string, React.LazyExoticComponent<() => JSX.Element>> = {
  "reconcile-excel-files-automatically": lazy(
    () => import("../content/blog/reconcile-excel-files-automatically"),
  ),
  "remove-duplicates-csv-without-code": lazy(
    () => import("../content/blog/remove-duplicates-csv-without-code"),
  ),
  "alteryx-alternative-cheaper": lazy(
    () => import("../content/blog/alteryx-alternative-cheaper"),
  ),
  "data-cleaning-tool-for-analysts": lazy(
    () => import("../content/blog/data-cleaning-tool-for-analysts"),
  ),
  "standardise-column-names-excel": lazy(
    () => import("../content/blog/standardise-column-names-excel"),
  ),
  "clean-messy-excel-csv-without-coding": lazy(
    () => import("../content/blog/clean-messy-excel-csv-without-coding"),
  ),
  "affordable-alteryx-alternative-small-teams": lazy(
    () => import("../content/blog/affordable-alteryx-alternative-small-teams"),
  ),
  "prepare-raw-data-for-power-bi": lazy(
    () => import("../content/blog/prepare-raw-data-for-power-bi"),
  ),
  "why-analysts-spend-more-time-cleaning": lazy(
    () => import("../content/blog/why-analysts-spend-more-time-cleaning"),
  ),
  "automate-repetitive-data-cleaning-workflows": lazy(
    () => import("../content/blog/automate-repetitive-data-cleaning-workflows"),
  ),
};

function ArticleSkeleton() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      {[200, 160, 300, 240, 280].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? 32 : 16,
            width: `${w}px`,
            maxWidth: "100%",
            background: "#1e2235",
            borderRadius: 6,
            marginBottom: i === 0 ? 24 : 12,
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}

export function BlogPostPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const post = getPostBySlug(slug);
  const related = getRelatedPosts(slug);
  const ArticleComponent = ARTICLE_COMPONENTS[slug];

  // Unknown slug → 404
  if (!post || !ArticleComponent) {
    return <Navigate to="/blog" replace />;
  }

  useSEO({
    title: `${post.title} | DataHub Blog`,
    description: post.excerpt,
    canonical: `https://datahub.org.in/blog/${post.slug}`,
    ogType: "article",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      dateModified: post.date,
      author: {
        "@type": "Organization",
        name: "DataHub Team",
        url: "https://datahub.org.in",
      },
      publisher: {
        "@type": "Organization",
        name: "DataHub",
        url: "https://datahub.org.in",
        logo: {
          "@type": "ImageObject",
          url: "https://datahub.org.in/logo.png",
        },
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `https://datahub.org.in/blog/${post.slug}`,
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
          <Link to="/blog" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none" }}>
            Blog
          </Link>
          <Link to="/pricing" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none" }}>
            Pricing
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

      {/* Article header */}
      <header
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "52px 24px 0",
        }}
      >
        {/* Breadcrumb */}
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
          <Link to="/blog" style={{ color: "#64748b", textDecoration: "none" }}>
            Blog
          </Link>
          <span style={{ margin: "0 8px" }}>›</span>
          <span style={{ color: "#94a3b8" }}>{post.tags[0]}</span>
        </div>

        {/* Tags */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {post.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#5B6AF0",
                background: "rgba(91,106,240,0.12)",
                padding: "3px 10px",
                borderRadius: 4,
                letterSpacing: "0.05em",
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        <h1
          style={{
            fontSize: "clamp(24px, 4.5vw, 38px)",
            fontWeight: 800,
            lineHeight: 1.2,
            letterSpacing: "-0.5px",
            color: "#fff",
            margin: "0 0 20px",
          }}
        >
          {post.title}
        </h1>

        {/* Meta row */}
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            fontSize: 13,
            color: "#64748b",
            borderBottom: "1px solid #1e2235",
            paddingBottom: 28,
            marginBottom: 40,
          }}
        >
          <span>DataHub Team</span>
          <span>·</span>
          <span>
            {new Date(post.date).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          <span>·</span>
          <span>{post.readTime} min read</span>
        </div>
      </header>

      {/* Article body */}
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
        <Suspense fallback={<ArticleSkeleton />}>
          <ArticleComponent />
        </Suspense>

        {/* End CTA */}
        <div
          style={{
            marginTop: 64,
            marginBottom: 24,
            background: "linear-gradient(135deg, #131a3e 0%, #1a1f3a 100%)",
            border: "1px solid #5B6AF0",
            borderRadius: 16,
            padding: "40px 32px",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#fff",
              margin: "0 0 12px",
              letterSpacing: "-0.3px",
            }}
          >
            Stop doing this manually.
          </h2>
          <p style={{ fontSize: 15, color: "#94a3b8", margin: "0 0 28px", lineHeight: 1.6 }}>
            DataHub handles every step described in this article — upload your file, describe what
            you want in plain English, and get clean data in seconds. Free plan, no install needed.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
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
              Start for free
            </Link>
            <Link
              to="/pricing"
              style={{
                display: "inline-block",
                background: "transparent",
                color: "#94a3b8",
                padding: "12px 28px",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                textDecoration: "none",
                border: "1px solid #2a3050",
              }}
            >
              See pricing
            </Link>
          </div>
        </div>
      </main>

      {/* Related posts */}
      {related.length > 0 && (
        <section
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            padding: "48px 24px 80px",
          }}
        >
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              margin: "0 0 24px",
            }}
          >
            Related articles
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {related.map((rp) => (
              <Link
                key={rp.slug}
                to={`/blog/${rp.slug}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    background: "#131520",
                    border: "1px solid #1e2235",
                    borderRadius: 10,
                    padding: "20px",
                    transition: "border-color 0.15s",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor = "#5B6AF0")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor = "#1e2235")
                  }
                >
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    {rp.tags.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#5B6AF0",
                          background: "rgba(91,106,240,0.12)",
                          padding: "2px 7px",
                          borderRadius: 3,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#e2e8f0",
                      margin: "0 0 8px",
                      lineHeight: 1.35,
                    }}
                  >
                    {rp.title}
                  </p>
                  <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                    {rp.readTime} min read
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

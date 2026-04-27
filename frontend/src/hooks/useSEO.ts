import { useEffect } from "react";

export interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  /** Defaults to the site logo. Provide a 1200×630 image for best social previews. */
  ogImage?: string;
  ogType?: "website" | "article";
  noIndex?: boolean;
  /** One or more JSON-LD structured-data objects injected as a <script> tag. */
  structuredData?: object | object[];
}

const DEFAULT_OG_IMAGE = "https://datahub.org.in/logo.png";

function upsertMeta(attr: "name" | "property", key: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/**
 * Dynamically updates <title>, meta description, Open Graph, Twitter Card,
 * canonical link, and optional JSON-LD structured data for the current page.
 * Restores the default title on unmount.
 */
export function useSEO({
  title,
  description,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = "website",
  noIndex = false,
  structuredData,
}: SEOProps): void {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    // Core
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", noIndex ? "noindex, nofollow" : "index, follow");

    // Open Graph
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", ogType);
    upsertMeta("property", "og:image", ogImage);
    upsertMeta("property", "og:image:alt", "datahub.org.in – AI Data Analysis Platform");
    if (canonical) upsertMeta("property", "og:url", canonical);

    // Twitter Card
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", ogImage);
    upsertMeta("name", "twitter:image:alt", "datahub.org.in – AI Data Analysis Platform");

    // Canonical link
    if (canonical) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = canonical;
    }

    // JSON-LD structured data
    let sdScript: HTMLScriptElement | null = null;
    if (structuredData) {
      sdScript = document.createElement("script");
      sdScript.type = "application/ld+json";
      sdScript.id = "__page-ld-json__";
      sdScript.textContent = JSON.stringify(
        Array.isArray(structuredData) ? structuredData : [structuredData],
      );
      document.head.appendChild(sdScript);
    }

    return () => {
      document.title = prevTitle;
      sdScript?.remove();
      // Remove the canonical tag on unmount so stale canonicals don't persist
      // when navigating to a page that doesn't set one.
      document.querySelector('link[rel="canonical"]')?.remove();
    };
    // structuredData intentionally excluded — objects passed inline would cause
    // infinite re-runs. Callers should memoise the value with useMemo if dynamic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, canonical, ogImage, ogType, noIndex]);
}

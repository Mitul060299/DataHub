/**
 * useBranding.ts — fetches org branding and applies it as CSS custom properties.
 *
 * Usage (call once at the app root, e.g. inside App.tsx):
 *   const { branding } = useBranding();
 *
 * The hook:
 *  1. Fetches GET /organization/branding (only when the user is authenticated)
 *  2. Writes CSS variables to :root so every component can use var(--brand-primary)
 *  3. Injects a <link> for the custom favicon if the org has one set
 *  4. Updates <title> prefix when product_name is set
 *  5. Is a no-op for unauthenticated visitors (homepage, public dashboard)
 */

import { useEffect, useState } from "react";
import type { OrgBranding } from "../api";
import { fetchOrgBranding } from "../api";
import { supabase } from "../lib/supabase";

const DEFAULT_PRIMARY = "#5B6AF0";

function applyBranding(b: OrgBranding): void {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", b.primary_color || DEFAULT_PRIMARY);

  // Derive a slightly lighter shade for hover states (simple HSL shift)
  if (b.primary_color) {
    root.style.setProperty("--brand-primary-hover", b.primary_color);
  } else {
    root.style.setProperty("--brand-primary-hover", "#7B8AF8");
  }

  // Favicon
  if (b.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = b.favicon_url;
  }

  // Product name in tab title (replaces "DataHub" prefix)
  if (b.product_name && !document.title.startsWith(b.product_name)) {
    document.title = document.title.replace(/^DataHub/, b.product_name);
  }

  // Custom CSS — injected into a <style> tag with a stable id
  const cssId = "org-custom-css";
  let styleTag = document.getElementById(cssId) as HTMLStyleElement | null;
  if (b.custom_css) {
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = cssId;
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = b.custom_css;
  } else if (styleTag) {
    styleTag.remove();
  }
}

function clearBranding(): void {
  const root = document.documentElement;
  root.style.removeProperty("--brand-primary");
  root.style.removeProperty("--brand-primary-hover");
  const styleTag = document.getElementById("org-custom-css");
  if (styleTag) styleTag.remove();
}

export function useBranding(): { branding: OrgBranding | null } {
  const [branding, setBranding] = useState<OrgBranding | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // unauthenticated — no branding to fetch

      try {
        const b = await fetchOrgBranding();
        if (cancelled) return;
        setBranding(b);
        applyBranding(b);
      } catch {
        // Non-fatal — branding endpoint may not exist yet or user has no org
      }
    }

    load();
    return () => {
      cancelled = true;
      clearBranding();
    };
  }, []);

  return { branding };
}

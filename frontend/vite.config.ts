import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    // Emit source maps in production so runtime stack traces in user reports
    // map back to real component / line numbers (e.g. PlanDAG.tsx:97) instead
    // of the minified `DM`/`KM` chunk names.  "hidden" keeps the //# comment
    // out of the deployed bundle so source paths aren't exposed in DevTools
    // by default — upload the .map files to Sentry / your error tracker.
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          const isReact = id.includes("/node_modules/react/") || id.includes("\\node_modules\\react\\");
          const isReactDom = id.includes("/node_modules/react-dom/") || id.includes("\\node_modules\\react-dom\\");
          if (isReact || isReactDom) return "react";
          if (id.includes("antd") || id.includes("@ant-design")) return "antd";
          if (id.includes("echarts")) return "charts";
          if (id.includes("reactflow")) return "flow";
          if (id.includes("react-grid-layout") || id.includes("react-resizable")) return "grid";
          if (id.includes("zod")) return "zod";
          // framer-motion is only used on HomePage — keep it out of the shared bundle
          if (id.includes("framer-motion")) return "framer";
          // Supabase client is large (~200 KB) — split it from app code
          if (id.includes("@supabase")) return "supabase";
          // PostHog is analytics-only — lazy load it separately
          if (id.includes("posthog-js")) return "posthog";
          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "https://datahub-0dbp.onrender.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path: string) => path.replace(/^\/api/, ""),
      }
    }
  }
});

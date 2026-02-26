import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          const isReact = id.includes("/node_modules/react/") || id.includes("\\node_modules\\react\\");
          const isReactDom = id.includes("/node_modules/react-dom/") || id.includes("\\node_modules\\react-dom\\");
          if (isReact || isReactDom) return "react";
          if (id.includes("antd") || id.includes("@ant-design")) return "antd";
          if (id.includes("recharts")) return "charts";
          if (id.includes("reactflow")) return "flow";
          if (id.includes("react-grid-layout") || id.includes("react-resizable")) return "grid";
          if (id.includes("zod")) return "zod";
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
      }
    }
  }
});

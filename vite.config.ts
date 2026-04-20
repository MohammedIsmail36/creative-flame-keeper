import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Increase warning threshold so we don't get noise from intentionally-large chunks
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split heavy/rarely-used libs into their own chunks so the main bundle stays small
        // and report/PDF/Excel code only downloads when the user opens those features.
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;

          // Charts (recharts + d3 deps) — only needed on Dashboard & analytics reports
          if (
            id.includes("/recharts/") ||
            id.includes("/victory-vendor/") ||
            id.includes("/d3-")
          ) {
            return "charts";
          }

          // PDF generation — only needed when exporting/printing
          if (
            id.includes("/jspdf") ||
            id.includes("/jspdf-autotable") ||
            id.includes("/html2canvas") ||
            id.includes("/canvg")
          ) {
            return "pdf";
          }

          // Excel/CSV export
          if (id.includes("/xlsx") || id.includes("/papaparse")) {
            return "excel";
          }

          // Icon library (lucide-react). Tree-shaking handles unused icons,
          // but isolating it keeps the main entry small and cacheable.
          if (id.includes("/lucide-react/")) {
            return "icons";
          }

          // Date utilities
          if (id.includes("/date-fns/") || id.includes("/dayjs/")) {
            return "date";
          }

          // Radix UI primitives — large surface area, used across many pages
          if (id.includes("/@radix-ui/")) {
            return "radix";
          }

          // Supabase client
          if (id.includes("/@supabase/")) {
            return "supabase";
          }

          // React core stays in the main vendor chunk for fastest TTI
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/scheduler/")
          ) {
            return "react-vendor";
          }

          return "vendor";
        },
      },
    },
  },
}));

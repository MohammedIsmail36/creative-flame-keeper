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

          // CRITICAL: React core MUST be checked first so it's bundled together
          // and loaded before any library that depends on it (Radix, Recharts, etc.)
          // Otherwise split chunks may execute before React is initialized,
          // causing "Cannot read properties of undefined (reading 'forwardRef')".
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/react-router-dom/") ||
            id.includes("/scheduler/") ||
            id.includes("/use-sync-external-store/") ||
            id.includes("/react-is/")
          ) {
            return "react-vendor";
          }

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
            id.includes("/@react-pdf/") ||
            id.includes("/jspdf") ||
            id.includes("/html2canvas") ||
            id.includes("/canvg") ||
            id.includes("/pdfkit") ||
            id.includes("/fontkit") ||
            id.includes("/yoga-layout") ||
            id.includes("/restructure") ||
            id.includes("/png-js") ||
            id.includes("/brotli") ||
            id.includes("/linebreak") ||
            id.includes("/unicode-")
          ) {
            return "pdf";
          }

          // Excel/CSV export
          if (
            id.includes("/exceljs") ||
            id.includes("/xlsx") ||
            id.includes("/papaparse") ||
            id.includes("/fast-csv") ||
            id.includes("/@fast-csv")
          ) {
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

          // React core handled at top of function

          return "vendor";
        },
      },
    },
  },
}));

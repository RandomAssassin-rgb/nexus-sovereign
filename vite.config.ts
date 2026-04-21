import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const includesPackage = (id: string, packageName: string) =>
  id.includes(`/node_modules/${packageName}/`) || id.includes(`\\node_modules\\${packageName}\\`);
const devApiTarget = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  cacheDir: ".vite/app-client",
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: devApiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (
            includesPackage(id, "react") ||
            includesPackage(id, "react-dom") ||
            includesPackage(id, "react-router") ||
            includesPackage(id, "react-router-dom") ||
            includesPackage(id, "scheduler")
          ) {
            return "react-vendor";
          }

          if (
            includesPackage(id, "framer-motion") ||
            includesPackage(id, "motion")
          ) {
            return "motion-vendor";
          }

          if (
            includesPackage(id, "mapbox-gl") ||
            includesPackage(id, "react-map-gl") ||
            includesPackage(id, "h3-js")
          ) {
            return "maps-vendor";
          }

          if (
            includesPackage(id, "face-api.js") ||
            includesPackage(id, "tesseract.js")
          ) {
            return "vision-vendor";
          }

          if (
            includesPackage(id, "html2canvas") ||
            includesPackage(id, "html-to-image") ||
            includesPackage(id, "jspdf")
          ) {
            return "capture-vendor";
          }

          if (includesPackage(id, "@supabase")) {
            return "supabase-vendor";
          }

          return undefined;
        },
      },
    },
  },
});

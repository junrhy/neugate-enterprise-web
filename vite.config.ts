import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@tauri-apps/plugin-sql": path.resolve(__dirname, "src/lib/tauri-sql-web.ts"),
      "@tauri-apps/api/core": path.resolve(__dirname, "src/lib/tauri-api-web.ts"),
      "@tauri-apps/api/window": path.resolve(__dirname, "src/lib/tauri-window-web.ts"),
      "@tauri-apps/plugin-opener": path.resolve(__dirname, "src/lib/tauri-opener-web.ts"),
      "@tauri-apps/plugin-process": path.resolve(__dirname, "src/lib/tauri-process-web.ts"),
      "@tauri-apps/plugin-updater": path.resolve(__dirname, "src/lib/tauri-updater-web.ts"),
      "@tauri-apps/plugin-dialog": path.resolve(__dirname, "src/lib/tauri-dialog-web.ts"),
      "@tauri-apps/plugin-fs": path.resolve(__dirname, "src/lib/tauri-fs-web.ts"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8642",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(
      __dirname,
      "../packages/ui/src/courgette_ui/static/dist"
    ),
    emptyOutDir: true,
  },
});

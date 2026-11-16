import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL("./src/client", import.meta.url)),
  plugins: [react()],
  server: {
    proxy: { "/bindTicket": "http://localhost:8787" },
  },
  build: {
    minify: false,
    sourcemap: true,
    outDir: fileURLToPath(new URL("./dist/client", import.meta.url)),
    emptyOutDir: true,
  },
});

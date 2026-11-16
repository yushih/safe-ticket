import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL("./src/client", import.meta.url)),
  plugins: [react()],
  server: {
    proxy: {
      "/bindTicket": "http://localhost:8787",
      "/verify-ticket": "http://localhost:8787",
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./src/client/index.html", import.meta.url)),
        verify: fileURLToPath(new URL("./src/client/verify.html", import.meta.url)),
      },
    },
    minify: false,
    sourcemap: true,
    outDir: fileURLToPath(new URL("./dist/client", import.meta.url)),
    emptyOutDir: true,
  },
});

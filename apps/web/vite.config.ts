import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: process.env.GRAPHCODE_WEB_HOST ?? "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3010"
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true
  }
});

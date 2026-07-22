import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const DEFAULT_WEB_PORT = 5173;
const DEFAULT_SERVER_PORT = 3010;

function resolvePort(input: string | undefined, fallback: number): number {
  if (!input) {
    return fallback;
  }
  const port = Number.parseInt(input, 10);
  return Number.isFinite(port) && port > 0 ? port : fallback;
}

function proxyHostForServer(host: string): string {
  if (host === "0.0.0.0" || host === "::") {
    return "127.0.0.1";
  }
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

const webHost = process.env.GRAPHCODE_WEB_HOST ?? "127.0.0.1";
const webPort = resolvePort(process.env.GRAPHCODE_WEB_PORT, DEFAULT_WEB_PORT);
const serverHost = process.env.GRAPHCODE_SERVER_HOST ?? "127.0.0.1";
const serverPort = resolvePort(process.env.GRAPHCODE_SERVER_PORT ?? process.env.PORT, DEFAULT_SERVER_PORT);
const apiProxyTarget = process.env.GRAPHCODE_API_PROXY_TARGET ?? `http://${proxyHostForServer(serverHost)}:${serverPort}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: webHost,
    port: webPort,
    proxy: {
      "/api": apiProxyTarget
    }
  },
  test: {
    environment: "jsdom",
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    setupFiles: ["./src/test/setup.ts"],
    globals: true
  }
});

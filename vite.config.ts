import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

function readVersion() {
  return readFileSync("VERSION", "utf8").trim();
}

function readCommitHash() {
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA.slice(0, 7);
  }

  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
}

export default defineConfig({
  base: process.env.APP_BASE_PATH ?? (process.env.GITHUB_PAGES === "true" ? "/Dispatch-Tool/" : "/"),
  plugins: [react()],
  cacheDir: "/private/tmp/dispatch-tool-vite-cache",
  define: {
    __APP_VARIANT__: JSON.stringify(process.env.APP_VARIANT ?? "resource-planning"),
    __APP_VERSION__: JSON.stringify(readVersion()),
    __BUILD_COMMIT__: JSON.stringify(readCommitHash()),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          xlsx: ["xlsx"],
          dnd: ["@dnd-kit/core", "@dnd-kit/utilities"],
          icons: ["lucide-react"],
        },
      },
    },
  },
});

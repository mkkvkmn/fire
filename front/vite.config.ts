// Vite and Vitest config for the fire web app.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { cspPlugin } from "./csp.ts";

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "package.json"), "utf8")) as { version: string };

export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // The commit the site was built from (set by the deploy workflow), so anyone can match it to the repo.
    __BUILD_COMMIT__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 12) ?? "local"),
  },
  plugins: [cspPlugin()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    outDir: "dist",
    target: "es2022",
    // sql.js carries its wasm inline (about 960 kB); it is its own lazily loaded chunk.
    chunkSizeWarningLimit: 1100,
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * GitHub Pages deployment notes
 * -----------------------------
 * This builds the app for https://ankur9301.github.io (a *user* page, served
 * at the root). Therefore:
 *
 *   base: "/"                       // root, not "/repo-name/"
 *
 * After build we copy dist/index.html → dist/404.html so client-side routing
 * (deep links + refresh) keeps working: GH Pages serves 404.html for any
 * unknown path, our SPA then renders the right view.
 *
 * Secrets are read from process.env at build time (provided by GitHub Actions
 * repository secrets). They are public by nature — only put the anon key here,
 * never the service-role key.
 */

function spa404Plugin() {
  return {
    name: "spa-404-fallback",
    closeBundle() {
      const outDir = resolve(process.cwd(), "dist");
      const indexHtml = resolve(outDir, "index.html");
      const fourOhFour = resolve(outDir, "404.html");
      if (existsSync(indexHtml)) {
        copyFileSync(indexHtml, fourOhFour);
        // eslint-disable-next-line no-console
        console.log("[spa-404-fallback] wrote dist/404.html");
      }
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [react(), spa404Plugin()],
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2020",
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});

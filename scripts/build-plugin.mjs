#!/usr/bin/env node
/**
 * Builds the Figma plugin in two steps:
 *   1. esbuild  → src/plugin/code.ts  →  dist/code.js
 *   2. vite     → src/app (React UI)  →  dist/ui.html  (single inlined file)
 */
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { createRequire } from "module";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── 1. Plugin sandbox code ─────────────────────────────────────────────────

console.log("Building plugin sandbox code…");
await esbuild({
  entryPoints: [resolve(root, "src/plugin/code.ts")],
  bundle: true,
  outfile: resolve(root, "dist/code.js"),
  target: "es6",
  platform: "browser",
  format: "iife",
  tsconfig: resolve(root, "tsconfig.plugin.json"),
  logLevel: "info",
});
console.log("✓  dist/code.js");

// ── 2. Plugin UI (React → single HTML) ────────────────────────────────────

console.log("\nBuilding plugin UI…");
const require = createRequire(import.meta.url);
const { viteSingleFile } = require("vite-plugin-singlefile");
const react = (await import("@vitejs/plugin-react")).default;
const tailwind = (await import("@tailwindcss/vite")).default;
const path = (await import("path")).default;

mkdirSync(resolve(root, "dist"), { recursive: true });

// Write a temporary HTML entry point for the plugin UI build
const tmpHtml = resolve(root, "dist/_plugin_ui_entry.html");
writeFileSync(tmpHtml, `<!doctype html>
<html lang="ru">
  <head><meta charset="UTF-8"><title>SlideCheck</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/plugin-ui-entry.tsx"></script>
  </body>
</html>`);

await viteBuild({
  root,
  configFile: false,
  plugins: [react(), tailwind(), viteSingleFile()],
  resolve: { alias: { "@": resolve(root, "src") } },
  build: {
    outDir: resolve(root, "dist/ui-build"),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      input: tmpHtml,
    },
  },
  logLevel: "warn",
});

// Copy the built HTML to dist/ui.html (vite-plugin-singlefile may nest output)
const builtPaths = [
  resolve(root, "dist/ui-build/_plugin_ui_entry.html"),
  resolve(root, "dist/ui-build/dist/_plugin_ui_entry.html"),
];
const builtPath = builtPaths.find(p => { try { readFileSync(p); return true; } catch { return false; } });
if (!builtPath) throw new Error("Could not find built UI HTML. Check Vite output.");
const uiHtml = readFileSync(builtPath, "utf8");
writeFileSync(resolve(root, "dist/ui.html"), uiHtml);
console.log("✓  dist/ui.html");

console.log("\n✅  Plugin ready. Load manifest.json in Figma → Plugins → Development.");

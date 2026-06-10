import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";

const miniappDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(miniappDir, "..");

function copyDirRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

function copyLegacyWebAssets(): Plugin {
  return {
    name: "nma-copy-legacy-web-assets",
    closeBundle() {
      const outWeb = path.resolve(miniappDir, "dist", "web");
      if (!fs.existsSync(outWeb)) return;

      for (const file of ["app.js", "app.css", "sw.js", "manifest.json", "brand-icon.png"]) {
        const src = path.join(webRoot, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(outWeb, file));
        }
      }

      const uiSrc = path.join(webRoot, "ui");
      if (fs.existsSync(uiSrc)) {
        copyDirRecursive(uiSrc, path.join(outWeb, "ui"));
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  loadEnv(mode, miniappDir, "VITE_");

  return {
    base: "./",
    root: webRoot,
    envDir: miniappDir,
    publicDir: false,
    plugins: [copyLegacyWebAssets()],
    resolve: {
      alias: {
        "@apps-in-toss/web-framework": path.resolve(
          miniappDir,
          "node_modules/@apps-in-toss/web-framework",
        ),
      },
    },
    build: {
      outDir: path.resolve(miniappDir, "dist"),
      emptyOutDir: true,
      target: "es2022",
      rollupOptions: {
        input: path.resolve(webRoot, "index.html"),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
  };
});

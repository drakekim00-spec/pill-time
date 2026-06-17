import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const miniappDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.resolve(miniappDir, "..");
const outWeb = path.resolve(miniappDir, "dist", "web");

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

if (!fs.existsSync(outWeb)) {
  console.error("[copy-legacy] dist/web 없음 — 먼저 ait build 를 실행하세요.");
  process.exit(1);
}

for (const file of ["app.js", "app.css", "sw.js", "manifest.json", "brand-icon.png"]) {
  const src = path.join(webRoot, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(outWeb, file));
    console.log("[copy-legacy]", file);
  }
}

const uiSrc = path.join(webRoot, "ui");
if (fs.existsSync(uiSrc)) {
  copyDirRecursive(uiSrc, path.join(outWeb, "ui"));
  console.log("[copy-legacy] ui/");
}

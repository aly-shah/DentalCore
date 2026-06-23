// After `next build` with output:'standalone', Next emits a minimal server in
// .next/standalone but does NOT copy static assets or the public/ folder, and
// it doesn't reliably trace Prisma's native query engine. This script makes the
// standalone dir fully self-contained so Electron can run it offline.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isSymbolicLink()) {
      try { fs.copyFileSync(fs.realpathSync(s), d); } catch {}
    } else fs.copyFileSync(s, d);
  }
  return true;
}

if (!fs.existsSync(STANDALONE)) {
  console.error("✗ .next/standalone not found — run `next build` with BUILD_STANDALONE=1 first");
  process.exit(1);
}

// 1) static assets + public dir
copyDir(path.join(ROOT, ".next", "static"), path.join(STANDALONE, ".next", "static"));
copyDir(path.join(ROOT, "public"), path.join(STANDALONE, "public"));

// 2) guarantee the Prisma client + native engine are present
copyDir(
  path.join(ROOT, "node_modules", ".prisma"),
  path.join(STANDALONE, "node_modules", ".prisma")
);
copyDir(
  path.join(ROOT, "node_modules", "@prisma", "client"),
  path.join(STANDALONE, "node_modules", "@prisma", "client")
);

console.log("✓ standalone bundle assembled at", STANDALONE);

// Local smoke test: mimics what Electron's main process does, minus the GUI.
// Copies the seeded template, starts embedded postgres, boots the standalone
// Next server against it, then checks /api/health and a real login.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";

const require = createRequire(import.meta.url);
const { startDatabase } = require("../desktop/database.js");
const { startNextServer } = require("../desktop/next-server.js");

const ROOT = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dentacore-smoke-"));

function post(port, p, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port, path: p, method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) } },
      (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b, headers: res.headers })); }
    );
    req.on("error", reject); req.write(data); req.end();
  });
}
function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: p }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b })); }).on("error", reject);
  });
}

let db, server;
try {
  db = await startDatabase({
    templateDir: path.join(ROOT, "desktop", "resources", "pgdata"),
    dataDir: path.join(tmp, "pgdata"),
    onStatus: (m) => console.log("  status:", m),
  });
  console.log("DB up:", db.url.replace(/:[^:@]+@/, ":***@"));

  server = await startNextServer({
    serverJs: path.join(ROOT, ".next", "standalone", "server.js"),
    databaseUrl: db.url,
    authSecret: "ci-not-a-real-secret-ci-not-a-real-secret-0123",
  });
  console.log("Next up on port", server.port);

  const health = await get(server.port, "/api/health");
  console.log("HEALTH", health.status, health.body);

  // Find the login route shape by trying the common API path.
  const login = await post(server.port, "/api/auth/login", { email: "admin@dentacore.com", password: "password" });
  console.log("LOGIN", login.status, login.body.slice(0, 200));
  console.log("LOGIN set-cookie:", !!login.headers["set-cookie"]);
} catch (e) {
  console.error("SMOKE FAILED:", e);
  process.exitCode = 1;
} finally {
  if (server) server.stop();
  if (db) await db.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
}

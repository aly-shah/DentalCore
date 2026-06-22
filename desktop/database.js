// Embedded PostgreSQL lifecycle for the desktop app.
//
// On first launch we copy the bundled, pre-seeded data dir template into a
// writable per-user location (Program Files is read-only). Postgres then runs
// against that copy, so the user's edits persist between launches while the
// installed template stays pristine.

// embedded-postgres is ESM-only; load it via dynamic import from this CJS module.
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");

const creds = require("./db.json");

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * @param {object} opts
 * @param {string} opts.templateDir  bundled, read-only seeded pgdata
 * @param {string} opts.dataDir      writable per-user pgdata location
 * @param {(msg:string)=>void} [opts.onStatus]
 * @returns {Promise<{ url: string, stop: () => Promise<void> }>}
 */
async function startDatabase({ templateDir, dataDir, onStatus = () => {} }) {
  const firstRun = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
  if (firstRun) {
    onStatus("Setting up the demo database (first launch only)…");
    fs.rmSync(dataDir, { recursive: true, force: true });
    copyDirSync(templateDir, dataDir);
    // Postgres refuses to start unless the data dir is private (0700/0750).
    // The copy recreates dirs with default perms, so tighten it back. No-op on
    // Windows, where postgres skips this check.
    try {
      fs.chmodSync(dataDir, 0o700);
    } catch {
      /* ignore on platforms that don't support chmod */
    }
  }

  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const port = await findFreePort();
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: creds.user,
    password: creds.password,
    port,
    persistent: true,
  });

  onStatus("Starting the database…");
  await pg.start(); // data dir is already initialised in the template

  const url = `postgresql://${creds.user}:${creds.password}@127.0.0.1:${port}/${creds.database}`;
  return {
    url,
    stop: async () => {
      try {
        await pg.stop();
      } catch {
        /* best-effort on shutdown */
      }
    },
  };
}

module.exports = { startDatabase, findFreePort };

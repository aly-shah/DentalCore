// Build-time only. Produces a fully-seeded PostgreSQL data directory that the
// desktop app ships and copies to a writable location on first launch.
//
// Flow: initdb -> start postgres via pg_ctl -> `prisma migrate deploy` ->
// `tsx prisma/seed.ts` -> stop. The resulting data dir (desktop/resources/pgdata)
// already contains the schema + all mock data, so the installed app needs no
// migration/seed step at runtime — it just starts postgres against this dir.
//
// Why pg_ctl (not embedded-postgres' own start): on Windows CI the runner is an
// administrator, and postgres.exe refuses to run under an admin token. pg_ctl
// launches it with a restricted (de-elevated) token, which is the documented
// way to start postgres as admin. Runtime on a normal user account is fine with
// the direct spawn embedded-postgres uses.
//
// IMPORTANT: this data dir is binary-compatible only with the same platform +
// postgres version it was built on. CI builds it on windows-latest for the
// Windows installer; running it locally on Linux only validates the pipeline.

import EmbeddedPostgres from "embedded-postgres";
import { execSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const creds = JSON.parse(readFileSync(path.join(ROOT, "desktop", "db.json"), "utf8"));

const DATA_DIR = path.join(ROOT, "desktop", "resources", "pgdata");
const PORT = 54329; // build-time only; runtime picks a free port

/** Locate a binary inside the platform-specific @embedded-postgres package. */
function pgBin(name) {
  const base = path.join(ROOT, "node_modules", "@embedded-postgres");
  const platformDir = readdirSync(base).find((d) => existsSync(path.join(base, d, "native", "bin")));
  if (!platformDir) throw new Error("@embedded-postgres native bin not found");
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  return path.join(base, platformDir, "native", "bin", exe);
}

async function connectWithRetry(Client, url, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const c = new Client({ connectionString: url });
    try {
      await c.connect();
      return c;
    } catch (e) {
      await c.end().catch(() => {});
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

async function main() {
  if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(path.dirname(DATA_DIR), { recursive: true });

  // initdb only (does not start the server).
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: creds.user,
    password: creds.password,
    port: PORT,
    persistent: true,
  });
  console.log("• initdb …");
  await pg.initialise();

  const pgCtl = pgBin("pg_ctl");
  const logFile = path.join(ROOT, "desktop", "resources", "pgdata-build.log");
  console.log("• starting postgres via pg_ctl on", PORT, "…");
  execFileSync(pgCtl, ["-D", DATA_DIR, "-o", `-p ${PORT}`, "-l", logFile, "-w", "-t", "60", "start"], {
    stdio: "inherit",
  });

  const { default: pgModule } = await import("pg");
  const Client = pgModule.Client;
  const adminUrl = `postgresql://${creds.user}:${creds.password}@127.0.0.1:${PORT}/postgres`;
  const dbUrl = `postgresql://${creds.user}:${creds.password}@127.0.0.1:${PORT}/${creds.database}`;

  try {
    console.log("• creating database", creds.database, "…");
    const admin = await connectWithRetry(Client, adminUrl);
    await admin.query(`CREATE DATABASE "${creds.database}"`);
    await admin.end();

    const env = { ...process.env, DATABASE_URL: dbUrl };
    console.log("• prisma migrate deploy …");
    execSync("npx prisma migrate deploy", { stdio: "inherit", env, cwd: ROOT });
    console.log("• seeding mock data …");
    execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env, cwd: ROOT });
  } finally {
    console.log("• stopping postgres …");
    try {
      execFileSync(pgCtl, ["-D", DATA_DIR, "-m", "fast", "-w", "stop"], { stdio: "inherit" });
    } catch {
      /* best-effort */
    }
  }

  console.log("\n✓ Seeded pgdata template at", DATA_DIR);
}

main().catch((err) => {
  console.error("build-pgdata failed:", err);
  process.exit(1);
});

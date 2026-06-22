// Build-time only. Produces a fully-seeded PostgreSQL data directory that the
// desktop app ships and copies to a writable location on first launch.
//
// Flow: initdb -> start a throwaway postgres -> `prisma migrate deploy` ->
// `tsx prisma/seed.ts` -> stop. The resulting data dir (desktop/resources/pgdata)
// already contains the schema + all mock data, so the installed app needs no
// migration/seed step at runtime — it just starts postgres against this dir.
//
// IMPORTANT: this data dir is binary-compatible only with the same platform +
// postgres version it was built on. CI builds it on windows-latest for the
// Windows installer; running it locally on Linux only validates the pipeline.

import EmbeddedPostgres from "embedded-postgres";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const creds = JSON.parse(readFileSync(path.join(ROOT, "desktop", "db.json"), "utf8"));

const DATA_DIR = path.join(ROOT, "desktop", "resources", "pgdata");
const PORT = 54329; // build-time only; runtime picks a free port

async function main() {
  // Always start from a clean template.
  if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(path.dirname(DATA_DIR), { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: creds.user,
    password: creds.password,
    port: PORT,
    persistent: true, // keep the data dir on disk after stop()
  });

  console.log("• initdb …");
  await pg.initialise();
  console.log("• starting postgres on", PORT, "…");
  await pg.start();
  console.log("• creating database", creds.database, "…");
  await pg.createDatabase(creds.database);

  const url = `postgresql://${creds.user}:${creds.password}@127.0.0.1:${PORT}/${creds.database}`;
  const env = { ...process.env, DATABASE_URL: url };

  try {
    console.log("• prisma migrate deploy …");
    execSync("npx prisma migrate deploy", { stdio: "inherit", env, cwd: ROOT });
    console.log("• seeding mock data …");
    execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env, cwd: ROOT });
  } finally {
    console.log("• stopping postgres …");
    await pg.stop();
  }

  console.log("\n✓ Seeded pgdata template at", DATA_DIR);
}

main().catch((err) => {
  console.error("build-pgdata failed:", err);
  process.exit(1);
});

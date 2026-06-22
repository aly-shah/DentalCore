# DentaCore Desktop — offline Windows app

A downloadable Windows application that runs the **entire DentaCore system on a
single laptop, fully offline, preloaded with demo/mock data**. No internet, no
server, no database setup — double-click to install and it just runs.

It works by wrapping the real Next.js app in [Electron](https://www.electronjs.org/)
and bundling a small embedded PostgreSQL inside the installer. On first launch
it copies a pre-seeded database into your user folder and starts everything on
`localhost`.

---

## How to download it (for end users)

1. Go to the repo's **Releases** page:
   <https://github.com/aly-shah/DentalCore/releases>
2. Under the latest **"DentaCore Desktop (latest)"** release, download
   **`DentaCore-Setup-<version>.exe`**.
3. Double-click the installer and follow the prompts (you can choose the install
   folder). It creates a Start Menu + Desktop shortcut.
4. Launch **DentaCore**. The first start takes ~20–40s while it sets up the demo
   database; later launches are quick.

> Windows SmartScreen may warn because the installer isn't code-signed. Click
> **More info → Run anyway**. (Signing requires a paid certificate — optional.)

### Demo logins (all passwords are `password`)

| Role | Email |
|---|---|
| Admin | `admin@dentacore.com` |
| Dentist | `dr.chen@dentacore.com` |
| Receptionist | `reception@dentacore.com` |

All data is fake/mock and lives only on that machine. Anything you change is
saved locally between launches. To reset back to the demo data, delete the
`pgdata` folder in `%APPDATA%\DentaCore` and relaunch.

---

## How to produce the installer (build)

The installer is built in the cloud by GitHub Actions on a Windows runner —
you don't need a Windows machine.

1. Open the repo's **Actions** tab → **"Desktop (Windows installer)"** →
   **Run workflow**.
2. When it finishes (~15–25 min) the `DentaCore-Setup-*.exe` is published to the
   **`desktop-latest`** Release and also attached to the run as an artifact.

Alternatively, pushing a tag matching `desktop-v*` (e.g. `git tag desktop-v1 &&
git push origin desktop-v1`) triggers the same build.

### What the build does
1. `npm run build` with `BUILD_STANDALONE=1` → self-contained Next server in `.next/standalone`.
2. `npm run desktop:assemble` → copies static assets, `public/`, and the Prisma engine into the bundle.
3. `npm run desktop:pgdata` → boots a throwaway Postgres, runs `prisma migrate deploy` + `prisma/seed.ts`, and saves the seeded data dir as the template.
4. `npm run desktop:dist` → electron-builder packages everything into the NSIS installer.

---

## Repo layout

| Path | Purpose |
|---|---|
| `desktop/main.js` | Electron entry — starts DB, launches the server, opens the window |
| `desktop/database.js` | Copies the seeded template + starts embedded Postgres |
| `desktop/next-server.js` | Spawns the Next standalone server with offline env |
| `desktop/loading.html` | Splash screen shown during boot |
| `desktop/db.json` | Local DB credentials (shared by build + runtime) |
| `scripts/build-pgdata.mjs` | Builds the seeded Postgres template |
| `scripts/assemble-standalone.mjs` | Completes the standalone bundle |
| `scripts/smoke-desktop.mjs` | Local sanity check (DB + server + login), no GUI |
| `electron-builder.yml` | Windows installer packaging config |
| `.github/workflows/desktop.yml` | Cloud build + Release publishing |

The production VPS deploy is unaffected: the desktop build is opt-in via the
`BUILD_STANDALONE` env, and `prisma generate` just ships an extra (unused)
Windows engine on the server.

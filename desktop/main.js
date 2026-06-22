// DentaCore Desktop — Electron main process.
//
// Boots an embedded PostgreSQL, launches the Next.js standalone server against
// it, then points a window at the local server. Everything runs on localhost;
// no network access is required.

const { app, BrowserWindow, dialog } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { startDatabase } = require("./database");
const { startNextServer } = require("./next-server");

// Single instance — a second launch just focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let splash = null;
let db = null;
let server = null;

/** Resolve bundled resources for dev vs. a packaged install. */
function resolvePaths() {
  if (app.isPackaged) {
    const res = process.resourcesPath;
    return {
      templateDir: path.join(res, "pgdata"),
      serverJs: path.join(res, "standalone", "server.js"),
    };
  }
  const root = path.resolve(__dirname, "..");
  return {
    templateDir: path.join(__dirname, "resources", "pgdata"),
    serverJs: path.join(root, ".next", "standalone", "server.js"),
  };
}

/** Stable per-install secret so login sessions survive restarts. */
function getAuthSecret() {
  const file = path.join(app.getPath("userData"), "auth-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    const secret = crypto.randomBytes(48).toString("hex");
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

function createSplash() {
  splash = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    resizable: false,
    center: true,
    backgroundColor: "#0f172a",
    webPreferences: { contextIsolation: true },
  });
  splash.loadFile(path.join(__dirname, "loading.html"));
}

function setStatus(msg) {
  if (splash && !splash.isDestroyed()) {
    splash.webContents.executeJavaScript(
      `window.setStatus && window.setStatus(${JSON.stringify(msg)})`
    ).catch(() => {});
  }
}

async function boot() {
  const { templateDir, serverJs } = resolvePaths();

  if (!fs.existsSync(templateDir)) {
    throw new Error(`Bundled database template missing at:\n${templateDir}`);
  }
  if (!fs.existsSync(serverJs)) {
    throw new Error(`Bundled app server missing at:\n${serverJs}`);
  }

  db = await startDatabase({
    templateDir,
    dataDir: path.join(app.getPath("userData"), "pgdata"),
    onStatus: setStatus,
  });

  setStatus("Starting DentaCore…");
  server = await startNextServer({
    serverJs,
    databaseUrl: db.url,
    authSecret: getAuthSecret(),
  });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: "#ffffff",
    title: "DentaCore",
    webPreferences: { contextIsolation: true },
  });
  await mainWindow.loadURL(`http://127.0.0.1:${server.port}`);
  mainWindow.maximize();
  mainWindow.show();

  if (splash && !splash.isDestroyed()) splash.destroy();
}

async function shutdown() {
  if (server) server.stop();
  if (db) await db.stop();
}

app.whenReady().then(() => {
  createSplash();
  boot().catch(async (err) => {
    console.error(err);
    if (splash && !splash.isDestroyed()) splash.destroy();
    dialog.showErrorBox("DentaCore failed to start", String(err && err.message ? err.message : err));
    await shutdown();
    app.quit();
  });
});

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", async (e) => {
  if (!db && !server) return;
  e.preventDefault();
  const _db = db, _server = server;
  db = null; server = null;
  if (_server) _server.stop();
  if (_db) await _db.stop();
  app.quit();
});

// Launches the Next.js standalone server as a child Node process (Electron's
// own binary, run in Node mode) and waits until it answers HTTP.

const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

function waitForHttp(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/api/health", timeout: 2000 },
        (res) => {
          res.resume();
          resolve(); // any HTTP response means the server is up
        }
      );
      req.on("error", retry);
      req.on("timeout", () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error("Next server did not start in time"));
      else setTimeout(tryOnce, 400);
    };
    tryOnce();
  });
}

/**
 * @param {object} opts
 * @param {string} opts.serverJs    absolute path to standalone/server.js
 * @param {string} opts.databaseUrl
 * @param {string} opts.authSecret
 * @returns {Promise<{ port: number, stop: () => void }>}
 */
async function startNextServer({ serverJs, databaseUrl, authSecret }) {
  const net = require("node:net");
  const port = await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });

  const child = spawn(process.execPath, [serverJs], {
    cwd: path.dirname(serverJs),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: authSecret,
      NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
      NEXT_TELEMETRY_DISABLED: "1",
      // Offline build — keep all external integrations disabled so nothing
      // reaches for the network.
      REDIS_URL: "",
      SENTRY_DSN: "",
      NEXT_PUBLIC_SENTRY_DSN: "",
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      WHATSAPP_BAILEYS_ENABLED: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (d) => process.stdout.write(`[next] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[next] ${d}`));

  await waitForHttp(port);
  return {
    port,
    stop: () => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    },
  };
}

module.exports = { startNextServer };

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dentacore.app",
  appName: "DentaCore",
  // The "webDir" must exist for `cap sync` to work, even though we're
  // loading a remote URL. We point it at .next/server/app — anything that
  // exists is fine; the bundled assets aren't actually served because of
  // server.url below.
  webDir: "public",

  server: {
    url: "https://dental.scalamatic.com",
    cleartext: false,
    allowNavigation: ["dental.scalamatic.com", "*.scalamatic.com"],
  },

  android: {
    backgroundColor: "#ffffff",
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;

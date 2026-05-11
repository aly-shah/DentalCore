// DentaCore Service Worker — DISABLED.
//
// The previous version cached the root page and auth-gated routes, which could
// leave the app stuck serving a stale/broken cached page (showing up as
// net::ERR_FAILED in the Android WebView, since the cache persists across
// restarts). This version takes over, wipes ALL caches, unregisters itself,
// and reloads any open clients — so existing installs heal themselves and no
// service worker intercepts requests going forward.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch {
        /* ignore */
      }
      try {
        const clientList = await self.clients.matchAll({ type: "window" });
        for (const client of clientList) {
          client.navigate(client.url);
        }
      } catch {
        /* ignore */
      }
    })()
  );
});

// No fetch handler — every request goes straight to the network.

self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();
  event.waitUntil(
    self.registration.showNotification(data.title || "DentaCore", {
      body: data.body || "You have a new notification",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { url: data.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/dashboard"));
});

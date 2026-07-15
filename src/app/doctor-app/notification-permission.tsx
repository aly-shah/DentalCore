"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

/**
 * Web Notification permission for the doctor app.
 *
 * Uses the browser/WebView Notification API — works in the PWA and in the
 * Capacitor Android WebView where it's available. When the API isn't present
 * (older WebView), `supported` is false and the UI stays hidden. Native FCM
 * push (via @capacitor/push-notifications) can layer on later without changing
 * these call sites.
 */
type Perm = "default" | "granted" | "denied" | "unsupported";

function readPermission(): Perm {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as Perm;
}

export function useNotificationPermission() {
  const [permission, setPermission] = useState<Perm>("unsupported");

  // Read the real value only after mount so SSR and the client agree.
  useEffect(() => {
    setPermission(readPermission());
  }, []);

  const request = useCallback(async (): Promise<Perm> => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    try {
      const result = (await Notification.requestPermission()) as Perm;
      setPermission(result);
      if (result === "granted") {
        // Confirm it works with a first, quiet notification.
        try {
          new Notification("Notifications on", {
            body: "You'll be notified about check-ins and updates.",
          });
        } catch {
          /* some WebViews only allow notifications from a service worker */
        }
      }
      return result;
    } catch {
      return readPermission();
    }
  }, []);

  return {
    supported: permission !== "unsupported",
    permission,
    request,
  };
}

/**
 * Dismissible banner shown to a logged-in clinical user when notification
 * permission hasn't been decided yet. Tapping "Enable" triggers the native
 * permission prompt (a user gesture, which every browser requires).
 */
export function NotificationPrompt() {
  const { supported, permission, request } = useNotificationPermission();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!supported || permission !== "default" || dismissed) return null;

  return (
    <div className="mx-auto mt-3 flex max-w-3xl items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
        <Bell className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-teal-900">Turn on notifications</p>
        <p className="text-[11px] leading-tight text-teal-700/80">
          Get alerted when your patients check in and when updates arrive.
        </p>
      </div>
      <button
        onClick={async () => {
          setBusy(true);
          await request();
          setBusy(false);
        }}
        disabled={busy}
        className="shrink-0 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
      >
        {busy ? "…" : "Enable"}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-1 text-teal-700/70 transition-colors hover:bg-teal-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/utils";

/**
 * Renders a relative timestamp ("5m ago") without causing a hydration
 * mismatch. `timeAgo` depends on the current clock, so the server render and
 * the browser's first render disagree — which makes React bail out of
 * hydrating the surrounding tree and silently drops its event handlers
 * (buttons stop working). We render a stable `fallback` on the server and for
 * the first client paint, then swap in the real relative time after mount.
 */
export function RelativeTime({
  date,
  fallback = "",
}: {
  date?: string | Date | null;
  fallback?: string;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    setText(date ? timeAgo(date) : fallback);
  }, [date, fallback]);

  // Pre-mount (and SSR) both render `fallback`, so they always match.
  return <>{text ?? fallback}</>;
}

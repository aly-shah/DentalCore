"use client";

/**
 * WhatsApp connection status badge for the admin dashboard.
 * Polls /api/admin/whatsapp/status on a slow interval (30s by default).
 * Hides itself entirely when the Baileys integration is not enabled.
 */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, QrCode, Loader2, MessageCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "disconnected" | "qr" | "connecting" | "connected";

interface StatusPayload {
  enabled: boolean;
  status: Status;
  lastError: string | null;
  qr?: string | null;
  userId?: string;
  userName?: string | null;
}

export function WhatsAppStatusBadge({ pollMs = 30000, className }: { pollMs?: number; className?: string }) {
  const { data } = useQuery({
    queryKey: ["whatsapp-status-badge"],
    queryFn: async (): Promise<StatusPayload> => {
      const r = await fetch(`/api/admin/whatsapp/status`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    refetchInterval: pollMs,
    // Don't show stale data flickers — keep prev while refetching.
    placeholderData: (prev) => prev,
  });

  if (!data || !data.enabled) return null;

  const map: Record<Status, { label: string; tone: "ok" | "warn" | "err" | "info"; icon: React.ReactNode }> = {
    connected:    { label: "WhatsApp connected",    tone: "ok",   icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    qr:           { label: "Scan QR to pair",        tone: "warn", icon: <QrCode className="w-3.5 h-3.5" /> },
    connecting:   { label: "Connecting…",            tone: "info", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    disconnected: { label: "WhatsApp disconnected",  tone: "err",  icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  };

  const m = map[data.status];
  const toneStyles: Record<typeof m.tone, string> = {
    ok:   "bg-emerald-50 border-emerald-200 text-emerald-700",
    warn: "bg-amber-50   border-amber-200   text-amber-700",
    info: "bg-blue-50    border-blue-200    text-blue-700",
    err:  "bg-red-50     border-red-200     text-red-700",
  };
  const dotStyles: Record<typeof m.tone, string> = {
    ok:   "bg-emerald-500 animate-pulse-dot",
    warn: "bg-amber-500 animate-pulse-dot",
    info: "bg-blue-500",
    err:  "bg-red-500",
  };

  const subtitle =
    data.status === "connected" && (data.userName || data.userId)
      ? (data.userName ?? (data.userId ?? "").replace(/@s\.whatsapp\.net|:.+$/g, ""))
      : data.status === "disconnected" && data.lastError
        ? "Tap to reconnect"
        : data.status === "qr"
          ? "Pair the clinic phone"
          : "Booting session";

  return (
    <Link
      href="/admin/whatsapp"
      className={cn(
        "inline-flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-all hover:-translate-y-px hover:shadow-sm group",
        toneStyles[m.tone],
        className
      )}
      title="Open WhatsApp pairing"
    >
      <span className="relative shrink-0">
        <MessageCircle className="w-5 h-5 opacity-80" />
        <span className={cn("absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white", dotStyles[m.tone])} />
      </span>
      <span className="flex items-center gap-1.5 min-w-0">
        {m.icon}
        <span className="min-w-0">
          <span className="block text-[11px] font-bold leading-tight truncate">{m.label}</span>
          <span className="block text-[10px] opacity-70 leading-tight truncate">{subtitle}</span>
        </span>
      </span>
      <ExternalLink className="w-3 h-3 opacity-40 group-hover:opacity-80 transition-opacity shrink-0" />
    </Link>
  );
}

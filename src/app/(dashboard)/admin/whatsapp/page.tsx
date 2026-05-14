"use client";

/**
 * WhatsApp Pairing — admin UI for the Baileys (QR-code) integration.
 * Shows the QR while pairing, status when connected, and a test-send
 * box. The Business API path is NOT managed here; it's env-driven.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle, AlertTriangle, CheckCircle2, Loader2, LogOut, Send,
  RefreshCw, ShieldAlert,
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

type Status =
  | { status: "disconnected"; qr: null; lastError: string | null }
  | { status: "qr"; qr: string; qrSeenAt: number; lastError: string | null }
  | { status: "connecting"; qr: null; lastError: string | null }
  | { status: "connected"; qr: null; lastError: null; userId: string; userName: string | null };

export default function WhatsAppAdminPage() {
  const qc = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: async (): Promise<Status> => {
      const r = await fetch(`/api/admin/whatsapp/status`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    refetchInterval: 2000,
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/whatsapp/disconnect`, { method: "POST" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-status"] }),
  });

  const data = statusQuery.data;
  const status = data?.status ?? "disconnected";

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="ADMIN-WHATSAPP">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-md">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 leading-tight">WhatsApp Pairing</h1>
            <p className="text-sm text-stone-500 mt-0.5">QR-code pair your clinic phone (no Business API required)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => statusQuery.refetch()}
            className="p-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", statusQuery.isFetching && "animate-spin")} />
          </button>
          {status === "connected" && (
            <Button
              variant="outline"
              iconLeft={<LogOut className="w-4 h-4" />}
              onClick={() => {
                if (confirm("Disconnect WhatsApp? You'll need to scan a fresh QR to reconnect.")) {
                  disconnect.mutate();
                }
              }}
            >
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {/* ToS warning — visible always so admins don't forget */}
      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-3 flex gap-2.5">
        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-[12px] text-amber-900 leading-snug">
          <p className="font-bold">Heads up: QR-pairing uses an unofficial WhatsApp protocol.</p>
          <p className="text-amber-700 mt-0.5">
            Acceptable for small-clinic operational messaging (reminders, follow-ups), but commercial bulk messaging
            against WhatsApp&apos;s terms can get the paired number banned. For large volume or regulated deployments,
            configure the Business API (<code className="bg-amber-100 px-1 rounded font-mono text-[11px]">WHATSAPP_API_URL</code>
            + <code className="bg-amber-100 px-1 rounded font-mono text-[11px]">WHATSAPP_API_TOKEN</code>) — it takes priority over Baileys when both are present.
          </p>
        </div>
      </div>

      {/* Main card — content varies by state */}
      <Card padding="lg">
        {statusQuery.isLoading && !data ? (
          <div className="flex flex-col items-center justify-center py-12 text-stone-500 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            <p className="text-sm font-semibold">Booting WhatsApp session…</p>
          </div>
        ) : status === "connecting" ? (
          <div className="flex flex-col items-center justify-center py-12 text-stone-500 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            <p className="text-sm font-semibold">Connecting to WhatsApp…</p>
            <p className="text-[11px] text-stone-400">QR code will appear shortly.</p>
          </div>
        ) : status === "qr" && data && "qr" in data && data.qr ? (
          <div className="flex flex-col items-center text-center gap-4 py-4">
            <div>
              <p className="text-sm font-bold text-stone-900">Scan with WhatsApp on your phone</p>
              <p className="text-[11px] text-stone-500 mt-1 max-w-md">
                In WhatsApp, tap <strong>Settings → Linked Devices → Link a Device</strong> and point your camera at this code.
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-white border-2 border-emerald-200 shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.qr} alt="WhatsApp pairing QR code" className="w-72 h-72 object-contain" />
            </div>
            <p className="text-[10px] text-stone-400">
              QR refreshes automatically · keep this page open until paired
            </p>
          </div>
        ) : status === "connected" && data && "userId" in data ? (
          <ConnectedView userId={data.userId} userName={data.userName} />
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <p className="text-sm font-bold text-stone-900">Disconnected</p>
            {data?.lastError && (
              <p className="text-[11px] text-stone-500 max-w-md break-words">
                Last error: <span className="font-mono">{data.lastError}</span>
              </p>
            )}
            <p className="text-[11px] text-stone-500">
              Click <em>Refresh</em> above to request a new pairing code.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function ConnectedView({ userId, userName }: { userId: string; userName: string | null }) {
  // strip "@s.whatsapp.net" / device suffix off the JID for a cleaner display
  const cleaned = userId.replace(/@s\.whatsapp\.net|:.+$/g, "");

  const [testPhone, setTestPhone] = useState("");
  const [testText, setTestText] = useState("Test message from DentaCore. WhatsApp pairing works ✓");

  const test = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/whatsapp/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testPhone.trim(), message: testText }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
  });

  return (
    <div className="flex flex-col items-center text-center gap-4 py-2">
      <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
        <CheckCircle2 className="w-7 h-7 text-emerald-600" />
      </div>
      <div>
        <p className="text-sm font-bold text-stone-900">Connected</p>
        {userName && <p className="text-[12px] text-stone-600 mt-0.5">{userName}</p>}
        <p className="text-[11px] text-stone-400 font-mono mt-0.5">{cleaned}</p>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-stone-200 p-3 space-y-2 text-left">
        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
          <Send className="w-3 h-3" /> Send a test message
        </p>
        <input
          type="tel"
          value={testPhone}
          onChange={(e) => setTestPhone(e.target.value)}
          placeholder="+15551234567"
          className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-emerald-400 focus:outline-none bg-stone-50/50 font-mono"
        />
        <textarea
          rows={2}
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-emerald-400 focus:outline-none bg-stone-50/50 resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-stone-400">Include country code, no <code>+</code> required.</p>
          <button
            onClick={() => test.mutate()}
            disabled={test.isPending || !testPhone.trim() || !testText.trim()}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-colors flex items-center gap-1.5"
          >
            {test.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            {test.isPending ? "Sending…" : "Send test"}
          </button>
        </div>
        {test.isSuccess && (
          <p className="text-[11px] text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Sent ({(test.data as { messageId: string }).messageId.slice(0, 12)}…)
          </p>
        )}
        {test.isError && (
          <p className="text-[11px] text-red-600">{(test.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}

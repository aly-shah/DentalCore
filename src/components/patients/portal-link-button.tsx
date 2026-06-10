"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import * as QRCode from "qrcode";
import { Share2, Copy, Check, QrCode, Loader2, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Generates a private patient-portal magic link, shows it as a copyable link
 * + a scannable QR code, and offers a one-tap WhatsApp send. The token is the
 * credential — no patient password.
 */
export function PortalLinkButton({ patientId, phone }: { patientId: string; phone?: string | null }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  const gen = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/patients/${patientId}/portal-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeExisting: false, expiresInDays: 90 }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to generate link");
      return j.data.url as string;
    },
    onSuccess: async (u) => {
      setUrl(u);
      try { setQr(await QRCode.toDataURL(u, { margin: 1, width: 240 })); } catch { /* QR optional */ }
    },
  });

  const openModal = () => { setOpen(true); if (!url) gen.mutate(); };
  const copy = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const waHref = phone && url ? `https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Here's your DentaCore portal: ${url}`)}` : null;

  return (
    <>
      <button
        onClick={openModal}
        title="Patient portal link"
        className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center hover:bg-violet-100 transition-colors cursor-pointer"
      >
        <Share2 className="w-4 h-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5"><QrCode className="w-4 h-4 text-violet-600" /> Patient Portal</h3>
              <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-600 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            {gen.isPending && <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-violet-500" /></div>}
            {gen.isError && <p className="text-xs text-red-600 py-4 text-center">{(gen.error as Error).message}</p>}

            {url && (
              <div className="space-y-3">
                {qr && <img src={qr} alt="Portal QR code" className="w-44 h-44 mx-auto rounded-lg border border-stone-100" />}
                <p className="text-[11px] text-stone-500 text-center">Patient scans this (or opens the link) to view their visits, billing, prescriptions and more — no password.</p>
                <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-2">
                  <span className="text-[11px] text-stone-600 truncate flex-1">{url}</span>
                  <button onClick={copy} className="text-violet-600 shrink-0 cursor-pointer">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={copy} iconLeft={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}>{copied ? "Copied" : "Copy link"}</Button>
                  {waHref && (
                    <a href={waHref} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700" iconLeft={<MessageSquare className="w-3.5 h-3.5" />}>WhatsApp</Button>
                    </a>
                  )}
                </div>
                <p className="text-[10px] text-stone-400 text-center">Link expires in 90 days.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare, Phone, Mail, MessageCircle, Send, Loader2, AlertTriangle, CheckCircle2,
  Paperclip, X as XIcon, FileText, Image as ImageIcon, Volume2, Video as VideoIcon,
  Sparkles, Link2,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatient, usePatientCommunications } from "@/hooks/use-queries";
import { formatDate, formatTime, cn } from "@/lib/utils";
import type { CommunicationLog } from "@/types";

const typeIcon: Record<string, React.ReactNode> = {
  CALL: <Phone className="w-4 h-4" />,
  SMS: <MessageSquare className="w-4 h-4" />,
  EMAIL: <Mail className="w-4 h-4" />,
  WHATSAPP: <MessageCircle className="w-4 h-4" />,
  SYSTEM: <MessageSquare className="w-4 h-4" />,
};

const typeColor: Record<string, string> = {
  CALL: "text-blue-600 bg-blue-50",
  SMS: "text-emerald-500 bg-[#E6FAF5]",
  EMAIL: "text-amber-500 bg-[#FFF6E5]",
  WHATSAPP: "text-emerald-500 bg-[#E6FAF5]",
  SYSTEM: "text-stone-500 bg-stone-100",
};

/**
 * Many of our subject values are machine-generated dedup keys (e.g.
 * `appt-reminder:APT-001:2026-05-13`). Render a friendly label
 * when we recognise the prefix, otherwise fall back to the raw value.
 */
function prettySubject(subject: string | null | undefined, direction: string): string {
  if (!subject) return direction === "INBOUND" ? "Reply" : "Message";
  if (subject.startsWith("appt-reminder:"))    return "Appointment reminder";
  if (subject.startsWith("followup-overdue:")) return "Follow-up reminder";
  if (subject.startsWith("package-expiring:")) return "Package expiring";
  if (subject.startsWith("wa-inbound:"))       return "Inbound message";
  return subject;
}

export function CommsTab({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const { data: response, isLoading } = usePatientCommunications(patientId);
  const { data: patientRes } = usePatient(patientId);
  const patient = (patientRes?.data ?? null) as { id: string; firstName: string; phone: string | null } | null;
  const phone = patient?.phone ?? null;

  const [text, setText] = useState("");
  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [lastResult, setLastResult] = useState<{ channel: string; delivered: boolean } | null>(null);
  const [attachment, setAttachment] = useState<{ url: string; mimeType: string; name: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [draftMeta, setDraftMeta] = useState<{
    confidence: "LOW" | "MEDIUM" | "HIGH";
    intent: string;
    suggestionLogId: string;
  } | null>(null);

  const portalLink = useMutation({
    mutationFn: async (): Promise<{ url: string }> => {
      const r = await fetch(`/api/admin/patients/${patientId}/portal-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeExisting: false, expiresInDays: 90 }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to generate link");
      return j.data;
    },
    onSuccess: (data) => {
      // Append to the textarea (or seed if empty) so the user can review/edit before sending.
      const blurb = `Here's your DentaCore portal: ${data.url}`;
      setText((t) => (t.trim() ? `${t.trim()}\n${blurb}` : blurb));
    },
  });

  const draftAi = useMutation({
    mutationFn: async (): Promise<{ reply: string; confidence: "LOW" | "MEDIUM" | "HIGH"; intent: string; suggestionLogId: string }> => {
      const r = await fetch(`/api/ai/draft-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Draft failed");
      return j.data;
    },
    onSuccess: (data) => {
      setText(data.reply);
      setDraftMeta({ confidence: data.confidence, intent: data.intent, suggestionLogId: data.suggestionLogId });
      setTimeout(() => setDraftMeta(null), 8000);
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File): Promise<{ url: string; mimeType: string; name: string }> => {
      setUploadError(null);
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/upload`, { method: "POST", body: fd });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Upload failed");
      return { url: j.data.url, mimeType: j.data.mimeType, name: j.data.filename ?? file.name };
    },
    onSuccess: (data) => setAttachment(data),
    onError: (err) => setUploadError((err as Error).message),
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Press "/" anywhere on the Comms tab to focus the composer — unless
  // the focus is already in a text input (don't steal real typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || t?.isContentEditable) return;
      e.preventDefault();
      textareaRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [dragOver, setDragOver] = useState(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!phone) return;
    const f = e.dataTransfer.files?.[0];
    if (f) upload.mutate(f);
  };

  const reply = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/communications/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          type: channel,
          ...(attachment ? { mediaUrl: attachment.url, mediaMimeType: attachment.mimeType } : {}),
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data as { channel: string; delivered: boolean };
    },
    onSuccess: (data) => {
      setText("");
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setLastResult({ channel: data.channel, delivered: data.delivered });
      qc.invalidateQueries({ queryKey: ["patients", patientId, "communications"] });
      // Auto-hide the toast after a few seconds
      setTimeout(() => setLastResult(null), 4000);
    },
  });

  if (isLoading) return <LoadingSpinner />;

  const comms = ((response?.data || []) as CommunicationLog[])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const canSend = !!phone && (text.trim().length > 0 || !!attachment) && !reply.isPending;

  return (
    <div data-id="PATIENT-COMMS-TAB" className="space-y-4">
      {/* ───── Reply composer ───── */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (phone) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "relative rounded-xl transition-all",
          dragOver && "ring-2 ring-emerald-400 ring-offset-2"
        )}
      >
      {dragOver && (
        <div className="absolute inset-0 z-10 rounded-xl bg-emerald-50/80 border-2 border-dashed border-emerald-400 flex items-center justify-center pointer-events-none">
          <div className="text-emerald-700 text-sm font-semibold inline-flex items-center gap-2">
            <Paperclip className="w-4 h-4" /> Drop to attach
          </div>
        </div>
      )}
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-stone-900">Send a message</h3>
            {phone ? (
              <span className="text-[10px] text-stone-400 font-mono ml-auto">to {phone}</span>
            ) : (
              <span className="text-[10px] text-amber-600 font-semibold ml-auto inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> No phone on file
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <textarea
            ref={textareaRef}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={phone
              ? "Type your message…  (press / to focus, ⌘⏎ to send)"
              : "Add a phone number on the patient profile to enable messaging."}
            disabled={!phone}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSend) {
                e.preventDefault();
                reply.mutate();
              }
            }}
            className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-emerald-400 focus:outline-none bg-stone-50/50 resize-none disabled:opacity-60 disabled:cursor-not-allowed"
          />

          {/* Attachment preview chip */}
          {attachment && (
            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 max-w-full">
              <MediaIcon mime={attachment.mimeType} className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="text-[11px] font-medium text-stone-800 truncate max-w-[240px]">{attachment.name}</span>
              <button
                onClick={() => {
                  setAttachment(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="p-0.5 -mr-1 rounded hover:bg-emerald-100 text-emerald-700 transition-colors"
                aria-label="Remove attachment"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          )}
          {uploadError && (
            <p className="text-[11px] text-red-600 inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {uploadError}
            </p>
          )}
          {draftAi.isError && (
            <p className="text-[11px] text-red-600 inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {(draftAi.error as Error).message}
            </p>
          )}
          {draftMeta && (
            <p className="text-[11px] text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-2.5 py-1.5 inline-flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              AI draft ({draftMeta.confidence.toLowerCase()} confidence, {draftMeta.intent.toLowerCase()}) — review and edit before sending.
            </p>
          )}

          {/* Hidden file input — triggered by paperclip button below.
              Accept list mirrors /api/upload's allowed types. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/wav,audio/aac,video/mp4,video/webm,video/quicktime"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
            }}
            className="hidden"
          />

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="inline-flex bg-stone-100 rounded-lg p-0.5">
                {(["whatsapp", "sms"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    disabled={!phone}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all flex items-center gap-1.5 disabled:opacity-60",
                      channel === c
                        ? c === "whatsapp"
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-blue-600 text-white shadow-sm"
                        : "text-stone-500 hover:text-stone-700"
                    )}
                  >
                    {c === "whatsapp" ? <MessageCircle className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                    {c === "whatsapp" ? "WhatsApp" : "SMS"}
                  </button>
                ))}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!phone || upload.isPending}
                title="Attach an image or PDF"
                className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
              >
                {upload.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Paperclip className="w-3.5 h-3.5" />}
                Attach
              </button>
              <button
                onClick={() => draftAi.mutate()}
                disabled={!phone || draftAi.isPending}
                title="Suggest a reply based on the conversation"
                className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
              >
                {draftAi.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />}
                Draft with AI
              </button>
              <button
                onClick={() => portalLink.mutate()}
                disabled={!phone || portalLink.isPending}
                title="Generate a private portal link and add it to the message"
                className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
              >
                {portalLink.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Link2 className="w-3.5 h-3.5" />}
                Portal link
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-stone-400 hidden sm:inline">
                {text.length}/2000
              </span>
              <button
                onClick={() => reply.mutate()}
                disabled={!canSend}
                className={cn(
                  "px-4 py-2 rounded-lg text-[11px] font-bold text-white flex items-center gap-1.5 shadow-sm transition-all",
                  canSend
                    ? "bg-gradient-to-r from-emerald-600 to-green-600 hover:shadow-md hover:-translate-y-px"
                    : "bg-stone-300 cursor-not-allowed"
                )}
              >
                {reply.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {reply.isPending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>

          {reply.isError && (
            <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              {(reply.error as Error).message}
            </p>
          )}
          {lastResult && (
            <p className={cn(
              "text-[11px] rounded-md px-2.5 py-1.5 inline-flex items-center gap-1.5 animate-fade-in",
              lastResult.channel === "none"
                ? "bg-amber-50 border border-amber-200 text-amber-700"
                : "bg-emerald-50 border border-emerald-200 text-emerald-700"
            )}>
              <CheckCircle2 className="w-3 h-3" />
              {lastResult.channel === "none"
                ? "Logged only — no messaging gateway configured."
                : `Sent via ${lastResult.channel === "whatsapp" ? "WhatsApp" : "SMS"}.`}
            </p>
          )}
        </CardContent>
      </Card>
      </div>

      {/* ───── Timeline ───── */}
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-stone-900">
              Communication History ({comms.length})
            </h3>
          </div>
        </CardHeader>
        <CardContent>
          {comms.length > 0 ? (
            <div className="space-y-4">
              {comms.map((comm) => (
                <div key={comm.id} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${typeColor[comm.type] ?? typeColor.SYSTEM}`}>
                    {typeIcon[comm.type] ?? typeIcon.SYSTEM}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-sm">{prettySubject(comm.subject, comm.direction)}</span>
                      <Badge variant={comm.direction === "OUTBOUND" ? "info" : "success"}>
                        {comm.direction}
                      </Badge>
                      <Badge variant="default">{comm.type}</Badge>
                    </div>
                    {comm.mediaUrl && (
                      <MediaPreview url={comm.mediaUrl} mimeType={comm.mediaMimeType ?? null} className="mt-1.5 mb-1" />
                    )}
                    {comm.content && (
                      <p className="text-sm text-stone-900 whitespace-pre-wrap break-words">{comm.content}</p>
                    )}
                    <p className="text-xs text-stone-500 mt-1">
                      {comm.sentByName} &middot; {formatDate(comm.createdAt)} at {formatTime(comm.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500 text-center py-4">
              No communication history for this patient
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function MediaIcon({ mime, className }: { mime: string | null; className?: string }) {
  if (mime?.startsWith("image/")) return <ImageIcon className={className} />;
  if (mime?.startsWith("video/")) return <VideoIcon className={className} />;
  if (mime?.startsWith("audio/")) return <Volume2 className={className} />;
  return <FileText className={className} />;
}

/**
 * Inline render for media attached to a CommunicationLog row:
 *  - image/*  → 200px-tall thumbnail, click opens the full file
 *  - audio/*  → an HTML5 audio player
 *  - video/*  → a small <video> with controls
 *  - anything else (pdf / doc) → a download chip
 */
function MediaPreview({ url, mimeType, className }: { url: string; mimeType: string | null; className?: string }) {
  const filename = url.split("/").pop() ?? "attachment";

  if (mimeType?.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={cn("block", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Attachment"
          loading="lazy"
          decoding="async"
          className="max-h-48 max-w-full rounded-lg border border-stone-200 object-cover hover:shadow-md transition-shadow"
        />
      </a>
    );
  }

  if (mimeType?.startsWith("audio/")) {
    return (
      <audio controls preload="metadata" className={cn("max-w-full", className)}>
        <source src={url} type={mimeType} />
      </audio>
    );
  }

  if (mimeType?.startsWith("video/")) {
    return (
      <video controls preload="metadata" className={cn("max-h-64 max-w-full rounded-lg border border-stone-200", className)}>
        <source src={url} type={mimeType} />
      </video>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 max-w-full transition-colors",
        className
      )}
    >
      <MediaIcon mime={mimeType} className="w-3.5 h-3.5 text-stone-600 shrink-0" />
      <span className="text-[11px] font-medium text-stone-800 truncate max-w-[260px]">{filename}</span>
    </a>
  );
}

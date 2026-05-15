"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare, Phone, Mail, MessageCircle, Send, Loader2, AlertTriangle, CheckCircle2,
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

  const reply = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/communications/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), type: channel }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data as { channel: string; delivered: boolean };
    },
    onSuccess: (data) => {
      setText("");
      setLastResult({ channel: data.channel, delivered: data.delivered });
      qc.invalidateQueries({ queryKey: ["patients", patientId, "communications"] });
      // Auto-hide the toast after a few seconds
      setTimeout(() => setLastResult(null), 4000);
    },
  });

  if (isLoading) return <LoadingSpinner />;

  const comms = ((response?.data || []) as CommunicationLog[])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const canSend = !!phone && text.trim().length > 0 && !reply.isPending;

  return (
    <div data-id="PATIENT-COMMS-TAB" className="space-y-4">
      {/* ───── Reply composer ───── */}
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
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={phone
              ? "Type your message…  (⌘⏎ to send)"
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
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
                    <p className="text-sm text-stone-900 whitespace-pre-wrap break-words">{comm.content}</p>
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

"use client";

/**
 * Dashboard — Voice Note Updates.
 *
 * Surfaces two things from voice notes: recordings still awaiting
 * transcription (kind "pending"), and AI-extracted follow-ups / tasks from
 * transcribed notes (kind "action"). Actions can be scheduled or dismissed
 * in one tap; pending notes are informational. Hidden when empty.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Mic, CalendarPlus, X, Loader2, ChevronRight, Clock, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { cn, formatDate } from "@/lib/utils";

interface ActionItem { item: string; priority?: string }
interface VNItem {
  id: string;
  kind: "pending" | "action";
  patientId: string;
  patient: { id: string; firstName: string; lastName: string; patientCode: string } | null;
  createdAt: string;
  // pending only
  durationSec?: number;
  audioUrl?: string;
  doctorId?: string;
  // action only
  followUpRequired?: boolean;
  followUpDate?: string | null;
  followUpReason?: string | null;
  actionItems?: ActionItem[];
  summary?: string | null;
}

const PRIORITY_STYLE: Record<string, string> = {
  HIGH: "bg-red-50 text-red-700 border-red-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-stone-50 text-stone-600 border-stone-200",
};

export function VoiceNoteUpdates({ doctorId }: { doctorId?: string }) {
  const { data } = useQuery({
    queryKey: ["voice-note-actions", doctorId ?? "all"],
    queryFn: async (): Promise<VNItem[]> => {
      const r = await fetch(`/api/voice-notes/action-items${doctorId ? `?doctorId=${doctorId}` : ""}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data as VNItem[];
    },
    refetchInterval: 60_000,
  });

  const items = data ?? [];
  if (items.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-violet-500 bg-violet-50/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-stone-900">Voice Note Updates</span>
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold rounded-full bg-violet-500 text-white">
            {items.length}
          </span>
        </div>
        <p className="text-xs text-stone-500 mt-0.5">Recordings awaiting transcription and AI-flagged follow-ups</p>
      </CardHeader>
      <CardContent className="p-0 divide-y divide-stone-100">
        {items.map((it) => it.kind === "pending"
          ? <PendingRow key={it.id} it={it} />
          : <Row key={it.id} it={it} doctorId={doctorId} />)}
      </CardContent>
    </Card>
  );
}

function PendingRow({ it }: { it: VNItem }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canTranscribe = ["SUPER_ADMIN", "ADMIN", "DOCTOR", "ASSISTANT"].includes(user?.role ?? "");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["voice-note-actions"] });
    qc.invalidateQueries({ queryKey: ["follow-ups"] });
  };

  const [showForm, setShowForm] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [reason, setReason] = useState("");

  const dismiss = useMutation({
    mutationFn: async () => { await fetch(`/api/voice-notes/${it.id}`, { method: "PATCH" }); },
    onSuccess: refresh,
  });

  const transcribe = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/voice-notes/${it.id}/transcribe`, { method: "POST" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Transcription failed");
      return j.data;
    },
    onSuccess: refresh,
  });

  const createFollowUp = useMutation({
    mutationFn: async () => {
      if (!dueDate) throw new Error("Pick a date");
      const r = await fetch(`/api/patients/${it.patientId}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId: it.doctorId, dueDate, reason: reason.trim() || "Follow-up (from voice note)" }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Couldn't create follow-up");
      await fetch(`/api/voice-notes/${it.id}`, { method: "PATCH" }); // clear off the dashboard
      return j.data;
    },
    onSuccess: refresh,
  });

  const name = it.patient ? `${it.patient.firstName} ${it.patient.lastName}` : "Patient";
  const dur = it.durationSec ?? 0;
  const mmss = `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, "0")}`;
  const busy = transcribe.isPending || createFollowUp.isPending || dismiss.isPending;

  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/patients/${it.patientId}`} className="text-sm font-semibold text-stone-900 hover:text-blue-600 truncate">
          {name}
          {it.patient?.patientCode && <span className="ml-1.5 text-[10px] text-stone-400 font-mono">{it.patient.patientCode}</span>}
        </Link>
        <button onClick={() => dismiss.mutate()} disabled={busy} aria-label="Dismiss" className="text-stone-300 hover:text-stone-600 p-0.5 disabled:opacity-40 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
        <Clock className="w-3.5 h-3.5 shrink-0 text-amber-500" />
        <span>
          <span className="font-semibold">Awaiting transcription</span>
          {dur > 0 ? ` · ${mmss}` : ""} · recorded {formatDate(it.createdAt)}
        </span>
      </div>

      {it.audioUrl && <audio controls preload="none" src={it.audioUrl} className="mt-2 w-full h-9" />}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {canTranscribe && (
          <button
            onClick={() => transcribe.mutate()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
          >
            {transcribe.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Transcribe
          </button>
        )}
        <button
          onClick={() => setShowForm((s) => !s)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-violet-700 border border-violet-200 bg-white hover:bg-violet-50 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
        >
          <CalendarPlus className="w-3.5 h-3.5" />
          Create follow-up
        </button>
        {transcribe.isError && <span className="text-[10px] text-red-600">{(transcribe.error as Error).message}</span>}
      </div>

      {showForm && (
        <div className="mt-2 flex flex-col gap-1.5 bg-white border border-stone-200 rounded-lg p-2">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="text-xs border border-stone-200 rounded px-2 py-1" />
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="text-xs border border-stone-200 rounded px-2 py-1" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => createFollowUp.mutate()}
              disabled={busy || !dueDate}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
            >
              {createFollowUp.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />}
              Schedule
            </button>
            {createFollowUp.isError && <span className="text-[10px] text-red-600">{(createFollowUp.error as Error).message}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ it, doctorId }: { it: VNItem; doctorId?: string }) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["voice-note-actions"] });
    qc.invalidateQueries({ queryKey: ["follow-ups"] });
  };

  const schedule = useMutation({
    mutationFn: async () => {
      if (!it.followUpDate) throw new Error("No date");
      const r = await fetch(`/api/patients/${it.patientId}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId,
          dueDate: it.followUpDate,
          reason: it.followUpReason || "Follow-up (from voice note)",
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Couldn't schedule");
      await fetch(`/api/voice-notes/${it.id}`, { method: "PATCH" }); // mark handled
      return j.data;
    },
    onSuccess: refresh,
  });

  const dismiss = useMutation({
    mutationFn: async () => { await fetch(`/api/voice-notes/${it.id}`, { method: "PATCH" }); },
    onSuccess: refresh,
  });

  const name = it.patient ? `${it.patient.firstName} ${it.patient.lastName}` : "Patient";
  const busy = schedule.isPending || dismiss.isPending;

  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/patients/${it.patientId}`} className="text-sm font-semibold text-stone-900 hover:text-blue-600 truncate">
          {name}
          {it.patient?.patientCode && <span className="ml-1.5 text-[10px] text-stone-400 font-mono">{it.patient.patientCode}</span>}
        </Link>
        <button onClick={() => dismiss.mutate()} disabled={busy} aria-label="Dismiss" className="text-stone-300 hover:text-stone-600 p-0.5 disabled:opacity-40 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {it.summary && <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-2">{it.summary}</p>}

      {it.followUpRequired && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-violet-900 bg-white border border-violet-200 rounded-lg px-2.5 py-1.5">
          <CalendarPlus className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-500" />
          <span>
            <span className="font-semibold">Follow-up {it.followUpDate ? formatDate(it.followUpDate) : "needed"}</span>
            {it.followUpReason ? ` — ${it.followUpReason}` : ""}
          </span>
        </div>
      )}

      {it.actionItems && it.actionItems.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {it.actionItems.map((a, i) => (
            <li key={i} className="flex items-center gap-1.5 text-[11px] text-stone-700">
              <span className={cn("text-[8px] font-bold uppercase px-1 py-0.5 rounded border", PRIORITY_STYLE[a.priority ?? "LOW"] ?? PRIORITY_STYLE.LOW)}>
                {(a.priority ?? "LOW").slice(0, 1)}
              </span>
              {a.item}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center gap-2">
        {it.followUpDate ? (
          <button
            onClick={() => schedule.mutate()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
          >
            {schedule.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />}
            Schedule follow-up
          </button>
        ) : it.followUpRequired ? (
          <Link href={`/patients/${it.patientId}`} className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 hover:underline">
            Review &amp; schedule <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        ) : null}
        {schedule.isError && <span className="text-[10px] text-red-600">{(schedule.error as Error).message}</span>}
      </div>
    </div>
  );
}

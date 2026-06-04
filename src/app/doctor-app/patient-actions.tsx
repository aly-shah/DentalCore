"use client";

/**
 * Doctor App — patient quick actions.
 *
 * Turns the otherwise read-only patient screen into a workspace: write a
 * clinical note, prescribe, record vitals, and advance the appointment
 * status — all from mobile, via the same APIs the desktop consultation
 * page uses. Demo mode renders the buttons disabled (no API / no PII).
 */
import { useState, useRef, useEffect, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Pill, HeartPulse, CalendarCheck, Plus, Trash2, X, Check, Loader2,
  LogIn, CheckCircle2, UserX, Mic, Square, RotateCcw, Sparkles, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

export function PatientQuickActions({
  patientId,
  todayAppointmentId,
  todayApptStatus,
  demo = false,
}: {
  patientId: string;
  todayAppointmentId: string | null;
  todayApptStatus: string | null;
  demo?: boolean;
}) {
  const { user } = useAuth();
  const doctorId = user?.id ?? null;
  const [sheet, setSheet] = useState<null | "note" | "rx" | "vitals" | "voice">(null);

  const disabled = demo || !doctorId;

  return (
    <section className="rounded-2xl bg-white border border-stone-200 p-2.5 space-y-2">
      {/* Primary action — voice note (record → AI transcribe → save to profile) */}
      <button
        onClick={() => setSheet("voice")}
        disabled={disabled}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold shadow-sm transition-opacity",
          disabled ? "bg-stone-100 text-stone-300" : "bg-gradient-to-br from-teal-500 to-cyan-600 text-white hover:opacity-95",
        )}
      >
        <Mic className="w-4 h-4" /> Record voice note
      </button>

      <div className="grid grid-cols-4 gap-1.5">
        <ActionButton icon={<FileText className="w-5 h-5" />} label="Note" tone="teal" disabled={disabled} onClick={() => setSheet("note")} />
        <ActionButton icon={<Pill className="w-5 h-5" />} label="Prescribe" tone="emerald" disabled={disabled} onClick={() => setSheet("rx")} />
        <ActionButton icon={<HeartPulse className="w-5 h-5" />} label="Vitals" tone="rose" disabled={disabled} onClick={() => setSheet("vitals")} />
        <ApptStatusButton patientId={patientId} appointmentId={todayAppointmentId} status={todayApptStatus} disabled={disabled} />
      </div>
      {demo && <p className="text-[10px] text-stone-400 text-center">Actions are disabled in demo — sign in to use them.</p>}

      {sheet === "voice" && doctorId && (
        <VoiceNoteSheet patientId={patientId} doctorId={doctorId} appointmentId={todayAppointmentId} onClose={() => setSheet(null)} />
      )}
      {sheet === "note" && doctorId && (
        <NoteSheet patientId={patientId} doctorId={doctorId} appointmentId={todayAppointmentId} onClose={() => setSheet(null)} />
      )}
      {sheet === "rx" && doctorId && (
        <RxSheet patientId={patientId} doctorId={doctorId} appointmentId={todayAppointmentId} onClose={() => setSheet(null)} />
      )}
      {sheet === "vitals" && doctorId && (
        <VitalsSheet patientId={patientId} recordedById={doctorId} appointmentId={todayAppointmentId} onClose={() => setSheet(null)} />
      )}
    </section>
  );
}

const TONES: Record<string, string> = {
  teal: "text-teal-600",
  emerald: "text-emerald-600",
  rose: "text-rose-600",
  indigo: "text-indigo-600",
};

function ActionButton({ icon, label, tone, disabled, onClick }: { icon: ReactNode; label: string; tone: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl transition-colors",
        disabled ? "text-stone-300" : cn(TONES[tone], "hover:bg-stone-50 active:bg-stone-100"),
      )}
    >
      {icon}
      <span className="text-[10px] font-semibold">{label}</span>
    </button>
  );
}

/* ───────── appointment status ───────── */

function ApptStatusButton({ patientId, appointmentId, status, disabled }: { patientId: string; appointmentId: string | null; status: string | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const noAppt = !appointmentId;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled || noAppt}
        className={cn(
          "flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl transition-colors",
          disabled || noAppt ? "text-stone-300" : "text-indigo-600 hover:bg-stone-50 active:bg-stone-100",
        )}
        title={noAppt ? "No appointment today" : undefined}
      >
        <CalendarCheck className="w-5 h-5" />
        <span className="text-[10px] font-semibold">Status</span>
      </button>
      {open && appointmentId && (
        <ApptStatusSheet patientId={patientId} appointmentId={appointmentId} status={status} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ApptStatusSheet({ patientId, appointmentId, status, onClose }: { patientId: string; appointmentId: string; status: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const cur = (status ?? "").toUpperCase();
  const act = useMutation({
    mutationFn: async (action: "check-in" | "checkout" | "no-show") => {
      const r = await fetch(`/api/appointments/${appointmentId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Couldn't update appointment");
      return j.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor-app"] });
      qc.invalidateQueries({ queryKey: ["doctor-summary", patientId] });
      onClose();
    },
  });

  return (
    <BottomSheet title="Today's appointment" subtitle={cur ? `Currently: ${cur.replace(/_/g, " ").toLowerCase()}` : undefined} onClose={onClose} error={act.error as Error | null}>
      <div className="space-y-2">
        <StatusRow icon={<LogIn className="w-4 h-4" />} label="Check in" tone="amber" active={cur === "CHECKED_IN"} pending={act.isPending} onClick={() => act.mutate("check-in")} />
        <StatusRow icon={<CheckCircle2 className="w-4 h-4" />} label="Complete & send to billing" tone="emerald" active={cur === "COMPLETED"} pending={act.isPending} onClick={() => act.mutate("checkout")} />
        <StatusRow icon={<UserX className="w-4 h-4" />} label="Mark no-show" tone="rose" active={cur === "NO_SHOW"} pending={act.isPending} onClick={() => act.mutate("no-show")} />
      </div>
    </BottomSheet>
  );
}

function StatusRow({ icon, label, tone, active, pending, onClick }: { icon: ReactNode; label: string; tone: string; active: boolean; pending: boolean; onClick: () => void }) {
  const tones: Record<string, string> = {
    amber: "border-amber-200 text-amber-700 hover:bg-amber-50",
    emerald: "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
    rose: "border-rose-200 text-rose-700 hover:bg-rose-50",
  };
  return (
    <button
      onClick={onClick}
      disabled={active || pending}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-3 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-50",
        active ? "border-stone-200 text-stone-400 bg-stone-50" : tones[tone],
      )}
    >
      {icon}
      {label}
      {active && <span className="ml-auto text-[10px] font-bold">CURRENT</span>}
    </button>
  );
}

/* ───────── clinical note ───────── */

function NoteSheet({ patientId, doctorId, appointmentId, onClose }: { patientId: string; doctorId: string; appointmentId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [chiefComplaint, setCC] = useState("");
  const [diagnosis, setDx] = useState("");
  const [treatmentPlan, setPlan] = useState("");
  const [advice, setAdvice] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId,
          appointmentId: appointmentId || undefined,
          chiefComplaint: chiefComplaint.trim() || undefined,
          diagnosis: diagnosis.trim() || undefined,
          treatmentPlan: treatmentPlan.trim() || undefined,
          advice: advice.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Couldn't save note");
      return j.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor-summary", patientId] });
      onClose();
    },
  });

  const empty = !chiefComplaint.trim() && !diagnosis.trim() && !treatmentPlan.trim() && !advice.trim();

  return (
    <BottomSheet title="Clinical note" onClose={onClose} error={save.error as Error | null}
      footer={<SaveBar pending={save.isPending} disabled={empty} onCancel={onClose} onSave={() => save.mutate()} label="Save note" />}>
      <Field label="Chief complaint"><input value={chiefComplaint} onChange={(e) => setCC(e.target.value)} className={inputCls} placeholder="e.g. Pain upper-left on chewing" /></Field>
      <Field label="Diagnosis"><input value={diagnosis} onChange={(e) => setDx(e.target.value)} className={inputCls} placeholder="e.g. Irreversible pulpitis #26" /></Field>
      <Field label="Treatment plan"><textarea value={treatmentPlan} onChange={(e) => setPlan(e.target.value)} rows={2} className={inputCls} placeholder="Plan for this visit / next steps" /></Field>
      <Field label="Advice"><textarea value={advice} onChange={(e) => setAdvice(e.target.value)} rows={2} className={inputCls} placeholder="Home care, medication advice" /></Field>
    </BottomSheet>
  );
}

/* ───────── prescription ───────── */

interface RxRow { medicineName: string; dosage: string; frequency: string; duration: string }
const FREQS = ["OD", "BD", "TDS", "QDS", "PRN", "STAT"];

function RxSheet({ patientId, doctorId, appointmentId, onClose }: { patientId: string; doctorId: string; appointmentId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<RxRow[]>([{ medicineName: "", dosage: "", frequency: "", duration: "" }]);

  const update = (i: number, field: keyof RxRow, value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const addRow = () => setRows((prev) => [...prev, { medicineName: "", dosage: "", frequency: "", duration: "" }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const valid = rows.filter((r) => r.medicineName.trim());

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/prescriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId,
          appointmentId: appointmentId || undefined,
          items: valid.map((m) => ({
            medicineName: m.medicineName.trim(),
            dosage: m.dosage.trim() || undefined,
            frequency: m.frequency || undefined,
            duration: m.duration.trim() || undefined,
          })),
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Couldn't save prescription");
      return j.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor-summary", patientId] });
      onClose();
    },
  });

  return (
    <BottomSheet title="Prescription" onClose={onClose} error={save.error as Error | null}
      footer={<SaveBar pending={save.isPending} disabled={valid.length === 0} onCancel={onClose} onSave={() => save.mutate()} label={`Prescribe ${valid.length || ""}`.trim()} />}>
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="rounded-xl border border-stone-200 p-2.5">
            <div className="flex items-center gap-2 mb-2">
              <input value={row.medicineName} onChange={(e) => update(i, "medicineName", e.target.value)} className={cn(inputCls, "flex-1")} placeholder={`Medicine ${i + 1}`} />
              {rows.length > 1 && (
                <button onClick={() => removeRow(i)} aria-label="Remove" className="text-stone-300 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <input value={row.dosage} onChange={(e) => update(i, "dosage", e.target.value)} className={cn(inputCls, "text-xs")} placeholder="Dose" />
              <select value={row.frequency} onChange={(e) => update(i, "frequency", e.target.value)} className={cn(inputCls, "text-xs")}>
                <option value="">Freq</option>
                {FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <input value={row.duration} onChange={(e) => update(i, "duration", e.target.value)} className={cn(inputCls, "text-xs")} placeholder="Days" />
            </div>
          </div>
        ))}
        <button onClick={addRow} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-stone-300 text-stone-500 text-xs font-semibold hover:border-stone-400">
          <Plus className="w-4 h-4" /> Add medicine
        </button>
      </div>
    </BottomSheet>
  );
}

/* ───────── vitals ───────── */

function VitalsSheet({ patientId, recordedById, appointmentId, onClose }: { patientId: string; recordedById: string; appointmentId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ temperature: "", systolicBP: "", diastolicBP: "", heartRate: "", oxygenSaturation: "", painLevel: "" });
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/triage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordedById,
          appointmentId: appointmentId || undefined,
          temperature: num(v.temperature),
          systolicBP: num(v.systolicBP),
          diastolicBP: num(v.diastolicBP),
          heartRate: num(v.heartRate),
          oxygenSaturation: num(v.oxygenSaturation),
          painLevel: num(v.painLevel),
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Couldn't save vitals");
      return j.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor-summary", patientId] });
      onClose();
    },
  });

  const empty = Object.values(v).every((x) => x.trim() === "");

  return (
    <BottomSheet title="Record vitals" onClose={onClose} error={save.error as Error | null}
      footer={<SaveBar pending={save.isPending} disabled={empty} onCancel={onClose} onSave={() => save.mutate()} label="Save vitals" />}>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Temp (°C)"><input inputMode="decimal" value={v.temperature} onChange={(e) => set("temperature", e.target.value)} className={inputCls} placeholder="36.8" /></Field>
        <Field label="Heart rate (bpm)"><input inputMode="numeric" value={v.heartRate} onChange={(e) => set("heartRate", e.target.value)} className={inputCls} placeholder="80" /></Field>
        <Field label="Systolic BP"><input inputMode="numeric" value={v.systolicBP} onChange={(e) => set("systolicBP", e.target.value)} className={inputCls} placeholder="120" /></Field>
        <Field label="Diastolic BP"><input inputMode="numeric" value={v.diastolicBP} onChange={(e) => set("diastolicBP", e.target.value)} className={inputCls} placeholder="80" /></Field>
        <Field label="SpO₂ (%)"><input inputMode="numeric" value={v.oxygenSaturation} onChange={(e) => set("oxygenSaturation", e.target.value)} className={inputCls} placeholder="98" /></Field>
        <Field label="Pain (0–10)"><input inputMode="numeric" value={v.painLevel} onChange={(e) => set("painLevel", e.target.value)} className={inputCls} placeholder="3" /></Field>
      </div>
    </BottomSheet>
  );
}

/* ───────── voice note (record → AI transcribe → save) ───────── */

type VoicePhase = "idle" | "recording" | "recorded" | "transcribing" | "review";

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
function safeParseObj(s: unknown): Record<string, string> {
  if (s && typeof s === "object") return s as Record<string, string>;
  if (typeof s === "string") { try { return JSON.parse(s); } catch { return {}; } }
  return {};
}

function VoiceNoteSheet({ patientId, doctorId, appointmentId, onClose }: { patientId: string; doctorId: string; appointmentId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // transcription review fields
  const [cc, setCC] = useState("");
  const [findings, setFindings] = useState("");
  const [dx, setDx] = useState("");
  const [plan, setPlan] = useState("");
  const [raw, setRaw] = useState("");

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const cleanupStream = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  useEffect(() => () => { stopTimer(); cleanupStream(); }, []);

  async function start() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        blobRef.current = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || "audio/webm" });
        cleanupStream();
        setPhase("recorded");
      };
      recRef.current = mr;
      mr.start();
      setSeconds(0);
      setPhase("recording");
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setErr("Microphone access was denied or isn't available on this device.");
    }
  }
  function stop() { stopTimer(); recRef.current?.stop(); }
  function reset() { blobRef.current = null; setSeconds(0); setErr(null); setPhase("idle"); }

  async function transcribe() {
    if (!blobRef.current) return;
    setPhase("transcribing");
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("audio", blobRef.current, "voice-note.webm");
      fd.append("patientId", patientId);
      fd.append("doctorId", doctorId);
      if (appointmentId) fd.append("appointmentId", appointmentId);
      const r = await fetch("/api/ai/transcribe", { method: "POST", body: fd });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Transcription failed");
      const sn = safeParseObj(j.data.structuredNote);
      setRaw(j.data.rawTranscript || "");
      setCC(sn.chiefComplaint || "");
      setFindings(sn.findings || "");
      setDx(sn.diagnosis || "");
      setPlan(sn.plan || "");
      setPhase("review");
    } catch (e) {
      setErr((e as Error).message);
      setPhase("recorded");
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId,
          appointmentId: appointmentId || undefined,
          chiefComplaint: cc.trim() || undefined,
          examination: findings.trim() || undefined,
          diagnosis: dx.trim() || undefined,
          treatmentPlan: plan.trim() || undefined,
          internalNotes: raw.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Couldn't save note");
      return j.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doctor-summary", patientId] });
      onClose();
    },
  });

  const reviewEmpty = !cc.trim() && !findings.trim() && !dx.trim() && !plan.trim() && !raw.trim();

  return (
    <BottomSheet
      title="Voice note"
      subtitle={phase === "review" ? "Review the AI transcript, then save" : "Dictate — AI transcribes it for the record"}
      onClose={onClose}
      error={err ? new Error(err) : (save.error as Error | null)}
      footer={phase === "review"
        ? <SaveBar pending={save.isPending} disabled={reviewEmpty} onCancel={onClose} onSave={() => save.mutate()} label="Save to profile" />
        : undefined}
    >
      {phase === "idle" && (
        <div className="flex flex-col items-center py-6">
          <button onClick={start} aria-label="Start recording" className="w-20 h-20 rounded-full bg-teal-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform">
            <Mic className="w-8 h-8" />
          </button>
          <p className="text-xs text-stone-500 mt-3">Tap to start recording</p>
        </div>
      )}

      {phase === "recording" && (
        <div className="flex flex-col items-center py-6">
          <div className="relative">
            <span className="absolute inset-0 rounded-full bg-red-400/40 animate-ping" />
            <button onClick={stop} aria-label="Stop recording" className="relative w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg">
              <Square className="w-7 h-7 fill-current" />
            </button>
          </div>
          <p className="text-2xl font-bold text-stone-800 tabular-nums mt-4">{fmtTime(seconds)}</p>
          <p className="text-xs text-stone-500 mt-1">Recording… tap to stop</p>
        </div>
      )}

      {phase === "recorded" && (
        <div className="flex flex-col items-center py-5">
          <div className="w-16 h-16 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center"><Mic className="w-7 h-7" /></div>
          <p className="text-sm font-semibold text-stone-700 mt-2">Recorded {fmtTime(seconds)}</p>
          <div className="flex gap-2 mt-4 w-full">
            <button onClick={reset} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-sm font-semibold text-stone-600 hover:bg-stone-50 inline-flex items-center justify-center gap-1.5">
              <RotateCcw className="w-4 h-4" /> Re-record
            </button>
            <button onClick={transcribe} className="flex-[2] py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 inline-flex items-center justify-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Transcribe with AI
            </button>
          </div>
        </div>
      )}

      {phase === "transcribing" && (
        <div className="flex flex-col items-center py-10 text-stone-500">
          <Loader2 className="w-7 h-7 animate-spin text-teal-500" />
          <p className="text-sm font-medium mt-3">Transcribing &amp; structuring…</p>
          <p className="text-[11px] text-stone-400 mt-1">AI is turning your dictation into a note</p>
        </div>
      )}

      {phase === "review" && (
        <div className="py-1">
          <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-wider text-violet-600">
            <Sparkles className="w-3 h-3" /> AI-structured — edit before saving
          </div>
          <Field label="Chief complaint"><input value={cc} onChange={(e) => setCC(e.target.value)} className={inputCls} /></Field>
          <Field label="Findings"><textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={2} className={inputCls} /></Field>
          <Field label="Diagnosis"><input value={dx} onChange={(e) => setDx(e.target.value)} className={inputCls} /></Field>
          <Field label="Plan"><textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={2} className={inputCls} /></Field>
          <button onClick={() => setShowRaw((v) => !v)} className="flex items-center gap-1 text-[11px] font-semibold text-stone-500 mt-1">
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showRaw && "rotate-180")} /> Full transcript
          </button>
          {showRaw && (
            <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={4} className={cn(inputCls, "mt-1.5 text-xs font-mono")} />
          )}
          <p className="text-[10px] text-stone-400 mt-2">Saved as a clinical note on the patient profile (transcript kept in internal notes).</p>
        </div>
      )}
    </BottomSheet>
  );
}

/* ───────── shared UI ───────── */

const inputCls = "w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block mb-2.5">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function SaveBar({ pending, disabled, onCancel, onSave, label }: { pending: boolean; disabled: boolean; onCancel: () => void; onSave: () => void; label: string }) {
  return (
    <div className="flex gap-2">
      <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-sm font-semibold text-stone-600 hover:bg-stone-50">Cancel</button>
      <button onClick={onSave} disabled={pending || disabled} className="flex-[2] py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {pending ? "Saving…" : label}
      </button>
    </div>
  );
}

function BottomSheet({ title, subtitle, onClose, error, footer, children }: { title: string; subtitle?: string; onClose: () => void; error?: Error | null; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl max-h-[88vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 pb-2 shrink-0">
          <div>
            <p className="text-sm font-bold text-stone-900">{title}</p>
            {subtitle && <p className="text-[10px] text-stone-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto px-4 flex-1">{children}</div>
        {error && <p className="text-[11px] text-red-600 px-4 pt-2">{error.message}</p>}
        {footer && <div className="p-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-stone-100 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

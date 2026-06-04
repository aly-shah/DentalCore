"use client";

/**
 * Doctor App — patient quick actions.
 *
 * Turns the otherwise read-only patient screen into a workspace: write a
 * clinical note, prescribe, record vitals, and advance the appointment
 * status — all from mobile, via the same APIs the desktop consultation
 * page uses. Demo mode renders the buttons disabled (no API / no PII).
 */
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Pill, HeartPulse, CalendarCheck, Plus, Trash2, X, Check, Loader2,
  LogIn, CheckCircle2, UserX,
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
  const [sheet, setSheet] = useState<null | "note" | "rx" | "vitals">(null);

  const disabled = demo || !doctorId;

  return (
    <section className="rounded-2xl bg-white border border-stone-200 p-2">
      <div className="grid grid-cols-4 gap-1.5">
        <ActionButton icon={<FileText className="w-5 h-5" />} label="Note" tone="teal" disabled={disabled} onClick={() => setSheet("note")} />
        <ActionButton icon={<Pill className="w-5 h-5" />} label="Prescribe" tone="emerald" disabled={disabled} onClick={() => setSheet("rx")} />
        <ActionButton icon={<HeartPulse className="w-5 h-5" />} label="Vitals" tone="rose" disabled={disabled} onClick={() => setSheet("vitals")} />
        <ApptStatusButton patientId={patientId} appointmentId={todayAppointmentId} status={todayApptStatus} disabled={disabled} />
      </div>
      {demo && <p className="text-[10px] text-stone-400 text-center mt-1.5">Actions are disabled in demo — sign in to use them.</p>}

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

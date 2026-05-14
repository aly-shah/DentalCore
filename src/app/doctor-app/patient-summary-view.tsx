"use client";

/**
 * Doctor App — inline patient summary view. Renders patient identity,
 * allergies banner, vitals snapshot, last visit, active Rx, open plan,
 * problem teeth, finance state, plus an AI pre-visit briefing card.
 * Used inside DoctorApp; the parent renders the contextual action bar.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft, Phone, Sparkles, AlertTriangle, Stethoscope,
  HeartPulse, Pill, ClipboardList, DollarSign, Smile,
  Calendar, Loader2, RefreshCw, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AIFeedbackWidget } from "@/components/ai/feedback-widget";

interface RxItem { medicineName: string; dosage: string; frequency: string; duration: string }
interface SummaryItem {
  text: string;
  category: "ALLERGY" | "MEDICAL" | "DENTAL" | "FINANCIAL" | "OPERATIONAL" | "ROUTINE";
  severity: "INFO" | "ATTENTION" | "URGENT";
}

interface SummaryPayload {
  patient: {
    id: string; firstName: string; lastName: string; patientCode: string;
    gender: string; age: number | null; phone: string | null; email: string | null;
    bloodType: string | null; isVip: boolean; profileImage: string | null;
    assignedDoctor: { id: string; name: string } | null;
    tags: string[];
  };
  allergies: { allergen: string; severity: string | null }[];
  lastNote: { chiefComplaint: string | null; diagnosis: string | null; treatmentPlan: string | null; advice: string | null; createdAt: string; doctor: { name: string } | null } | null;
  latestRx: { items: RxItem[]; createdAt: string } | null;
  latestTriage: {
    temperature: number | null; systolicBP: number | null; diastolicBP: number | null;
    heartRate: number | null; oxygenSaturation: number | null; painLevel: number | null;
    urgencyLevel: string; createdAt: string;
  } | null;
  problemTeeth: { fdi: number; status: string; conditions: string | null; plannedTreatment: string | null; priority: string }[];
  openPlan: {
    id: string; title: string | null; status: string; totalCost: number;
    estimatedPatientPortion: number;
    items: { id: string; description: string; status: string; total: number; fdi: number | null }[];
    completedCount: number;
  } | null;
  finance: { outstandingBalance: number; openInvoices: { id: string; invoiceNumber: string; total: number; balanceDue: number; status: string; dueDate: string | null }[] };
  todayAppt: { id: string; startTime: string; endTime: string; type: string; status: string; doctorId: string } | null;
  nextAppt: { id: string; date: string; startTime: string; type: string; doctor: { name: string } | null } | null;
}

const SEVERITY_STYLES: Record<SummaryItem["severity"], { bg: string; text: string; border: string; dot: string }> = {
  URGENT:    { bg: "bg-red-50",    text: "text-red-800",    border: "border-red-200",    dot: "bg-red-500" },
  ATTENTION: { bg: "bg-amber-50",  text: "text-amber-800",  border: "border-amber-200",  dot: "bg-amber-500" },
  INFO:      { bg: "bg-blue-50",   text: "text-blue-800",   border: "border-blue-200",   dot: "bg-blue-500" },
};

const CATEGORY_ICON: Record<SummaryItem["category"], string> = {
  ALLERGY: "⚠️", MEDICAL: "🩺", DENTAL: "🦷", FINANCIAL: "💳", OPERATIONAL: "📋", ROUTINE: "•",
};

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

const fmtDateShort = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
};
const daysAgo = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

export function PatientSummaryView({
  patientId,
  onBack,
}: {
  patientId: string;
  onBack: () => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["doctor-summary", patientId],
    queryFn: async (): Promise<SummaryPayload> => {
      const r = await fetch(`/api/patients/${patientId}/doctor-summary`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
  });

  // AI summary — auto-fires on mount once data is ready. Returns the
  // full payload (incl. suggestionLogId) so we can attach feedback.
  const aiSummary = useMutation({
    mutationFn: async (): Promise<{ summary: SummaryItem[]; suggestionLogId: string }> => {
      const r = await fetch(`/api/ai/patient-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "AI failed");
      return { summary: j.data.summary as SummaryItem[], suggestionLogId: j.data.suggestionLogId as string };
    },
  });

  useEffect(() => {
    if (data && !aiSummary.data && !aiSummary.isPending && !aiSummary.isError) {
      aiSummary.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-stone-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-xs">Loading patient briefing…</p>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-stone-400 gap-3">
        <AlertTriangle className="w-6 h-6 text-amber-500" />
        <p className="text-sm">Couldn&apos;t load patient.</p>
        <button onClick={onBack} className="text-xs text-blue-600 font-semibold underline">
          Go back
        </button>
      </div>
    );
  }

  const initials = ((data.patient.firstName?.[0] || "") + (data.patient.lastName?.[0] || "")).toUpperCase();
  const planProgress = data.openPlan && data.openPlan.items.length > 0
    ? Math.round((data.openPlan.completedCount / data.openPlan.items.length) * 100)
    : 0;
  const hasUrgentAllergy = data.allergies.some((a) => /severe|anaphyl/i.test(a.severity ?? ""));

  return (
    <div className="px-3 sm:px-4 py-3 space-y-3 max-w-3xl mx-auto w-full">
      {/* ─── Back link ─── */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-stone-800 transition-colors -ml-1"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      {/* ─── Identity card ─── */}
      <section className="bg-white rounded-2xl border border-stone-200 p-3.5 flex items-center gap-3 shadow-sm">
        <div className="relative shrink-0">
          {data.patient.profileImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.patient.profileImage} alt={data.patient.firstName} loading="lazy" decoding="async" className="w-14 h-14 rounded-2xl object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 via-cyan-500 to-blue-500 flex items-center justify-center text-white text-lg font-bold shadow-md">
              {initials || "?"}
            </div>
          )}
          {data.patient.isVip && (
            <span className="absolute -top-1 -right-1 text-[8px] font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 px-1.5 py-0.5 rounded-full shadow">VIP</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-stone-900 leading-tight truncate">
            {data.patient.firstName} {data.patient.lastName}
          </p>
          <p className="text-[10px] text-stone-400 font-mono leading-tight mt-0.5">
            {data.patient.patientCode}
            {data.patient.age !== null && <> · {data.patient.age}y</>}
            {data.patient.gender && data.patient.gender !== "OTHER" && <> · {data.patient.gender.toLowerCase()}</>}
            {data.patient.bloodType && <> · {data.patient.bloodType}</>}
          </p>
          {data.patient.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {data.patient.tags.slice(0, 3).map((t) => (
                <span key={t} className="text-[9px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">{t}</span>
              ))}
            </div>
          )}
        </div>
        {data.patient.phone && (
          <a
            href={`tel:${data.patient.phone}`}
            className="shrink-0 w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors"
            aria-label={`Call ${data.patient.firstName}`}
          >
            <Phone className="w-4 h-4" />
          </a>
        )}
      </section>

      {/* ─── Allergies banner (always visible if present) ─── */}
      {data.allergies.length > 0 && (
        <section className={cn(
          "rounded-2xl border-2 p-3 flex items-start gap-2.5",
          hasUrgentAllergy ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"
        )}>
          <AlertTriangle className={cn(
            "w-4 h-4 shrink-0 mt-0.5",
            hasUrgentAllergy ? "text-red-600" : "text-amber-600"
          )} />
          <div className="min-w-0">
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-wider",
              hasUrgentAllergy ? "text-red-700" : "text-amber-700"
            )}>
              {hasUrgentAllergy ? "⚠ Severe allergies" : "Allergies"}
            </p>
            <p className="text-xs font-semibold text-stone-800 mt-0.5">
              {data.allergies.map((a) => a.allergen + (a.severity ? ` (${a.severity})` : "")).join(", ")}
            </p>
          </div>
        </section>
      )}

      {/* ─── AI Pre-visit Briefing ─── */}
      <section className="rounded-2xl bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 border border-violet-200 p-3.5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-violet-700">
              AI Pre-Visit Briefing
            </span>
          </div>
          <button
            onClick={() => aiSummary.mutate()}
            disabled={aiSummary.isPending}
            className="p-1 rounded-md text-violet-600 hover:bg-violet-100 transition-colors disabled:opacity-50"
            aria-label="Re-run AI briefing"
          >
            {aiSummary.isPending
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />}
          </button>
        </div>
        {aiSummary.isPending && !aiSummary.data && (
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-3 bg-violet-100 rounded animate-pulse" style={{ width: `${85 - i * 12}%` }} />
            ))}
          </div>
        )}
        {aiSummary.isError && (
          <p className="text-[11px] text-red-600">
            Couldn&apos;t generate briefing: {(aiSummary.error as Error).message}
          </p>
        )}
        {aiSummary.data && aiSummary.data.summary.length === 0 && (
          <p className="text-[11px] text-stone-500 italic">Nothing notable for today&apos;s visit.</p>
        )}
        {aiSummary.data && aiSummary.data.summary.length > 0 && (
          <>
            <ul className="space-y-1.5">
              {aiSummary.data.summary.map((it, idx) => {
                const s = SEVERITY_STYLES[it.severity];
                return (
                  <li
                    key={idx}
                    className={cn("rounded-lg px-2.5 py-1.5 flex items-start gap-2 border", s.bg, s.border)}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", s.dot)} />
                    <span className="text-[12px] leading-snug text-stone-800">
                      <span className="mr-1">{CATEGORY_ICON[it.category]}</span>
                      {it.text}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex justify-end">
              <AIFeedbackWidget suggestionLogId={aiSummary.data.suggestionLogId} compact />
            </div>
          </>
        )}
      </section>

      {/* ─── Vitals snapshot ─── */}
      {data.latestTriage && (
        <section className="rounded-2xl bg-white border border-stone-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <HeartPulse className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600">Vitals</span>
            </div>
            <span className="text-[10px] text-stone-400">{daysAgo(data.latestTriage.createdAt)}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Vital label="BP" value={data.latestTriage.systolicBP && data.latestTriage.diastolicBP ? `${data.latestTriage.systolicBP}/${data.latestTriage.diastolicBP}` : "—"} />
            <Vital label="HR" value={data.latestTriage.heartRate ? `${data.latestTriage.heartRate}` : "—"} unit="bpm" />
            <Vital label="Temp" value={data.latestTriage.temperature ? `${data.latestTriage.temperature}` : "—"} unit="°" />
            <Vital
              label="Pain"
              value={data.latestTriage.painLevel != null ? `${data.latestTriage.painLevel}/10` : "—"}
              accent={data.latestTriage.painLevel != null && data.latestTriage.painLevel >= 7 ? "red" : data.latestTriage.painLevel != null && data.latestTriage.painLevel >= 4 ? "amber" : "default"}
            />
          </div>
        </section>
      )}

      {/* ─── Today's / Next appointment ─── */}
      {(data.todayAppt || data.nextAppt) && (
        <section className="rounded-2xl bg-white border border-stone-200 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600">
              {data.todayAppt ? "Today" : "Upcoming"}
            </span>
          </div>
          {data.todayAppt && (
            <div className="rounded-xl bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 px-3 py-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-blue-900">{data.todayAppt.startTime}–{data.todayAppt.endTime}</p>
                <p className="text-[10px] text-blue-700 uppercase tracking-wide">{data.todayAppt.type.replace(/_/g, " ")}</p>
              </div>
              <span className="text-[9px] font-bold bg-white text-blue-700 px-2 py-0.5 rounded-full uppercase">
                {data.todayAppt.status.replace(/_/g, " ")}
              </span>
            </div>
          )}
          {!data.todayAppt && data.nextAppt && (
            <div className="text-[11px] text-stone-600">
              <span className="font-bold text-stone-900">{fmtDateShort(data.nextAppt.date)}</span>
              {" · "}{data.nextAppt.startTime}
              {data.nextAppt.doctor?.name && <> · {data.nextAppt.doctor.name}</>}
            </div>
          )}
        </section>
      )}

      {/* ─── Open Treatment Plan ─── */}
      {data.openPlan && (
        <section className="rounded-2xl bg-white border border-stone-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600">Open Plan</span>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
              {data.openPlan.status}
            </span>
          </div>
          <p className="text-sm font-semibold text-stone-900 truncate">
            {data.openPlan.title || `Plan ${data.openPlan.id.slice(-6)}`}
          </p>
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-stone-500 mb-1">
              <span>{data.openPlan.completedCount} of {data.openPlan.items.length} items done</span>
              <span className="font-bold text-stone-700">{planProgress}%</span>
            </div>
            <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                style={{ width: `${planProgress}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-stone-100 text-[10px]">
            <div>
              <p className="text-stone-400 uppercase tracking-wide">Total</p>
              <p className="font-bold text-stone-900 text-sm">{currency(data.openPlan.totalCost)}</p>
            </div>
            <div>
              <p className="text-stone-400 uppercase tracking-wide">Patient owes</p>
              <p className="font-bold text-stone-900 text-sm">{currency(data.openPlan.estimatedPatientPortion)}</p>
            </div>
          </div>
        </section>
      )}

      {/* ─── Last visit ─── */}
      {data.lastNote && (
        <section className="rounded-2xl bg-white border border-stone-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Stethoscope className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600">Last Visit</span>
            </div>
            <span className="text-[10px] text-stone-400">{daysAgo(data.lastNote.createdAt)}</span>
          </div>
          {data.lastNote.diagnosis && <NoteRow label="Dx" value={data.lastNote.diagnosis} />}
          {data.lastNote.chiefComplaint && <NoteRow label="CC" value={data.lastNote.chiefComplaint} />}
          {data.lastNote.treatmentPlan && <NoteRow label="Plan" value={data.lastNote.treatmentPlan} />}
          {data.lastNote.doctor?.name && (
            <p className="text-[10px] text-stone-400 mt-2">Seen by {data.lastNote.doctor.name}</p>
          )}
        </section>
      )}

      {/* ─── Active Rx ─── */}
      {data.latestRx && data.latestRx.items.length > 0 && (
        <section className="rounded-2xl bg-white border border-stone-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Pill className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600">Latest Rx</span>
            </div>
            <span className="text-[10px] text-stone-400">{daysAgo(data.latestRx.createdAt)}</span>
          </div>
          <ul className="space-y-1.5">
            {data.latestRx.items.slice(0, 4).map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px]">
                <Pill className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="font-semibold text-stone-900">{it.medicineName}</span>
                  {" "}<span className="text-stone-500">{it.dosage} · {it.frequency} · {it.duration}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── Problem teeth ─── */}
      {data.problemTeeth.length > 0 && (
        <section className="rounded-2xl bg-white border border-stone-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Smile className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600">Problem Teeth</span>
            </div>
            <Link
              href={`/patients/${patientId}?tab=dental-chart`}
              className="text-[10px] font-bold text-blue-600 hover:underline"
            >
              Full chart →
            </Link>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.problemTeeth.slice(0, 12).map((t) => (
              <span
                key={t.fdi}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border",
                  t.priority === "EMERGENCY" ? "bg-red-50 text-red-700 border-red-200" :
                  t.priority === "HIGH" ? "bg-amber-50 text-amber-700 border-amber-200" :
                  "bg-stone-50 text-stone-700 border-stone-200"
                )}
                title={t.conditions ?? t.status}
              >
                #{t.fdi}
                <span className="text-[9px] font-normal opacity-80">{t.status.replace(/_/g, " ").toLowerCase()}</span>
              </span>
            ))}
            {data.problemTeeth.length > 12 && (
              <span className="text-[10px] text-stone-400 self-center">+{data.problemTeeth.length - 12} more</span>
            )}
          </div>
        </section>
      )}

      {/* ─── Finance ─── */}
      {data.finance.outstandingBalance > 0 && (
        <section className="rounded-2xl bg-amber-50/40 border border-amber-200 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Outstanding</span>
            </div>
            <p className="text-sm font-bold text-amber-900">{currency(data.finance.outstandingBalance)}</p>
          </div>
          <p className="text-[10px] text-amber-700">
            {data.finance.openInvoices.length} open invoice{data.finance.openInvoices.length === 1 ? "" : "s"}
          </p>
        </section>
      )}

      {/* Bottom spacer so content isn't hidden behind the action bar */}
      <div className="h-24" />
    </div>
  );
}

/* ─────────────── Small helpers ─────────────── */

function Vital({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: "red" | "amber" | "default" }) {
  return (
    <div className="text-center">
      <p className="text-[9px] text-stone-400 uppercase tracking-wider">{label}</p>
      <p className={cn(
        "text-sm font-bold leading-tight",
        accent === "red" ? "text-red-600" : accent === "amber" ? "text-amber-600" : "text-stone-900"
      )}>{value}{unit && <span className="text-[9px] text-stone-400 font-normal ml-0.5">{unit}</span>}</p>
    </div>
  );
}

function NoteRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[12px] text-stone-700 leading-snug">
      <span className="text-stone-400 font-bold mr-1">{label}:</span>
      {value}
    </p>
  );
}

/* ───────────────────────────────────────────────────────────── */
/** Contextual bottom action bar — replaces the 3-tab nav when in
 *  patient-summary mode. Compact 4-button bar with quick actions. */
export function PatientActionBar({
  patientId,
  todayAppointmentId,
  phone,
}: {
  patientId: string;
  todayAppointmentId: string | null;
  phone: string | null;
}) {
  const startConsultUrl = todayAppointmentId
    ? `/consultation?patientId=${patientId}&appointmentId=${todayAppointmentId}`
    : `/consultation?patientId=${patientId}`;

  return (
    <nav className="shrink-0 border-t border-stone-200 bg-white grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
      <Link
        href={startConsultUrl}
        className="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-bold text-white bg-gradient-to-br from-teal-500 to-cyan-600 col-span-2 m-1.5 rounded-xl shadow-md"
      >
        <Activity className="w-4 h-4" />
        Start Consultation
      </Link>
      <Link
        href={`/patients/${patientId}`}
        className="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium text-stone-500 hover:text-stone-900 transition-colors"
      >
        <ClipboardList className="w-4 h-4" />
        Full record
      </Link>
      {phone ? (
        <a
          href={`tel:${phone}`}
          className="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          <Phone className="w-4 h-4" />
          Call
        </a>
      ) : (
        <span className="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium text-stone-300">
          <Phone className="w-4 h-4" />
          No phone
        </span>
      )}
    </nav>
  );
}

/** Hook so the parent component can know about the current patient's
 *  todayAppointmentId + phone for the action bar without re-fetching. */
export function usePatientSummary(patientId: string | null) {
  return useQuery({
    queryKey: ["doctor-summary", patientId],
    enabled: !!patientId,
    queryFn: async (): Promise<SummaryPayload> => {
      const r = await fetch(`/api/patients/${patientId}/doctor-summary`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
  });
}

// Expose payload type for the parent (kept named export to avoid bundling overhead).
export type { SummaryPayload };

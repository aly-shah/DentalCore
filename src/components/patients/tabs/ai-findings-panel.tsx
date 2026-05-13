"use client";

/**
 * AI Tooth-wise Findings — right-slide drawer.
 * Calls POST /api/ai/tooth-findings, displays findings grouped by urgency,
 * and lets the doctor apply a finding to a tooth (writes plannedTreatment
 * and CARIES-like status) or dismiss it.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, X as XIcon, Loader2, AlertTriangle, ChevronRight,
  Check, Trash2, Clock, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ToothFinding {
  fdi: number;
  diagnosis: string;
  recommendedTreatment: string;
  cdtCode: string | null;
  urgency: "ROUTINE" | "URGENT" | "EMERGENCY";
  confidence: number;
  rationale: string;
  estimatedVisits: number;
}

interface AnalyzeResult {
  suggestionLogId: string;
  findings: ToothFinding[];
  modelId: string;
  costCents: number;
  latencyMs: number;
}

const URGENCY_STYLES: Record<ToothFinding["urgency"], { bg: string; text: string; ring: string; gradient: string; dot: string }> = {
  EMERGENCY: { bg: "bg-red-50",     text: "text-red-700",     ring: "ring-red-200",     gradient: "from-red-500 to-orange-500",     dot: "bg-red-500" },
  URGENT:    { bg: "bg-amber-50",   text: "text-amber-700",   ring: "ring-amber-200",   gradient: "from-amber-500 to-orange-400",   dot: "bg-amber-500" },
  ROUTINE:   { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", gradient: "from-emerald-500 to-teal-500",   dot: "bg-emerald-500" },
};

export function AIFindingsPanel({
  patientId, chartId, onClose, onAppliedToTooth,
}: {
  patientId: string;
  chartId: string;
  onClose: () => void;
  /** Called after a finding is successfully applied; consumer can refetch chart. */
  onAppliedToTooth?: (fdi: number) => void;
}) {
  const qc = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const [findings, setFindings] = useState<ToothFinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedFdis, setDismissedFdis] = useState<Set<number>>(new Set());
  const [appliedFdis, setAppliedFdis] = useState<Set<number>>(new Set());
  const [meta, setMeta] = useState<{ modelId: string; costCents: number; latencyMs: number } | null>(null);

  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    const t = setTimeout(() => setContentReady(true), 160);
    return () => { cancelAnimationFrame(r); clearTimeout(t); };
  }, []);

  const handleClose = () => {
    setContentReady(false);
    setMounted(false);
    setTimeout(onClose, 280);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyze = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/ai/tooth-findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "AI request failed");
      return j.data as AnalyzeResult;
    },
    onSuccess: (data) => {
      setFindings(data.findings);
      setMeta({ modelId: data.modelId, costCents: data.costCents, latencyMs: data.latencyMs });
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  // Auto-run on mount
  useEffect(() => {
    analyze.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = useMutation({
    mutationFn: async (f: ToothFinding) => {
      // Map AI urgency → existing tooth priority for visual continuity.
      const priorityFromUrgency = {
        EMERGENCY: "EMERGENCY",
        URGENT: "HIGH",
        ROUTINE: "MEDIUM",
      }[f.urgency];

      const r = await fetch(`/api/dental-chart/${chartId}/teeth/${f.fdi}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannedTreatment: f.recommendedTreatment + (f.cdtCode ? ` (${f.cdtCode})` : ""),
          conditions: f.diagnosis,
          priority: priorityFromUrgency,
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return f.fdi;
    },
    onSuccess: (fdi) => {
      setAppliedFdis((prev) => new Set(prev).add(fdi));
      qc.invalidateQueries({ queryKey: ["dental-chart", patientId] });
      onAppliedToTooth?.(fdi);
    },
  });

  const stagger = (i: number) => ({
    opacity: contentReady ? 1 : 0,
    transform: contentReady ? "translateY(0)" : "translateY(10px)",
    transition: `opacity 280ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 45}ms, transform 320ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 45}ms`,
  });

  const visibleFindings = useMemo(
    () => (findings ?? []).filter((f) => !dismissedFdis.has(f.fdi)),
    [findings, dismissedFdis]
  );

  const grouped = useMemo(() => {
    const groups: Record<ToothFinding["urgency"], ToothFinding[]> = { EMERGENCY: [], URGENT: [], ROUTINE: [] };
    for (const f of visibleFindings) groups[f.urgency].push(f);
    return groups;
  }, [visibleFindings]);

  const counts = {
    EMERGENCY: grouped.EMERGENCY.length,
    URGENT: grouped.URGENT.length,
    ROUTINE: grouped.ROUTINE.length,
  };

  return (
    <div className="fixed inset-0 z-40">
      <div
        onClick={handleClose}
        style={{
          backdropFilter: mounted ? "blur(4px)" : "blur(0px)",
          transition: "opacity 260ms ease-out, backdrop-filter 260ms ease-out",
        }}
        className={cn(
          "absolute inset-0 bg-slate-900/40",
          mounted ? "opacity-100" : "opacity-0"
        )}
      />
      <aside
        style={{
          transform: mounted ? "translateX(0)" : "translateX(100%)",
          transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: mounted
            ? "-30px 0 60px -20px rgba(15, 23, 42, 0.25), -10px 0 30px -10px rgba(15, 23, 42, 0.15)"
            : "none",
        }}
        className="absolute top-0 bottom-0 right-0 w-full sm:w-[500px] md:w-[560px] bg-stone-50 flex flex-col will-change-transform"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="AI tooth findings"
      >
        {/* Header */}
        <header className="shrink-0 px-5 pt-5 pb-3 border-b border-stone-200 bg-white" style={stagger(0)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 flex items-center justify-center shadow-md">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 leading-tight">AI Tooth Findings</h2>
                <p className="text-[11px] text-stone-500 leading-tight mt-0.5">
                  {analyze.isPending
                    ? "Analyzing the chart…"
                    : meta
                      ? `Model: ${meta.modelId} · ${meta.latencyMs}ms`
                      : "Per-tooth diagnosis + recommended treatment"}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 -m-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Urgency summary chips */}
          {findings && findings.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3">
              <UrgencyChip label="Emergency" count={counts.EMERGENCY} urgency="EMERGENCY" />
              <UrgencyChip label="Urgent"    count={counts.URGENT}    urgency="URGENT" />
              <UrgencyChip label="Routine"   count={counts.ROUTINE}   urgency="ROUTINE" />
              <button
                onClick={() => analyze.mutate()}
                disabled={analyze.isPending}
                className="ml-auto px-2.5 py-1 rounded-md text-[10px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors flex items-center gap-1 disabled:opacity-60"
              >
                {analyze.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Re-run
              </button>
            </div>
          )}
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {analyze.isPending && !findings && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-100 to-pink-100 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-violet-500 animate-pulse" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-violet-300 border-t-transparent animate-spin" />
              </div>
              <p className="text-sm font-semibold text-stone-700 mt-4">Analyzing chart…</p>
              <p className="text-[11px] text-stone-500 mt-1">Reading tooth status, surfaces, and notes</p>
            </div>
          )}

          {error && !analyze.isPending && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-3 flex items-start gap-2" style={stagger(1)}>
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-red-700">Couldn&apos;t analyze chart</p>
                <p className="text-[11px] text-red-600 mt-0.5 break-words">{error}</p>
                <button
                  onClick={() => analyze.mutate()}
                  className="mt-2 text-[11px] font-bold text-red-700 hover:underline"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {findings && findings.length === 0 && !analyze.isPending && (
            <div className="flex flex-col items-center justify-center py-16 text-center" style={stagger(1)}>
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-stone-800 mt-4">No findings to flag</p>
              <p className="text-[11px] text-stone-500 mt-1 max-w-xs">
                The chart looks clean. Mark some teeth with conditions or surface lesions and re-run.
              </p>
            </div>
          )}

          {visibleFindings.length === 0 && findings && findings.length > 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center" style={stagger(1)}>
              <p className="text-sm font-semibold text-stone-700">All findings handled</p>
              <p className="text-[11px] text-stone-500 mt-1">
                Apply, dismiss, or re-run analysis to fetch fresh suggestions.
              </p>
            </div>
          )}

          {(["EMERGENCY", "URGENT", "ROUTINE"] as const).map((urg, urgIdx) => {
            const items = grouped[urg];
            if (items.length === 0) return null;
            const style = URGENCY_STYLES[urg];
            return (
              <section key={urg} className="space-y-2" style={stagger(1 + urgIdx)}>
                <div className="flex items-center gap-2 px-1">
                  <span className={cn("h-1.5 w-8 rounded-full bg-gradient-to-r", style.gradient)} />
                  <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", style.text)}>
                    {urg === "EMERGENCY" ? "Emergency" : urg === "URGENT" ? "Urgent" : "Routine"}
                  </h3>
                  <span className="text-[10px] text-stone-400">{items.length}</span>
                </div>
                <ul className="space-y-2">
                  {items.map((f) => (
                    <FindingCard
                      key={f.fdi}
                      f={f}
                      applied={appliedFdis.has(f.fdi)}
                      applying={apply.isPending && apply.variables?.fdi === f.fdi}
                      onApply={() => apply.mutate(f)}
                      onDismiss={() => setDismissedFdis((prev) => new Set(prev).add(f.fdi))}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <footer className="shrink-0 border-t border-stone-200 px-3 py-2.5 bg-white flex items-center gap-2 text-[10px] text-stone-400">
          <Activity className="w-3 h-3 text-violet-500" />
          AI is advisory only. Every suggestion is logged for audit (model, prompt, response, accept/reject).
        </footer>
      </aside>
    </div>
  );
}

function UrgencyChip({ label, count, urgency }: { label: string; count: number; urgency: ToothFinding["urgency"] }) {
  const s = URGENCY_STYLES[urgency];
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold",
      count > 0 ? `${s.bg} ${s.text}` : "bg-stone-100 text-stone-400"
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", count > 0 ? s.dot : "bg-stone-300")} />
      {label} <span className="text-[9px]">{count}</span>
    </span>
  );
}

function FindingCard({ f, applied, applying, onApply, onDismiss }: {
  f: ToothFinding;
  applied: boolean;
  applying: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const s = URGENCY_STYLES[f.urgency];
  const conf = Math.round((f.confidence ?? 0) * 100);

  return (
    <li className={cn(
      "rounded-2xl bg-white border-2 transition-all overflow-hidden",
      applied ? "border-emerald-300 bg-emerald-50/40" : "border-stone-200 hover:border-stone-300 hover:shadow-sm"
    )}>
      <div className={cn("h-1 bg-gradient-to-r", s.gradient)} />
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-bold bg-gradient-to-br text-white shadow-sm",
            s.gradient
          )}>
            #{f.fdi}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <span className="text-sm font-bold text-stone-900 leading-tight">{f.diagnosis}</span>
              {f.cdtCode && (
                <span className="text-[9px] font-mono text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">{f.cdtCode}</span>
              )}
            </div>
            <p className="text-[12px] text-stone-700 leading-snug">
              <ChevronRight className="w-3 h-3 inline -mt-px text-blue-500" />
              {f.recommendedTreatment}
            </p>
            <p className="text-[11px] text-stone-500 leading-snug mt-1 italic">{f.rationale}</p>

            <div className="flex items-center gap-2 mt-2 text-[10px] text-stone-500">
              <span className="flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" /> ~{f.estimatedVisits} visit{f.estimatedVisits === 1 ? "" : "s"}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-10 h-1 bg-stone-200 rounded-full overflow-hidden">
                  <span
                    className={cn(
                      "block h-full",
                      conf >= 80 ? "bg-emerald-500" : conf >= 50 ? "bg-amber-500" : "bg-red-400"
                    )}
                    style={{ width: `${conf}%` }}
                  />
                </span>
                <span className="font-semibold text-stone-600">{conf}%</span>
              </span>
            </div>
          </div>
        </div>

        {!applied ? (
          <div className="flex items-center gap-1.5 pt-1">
            <button
              onClick={onApply}
              disabled={applying}
              className="flex-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
            >
              {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {applying ? "Applying…" : `Apply to #${f.fdi}`}
            </button>
            <button
              onClick={onDismiss}
              className="px-2.5 py-1.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-600 text-[11px] font-semibold transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Dismiss
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-emerald-700 font-bold flex items-center gap-1 pt-1">
            <Check className="w-3 h-3" /> Applied to tooth #{f.fdi}
          </p>
        )}
      </div>
    </li>
  );
}

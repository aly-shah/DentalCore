"use client";

/**
 * ToothPanel — right-slide drawer for editing a single tooth.
 *
 * Extracted from dental-chart-tab.tsx so the chart's main render loop
 * stays focused on layout. Includes its inline helpers (ChipField,
 * MiniToothIcon, SurfacePicker).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X as XIcon, Activity, Layers, FileText, Trash2, AlertTriangle,
  Sparkles, Plus, Zap, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONDITION_CHIPS,
  joinChips,
  parseChips,
  STATUS_STYLES,
  STATUSES,
  SURFACE_CHIPS,
  suggestTreatments,
  surfaceFill,
  TREATMENT_CHIPS,
  toothCategory,
  type Surface,
  type SurfaceData,
  type ToothCategory,
  type ToothRecord,
  type ToothStatus,
} from "./types";

interface AiSuggestion {
  treatment: string;
  cdtCode: string | null;
  rationale: string;
  estimatedVisits: number;
  urgency: "ROUTINE" | "URGENT" | "EMERGENCY";
  confidence: number;
}

interface ApplyPayload {
  status: ToothStatus;
  priority: string;
  conditions: string;
  plannedTreatment: string;
  completedTreatment: string;
  surfaces: Partial<Record<Surface, SurfaceData>>;
}

export function ToothPanel({
  chartId, fdi, existing, initialSurface, patientId, onClose, onSaved, onApplyToOthers,
}: {
  chartId: string;
  fdi: number;
  existing?: ToothRecord;
  initialSurface?: Surface | null;
  patientId?: string;
  onClose: () => void;
  onSaved: () => void;
  onApplyToOthers?: (sourceFdi: number, payload: ApplyPayload) => void;
}) {
  const qc = useQueryClient();
  const cat = toothCategory(fdi);

  const [status, setStatus] = useState<ToothStatus>(existing?.status ?? "HEALTHY");
  const [priority, setPriority] = useState(existing?.priority ?? "MEDIUM");
  const [plannedTreatment, setPlannedTreatment] = useState(existing?.plannedTreatment ?? "");
  const [completedTreatment, setCompletedTreatment] = useState(existing?.completedTreatment ?? "");
  const [conditions, setConditions] = useState(existing?.conditions ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [surfaces, setSurfaces] = useState<Partial<Record<Surface, SurfaceData>>>(existing?.surfaces ?? {});

  // AI suggestions
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const hasSurfaceData = useMemo(
    () => Object.values(surfaces).some((d) => !!(d?.condition || d?.completedTreatment || d?.plannedTreatment)),
    [surfaces]
  );
  const instantSuggestions = useMemo(
    () => suggestTreatments(status, cat, hasSurfaceData),
    [status, cat, hasSurfaceData]
  );

  const patientIdForAi = patientId;

  async function onAskAi() {
    if (!patientIdForAi) return;
    setAiLoading(true);
    try {
      const condList = parseChips(conditions);
      const diagnosis = [
        `Tooth ${fdi} (${cat})`,
        `Current status: ${STATUS_STYLES[status].label}`,
        condList.length ? `Conditions: ${condList.join(", ")}` : "",
        plannedTreatment ? `Planned: ${plannedTreatment}` : "",
        hasSurfaceData ? `Surfaces with findings: ${(Object.keys(surfaces) as Surface[]).filter((s) => {
          const d = surfaces[s];
          return !!(d?.condition || d?.plannedTreatment);
        }).join(", ")}` : "",
      ].filter(Boolean).join(". ");

      const r = await fetch("/api/ai/treatment-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnosis: diagnosis || `Tooth ${fdi} ${cat} clinical evaluation`,
          toothFdi: fdi,
          patientId: patientIdForAi,
        }),
      });
      const j = await r.json();
      if (j.success && Array.isArray(j.data?.suggestions)) {
        setAiSuggestions(j.data.suggestions);
      }
    } catch {
      // silent — UI shows AI button state
    } finally {
      setAiLoading(false);
    }
  }

  // Slide-in animation state
  const [mounted, setMounted] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const [tab, setTab] = useState<"overview" | "surfaces" | "notes">(initialSurface ? "surfaces" : "overview");
  const [activeSurface, setActiveSurface] = useState<Surface | null>(initialSurface ?? null);

  useEffect(() => {
    const r1 = requestAnimationFrame(() => setMounted(true));
    const t1 = setTimeout(() => setContentReady(true), 180);
    return () => { cancelAnimationFrame(r1); clearTimeout(t1); };
  }, []);

  const handleClose = () => {
    setContentReady(false);
    setMounted(false);
    setTimeout(onClose, 260);
  };

  const stagger = (i: number) => ({
    opacity: contentReady ? 1 : 0,
    transform: contentReady ? "translateY(0)" : "translateY(10px)",
    transition: `opacity 280ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 45}ms, transform 320ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 45}ms`,
  });

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      const body = { status, priority, plannedTreatment, completedTreatment, conditions, notes, surfaces };
      const r = await fetch(`/api/dental-chart/${chartId}/teeth/${fdi}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to save");
      return j.data;
    },
    onSuccess: () => { onSaved(); handleClose(); },
  });

  const reset = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/dental-chart/${chartId}/teeth/${fdi}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to reset");
      return j.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dental-chart"] });
      handleClose();
    },
  });

  function updateSurface(s: Surface, field: keyof SurfaceData, value: string) {
    setSurfaces((prev) => ({
      ...prev,
      [s]: { ...(prev[s] ?? {}), [field]: value || undefined },
    }));
  }

  function surfaceHasData(s: Surface): boolean {
    const d = surfaces[s];
    return !!(d?.condition || d?.completedTreatment || d?.plannedTreatment || d?.notes);
  }

  const statusStyle = STATUS_STYLES[status];

  // Cmd/Ctrl + Enter = save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save.mutate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, priority, plannedTreatment, completedTreatment, conditions, notes, surfaces]);

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
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

      {/* Right drawer */}
      <aside
        style={{
          transform: mounted
            ? "translateX(0) scale(1)"
            : "translateX(100%) scale(0.97)",
          transformOrigin: "right center",
          transition: mounted
            ? "transform 320ms cubic-bezier(0.34, 1.35, 0.64, 1), box-shadow 200ms ease-out"
            : "transform 220ms cubic-bezier(0.7, 0, 0.84, 0), box-shadow 200ms ease-out",
          boxShadow: mounted
            ? "-30px 0 60px -20px rgba(15, 23, 42, 0.25), -10px 0 30px -10px rgba(15, 23, 42, 0.15)"
            : "none",
        }}
        className="absolute top-0 bottom-0 right-0 w-full sm:w-[440px] md:w-[480px] bg-white flex flex-col will-change-transform"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Edit tooth ${fdi}`}
      >
        {/* ───── Header ───── */}
        <header className="shrink-0 pl-16 pr-5 sm:px-5 pt-5 pb-4 border-b border-stone-100" style={stagger(0)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border-2",
                statusStyle.bg, statusStyle.border
              )}>
                <MiniToothIcon cat={cat} status={status} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-stone-900 leading-none">#{fdi}</h2>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-400">{cat}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={cn("w-2 h-2 rounded-full", statusStyle.dot)} />
                  <span className={cn("text-xs font-medium", statusStyle.text)}>{statusStyle.label}</span>
                  {priority !== "MEDIUM" && (
                    <span className={cn(
                      "ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                      priority === "EMERGENCY" ? "bg-red-50 text-red-700"
                        : priority === "HIGH" ? "bg-amber-50 text-amber-700"
                        : "bg-violet-50 text-violet-700"
                    )}>
                      {priority === "EMERGENCY" && <AlertTriangle className="w-2.5 h-2.5" />}
                      {priority.charAt(0) + priority.slice(1).toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="p-1.5 -m-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Tab bar */}
          <nav className="flex gap-1 mt-4 -mb-2" role="tablist">
            {([
              { key: "overview", label: "Overview", icon: <Activity className="w-3.5 h-3.5" /> },
              { key: "surfaces", label: "Surfaces", icon: <Layers className="w-3.5 h-3.5" /> },
              { key: "notes",    label: "Notes",    icon: <FileText className="w-3.5 h-3.5" /> },
            ] as const).map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[11px] font-semibold transition-all border-b-2 -mb-px",
                  tab === t.key
                    ? "text-blue-600 border-blue-500 bg-blue-50/60"
                    : "text-stone-500 border-transparent hover:text-stone-800 hover:bg-stone-50"
                )}
              >
                {t.icon}
                {t.label}
                {t.key === "surfaces" && Object.values(surfaces).filter(Boolean).length > 0 && (
                  <span className="ml-1 px-1.5 py-0 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold">
                    {Object.values(surfaces).filter(Boolean).length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </header>

        {/* ───── Body ───── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* OVERVIEW TAB */}
          {tab === "overview" && (
            <>
              {/* Status */}
              <section style={stagger(1)}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-500">Status</label>
                  {status !== "HEALTHY" && (
                    <button
                      onClick={() => setStatus("HEALTHY")}
                      className="text-[10px] text-stone-400 hover:text-stone-700 font-medium"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {STATUSES.map((s) => {
                    const style = STATUS_STYLES[s];
                    const active = status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setStatus(s)}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold transition-all",
                          active
                            ? `${style.border} ${style.bg} ${style.text} shadow-sm scale-[1.03]`
                            : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:bg-stone-50"
                        )}
                      >
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", style.dot)} />
                        {style.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Priority */}
              <section style={stagger(2)}>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Priority</label>
                <div className="flex gap-1">
                  {(["EMERGENCY", "HIGH", "MEDIUM", "COSMETIC"] as const).map((p) => {
                    const active = priority === p;
                    const palette =
                      p === "EMERGENCY" ? "border-red-300 bg-red-50 text-red-700"
                      : p === "HIGH"    ? "border-amber-300 bg-amber-50 text-amber-700"
                      : p === "MEDIUM"  ? "border-blue-300 bg-blue-50 text-blue-700"
                      :                   "border-violet-300 bg-violet-50 text-violet-700";
                    const dot =
                      p === "EMERGENCY" ? "bg-red-500"
                      : p === "HIGH"    ? "bg-amber-500"
                      : p === "MEDIUM"  ? "bg-blue-500"
                      :                   "bg-violet-500";
                    return (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold transition-all",
                          active ? palette + " shadow-sm" : "border-stone-200 bg-white text-stone-400 hover:border-stone-300"
                        )}
                      >
                        <span className={cn("w-1.5 h-1.5 rounded-full", active ? dot : "bg-stone-300")} />
                        {p.charAt(0) + p.slice(1).toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              </section>

              <div style={stagger(3)}>
                <ChipField
                  label="Conditions"
                  accentClass="rose"
                  values={parseChips(conditions)}
                  onChange={(chips) => setConditions(joinChips(chips))}
                  suggestions={CONDITION_CHIPS}
                  placeholder="Type or pick…"
                />
              </div>

              <div style={stagger(4)}>
                <ChipField
                  label="Planned Treatment"
                  accentClass="cyan"
                  values={parseChips(plannedTreatment)}
                  onChange={(chips) => setPlannedTreatment(joinChips(chips))}
                  suggestions={instantSuggestions}
                  instantBadge="Smart"
                  placeholder="Add procedure to plan…"
                  showAiButton={!!patientIdForAi}
                  onAskAi={onAskAi}
                  aiLoading={aiLoading}
                />
              </div>

              <div style={stagger(5)}>
                <ChipField
                  label="Completed Treatment"
                  accentClass="emerald"
                  values={parseChips(completedTreatment)}
                  onChange={(chips) => setCompletedTreatment(joinChips(chips))}
                  suggestions={TREATMENT_CHIPS.slice(0, 12)}
                  placeholder="Add finished procedure…"
                />
              </div>

              {/* AI suggestions */}
              {aiSuggestions.length > 0 && (
                <section
                  style={stagger(6)}
                  className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50/60 p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-500" />
                    <span className="text-[11px] uppercase tracking-wider font-bold text-violet-700">AI Treatment Suggestions</span>
                  </div>
                  <div className="space-y-1.5">
                    {aiSuggestions.slice(0, 3).map((s, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const current = parseChips(plannedTreatment);
                          if (!current.includes(s.treatment)) {
                            setPlannedTreatment(joinChips([...current, s.treatment]));
                          }
                        }}
                        className="w-full text-left bg-white/80 hover:bg-white border border-violet-200 hover:border-violet-300 rounded-xl px-3 py-2 transition-all group hover:shadow-md hover:-translate-y-px"
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-xs font-bold text-stone-900">{s.treatment}</span>
                          <div className="flex items-center gap-1.5">
                            {s.cdtCode && <span className="text-[9px] font-mono text-stone-400">{s.cdtCode}</span>}
                            <span className={cn(
                              "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                              s.urgency === "EMERGENCY" ? "bg-red-100 text-red-700"
                              : s.urgency === "URGENT" ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                            )}>{s.urgency}</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-stone-600 leading-tight">{s.rationale}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[9px] text-stone-400">{s.estimatedVisits} visit{s.estimatedVisits === 1 ? "" : "s"} · {Math.round(s.confidence * 100)}% confidence</span>
                          <Plus className="w-3 h-3 text-violet-400 group-hover:text-violet-600 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* SURFACES TAB */}
          {tab === "surfaces" && (
            <>
              <section style={stagger(1)} className="flex flex-col items-center pb-1">
                <div className="text-center mb-3">
                  <div className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Occlusal View</div>
                  <div className="text-[10px] text-stone-500 mt-0.5">Tap a surface to edit</div>
                </div>
                <SurfacePicker
                  cat={cat}
                  arch={(fdi >= 30 && fdi <= 48) || fdi >= 70 ? "lower" : "upper"}
                  surfaces={surfaces}
                  status={status}
                  active={activeSurface}
                  onSelect={(s) => setActiveSurface(s)}
                />
                <div className="flex gap-1.5 mt-4">
                  {SURFACE_CHIPS.map((c) => {
                    const has = surfaceHasData(c.key);
                    const active = activeSurface === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => setActiveSurface(c.key)}
                        className={cn(
                          "group relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all",
                          active && "bg-blue-50 ring-2 ring-blue-400 ring-offset-1 ring-offset-white scale-[1.04]"
                        )}
                        title={c.label}
                      >
                        <span className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold transition-all",
                          active ? "bg-blue-600 text-white shadow-md"
                          : has ? "bg-stone-800 text-white"
                          : "bg-stone-100 text-stone-500 group-hover:bg-stone-200"
                        )}>
                          {c.short}
                        </span>
                        <span className={cn(
                          "text-[8px] font-semibold uppercase tracking-wider transition-colors",
                          active ? "text-blue-700"
                          : has ? "text-stone-700"
                          : "text-stone-400"
                        )}>
                          {c.label.replace(/\s*\(.*\)/, "")}
                        </span>
                        {has && !active && (
                          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 ring-2 ring-white" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Surface editor */}
              {activeSurface && (
                <section
                  style={stagger(2)}
                  className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50/60 to-cyan-50/30 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shadow-md">
                        {SURFACE_CHIPS.find((c) => c.key === activeSurface)?.short}
                      </span>
                      <span className="leading-tight">
                        {SURFACE_CHIPS.find((c) => c.key === activeSurface)?.label}
                        <span className="block text-[10px] font-medium text-stone-500">surface · tooth #{fdi}</span>
                      </span>
                    </h3>
                    {surfaceHasData(activeSurface) && (
                      <button
                        onClick={() => setSurfaces((prev) => {
                          const next = { ...prev };
                          delete next[activeSurface];
                          return next;
                        })}
                        className="text-[10px] text-red-500 hover:text-red-700 font-semibold flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded-md transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Clear
                      </button>
                    )}
                  </div>

                  <ChipField
                    label="Condition"
                    accentClass="rose"
                    values={parseChips(surfaces[activeSurface]?.condition ?? "")}
                    onChange={(chips) => updateSurface(activeSurface, "condition", joinChips(chips))}
                    suggestions={CONDITION_CHIPS}
                    placeholder="Cavity, Sensitivity…"
                  />

                  <ChipField
                    label="Planned"
                    accentClass="cyan"
                    values={parseChips(surfaces[activeSurface]?.plannedTreatment ?? "")}
                    onChange={(chips) => updateSurface(activeSurface, "plannedTreatment", joinChips(chips))}
                    suggestions={TREATMENT_CHIPS.slice(0, 10)}
                    placeholder="Procedure to plan…"
                  />

                  <ChipField
                    label="Completed"
                    accentClass="emerald"
                    values={parseChips(surfaces[activeSurface]?.completedTreatment ?? "")}
                    onChange={(chips) => updateSurface(activeSurface, "completedTreatment", joinChips(chips))}
                    suggestions={TREATMENT_CHIPS.slice(0, 8)}
                    placeholder="Finished procedure…"
                  />

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5 block">
                      Notes
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Optional notes for this surface…"
                      value={surfaces[activeSurface]?.notes ?? ""}
                      onChange={(e) => updateSurface(activeSurface, "notes", e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-white placeholder:text-stone-400 resize-none"
                    />
                  </div>
                </section>
              )}

              {!activeSurface && (
                <div
                  style={stagger(2)}
                  className="rounded-2xl border-2 border-dashed border-stone-200 p-6 text-center"
                >
                  <Layers className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-xs text-stone-500 font-medium">
                    Pick a surface above to mark its condition
                  </p>
                  <p className="text-[10px] text-stone-400 mt-1">
                    M · Mesial   D · Distal   O · Occlusal   B · Buccal   L · Lingual
                  </p>
                </div>
              )}
            </>
          )}

          {/* NOTES TAB */}
          {tab === "notes" && (
            <>
              <section>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2 block">
                  Tooth Notes
                </label>
                <textarea
                  rows={5}
                  placeholder="Patient-history relevant notes for this tooth — symptoms, observations, treatment rationale…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none placeholder:text-stone-400 resize-none"
                />
              </section>
              <div className="text-[10px] text-stone-400 leading-relaxed">
                Notes are saved with the tooth record. Audit history (status changes, treatment events) is captured automatically and visible in the chart-level <strong>History</strong> panel.
              </div>
            </>
          )}

          {save.isError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {(save.error as Error).message}
            </div>
          )}
        </div>

        {/* ───── Footer ───── */}
        <footer className="shrink-0 border-t border-stone-100 bg-stone-50/60">
          {onApplyToOthers && (
            <button
              onClick={async () => {
                const payload: ApplyPayload = {
                  status, priority,
                  conditions: conditions || "",
                  plannedTreatment: plannedTreatment || "",
                  completedTreatment: completedTreatment || "",
                  surfaces: surfaces || {},
                };
                save.mutate(undefined, {
                  onError: () => { /* swallow — we still want copy-mode to start */ },
                });
                onApplyToOthers(fdi, payload);
                setContentReady(false);
                setMounted(false);
                setTimeout(onClose, 220);
              }}
              className="w-full px-4 py-2 text-[11px] font-bold flex items-center justify-center gap-1.5 text-violet-700 hover:bg-violet-50 border-b border-stone-100 transition-colors"
              title="Save this tooth and copy its data to others"
            >
              <Layers className="w-3.5 h-3.5" />
              Apply this tooth&apos;s data to others →
            </button>
          )}
          <div className="p-3 flex items-center justify-between gap-2">
            <button
              onClick={() => reset.mutate()}
              disabled={reset.isPending || !existing}
              className="px-3 py-2 rounded-lg text-[11px] font-semibold text-stone-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-stone-500 transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-stone-400 mr-1 hidden sm:inline">
                ⌘ Enter to save · Esc to close
              </span>
              <button
                onClick={handleClose}
                className="px-3 py-2 rounded-lg text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="px-4 py-2 rounded-lg text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                {save.isPending ? "Saving…" : "Save tooth"}
              </button>
            </div>
          </div>
        </footer>
      </aside>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

/**
 * Chip-based input field with suggestion chips beneath.
 * - Type + Enter (or comma) adds a chip.
 * - Backspace on empty input deletes the last chip.
 * - Click a suggestion chip below to add it.
 * - Stored as comma-separated string at the data layer.
 *
 * Optional AI button on the right that triggers an LLM call.
 */
function ChipField({
  label,
  accentClass,
  values,
  onChange,
  suggestions,
  placeholder,
  instantBadge,
  showAiButton,
  onAskAi,
  aiLoading,
}: {
  label: string;
  accentClass: "rose" | "cyan" | "emerald" | "stone" | "violet";
  values: string[];
  onChange: (chips: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  instantBadge?: string;
  showAiButton?: boolean;
  onAskAi?: () => void;
  aiLoading?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const palette: Record<typeof accentClass, { border: string; bg: string; chip: string; label: string; dot: string }> = {
    rose:    { border: "border-rose-200",    bg: "bg-rose-50/30",    chip: "bg-rose-100 text-rose-800 border-rose-200",          label: "text-rose-700",    dot: "bg-rose-500" },
    cyan:    { border: "border-cyan-200",    bg: "bg-cyan-50/30",    chip: "bg-cyan-100 text-cyan-800 border-cyan-200",          label: "text-cyan-700",    dot: "bg-cyan-500" },
    emerald: { border: "border-emerald-200", bg: "bg-emerald-50/30", chip: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "text-emerald-700", dot: "bg-emerald-500" },
    stone:   { border: "border-stone-200",   bg: "bg-white",         chip: "bg-stone-100 text-stone-700 border-stone-200",       label: "text-stone-700",   dot: "bg-stone-500" },
    violet:  { border: "border-violet-200",  bg: "bg-violet-50/30",  chip: "bg-violet-100 text-violet-800 border-violet-200",    label: "text-violet-700",  dot: "bg-violet-500" },
  };
  const accent = palette[accentClass];

  function addChip(value: string) {
    const v = value.trim();
    if (!v || values.includes(v)) { setDraft(""); return; }
    onChange([...values, v]);
    setDraft("");
  }
  function removeChip(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  const visibleSuggestions = suggestions.filter((s) => !values.includes(s)).slice(0, 8);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className={cn("text-xs font-bold uppercase tracking-wider flex items-center gap-1.5", accent.label)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", accent.dot)} />
          {label}
          {instantBadge && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-[8px] font-bold uppercase bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded">
              <Zap className="w-2 h-2" /> {instantBadge}
            </span>
          )}
        </label>
        {showAiButton && (
          <button
            onClick={onAskAi}
            disabled={aiLoading}
            className={cn(
              "text-[10px] font-bold flex items-center gap-1 px-2 py-1 rounded-md transition-all",
              "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white",
              "hover:shadow-md hover:scale-[1.04] active:scale-[0.98]",
              "disabled:opacity-60 disabled:hover:scale-100"
            )}
          >
            <Sparkles className={cn("w-3 h-3", aiLoading && "animate-spin")} />
            {aiLoading ? "Thinking…" : "Ask AI"}
          </button>
        )}
      </div>

      <div className={cn(
        "rounded-xl border-2 px-2 py-2 transition-all",
        accent.border, accent.bg,
        "focus-within:border-stone-500 focus-within:bg-white focus-within:shadow-sm"
      )}>
        <div className="flex flex-wrap gap-1.5 items-center">
          {values.map((v) => (
            <span
              key={v}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-all",
                accent.chip
              )}
              style={{
                animation: "chipPop 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              {v}
              <button
                onClick={() => removeChip(v)}
                className="hover:bg-black/10 rounded-full p-0.5 -mr-1 transition-colors"
                aria-label={`Remove ${v}`}
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addChip(draft);
              } else if (e.key === "Backspace" && !draft && values.length > 0) {
                e.preventDefault();
                removeChip(values[values.length - 1]);
              }
            }}
            placeholder={values.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[100px] px-1 py-0.5 text-[12px] bg-transparent focus:outline-none placeholder:text-stone-400"
          />
        </div>
      </div>

      {visibleSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {visibleSuggestions.map((s) => (
            <button
              key={s}
              onClick={() => addChip(s)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 border border-transparent hover:border-stone-300 transition-all hover:-translate-y-px hover:shadow-sm active:scale-95"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

/** Mini tooth icon for the panel header. Small SVG of the tooth category. */
function MiniToothIcon({ cat, status }: { cat: ToothCategory; status: ToothStatus }) {
  const fill = status !== "HEALTHY" ? `url(#g-${status})` : "url(#tooth-pearl)";
  return (
    <svg viewBox="0 0 24 24" className="w-7 h-7">
      <defs>
        <linearGradient id="mini-pearl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e7e5e4" />
        </linearGradient>
      </defs>
      {cat === "incisor" || cat === "canine" ? (
        <path
          d="M 12 3 Q 18 4 18 12 Q 18 19 12 21 Q 6 19 6 12 Q 6 4 12 3 Z"
          fill={status === "HEALTHY" ? "url(#mini-pearl)" : fill}
          stroke="#475569"
          strokeWidth="1"
        />
      ) : (
        <rect
          x="4"
          y="4"
          width="16"
          height="16"
          rx={cat === "premolar" ? 4 : 3}
          fill={status === "HEALTHY" ? "url(#mini-pearl)" : fill}
          stroke="#475569"
          strokeWidth="1"
        />
      )}
      {(cat === "molar" || cat === "premolar") && (
        <g stroke="#94a3b8" strokeWidth="0.6" opacity="0.7">
          <line x1="12" y1="6" x2="12" y2="18" />
          <line x1="6" y1="12" x2="18" y2="12" />
        </g>
      )}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────── */

/**
 * Visual surface picker — refined mini-tooth diagram for the Surfaces tab.
 * Renders the chewing surface viewed from the occlusal direction, with
 * the 5 clinical surfaces (M / D / O / B / L) arranged around the centre.
 */
function SurfacePicker({
  cat, arch, surfaces, status, active, onSelect,
}: {
  cat: ToothCategory;
  arch: "upper" | "lower";
  surfaces: Partial<Record<Surface, SurfaceData>>;
  status: ToothStatus;
  active: Surface | null;
  onSelect: (s: Surface) => void;
}) {
  const w = 200;
  const h = 200;
  const cw = w / 3;
  const ch = h / 3;
  const surfaceFor = (s: Surface) => {
    const d = surfaces[s];
    return surfaceFill(status, d);
  };
  const cells: Array<{ s: Surface; x: number; y: number; w: number; h: number; label: string }> = [
    { s: "buccal",   x: cw,     y: 0,        w: cw, h: ch, label: "B" },
    { s: "lingual",  x: cw,     y: 2 * ch,   w: cw, h: ch, label: "L" },
    { s: "mesial",   x: 0,      y: ch,       w: cw, h: ch, label: "M" },
    { s: "distal",   x: 2 * cw, y: ch,       w: cw, h: ch, label: "D" },
    { s: "occlusal", x: cw,     y: ch,       w: cw, h: ch, label: "O" },
  ];
  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-stone-50 to-stone-100/60 blur-2xl scale-110 pointer-events-none" />

      <svg viewBox={`-12 -12 ${w + 24} ${h + 24}`} width="220" height="220" className="relative select-none">
        <defs>
          <radialGradient id="sp-pearl" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#faf7f1" />
            <stop offset="100%" stopColor="#ece6d8" />
          </radialGradient>
          <filter id="sp-shadow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="2" result="shadow" />
            <feComponentTransfer><feFuncA type="linear" slope="0.25" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="sp-cell-glow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" />
            <feFlood floodColor="#3b82f6" floodOpacity="0.35" result="color" />
            <feComposite in="color" in2="SourceAlpha" operator="in" result="shadow" />
            <feMerge><feMergeNode in="shadow" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g filter="url(#sp-shadow)">
          {cat === "incisor" || cat === "canine" ? (
            <path
              d={`M ${w / 2} 0 Q ${w + 10} 6 ${w} ${h * 0.45} Q ${w} ${h - 6} ${w / 2} ${h} Q 0 ${h - 6} 0 ${h * 0.45} Q -10 6 ${w / 2} 0 Z`}
              fill="url(#sp-pearl)"
              stroke="#a8a29e"
              strokeWidth="2"
            />
          ) : (
            <rect x={0} y={0} width={w} height={h} rx={cat === "premolar" ? 24 : 18} fill="url(#sp-pearl)" stroke="#a8a29e" strokeWidth="2" />
          )}
        </g>

        {cat === "premolar" && (
          <g pointerEvents="none" opacity={0.4}>
            <line x1={w / 2} y1={h * 0.32} x2={w / 2} y2={h * 0.68} stroke="#a8a29e" strokeWidth="1.2" />
            <line x1={w * 0.32} y1={h / 2} x2={w * 0.68} y2={h / 2} stroke="#a8a29e" strokeWidth="1.2" />
            <circle cx={w / 2} cy={h / 2} r={3} fill="#a8a29e" opacity={0.5} />
          </g>
        )}
        {cat === "molar" && (
          <g pointerEvents="none" opacity={0.4}>
            {arch === "upper" ? (
              <>
                <path d={`M ${w / 2} ${h * 0.5} L ${w * 0.28} ${h * 0.2}`} stroke="#a8a29e" strokeWidth="1.2" fill="none" />
                <path d={`M ${w / 2} ${h * 0.5} L ${w * 0.72} ${h * 0.2}`} stroke="#a8a29e" strokeWidth="1.2" fill="none" />
                <path d={`M ${w / 2} ${h * 0.5} L ${w / 2} ${h * 0.85}`} stroke="#a8a29e" strokeWidth="1.2" fill="none" />
              </>
            ) : (
              <>
                <line x1={w / 2} y1={h * 0.18} x2={w / 2} y2={h * 0.82} stroke="#a8a29e" strokeWidth="1.2" />
                <line x1={w * 0.18} y1={h / 2} x2={w * 0.82} y2={h / 2} stroke="#a8a29e" strokeWidth="1.2" />
              </>
            )}
            <g fill="#a8a29e" opacity={0.5}>
              <circle cx={w * 0.28} cy={h * 0.3} r={3.5} />
              <circle cx={w * 0.72} cy={h * 0.3} r={3.5} />
              <circle cx={w * 0.28} cy={h * 0.7} r={3.5} />
              <circle cx={w * 0.72} cy={h * 0.7} r={3.5} />
            </g>
          </g>
        )}
        {(cat === "incisor" || cat === "canine") && (
          <g pointerEvents="none" opacity={0.35}>
            <path d={`M ${w * 0.2} ${h * 0.82} Q ${w / 2} ${h - 4} ${w * 0.8} ${h * 0.82}`} stroke="#a8a29e" strokeWidth="1.2" fill="none" />
          </g>
        )}

        {cells.map(({ s, x, y, w: cellW, h: cellH, label }) => {
          const data = surfaces[s];
          const hasData = !!(data?.condition || data?.completedTreatment || data?.plannedTreatment);
          const isActive = active === s;
          const { fill, stroke } = surfaceFor(s);
          return (
            <g key={s} onClick={() => onSelect(s)} style={{ cursor: "pointer" }}>
              <rect
                x={x + 5}
                y={y + 5}
                width={cellW - 10}
                height={cellH - 10}
                rx={8}
                fill={hasData ? fill : isActive ? "#dbeafe" : "rgba(255,255,255,0.55)"}
                stroke={isActive ? "#2563eb" : hasData ? stroke : "rgba(168,162,158,0.4)"}
                strokeWidth={isActive ? 2.5 : hasData ? 1.5 : 1}
                opacity={hasData ? 0.92 : 1}
                filter={isActive ? "url(#sp-cell-glow)" : undefined}
                style={{ transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)" }}
              />
              <text
                x={x + cellW / 2}
                y={y + cellH / 2 + 6}
                textAnchor="middle"
                fontSize={isActive ? 20 : hasData ? 18 : 17}
                fontWeight={800}
                fill={hasData ? "#0f172a" : isActive ? "#1d4ed8" : "#a8a29e"}
                pointerEvents="none"
                style={{ transition: "all 0.18s ease" }}
              >
                {label}
              </text>
              {hasData && (
                <circle
                  cx={x + cellW - 10}
                  cy={y + 10}
                  r={3.5}
                  fill="#3b82f6"
                  stroke="white"
                  strokeWidth="1.5"
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}

        {active === "occlusal" && (
          <rect
            x={cw + 5}
            y={ch + 5}
            width={cw - 10}
            height={ch - 10}
            rx={8}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2.5}
            strokeDasharray="3 4"
            opacity={0.6}
            pointerEvents="none"
          />
        )}
      </svg>
    </div>
  );
}

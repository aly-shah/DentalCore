"use client";

/**
 * Template picker — modal that lists active TreatmentTemplate records,
 * grouped by category, and emits a chosen template to the parent. The parent
 * is responsible for translating the template fields into form state.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, X as XIcon, Search, Loader2, Sparkles, Pill, Clock,
  Stethoscope, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConsultationTemplate {
  id: string;
  code: string;
  name: string;
  category: string;
  cdtCode?: string | null;
  defaultDiagnosis?: string | null;
  defaultChiefComplaint?: string | null;
  defaultClinicalFindings?: string | null;
  defaultProcedureNotes?: string | null;
  defaultMaterialsUsed?: string | null;
  defaultPostOpInstructions?: string | null;
  defaultFollowUpDays?: number | null;
  defaultRxItems?: { medicineName: string; dosage: string; frequency: string; duration: string; instructions?: string }[] | null;
  defaultPrice: number;
  defaultDuration: number;
  isActive: boolean;
}

const CATEGORIES = [
  "Preventive", "Restorative", "Endodontic", "Prosthodontic",
  "Surgery", "Periodontic", "Orthodontic", "Cosmetic", "Other",
];

const CATEGORY_STYLES: Record<string, { gradient: string; text: string }> = {
  Preventive:     { gradient: "from-emerald-500 to-teal-500", text: "text-emerald-700" },
  Restorative:    { gradient: "from-blue-500 to-cyan-500",    text: "text-blue-700" },
  Endodontic:     { gradient: "from-rose-500 to-pink-500",    text: "text-rose-700" },
  Prosthodontic:  { gradient: "from-violet-500 to-purple-500", text: "text-violet-700" },
  Surgery:        { gradient: "from-orange-500 to-red-500",   text: "text-orange-700" },
  Periodontic:    { gradient: "from-teal-500 to-cyan-500",    text: "text-teal-700" },
  Orthodontic:    { gradient: "from-indigo-500 to-blue-500",  text: "text-indigo-700" },
  Cosmetic:       { gradient: "from-pink-500 to-rose-500",    text: "text-pink-700" },
  Other:          { gradient: "from-stone-500 to-stone-600",  text: "text-stone-700" },
};

export function TemplatePicker({ onPick, onClose }: {
  onPick: (template: ConsultationTemplate) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const handleClose = () => {
    setMounted(false);
    setTimeout(onClose, 280);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["treatment-templates", "active"],
    queryFn: async () => {
      const r = await fetch(`/api/treatment-templates`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return (j.data ?? []) as ConsultationTemplate[];
    },
  });

  const templates = data ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return templates;
    return templates.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      (t.cdtCode ?? "").toLowerCase().includes(q) ||
      (t.defaultDiagnosis ?? "").toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  }, [templates, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ConsultationTemplate[]>();
    for (const t of filtered) {
      const k = CATEGORIES.includes(t.category) ? t.category : "Other";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return [...map.entries()].sort(
      ([a], [b]) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b)
    );
  }, [filtered]);

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
        className="absolute top-0 bottom-0 right-0 w-full sm:w-[460px] bg-stone-50 flex flex-col will-change-transform"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Pick a template"
      >
        {/* Header */}
        <header className="shrink-0 px-5 pt-5 pb-3 border-b border-stone-200 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 leading-tight">Use a template</h2>
                <p className="text-[11px] text-stone-500 leading-tight mt-0.5">Prefills diagnosis, plan, Rx and follow-up</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 -m-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, CDT, diagnosis…"
              autoFocus
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-stone-50/50"
            />
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-stone-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-400 mb-3">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-semibold text-stone-800 mb-1">
                {templates.length === 0 ? "No templates yet" : "No matches"}
              </h3>
              <p className="text-[11px] text-stone-500 max-w-xs">
                {templates.length === 0
                  ? "An admin can create procedure templates from Admin → Procedure Templates."
                  : "Try a different search term."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(([category, items]) => {
                const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.Other;
                return (
                  <section key={category} className="space-y-1.5">
                    <div className="flex items-center gap-2 px-2">
                      <span className={cn("h-1 w-6 rounded-full bg-gradient-to-r", style.gradient)} />
                      <h3 className={cn("text-[10px] font-bold uppercase tracking-widest", style.text)}>
                        {category}
                      </h3>
                      <span className="text-[10px] text-stone-400">{items.length}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {items.map((t) => {
                        const rxCount = Array.isArray(t.defaultRxItems) ? t.defaultRxItems.length : 0;
                        return (
                          <li key={t.id}>
                            <button
                              onClick={() => onPick(t)}
                              className="w-full group bg-white rounded-xl border border-stone-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-px transition-all p-3 text-left"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-bold text-stone-900 leading-tight flex-1 truncate">{t.name}</span>
                                {t.cdtCode && (
                                  <span className="text-[9px] font-mono text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded shrink-0">{t.cdtCode}</span>
                                )}
                                <ChevronRight className="w-3.5 h-3.5 text-stone-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                              </div>
                              {t.defaultDiagnosis && (
                                <p className="text-[11px] text-stone-600 line-clamp-1">
                                  <Stethoscope className="w-2.5 h-2.5 inline -mt-px mr-1 text-rose-400" />
                                  {t.defaultDiagnosis}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-stone-500">
                                <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{t.defaultDuration}m</span>
                                {rxCount > 0 && (
                                  <span className="flex items-center gap-0.5 text-emerald-600">
                                    <Pill className="w-2.5 h-2.5" /> {rxCount} Rx
                                  </span>
                                )}
                                {t.defaultFollowUpDays && (
                                  <span>F/U {t.defaultFollowUpDays}d</span>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-stone-200 p-2.5 bg-white flex items-center gap-2 text-[10px] text-stone-400">
          <Sparkles className="w-3 h-3 text-blue-500" />
          Selecting a template overwrites the form fields it covers — you can still edit them after.
        </footer>
      </aside>
    </div>
  );
}

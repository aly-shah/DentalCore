"use client";

/**
 * Treatment Plans tab — list, create, accept, complete dental treatment
 * plans for a patient. Wired to the v2 endpoints:
 *   GET    /api/patients/[id]/treatment-plans
 *   POST   /api/patients/[id]/treatment-plans
 *   GET    /api/treatment-plans/[id]
 *   PUT    /api/treatment-plans/[id]
 *   POST   /api/treatment-plans/[id]/accept
 *   POST   /api/treatment-plans/[id]/complete
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList, Plus, X as XIcon, Check, CheckCheck, AlertTriangle,
  Sparkles, Trash2, FileSignature, ChevronRight, DollarSign, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading";
import { cn } from "@/lib/utils";

// ───────── types ─────────

type PlanStatus = "DRAFT" | "PROPOSED" | "ACCEPTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type PlanPriority = "EMERGENCY" | "HIGH" | "MEDIUM" | "COSMETIC";

interface PlanItem {
  id: string;
  treatmentId: string | null;
  cdtCode: string | null;
  fdi: number | null;
  surface: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  insuranceCoverage: number;
  patientPortion: number;
  status: "PROPOSED" | "ACCEPTED" | "IN_PROGRESS" | "COMPLETED" | "DECLINED";
  notes: string | null;
  performedAt: string | null;
}

interface PlanPhase {
  id: string;
  order: number;
  title: string;
  description: string | null;
  estimatedWeeks: number | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
  items: PlanItem[];
}

interface TreatmentPlan {
  id: string;
  patientId: string;
  proposedById: string;
  acceptedById: string | null;
  status: PlanStatus;
  title: string | null;
  diagnosis: string | null;
  rationale: string | null;
  priority: PlanPriority;
  consentRequired: boolean;
  consentSigned: boolean;
  proposedAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  totalCost: number;
  estimatedInsuranceCoverage: number;
  estimatedPatientPortion: number;
  notes: string | null;
  invoiceId: string | null;
  createdAt: string;
  phases: PlanPhase[];
  items: PlanItem[];
}

// ───────── status styling ─────────

const STATUS_STYLES: Record<PlanStatus, { label: string; bg: string; text: string; border: string; dot: string }> = {
  DRAFT:       { label: "Draft",       bg: "bg-stone-50",    text: "text-stone-700",    border: "border-stone-200",    dot: "bg-stone-400" },
  PROPOSED:    { label: "Proposed",    bg: "bg-amber-50",    text: "text-amber-700",    border: "border-amber-200",    dot: "bg-amber-500" },
  ACCEPTED:    { label: "Accepted",    bg: "bg-blue-50",     text: "text-blue-700",     border: "border-blue-200",     dot: "bg-blue-500" },
  IN_PROGRESS: { label: "In Progress", bg: "bg-cyan-50",     text: "text-cyan-700",     border: "border-cyan-200",     dot: "bg-cyan-500" },
  COMPLETED:   { label: "Completed",   bg: "bg-emerald-50",  text: "text-emerald-700",  border: "border-emerald-200",  dot: "bg-emerald-500" },
  CANCELLED:   { label: "Cancelled",   bg: "bg-stone-100",   text: "text-stone-500",    border: "border-stone-200",    dot: "bg-stone-400" },
};

const PRIORITY_STYLES: Record<PlanPriority, { label: string; bg: string; text: string }> = {
  EMERGENCY: { label: "Emergency", bg: "bg-red-100",    text: "text-red-700" },
  HIGH:      { label: "High",      bg: "bg-amber-100",  text: "text-amber-700" },
  MEDIUM:    { label: "Medium",    bg: "bg-blue-100",   text: "text-blue-700" },
  COSMETIC:  { label: "Cosmetic",  bg: "bg-violet-100", text: "text-violet-700" },
};

// ───────── helpers ─────────

function currency(v: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function dateShort(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ───────── main component ─────────

export function TreatmentPlansTab({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: plansRes, isLoading } = useQuery({
    queryKey: ["treatment-plans", patientId],
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/treatment-plans`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to load");
      return j.data as TreatmentPlan[];
    },
  });
  const plans = plansRes ?? [];

  // KPI calculations
  const kpi = useMemo(() => {
    let active = 0, totalProposedCost = 0, acceptedCount = 0;
    for (const p of plans) {
      if (p.status === "PROPOSED" || p.status === "ACCEPTED" || p.status === "IN_PROGRESS") active++;
      if (p.status === "PROPOSED") totalProposedCost += p.totalCost;
      if (p.status === "ACCEPTED" || p.status === "IN_PROGRESS" || p.status === "COMPLETED") acceptedCount++;
    }
    return { active, totalProposedCost, acceptedCount, total: plans.length };
  }, [plans]);

  const accept = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/treatment-plans/${id}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["treatment-plans", patientId] }),
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/treatment-plans/${id}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["treatment-plans", patientId] }),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/treatment-plans/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["treatment-plans", patientId] }),
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-blue-500" />
          <h2 className="text-base font-semibold text-stone-900">Treatment Plans</h2>
        </div>
        <Button size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowCreate(true)}>
          New Plan
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard label="Total Plans" value={kpi.total} dot="bg-stone-400" />
        <KpiCard label="Active" value={kpi.active} dot="bg-blue-500" />
        <KpiCard label="Proposed (open quote)" value={currency(kpi.totalProposedCost)} dot="bg-amber-500" isText />
        <KpiCard label="Accepted+" value={kpi.acceptedCount} dot="bg-emerald-500" />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="md" />
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-stone-200 p-8 text-center space-y-3">
          <ClipboardList className="w-10 h-10 text-stone-300 mx-auto" />
          <p className="text-sm text-stone-500">No treatment plans yet for this patient.</p>
          <Button size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowCreate(true)}>
            Create first plan
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onAccept={() => accept.mutate(p.id)}
              onComplete={() => complete.mutate(p.id)}
              onCancel={() => cancel.mutate(p.id)}
              busy={accept.isPending || complete.isPending || cancel.isPending}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreatePlanDrawer
          patientId={patientId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ["treatment-plans", patientId] });
          }}
        />
      )}
    </div>
  );
}

// ───────── KPI tile ─────────

function KpiCard({ label, value, dot, isText }: { label: string; value: number | string; dot: string; isText?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
        <span className="text-[9px] uppercase tracking-wider font-semibold text-stone-400">{label}</span>
      </div>
      <p className={cn("font-bold text-stone-900 leading-none", isText ? "text-lg" : "text-2xl")}>
        {value}
      </p>
    </div>
  );
}

// ───────── plan card ─────────

function PlanCard({
  plan, expanded, onToggle, onAccept, onComplete, onCancel, busy,
}: {
  plan: TreatmentPlan;
  expanded: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onComplete: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const s = STATUS_STYLES[plan.status];
  const pr = PRIORITY_STYLES[plan.priority];
  const allItems = useMemo(() => [...plan.items, ...plan.phases.flatMap((ph) => ph.items)], [plan]);
  const completedCount = allItems.filter((it) => it.status === "COMPLETED").length;
  const itemProgress = allItems.length ? (completedCount / allItems.length) * 100 : 0;

  return (
    <div className={cn("bg-white rounded-2xl border-2 overflow-hidden transition-all", s.border)}>
      {/* Header row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-stone-50/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-sm font-bold text-stone-900 truncate max-w-[200px] sm:max-w-none">
              {plan.title || `Plan ${dateShort(plan.createdAt)}`}
            </h3>
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border", s.bg, s.text, s.border)}>
              <span className={cn("w-1.5 h-1.5 rounded-full", s.dot)} />
              {s.label}
            </span>
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md", pr.bg, pr.text)}>
              {plan.priority === "EMERGENCY" && <AlertTriangle className="w-2.5 h-2.5" />}
              {pr.label}
            </span>
            {plan.consentRequired && (
              <span className={cn(
                "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md",
                plan.consentSigned ? "bg-emerald-50 text-emerald-700" : "bg-stone-50 text-stone-500"
              )}>
                <FileSignature className="w-2.5 h-2.5" />
                {plan.consentSigned ? "Signed" : "Consent req."}
              </span>
            )}
          </div>
          {plan.diagnosis && (
            <p className="text-xs text-stone-500 truncate">{plan.diagnosis}</p>
          )}
        </div>
        <div className="flex flex-col items-end shrink-0">
          <p className="text-base font-bold text-stone-900 leading-none">{currency(plan.totalCost)}</p>
          <p className="text-[10px] text-stone-400 mt-0.5">{allItems.length} item{allItems.length === 1 ? "" : "s"}</p>
        </div>
        <ChevronRight
          className={cn(
            "w-4 h-4 text-stone-300 shrink-0 transition-transform",
            expanded && "rotate-90"
          )}
        />
      </button>

      {/* Progress bar */}
      {allItems.length > 0 && plan.status !== "DRAFT" && (
        <div className="h-1 bg-stone-100 mx-4 -mt-1 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all rounded-full",
              plan.status === "COMPLETED" ? "bg-emerald-500" : "bg-blue-500"
            )}
            style={{ width: `${itemProgress}%` }}
          />
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-stone-100 space-y-3 animate-fade-in">
          {/* Insurance breakdown */}
          {plan.estimatedInsuranceCoverage > 0 && (
            <div className="rounded-lg bg-stone-50 p-3 flex items-center gap-4 text-xs">
              <div className="flex-1">
                <p className="text-stone-400 uppercase text-[9px] font-bold tracking-wider mb-0.5">Total</p>
                <p className="font-bold text-stone-900">{currency(plan.totalCost)}</p>
              </div>
              <div className="flex-1">
                <p className="text-emerald-600 uppercase text-[9px] font-bold tracking-wider mb-0.5">Insurance covers</p>
                <p className="font-bold text-emerald-700">{currency(plan.estimatedInsuranceCoverage)}</p>
              </div>
              <div className="flex-1">
                <p className="text-blue-600 uppercase text-[9px] font-bold tracking-wider mb-0.5">Patient pays</p>
                <p className="font-bold text-blue-700">{currency(plan.estimatedPatientPortion)}</p>
              </div>
            </div>
          )}

          {plan.rationale && (
            <div>
              <p className="text-[9px] uppercase tracking-wider font-bold text-stone-400 mb-1">Rationale</p>
              <p className="text-xs text-stone-600">{plan.rationale}</p>
            </div>
          )}

          {/* Items / phases */}
          {plan.phases.length > 0 ? (
            <div className="space-y-3">
              {plan.phases.map((ph) => (
                <PhaseBlock key={ph.id} phase={ph} />
              ))}
            </div>
          ) : (
            <ItemList items={plan.items} />
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
            {plan.status === "PROPOSED" && (
              <Button size="sm" iconLeft={<Check className="w-3.5 h-3.5" />} onClick={onAccept} disabled={busy}>
                Accept Plan
              </Button>
            )}
            {(plan.status === "ACCEPTED" || plan.status === "IN_PROGRESS") && (
              <Button size="sm" iconLeft={<CheckCheck className="w-3.5 h-3.5" />} onClick={onComplete} disabled={busy}>
                Mark Complete
              </Button>
            )}
            {plan.status !== "COMPLETED" && plan.status !== "CANCELLED" && (
              <button
                onClick={onCancel}
                disabled={busy}
                className="ml-auto text-[11px] text-stone-500 hover:text-red-600 font-medium px-2 py-1 rounded transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Cancel plan
              </button>
            )}
          </div>

          {/* Dates */}
          <div className="text-[10px] text-stone-400 flex flex-wrap gap-3">
            <span>Created {dateShort(plan.createdAt)}</span>
            {plan.proposedAt && <span>Proposed {dateShort(plan.proposedAt)}</span>}
            {plan.acceptedAt && <span>Accepted {dateShort(plan.acceptedAt)}</span>}
            {plan.completedAt && <span>Completed {dateShort(plan.completedAt)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function PhaseBlock({ phase }: { phase: PlanPhase }) {
  return (
    <div className="rounded-lg bg-stone-50/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-stone-900">
          <span className="inline-block w-5 h-5 rounded-md bg-blue-500 text-white text-[9px] font-bold leading-5 text-center mr-1.5">
            {phase.order}
          </span>
          {phase.title}
        </h4>
        <span className="text-[10px] font-semibold uppercase text-stone-400">{phase.status.replace(/_/g, " ").toLowerCase()}</span>
      </div>
      {phase.description && <p className="text-[11px] text-stone-500 mb-2">{phase.description}</p>}
      <ItemList items={phase.items} />
    </div>
  );
}

function ItemList({ items }: { items: PlanItem[] }) {
  if (items.length === 0) {
    return <p className="text-[11px] text-stone-400 italic">No items.</p>;
  }
  return (
    <div className="space-y-1.5">
      {items.map((it) => {
        const done = it.status === "COMPLETED";
        return (
          <div
            key={it.id}
            className={cn(
              "flex items-start gap-2 px-2.5 py-2 rounded-lg border transition-colors",
              done ? "bg-emerald-50/40 border-emerald-100" : "bg-white border-stone-100"
            )}
          >
            <span className={cn(
              "w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center text-white text-[9px]",
              done ? "bg-emerald-500" : "bg-stone-200"
            )}>
              {done && <Check className="w-2.5 h-2.5" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn("text-xs font-semibold", done ? "text-emerald-700 line-through" : "text-stone-900")}>
                  {it.description}
                </span>
                {it.cdtCode && <span className="text-[9px] font-mono text-stone-400">{it.cdtCode}</span>}
                {it.fdi && <span className="text-[9px] text-stone-500 font-medium">#{it.fdi}{it.surface ? ` · ${it.surface[0]}` : ""}</span>}
              </div>
              {it.notes && <p className="text-[10px] text-stone-500 mt-0.5">{it.notes}</p>}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold text-stone-900">{currency(it.total)}</p>
              {it.insuranceCoverage > 0 && (
                <p className="text-[9px] text-emerald-600">−{currency(it.insuranceCoverage)} ins</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────── create drawer ─────────

interface DraftItem {
  description: string;
  cdtCode: string;
  fdi: string;
  unitPrice: string;
  insuranceCoverage: string;
}

const TREATMENT_PRESETS = [
  { name: "Composite Filling",   cdt: "D2330", price: 200 },
  { name: "Root Canal — Anterior", cdt: "D3310", price: 700 },
  { name: "Root Canal — Premolar", cdt: "D3320", price: 850 },
  { name: "Root Canal — Molar",    cdt: "D3330", price: 1000 },
  { name: "Crown (PFM)",           cdt: "D2750", price: 1100 },
  { name: "Crown (Zirconia)",      cdt: "D2740", price: 1350 },
  { name: "Extraction (simple)",   cdt: "D7140", price: 200 },
  { name: "Extraction (surgical)", cdt: "D7210", price: 450 },
  { name: "Implant (single)",      cdt: "D6010", price: 2400 },
  { name: "Bridge (3-unit)",       cdt: "D6240", price: 3000 },
  { name: "Veneer (porcelain)",    cdt: "D2962", price: 1300 },
  { name: "Scaling & Polishing",   cdt: "D1110", price: 150 },
  { name: "Whitening",             cdt: "D9972", price: 350 },
  { name: "Bonding",               cdt: "D2391", price: 250 },
];

function CreatePlanDrawer({
  patientId, onClose, onCreated,
}: {
  patientId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [rationale, setRationale] = useState("");
  const [priority, setPriority] = useState<PlanPriority>("MEDIUM");
  const [consentRequired, setConsentRequired] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([
    { description: "", cdtCode: "", fdi: "", unitPrice: "", insuranceCoverage: "" },
  ]);

  const total = useMemo(
    () => items.reduce((sum, it) => sum + (parseFloat(it.unitPrice) || 0), 0),
    [items]
  );
  const totalIns = useMemo(
    () => items.reduce((sum, it) => sum + (parseFloat(it.insuranceCoverage) || 0), 0),
    [items]
  );

  const addItem = () => setItems((prev) => [...prev, { description: "", cdtCode: "", fdi: "", unitPrice: "", insuranceCoverage: "" }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, ix) => ix !== i));
  const updateItem = (i: number, field: keyof DraftItem, value: string) =>
    setItems((prev) => prev.map((it, ix) => ix === i ? { ...it, [field]: value } : it));

  const applyPreset = (i: number, preset: typeof TREATMENT_PRESETS[number]) =>
    setItems((prev) => prev.map((it, ix) => ix === i ? { ...it, description: preset.name, cdtCode: preset.cdt, unitPrice: String(preset.price) } : it));

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim() || undefined,
        diagnosis: diagnosis.trim() || undefined,
        rationale: rationale.trim() || undefined,
        priority,
        consentRequired,
        status: "PROPOSED" as const,
        items: items
          .filter((it) => it.description.trim() && parseFloat(it.unitPrice) >= 0)
          .map((it) => ({
            description: it.description.trim(),
            cdtCode: it.cdtCode.trim() || undefined,
            fdi: it.fdi.trim() ? parseInt(it.fdi.trim(), 10) : undefined,
            unitPrice: parseFloat(it.unitPrice) || 0,
            insuranceCoverage: parseFloat(it.insuranceCoverage) || 0,
            quantity: 1,
          })),
      };
      const r = await fetch(`/api/patients/${patientId}/treatment-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    onSuccess: () => onCreated(),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white w-full sm:w-[560px] sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 px-5 pt-5 pb-3 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-500" />
            <h2 className="text-base font-bold text-stone-900">New Treatment Plan</h2>
          </div>
          <button onClick={onClose} className="p-1.5 -m-1 rounded-lg hover:bg-stone-100 text-stone-400">
            <XIcon className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "RCT + crown #16"'
              className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Diagnosis</label>
            <textarea
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              rows={2}
              placeholder="Primary diagnosis driving this plan…"
              className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Priority</label>
              <div className="grid grid-cols-2 gap-1">
                {(["EMERGENCY", "HIGH", "MEDIUM", "COSMETIC"] as const).map((p) => {
                  const palette = PRIORITY_STYLES[p];
                  return (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={cn(
                        "px-2 py-1.5 rounded-md border text-[10px] font-bold transition-all",
                        priority === p ? `${palette.bg} ${palette.text} border-current` : "border-stone-200 bg-white text-stone-400 hover:border-stone-300"
                      )}
                    >
                      {palette.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Consent</label>
              <button
                onClick={() => setConsentRequired(!consentRequired)}
                className={cn(
                  "w-full px-3 py-2 rounded-md border-2 text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5",
                  consentRequired
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-stone-200 bg-white text-stone-400 hover:border-stone-300"
                )}
              >
                <FileSignature className="w-3 h-3" />
                {consentRequired ? "Required" : "Not required"}
              </button>
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-500">Line Items</label>
              <button
                onClick={addItem}
                className="text-[11px] text-blue-600 font-bold hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="rounded-lg border border-stone-200 bg-stone-50/30 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Item {i + 1}</span>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Preset chips */}
                  <div className="flex flex-wrap gap-1">
                    {TREATMENT_PRESETS.slice(0, 8).map((p) => (
                      <button
                        key={p.cdt}
                        onClick={() => applyPreset(i, p)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={it.description}
                    onChange={(e) => updateItem(i, "description", e.target.value)}
                    placeholder="Treatment description"
                    className="w-full px-3 py-1.5 text-sm rounded-md border border-stone-200 focus:border-blue-400 focus:outline-none bg-white"
                  />
                  <div className="grid grid-cols-4 gap-1.5">
                    <input
                      type="text"
                      value={it.cdtCode}
                      onChange={(e) => updateItem(i, "cdtCode", e.target.value)}
                      placeholder="CDT"
                      className="px-2 py-1.5 text-[11px] rounded-md border border-stone-200 focus:border-blue-400 focus:outline-none font-mono"
                    />
                    <input
                      type="number"
                      value={it.fdi}
                      onChange={(e) => updateItem(i, "fdi", e.target.value)}
                      placeholder="FDI"
                      className="px-2 py-1.5 text-[11px] rounded-md border border-stone-200 focus:border-blue-400 focus:outline-none"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={it.unitPrice}
                      onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
                      placeholder="Price"
                      className="px-2 py-1.5 text-[11px] rounded-md border border-stone-200 focus:border-blue-400 focus:outline-none"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={it.insuranceCoverage}
                      onChange={(e) => updateItem(i, "insuranceCoverage", e.target.value)}
                      placeholder="Ins."
                      className="px-2 py-1.5 text-[11px] rounded-md border border-stone-200 focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals preview */}
          <div className="rounded-xl bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 p-3 flex items-center gap-4">
            <DollarSign className="w-5 h-5 text-blue-500" />
            <div className="flex-1 grid grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-[9px] uppercase tracking-wider font-bold text-stone-500">Total</p>
                <p className="font-bold text-stone-900">{currency(total)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider font-bold text-emerald-600">Insurance</p>
                <p className="font-bold text-emerald-700">{currency(totalIns)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider font-bold text-blue-600">Patient</p>
                <p className="font-bold text-blue-700">{currency(Math.max(0, total - totalIns))}</p>
              </div>
            </div>
          </div>

          {create.isError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {(create.error as Error).message}
            </p>
          )}
        </div>

        <footer className="shrink-0 border-t border-stone-100 p-3 flex items-center justify-end gap-2 bg-stone-50/60">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending || items.filter((it) => it.description.trim()).length === 0}
            className="px-4 py-2 rounded-lg text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {create.isPending ? "Creating…" : "Create plan"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default TreatmentPlansTab;

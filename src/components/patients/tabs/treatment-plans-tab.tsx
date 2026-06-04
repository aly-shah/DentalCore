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
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList, Plus, X as XIcon, Check, CheckCheck, AlertTriangle,
  Sparkles, Trash2, FileSignature, ChevronRight, DollarSign, Loader2,
  Zap, Stethoscope, ListChecks, GripVertical, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardListSkeleton } from "@/components/ui/loading";
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
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(v);
}

function dateShort(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ───────── main component ─────────

export function TreatmentPlansTab({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TreatmentPlan | null>(null);
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
        <CardListSkeleton rows={3} />
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
              onEdit={() => setEditingPlan(p)}
              busy={accept.isPending || complete.isPending || cancel.isPending}
            />
          ))}
        </div>
      )}

      {(showCreate || editingPlan) && (
        <CreatePlanDrawer
          patientId={patientId}
          existing={editingPlan}
          onClose={() => { setShowCreate(false); setEditingPlan(null); }}
          onCreated={() => {
            setShowCreate(false);
            setEditingPlan(null);
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
  plan, expanded, onToggle, onAccept, onComplete, onCancel, onEdit, busy,
}: {
  plan: TreatmentPlan;
  expanded: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onEdit: () => void;
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
          <div className="flex items-center gap-2 pt-2 border-t border-stone-100 flex-wrap">
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
                onClick={onEdit}
                disabled={busy}
                className="text-[11px] text-stone-600 hover:text-blue-700 hover:bg-blue-50 font-medium px-2 py-1 rounded transition-colors flex items-center gap-1"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
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
  id: string;
  description: string;
  cdtCode: string;
  fdi: string;
  unitPrice: string;
  insuranceCoverage: string;
}

const TREATMENT_PRESETS = [
  { name: "Composite Filling",     cdt: "D2330", price: 200,  cat: "Restorative" },
  { name: "Root Canal — Anterior", cdt: "D3310", price: 700,  cat: "Endodontic" },
  { name: "Root Canal — Premolar", cdt: "D3320", price: 850,  cat: "Endodontic" },
  { name: "Root Canal — Molar",    cdt: "D3330", price: 1000, cat: "Endodontic" },
  { name: "Crown (PFM)",           cdt: "D2750", price: 1100, cat: "Prosthodontic" },
  { name: "Crown (Zirconia)",      cdt: "D2740", price: 1350, cat: "Prosthodontic" },
  { name: "Extraction (simple)",   cdt: "D7140", price: 200,  cat: "Surgery" },
  { name: "Extraction (surgical)", cdt: "D7210", price: 450,  cat: "Surgery" },
  { name: "Implant (single)",      cdt: "D6010", price: 2400, cat: "Surgery" },
  { name: "Bridge (3-unit)",       cdt: "D6240", price: 3000, cat: "Prosthodontic" },
  { name: "Veneer (porcelain)",    cdt: "D2962", price: 1300, cat: "Cosmetic" },
  { name: "Scaling & Polishing",   cdt: "D1110", price: 150,  cat: "Preventive" },
  { name: "Whitening",             cdt: "D9972", price: 350,  cat: "Cosmetic" },
  { name: "Bonding",               cdt: "D2391", price: 250,  cat: "Restorative" },
] as const;

const DIAGNOSIS_CHIPS = [
  "Dental caries", "Pulpitis", "Periapical abscess", "Cracked tooth syndrome",
  "Missing tooth", "Failed restoration", "Gingivitis", "Periodontitis",
  "Malocclusion", "Discoloration", "Sensitivity", "Worn dentition",
];

/** Plan templates — quick starters that pre-populate items + diagnosis */
const PLAN_TEMPLATES = [
  {
    id: "endo-crown",
    name: "RCT + Crown",
    icon: "🦷",
    diagnosis: "Irreversible pulpitis",
    priority: "HIGH" as PlanPriority,
    items: ["Root Canal — Molar", "Crown (PFM)"],
  },
  {
    id: "implant",
    name: "Implant Restoration",
    icon: "🔩",
    diagnosis: "Missing tooth",
    priority: "MEDIUM" as PlanPriority,
    items: ["Implant (single)", "Crown (Zirconia)"],
  },
  {
    id: "prophy",
    name: "Recall & Preventive",
    icon: "✨",
    diagnosis: "Routine recall",
    priority: "MEDIUM" as PlanPriority,
    items: ["Scaling & Polishing"],
  },
  {
    id: "cosmetic",
    name: "Cosmetic Smile",
    icon: "😁",
    diagnosis: "Aesthetic restoration",
    priority: "COSMETIC" as PlanPriority,
    items: ["Whitening", "Veneer (porcelain)", "Bonding"],
  },
] as const;

function CreatePlanDrawer({
  patientId, existing, onClose, onCreated,
}: {
  patientId: string;
  /** When provided, the drawer enters edit mode and PUTs to /api/treatment-plans/[id]. */
  existing?: TreatmentPlan | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const isEdit = !!existing;
  // ───── slide-in animation state ─────
  const [mounted, setMounted] = useState(false);
  const [contentReady, setContentReady] = useState(false);

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

  const stagger = (i: number) => ({
    opacity: contentReady ? 1 : 0,
    transform: contentReady ? "translateY(0)" : "translateY(10px)",
    transition: `opacity 280ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 45}ms, transform 320ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 45}ms`,
  });

  // ───── form state — initialized from `existing` when editing ─────
  const initialChips = existing?.diagnosis
    ? existing.diagnosis.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const initialItems: DraftItem[] = existing
    ? [
        ...existing.items,
        ...existing.phases.flatMap((ph) => ph.items),
      ].map((it) => ({
        id: it.id, // preserve real id so backend can match on PUT
        description: it.description,
        cdtCode: it.cdtCode ?? "",
        fdi: it.fdi != null ? String(it.fdi) : "",
        unitPrice: String(it.unitPrice),
        insuranceCoverage: String(it.insuranceCoverage),
      }))
    : [{ id: crypto.randomUUID(), description: "", cdtCode: "", fdi: "", unitPrice: "", insuranceCoverage: "" }];

  const [title, setTitle] = useState(existing?.title ?? "");
  const [diagnosisChips, setDiagnosisChips] = useState<string[]>(initialChips);
  const [diagnosisDraft, setDiagnosisDraft] = useState("");
  const [rationale, setRationale] = useState(existing?.rationale ?? "");
  const [priority, setPriority] = useState<PlanPriority>(existing?.priority ?? "MEDIUM");
  const [consentRequired, setConsentRequired] = useState(existing?.consentRequired ?? false);
  const [items, setItems] = useState<DraftItem[]>(
    initialItems.length > 0 ? initialItems : [{ id: crypto.randomUUID(), description: "", cdtCode: "", fdi: "", unitPrice: "", insuranceCoverage: "" }]
  );

  const total = useMemo(
    () => items.reduce((sum, it) => sum + (parseFloat(it.unitPrice) || 0), 0),
    [items]
  );
  const totalIns = useMemo(
    () => items.reduce((sum, it) => sum + (parseFloat(it.insuranceCoverage) || 0), 0),
    [items]
  );
  const validItemCount = items.filter((it) => it.description.trim()).length;

  const addItem = (preset?: typeof TREATMENT_PRESETS[number]) => {
    const newItem: DraftItem = preset
      ? { id: crypto.randomUUID(), description: preset.name, cdtCode: preset.cdt, fdi: "", unitPrice: String(preset.price), insuranceCoverage: "" }
      : { id: crypto.randomUUID(), description: "", cdtCode: "", fdi: "", unitPrice: "", insuranceCoverage: "" };
    setItems((prev) => {
      // If last item is empty, replace it instead of adding a new row
      const last = prev[prev.length - 1];
      if (last && !last.description.trim() && !last.cdtCode.trim()) {
        return [...prev.slice(0, -1), newItem];
      }
      return [...prev, newItem];
    });
  };
  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const updateItem = (id: string, field: keyof DraftItem, value: string) =>
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, [field]: value } : it));

  const addDiagnosisChip = (v: string) => {
    const trimmed = v.trim();
    if (!trimmed || diagnosisChips.includes(trimmed)) return;
    setDiagnosisChips([...diagnosisChips, trimmed]);
    setDiagnosisDraft("");
  };
  const removeDiagnosisChip = (v: string) =>
    setDiagnosisChips(diagnosisChips.filter((c) => c !== v));

  const applyTemplate = (tpl: typeof PLAN_TEMPLATES[number]) => {
    if (!diagnosisChips.includes(tpl.diagnosis)) {
      setDiagnosisChips((prev) => [...prev, tpl.diagnosis]);
    }
    setPriority(tpl.priority);
    if (!title.trim()) setTitle(tpl.name);
    const tplItems: DraftItem[] = tpl.items.map((name) => {
      const preset = TREATMENT_PRESETS.find((p) => p.name === name);
      return {
        id: crypto.randomUUID(),
        description: preset?.name ?? name,
        cdtCode: preset?.cdt ?? "",
        fdi: "",
        unitPrice: preset ? String(preset.price) : "",
        insuranceCoverage: "",
      };
    });
    setItems(tplItems);
  };

  const create = useMutation({
    mutationFn: async () => {
      const diagnosis = diagnosisChips.join(", ") || diagnosisDraft.trim();
      const mappedItems = items
        .filter((it) => it.description.trim() && parseFloat(it.unitPrice) >= 0)
        .map((it) => ({
          description: it.description.trim(),
          cdtCode: it.cdtCode.trim() || undefined,
          fdi: it.fdi.trim() ? parseInt(it.fdi.trim(), 10) : undefined,
          unitPrice: parseFloat(it.unitPrice) || 0,
          insuranceCoverage: parseFloat(it.insuranceCoverage) || 0,
          quantity: 1,
        }));
      const corePayload = {
        title: title.trim() || undefined,
        diagnosis: diagnosis || undefined,
        rationale: rationale.trim() || undefined,
        priority,
        consentRequired,
      };

      if (isEdit && existing) {
        // PUT — update fields; backend replaces items + phases.
        const r = await fetch(`/api/treatment-plans/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...corePayload, items: mappedItems }),
        });
        const j = await r.json();
        if (!j.success) throw new Error(j.error || "Failed");
        return j.data;
      }

      // Create
      const r = await fetch(`/api/patients/${patientId}/treatment-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...corePayload,
          status: "PROPOSED" as const,
          items: mappedItems,
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    onSuccess: () => onCreated(),
  });

  // ⌘+Enter to submit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && validItemCount > 0) {
        create.mutate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validItemCount, items, title, diagnosisChips, rationale, priority, consentRequired]);

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

      {/* Right drawer — pure horizontal slide */}
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
        aria-label="New treatment plan"
      >
        {/* ───── Header ───── */}
        <header className="shrink-0 pl-16 pr-5 sm:px-5 pt-5 pb-3 border-b border-stone-200 bg-white" style={stagger(0)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md">
                <ClipboardList className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 leading-tight">
                  {isEdit ? "Edit Treatment Plan" : "New Treatment Plan"}
                </h2>
                <p className="text-[11px] text-stone-500 leading-tight mt-0.5">
                  {isEdit
                    ? `Editing plan from ${dateShort(existing!.createdAt)}`
                    : "Build, price, then send to the patient"}
                </p>
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
        </header>

        {/* ───── Body ───── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Quick-start templates */}
          <section style={stagger(1)} className="rounded-2xl bg-white border border-stone-200 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-stone-600">Quick-start template</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PLAN_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => applyTemplate(tpl)}
                  className="group text-left p-2.5 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-gradient-to-br hover:from-blue-50 hover:to-cyan-50 hover:border-blue-300 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-base">{tpl.icon}</span>
                    <span className="text-xs font-bold text-stone-900">{tpl.name}</span>
                  </div>
                  <p className="text-[10px] text-stone-500 leading-tight">
                    {tpl.items.length} item{tpl.items.length === 1 ? "" : "s"} · {tpl.diagnosis}
                  </p>
                </button>
              ))}
            </div>
          </section>

          {/* Title */}
          <div style={stagger(2)} className="rounded-2xl bg-white border border-stone-200 p-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "RCT + crown #16"'
              className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-stone-50/50"
            />
          </div>

          {/* Diagnosis — chip-based */}
          <div style={stagger(3)} className="rounded-2xl bg-white border border-stone-200 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Stethoscope className="w-3.5 h-3.5 text-rose-500" />
              <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Diagnosis</label>
            </div>
            <div className="rounded-xl border-2 border-rose-200 bg-rose-50/30 px-2 py-2 focus-within:border-rose-400 focus-within:bg-white transition-all">
              <div className="flex flex-wrap gap-1.5 items-center">
                {diagnosisChips.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-100 text-rose-800 border border-rose-200 animate-fade-in"
                  >
                    {c}
                    <button
                      onClick={() => removeDiagnosisChip(c)}
                      className="hover:bg-black/10 rounded-full p-0.5 -mr-1"
                      aria-label={`Remove ${c}`}
                    >
                      <XIcon className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={diagnosisDraft}
                  onChange={(e) => setDiagnosisDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addDiagnosisChip(diagnosisDraft);
                    } else if (e.key === "Backspace" && !diagnosisDraft && diagnosisChips.length > 0) {
                      removeDiagnosisChip(diagnosisChips[diagnosisChips.length - 1]);
                    }
                  }}
                  placeholder={diagnosisChips.length === 0 ? "Type or pick…" : ""}
                  className="flex-1 min-w-[100px] px-1 py-0.5 text-[12px] bg-transparent focus:outline-none placeholder:text-stone-400"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {DIAGNOSIS_CHIPS.filter((c) => !diagnosisChips.includes(c)).slice(0, 8).map((c) => (
                <button
                  key={c}
                  onClick={() => addDiagnosisChip(c)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 border border-transparent hover:border-stone-300 transition-all hover:-translate-y-px"
                >
                  + {c}
                </button>
              ))}
            </div>
          </div>

          {/* Rationale + settings */}
          <div style={stagger(4)} className="rounded-2xl bg-white border border-stone-200 p-3 space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Rationale (optional)</label>
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={2}
                placeholder="Why is this plan recommended?"
                className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none resize-none bg-stone-50/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Priority</label>
                <div className="grid grid-cols-2 gap-1">
                  {(["EMERGENCY", "HIGH", "MEDIUM", "COSMETIC"] as const).map((p) => {
                    const palette = PRIORITY_STYLES[p];
                    return (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        className={cn(
                          "px-2 py-1.5 rounded-md border text-[10px] font-bold transition-all",
                          priority === p ? `${palette.bg} ${palette.text} border-current shadow-sm` : "border-stone-200 bg-white text-stone-400 hover:border-stone-300"
                        )}
                      >
                        {palette.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Consent</label>
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
          </div>

          {/* Items — preset chips + item cards */}
          <div style={stagger(5)} className="rounded-2xl bg-white border border-stone-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5 text-blue-500" />
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Line Items</label>
                {validItemCount > 0 && (
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">{validItemCount}</span>
                )}
              </div>
              <button
                onClick={() => addItem()}
                className="text-[10px] text-blue-600 font-bold hover:bg-blue-50 px-2 py-1 rounded-md flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" /> Custom item
              </button>
            </div>

            {/* Quick-add preset chips */}
            <div className="mb-3">
              <p className="text-[9px] uppercase tracking-wider font-bold text-stone-400 mb-1.5">Tap to add</p>
              <div className="flex flex-wrap gap-1">
                {TREATMENT_PRESETS.map((p) => (
                  <button
                    key={p.cdt}
                    onClick={() => addItem(p)}
                    className="text-[10px] px-2.5 py-1 rounded-full bg-stone-100 hover:bg-blue-50 hover:text-blue-700 text-stone-700 border border-transparent hover:border-blue-300 transition-all hover:-translate-y-px hover:shadow-sm flex items-center gap-1"
                  >
                    + {p.name}
                    <span className="text-[8px] font-mono text-stone-400">{p.cdt}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {items.map((it, i) => (
                <div
                  key={it.id}
                  className={cn(
                    "rounded-xl border-2 p-3 transition-all",
                    it.description.trim()
                      ? "border-blue-200 bg-gradient-to-br from-blue-50/40 to-cyan-50/20"
                      : "border-stone-200 bg-stone-50/30 border-dashed"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <GripVertical className="w-3 h-3 text-stone-300" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Item {i + 1}</span>
                      {it.cdtCode && (
                        <span className="text-[9px] font-mono bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded">
                          {it.cdtCode}
                        </span>
                      )}
                    </div>
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(it.id)}
                        className="text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-md p-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    value={it.description}
                    onChange={(e) => updateItem(it.id, "description", e.target.value)}
                    placeholder="Treatment description"
                    className="w-full px-3 py-1.5 text-sm rounded-md border border-stone-200 focus:border-blue-400 focus:outline-none bg-white font-medium"
                  />
                  <div className="grid grid-cols-4 gap-1.5 mt-2">
                    <div className="relative">
                      <input
                        type="text"
                        value={it.cdtCode}
                        onChange={(e) => updateItem(it.id, "cdtCode", e.target.value.toUpperCase())}
                        placeholder="CDT"
                        className="w-full px-2 py-1.5 text-[11px] rounded-md border border-stone-200 focus:border-blue-400 focus:outline-none font-mono bg-white"
                      />
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={it.fdi}
                        onChange={(e) => updateItem(it.id, "fdi", e.target.value)}
                        placeholder="Tooth"
                        className="w-full px-2 py-1.5 text-[11px] rounded-md border border-stone-200 focus:border-blue-400 focus:outline-none bg-white"
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-stone-400">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={it.unitPrice}
                        onChange={(e) => updateItem(it.id, "unitPrice", e.target.value)}
                        placeholder="Price"
                        className="w-full pl-4 pr-2 py-1.5 text-[11px] rounded-md border border-stone-200 focus:border-blue-400 focus:outline-none bg-white"
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-emerald-500">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={it.insuranceCoverage}
                        onChange={(e) => updateItem(it.id, "insuranceCoverage", e.target.value)}
                        placeholder="Ins."
                        className="w-full pl-4 pr-2 py-1.5 text-[11px] rounded-md border border-emerald-200 focus:border-emerald-400 focus:outline-none bg-emerald-50/30"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {create.isError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 animate-fade-in">
              {(create.error as Error).message}
            </p>
          )}
        </div>

        {/* ───── Sticky totals card + footer ───── */}
        <div className="shrink-0 border-t border-stone-200 bg-white">
          <div
            className="px-5 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
            style={stagger(6)}
          >
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-widest font-bold text-blue-100">Total</p>
                <p className="text-xl font-bold leading-tight">{currency(total)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest font-bold text-emerald-100">Insurance</p>
                <p className="text-xl font-bold leading-tight text-emerald-50">{currency(totalIns)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest font-bold text-amber-100">Patient pays</p>
                <p className="text-xl font-bold leading-tight">{currency(Math.max(0, total - totalIns))}</p>
              </div>
            </div>
          </div>
          <div className="p-3 flex items-center justify-between gap-2 bg-stone-50">
            <span className="text-[10px] text-stone-400 hidden sm:inline">
              ⌘ Enter to save · Esc to close
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={handleClose} className="px-3 py-2 rounded-lg text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => create.mutate()}
                disabled={create.isPending || validItemCount === 0}
                className={cn(
                  "px-4 py-2 rounded-lg text-[11px] font-bold text-white flex items-center gap-1.5 shadow-md transition-all",
                  validItemCount === 0
                    ? "bg-stone-300 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-cyan-600 hover:shadow-lg hover:-translate-y-0.5"
                )}
              >
                {create.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />}
                {create.isPending
                  ? (isEdit ? "Saving…" : "Creating…")
                  : isEdit
                    ? `Save changes${validItemCount > 0 ? ` (${validItemCount})` : ""}`
                    : `Create plan${validItemCount > 0 ? ` (${validItemCount})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default TreatmentPlansTab;

"use client";

/**
 * Procedure Templates — admin CRUD for TreatmentTemplate records.
 * Used as prefill source for consultation forms and treatment-plan drawers.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Plus, X as XIcon, Pencil, Trash2, Loader2,
  Search, Power, PowerOff, Tag, Pill, Clock, Stethoscope,
  Sparkles, ClipboardList, Save, ChevronDown, ChevronRight,
} from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface RxItem {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

interface TemplateRecord {
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
  defaultRxItems?: RxItem[] | null;
  defaultPrice: number;
  defaultDuration: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = [
  "Preventive", "Restorative", "Endodontic", "Prosthodontic",
  "Surgery", "Periodontic", "Orthodontic", "Cosmetic", "Other",
];

const CATEGORY_STYLES: Record<string, { bg: string; text: string; ring: string; gradient: string }> = {
  Preventive:     { bg: "bg-emerald-50",  text: "text-emerald-700", ring: "ring-emerald-200", gradient: "from-emerald-500 to-teal-500" },
  Restorative:    { bg: "bg-blue-50",     text: "text-blue-700",    ring: "ring-blue-200",    gradient: "from-blue-500 to-cyan-500" },
  Endodontic:     { bg: "bg-rose-50",     text: "text-rose-700",    ring: "ring-rose-200",    gradient: "from-rose-500 to-pink-500" },
  Prosthodontic:  { bg: "bg-violet-50",   text: "text-violet-700",  ring: "ring-violet-200",  gradient: "from-violet-500 to-purple-500" },
  Surgery:        { bg: "bg-orange-50",   text: "text-orange-700",  ring: "ring-orange-200",  gradient: "from-orange-500 to-red-500" },
  Periodontic:    { bg: "bg-teal-50",     text: "text-teal-700",    ring: "ring-teal-200",    gradient: "from-teal-500 to-cyan-500" },
  Orthodontic:    { bg: "bg-indigo-50",   text: "text-indigo-700",  ring: "ring-indigo-200",  gradient: "from-indigo-500 to-blue-500" },
  Cosmetic:       { bg: "bg-pink-50",     text: "text-pink-700",    ring: "ring-pink-200",    gradient: "from-pink-500 to-rose-500" },
  Other:          { bg: "bg-stone-100",   text: "text-stone-700",   ring: "ring-stone-200",   gradient: "from-stone-500 to-stone-600" },
};

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

export default function TemplatesAdminPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [editing, setEditing] = useState<TemplateRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TemplateRecord | null>(null);

  const qc = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ["treatment-templates", "all"],
    queryFn: async () => {
      const r = await fetch(`/api/treatment-templates?active=false`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return (j.data ?? []) as TemplateRecord[];
    },
  });

  const templates = templatesQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return templates.filter((t) => {
      if (categoryFilter !== "ALL" && t.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        (t.cdtCode ?? "").toLowerCase().includes(q) ||
        (t.defaultDiagnosis ?? "").toLowerCase().includes(q)
      );
    });
  }, [templates, search, categoryFilter]);

  // Group by category for nicer display
  const grouped = useMemo(() => {
    const map = new Map<string, TemplateRecord[]>();
    for (const t of filtered) {
      const k = CATEGORIES.includes(t.category) ? t.category : "Other";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return [...map.entries()].sort(
      ([a], [b]) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b)
    );
  }, [filtered]);

  // Category counts (over the full set, ignoring search)
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    map.set("ALL", templates.length);
    for (const t of templates) {
      map.set(t.category, (map.get(t.category) ?? 0) + 1);
    }
    return map;
  }, [templates]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/treatment-templates/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ["treatment-templates"] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async (t: TemplateRecord) => {
      const r = await fetch(`/api/treatment-templates/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["treatment-templates"] }),
  });

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="ADMIN-TEMPLATES">
      {/* ───── Header ───── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 leading-tight">Procedure Templates</h1>
            <p className="text-sm text-stone-500 mt-0.5">Reusable templates that prefill consultation notes and treatment plans</p>
          </div>
        </div>
        {canEdit && (
          <Button iconLeft={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>
            New Template
          </Button>
        )}
      </div>

      {/* ───── Filters ───── */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code, CDT, diagnosis…"
            className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-white"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <CategoryPill
            label="All"
            value="ALL"
            active={categoryFilter === "ALL"}
            count={categoryCounts.get("ALL") ?? 0}
            onClick={() => setCategoryFilter("ALL")}
            color="from-stone-600 to-stone-700"
          />
          {CATEGORIES.map((c) => {
            const cnt = categoryCounts.get(c) ?? 0;
            if (cnt === 0) return null;
            const style = CATEGORY_STYLES[c];
            return (
              <CategoryPill
                key={c}
                label={c}
                value={c}
                active={categoryFilter === c}
                count={cnt}
                onClick={() => setCategoryFilter(c)}
                color={style.gradient}
              />
            );
          })}
        </div>
      </div>

      {/* ───── List ───── */}
      {templatesQuery.isLoading ? (
        <div className="flex items-center justify-center py-20 text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={<FileText className="w-8 h-8" />}
            title={templates.length === 0 ? "No templates yet" : "No matching templates"}
            description={
              templates.length === 0
                ? "Create your first template to speed up clinical note-taking and treatment plan creation."
                : "Try a different search or category filter."
            }
            action={
              canEdit && templates.length === 0 ? (
                <Button iconLeft={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>
                  Create first template
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([category, items]) => {
            const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.Other;
            return (
              <section key={category} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span className={cn("h-1.5 w-8 rounded-full bg-gradient-to-r", style.gradient)} />
                  <h2 className={cn("text-[11px] font-bold uppercase tracking-widest", style.text)}>{category}</h2>
                  <span className="text-[10px] text-stone-400">{items.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {items.map((t) => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      canEdit={canEdit}
                      onEdit={() => setEditing(t)}
                      onDelete={() => setConfirmDelete(t)}
                      onToggle={() => toggleActive.mutate(t)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ───── Drawers ───── */}
      {(creating || editing) && (
        <TemplateDrawer
          existing={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["treatment-templates"] });
          }}
        />
      )}

      {confirmDelete && (
        <DeleteConfirmDialog
          template={confirmDelete}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
          error={deleteMutation.isError ? (deleteMutation.error as Error).message : null}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function CategoryPill({ label, count, active, onClick, color }: {
  label: string; value: string; count: number; active: boolean; onClick: () => void; color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 border",
        active
          ? "text-white border-transparent shadow-sm bg-gradient-to-r " + color
          : "bg-white text-stone-600 border-stone-200 hover:border-stone-300 hover:-translate-y-px"
      )}
    >
      {label}
      <span className={cn(
        "text-[10px] px-1.5 py-0.5 rounded-full",
        active ? "bg-white/25 text-white" : "bg-stone-100 text-stone-500"
      )}>{count}</span>
    </button>
  );
}

function TemplateCard({ template: t, canEdit, onEdit, onDelete, onToggle }: {
  template: TemplateRecord;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const style = CATEGORY_STYLES[t.category] ?? CATEGORY_STYLES.Other;
  const rxCount = Array.isArray(t.defaultRxItems) ? t.defaultRxItems.length : 0;

  return (
    <article className={cn(
      "group relative bg-white rounded-2xl border-2 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg",
      t.isActive ? "border-stone-200" : "border-stone-200 opacity-60"
    )}>
      {/* Top color band */}
      <div className={cn("h-1 bg-gradient-to-r", style.gradient)} />

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-stone-900 leading-snug truncate">{t.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[9px] font-mono text-stone-400">{t.code}</span>
              {t.cdtCode && (
                <span className="text-[9px] font-mono bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">
                  {t.cdtCode}
                </span>
              )}
              {!t.isActive && (
                <span className="text-[9px] font-bold bg-stone-200 text-stone-500 px-1.5 py-0.5 rounded uppercase">
                  Inactive
                </span>
              )}
            </div>
          </div>
        </div>

        {t.defaultDiagnosis && (
          <p className="text-[11px] text-stone-600 line-clamp-2 leading-snug">
            <Stethoscope className="w-2.5 h-2.5 inline -mt-px mr-1 text-rose-400" />
            {t.defaultDiagnosis}
          </p>
        )}

        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-stone-100 text-[10px] text-stone-500">
          <span className="font-bold text-stone-900">{currency(t.defaultPrice)}</span>
          <span className="flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" /> {t.defaultDuration}m
          </span>
          {rxCount > 0 && (
            <span className="flex items-center gap-0.5 text-emerald-600">
              <Pill className="w-2.5 h-2.5" /> {rxCount}
            </span>
          )}
          {t.defaultFollowUpDays && (
            <span className="flex items-center gap-0.5">
              <ClipboardList className="w-2.5 h-2.5" /> F/U {t.defaultFollowUpDays}d
            </span>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className="flex-1 px-2 py-1 rounded-md text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors flex items-center justify-center gap-1"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <button
              onClick={onToggle}
              title={t.isActive ? "Mark inactive" : "Mark active"}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                t.isActive
                  ? "text-stone-500 hover:bg-stone-100"
                  : "text-emerald-600 hover:bg-emerald-50"
              )}
            >
              {t.isActive ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/* ─────────────── Create / Edit Drawer ─────────────── */

interface DraftRx { id: string; medicineName: string; dosage: string; frequency: string; duration: string; instructions: string; }

function TemplateDrawer({ existing, onClose, onSaved }: {
  existing: TemplateRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
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

  // Form state
  const [code, setCode] = useState(existing?.code ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [category, setCategory] = useState(existing?.category ?? "Restorative");
  const [cdtCode, setCdtCode] = useState(existing?.cdtCode ?? "");
  const [defaultDiagnosis, setDefaultDiagnosis] = useState(existing?.defaultDiagnosis ?? "");
  const [defaultChiefComplaint, setDefaultChiefComplaint] = useState(existing?.defaultChiefComplaint ?? "");
  const [defaultClinicalFindings, setDefaultClinicalFindings] = useState(existing?.defaultClinicalFindings ?? "");
  const [defaultProcedureNotes, setDefaultProcedureNotes] = useState(existing?.defaultProcedureNotes ?? "");
  const [defaultMaterialsUsed, setDefaultMaterialsUsed] = useState(existing?.defaultMaterialsUsed ?? "");
  const [defaultPostOpInstructions, setDefaultPostOpInstructions] = useState(existing?.defaultPostOpInstructions ?? "");
  const [defaultFollowUpDays, setDefaultFollowUpDays] = useState(existing?.defaultFollowUpDays?.toString() ?? "");
  const [defaultPrice, setDefaultPrice] = useState(existing?.defaultPrice.toString() ?? "0");
  const [defaultDuration, setDefaultDuration] = useState(existing?.defaultDuration.toString() ?? "30");
  const [rxItems, setRxItems] = useState<DraftRx[]>(
    (existing?.defaultRxItems ?? []).map((r) => ({ id: crypto.randomUUID(), ...r, instructions: r.instructions ?? "" }))
  );

  const addRx = () => setRxItems((prev) => [...prev, { id: crypto.randomUUID(), medicineName: "", dosage: "", frequency: "", duration: "", instructions: "" }]);
  const updateRx = (id: string, field: keyof DraftRx, v: string) => setRxItems((prev) => prev.map((r) => r.id === id ? { ...r, [field]: v } : r));
  const removeRx = (id: string) => setRxItems((prev) => prev.filter((r) => r.id !== id));

  const [collapsedSections, setCollapsedSections] = useState({
    notes: false, materials: true, rx: false,
  });
  const toggleSection = (k: keyof typeof collapsedSections) => setCollapsedSections((p) => ({ ...p, [k]: !p[k] }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        category: category.trim() || "Other",
        cdtCode: cdtCode.trim() || (existing ? null : undefined),
        defaultDiagnosis: defaultDiagnosis.trim() || (existing ? null : undefined),
        defaultChiefComplaint: defaultChiefComplaint.trim() || (existing ? null : undefined),
        defaultClinicalFindings: defaultClinicalFindings.trim() || (existing ? null : undefined),
        defaultProcedureNotes: defaultProcedureNotes.trim() || (existing ? null : undefined),
        defaultMaterialsUsed: defaultMaterialsUsed.trim() || (existing ? null : undefined),
        defaultPostOpInstructions: defaultPostOpInstructions.trim() || (existing ? null : undefined),
        defaultFollowUpDays: defaultFollowUpDays.trim() ? parseInt(defaultFollowUpDays, 10) : (existing ? null : undefined),
        defaultPrice: parseFloat(defaultPrice) || 0,
        defaultDuration: parseInt(defaultDuration, 10) || 30,
        defaultRxItems: rxItems
          .filter((r) => r.medicineName.trim())
          .map((r) => ({
            medicineName: r.medicineName.trim(),
            dosage: r.dosage.trim(),
            frequency: r.frequency.trim(),
            duration: r.duration.trim(),
            instructions: r.instructions.trim() || undefined,
          })),
      };
      const url = existing
        ? `/api/treatment-templates/${existing.id}`
        : `/api/treatment-templates`;
      const r = await fetch(url, {
        method: existing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    onSuccess: () => onSaved(),
  });

  // ⌘+Enter to save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && code.trim() && name.trim()) {
        save.mutate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, name, category, defaultPrice, defaultDuration, rxItems]);

  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.Other;
  const canSave = code.trim().length >= 2 && name.trim().length >= 1;

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
        className="absolute top-0 bottom-0 right-0 w-full sm:w-[540px] md:w-[600px] bg-stone-50 flex flex-col will-change-transform"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={existing ? "Edit template" : "New template"}
      >
        {/* Header */}
        <header className="shrink-0 pl-16 pr-5 sm:px-5 pt-5 pb-3 border-b border-stone-200 bg-white" style={stagger(0)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shadow-md bg-gradient-to-br", style.gradient)}>
                {existing ? <Pencil className="w-5 h-5 text-white" /> : <Sparkles className="w-5 h-5 text-white" />}
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 leading-tight">
                  {existing ? "Edit Template" : "New Procedure Template"}
                </h2>
                <p className="text-[11px] text-stone-500 leading-tight mt-0.5">
                  {existing ? `Updating ${existing.code}` : "Reused across consultations & treatment plans"}
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
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Identity */}
          <section style={stagger(1)} className="rounded-2xl bg-white border border-stone-200 p-3 space-y-3">
            <div className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-blue-500" />
              <h3 className="text-[10px] uppercase tracking-wider font-bold text-stone-600">Identity</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name *" required>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Composite Filling"
                  className={inputClass}
                />
              </Field>
              <Field label="Code *" hint="Unique slug">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                  placeholder="COMPOSITE_FILLING"
                  className={cn(inputClass, "font-mono uppercase")}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Category">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={inputClass}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="CDT Code" hint="Optional">
                <input
                  type="text"
                  value={cdtCode}
                  onChange={(e) => setCdtCode(e.target.value.toUpperCase())}
                  placeholder="D2330"
                  className={cn(inputClass, "font-mono")}
                />
              </Field>
              <Field label="Default Price">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-stone-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={defaultPrice}
                    onChange={(e) => setDefaultPrice(e.target.value)}
                    className={cn(inputClass, "pl-6")}
                  />
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duration (min)">
                <input
                  type="number"
                  value={defaultDuration}
                  onChange={(e) => setDefaultDuration(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Follow-up (days)" hint="Optional">
                <input
                  type="number"
                  value={defaultFollowUpDays}
                  onChange={(e) => setDefaultFollowUpDays(e.target.value)}
                  placeholder="14"
                  className={inputClass}
                />
              </Field>
            </div>
          </section>

          {/* Clinical notes */}
          <CollapsibleSection
            title="Clinical Notes"
            icon={<Stethoscope className="w-3.5 h-3.5 text-rose-500" />}
            collapsed={collapsedSections.notes}
            onToggle={() => toggleSection("notes")}
            style={stagger(2)}
            preview={
              [defaultDiagnosis, defaultChiefComplaint, defaultClinicalFindings].filter(Boolean).length > 0
                ? `${[defaultDiagnosis, defaultChiefComplaint, defaultClinicalFindings].filter(Boolean).length} field${[defaultDiagnosis, defaultChiefComplaint, defaultClinicalFindings].filter(Boolean).length === 1 ? "" : "s"} filled`
                : "Optional prefill content"
            }
          >
            <Field label="Default Diagnosis">
              <textarea
                rows={2}
                value={defaultDiagnosis}
                onChange={(e) => setDefaultDiagnosis(e.target.value)}
                placeholder="Dental caries"
                className={textareaClass}
              />
            </Field>
            <Field label="Default Chief Complaint">
              <textarea
                rows={2}
                value={defaultChiefComplaint}
                onChange={(e) => setDefaultChiefComplaint(e.target.value)}
                placeholder="Patient reports sensitivity in the upper right molar…"
                className={textareaClass}
              />
            </Field>
            <Field label="Default Clinical Findings">
              <textarea
                rows={2}
                value={defaultClinicalFindings}
                onChange={(e) => setDefaultClinicalFindings(e.target.value)}
                placeholder="Cavitated lesion on occlusal surface; positive cold test…"
                className={textareaClass}
              />
            </Field>
            <Field label="Default Procedure Notes">
              <textarea
                rows={3}
                value={defaultProcedureNotes}
                onChange={(e) => setDefaultProcedureNotes(e.target.value)}
                placeholder="Local anesthetic administered. Caries excavated…"
                className={textareaClass}
              />
            </Field>
          </CollapsibleSection>

          {/* Materials + Post-op */}
          <CollapsibleSection
            title="Materials & Post-Op"
            icon={<ClipboardList className="w-3.5 h-3.5 text-amber-500" />}
            collapsed={collapsedSections.materials}
            onToggle={() => toggleSection("materials")}
            style={stagger(3)}
            preview={
              [defaultMaterialsUsed, defaultPostOpInstructions].filter(Boolean).length > 0
                ? "Filled"
                : "Optional"
            }
          >
            <Field label="Default Materials Used">
              <textarea
                rows={2}
                value={defaultMaterialsUsed}
                onChange={(e) => setDefaultMaterialsUsed(e.target.value)}
                placeholder="Composite resin (A2 shade), bonding agent…"
                className={textareaClass}
              />
            </Field>
            <Field label="Default Post-Op Instructions">
              <textarea
                rows={3}
                value={defaultPostOpInstructions}
                onChange={(e) => setDefaultPostOpInstructions(e.target.value)}
                placeholder="Avoid hot/cold liquids for 24 hours. Mild sensitivity is normal."
                className={textareaClass}
              />
            </Field>
          </CollapsibleSection>

          {/* Rx */}
          <CollapsibleSection
            title="Prescription Items"
            icon={<Pill className="w-3.5 h-3.5 text-emerald-500" />}
            collapsed={collapsedSections.rx}
            onToggle={() => toggleSection("rx")}
            style={stagger(4)}
            preview={rxItems.filter((r) => r.medicineName.trim()).length > 0
              ? `${rxItems.filter((r) => r.medicineName.trim()).length} medication${rxItems.filter((r) => r.medicineName.trim()).length === 1 ? "" : "s"}`
              : "None"
            }
            action={
              <button
                onClick={(e) => { e.stopPropagation(); addRx(); }}
                className="text-[10px] text-emerald-700 font-bold hover:bg-emerald-50 px-2 py-1 rounded-md flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            }
          >
            {rxItems.length === 0 ? (
              <button
                onClick={addRx}
                className="w-full p-3 rounded-xl border-2 border-dashed border-emerald-200 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-50/40 transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add first prescription
              </button>
            ) : (
              <div className="space-y-2">
                {rxItems.map((r, i) => (
                  <div key={r.id} className={cn(
                    "rounded-xl border-2 p-3 transition-all",
                    r.medicineName.trim()
                      ? "border-emerald-200 bg-emerald-50/30"
                      : "border-stone-200 bg-stone-50/40 border-dashed"
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Rx {i + 1}</span>
                      <button
                        onClick={() => removeRx(r.id)}
                        className="text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-md p-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={r.medicineName}
                      onChange={(e) => updateRx(r.id, "medicineName", e.target.value)}
                      placeholder="Medicine name"
                      className={cn(inputClass, "font-medium")}
                    />
                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                      <input type="text" value={r.dosage} onChange={(e) => updateRx(r.id, "dosage", e.target.value)} placeholder="Dosage" className={smallInputClass} />
                      <input type="text" value={r.frequency} onChange={(e) => updateRx(r.id, "frequency", e.target.value)} placeholder="Frequency" className={smallInputClass} />
                      <input type="text" value={r.duration} onChange={(e) => updateRx(r.id, "duration", e.target.value)} placeholder="Duration" className={smallInputClass} />
                    </div>
                    <input
                      type="text"
                      value={r.instructions}
                      onChange={(e) => updateRx(r.id, "instructions", e.target.value)}
                      placeholder="Instructions (optional)"
                      className={cn(smallInputClass, "mt-1.5 w-full")}
                    />
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {save.isError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {(save.error as Error).message}
            </p>
          )}
        </div>

        {/* Footer */}
        <footer className="shrink-0 border-t border-stone-200 p-3 flex items-center justify-between gap-2 bg-white">
          <span className="text-[10px] text-stone-400 hidden sm:inline">
            ⌘ Enter to save · Esc to close
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={handleClose} className="px-3 py-2 rounded-lg text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || !canSave}
              className={cn(
                "px-4 py-2 rounded-lg text-[11px] font-bold text-white flex items-center gap-1.5 shadow-md transition-all",
                !canSave
                  ? "bg-stone-300 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-cyan-600 hover:shadow-lg hover:-translate-y-0.5"
              )}
            >
              {save.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Save className="w-3.5 h-3.5" />}
              {save.isPending ? "Saving…" : existing ? "Save changes" : "Create template"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

/* ─────────────── Delete confirm ─────────────── */

function DeleteConfirmDialog({ template, isPending, error, onConfirm, onCancel }: {
  template: TemplateRecord;
  isPending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(r);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        onClick={onCancel}
        className={cn(
          "absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-200",
          mounted ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        className={cn(
          "relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 transition-all duration-200",
          mounted ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-95"
        )}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900">Delete template?</h2>
            <p className="text-[11px] text-stone-500">This marks the template inactive.</p>
          </div>
        </div>
        <p className="text-sm text-stone-600 mb-2">
          <span className="font-semibold">{template.name}</span>{" "}
          <span className="text-[10px] font-mono text-stone-400">({template.code})</span> will no longer appear in pickers.
        </p>
        <p className="text-[11px] text-stone-400 mb-4">Past consultations and plans referencing this template remain intact.</p>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 rounded-lg text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center gap-1.5"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {isPending ? "Deactivating…" : "Deactivate"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Small helpers ─────────────── */

const inputClass = "w-full px-3 py-1.5 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-stone-50/50";
const smallInputClass = "px-2 py-1.5 text-[11px] rounded-md border border-stone-200 focus:border-blue-400 focus:outline-none bg-white";
const textareaClass = "w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none resize-none bg-stone-50/50";

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
          {label}
        </span>
        {hint && <span className="text-[9px] text-stone-400 lowercase font-normal">{hint}</span>}
        {required && <span className="text-rose-500 -ml-1">*</span>}
      </div>
      {children}
    </label>
  );
}

function CollapsibleSection({ title, icon, collapsed, onToggle, preview, action, children, style }: {
  title: string;
  icon: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  preview?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section style={style} className="rounded-2xl bg-white border border-stone-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-stone-50/60 transition-colors text-left"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
        {icon}
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-stone-700">{title}</h3>
        {preview && <span className="text-[10px] text-stone-400 ml-auto">{preview}</span>}
        {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
      </button>
      {!collapsed && (
        <div className="px-3 pb-3 space-y-3 border-t border-stone-100">
          {children}
        </div>
      )}
    </section>
  );
}

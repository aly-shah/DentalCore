"use client";

/**
 * Tenant Management — SUPER_ADMIN only. List + create + edit + archive
 * tenants and their hostnames. The Prisma extension is bypassed by the
 * underlying API routes so this page sees ALL tenants.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Plus, X as XIcon, Pencil, Globe, Trash2, Loader2,
  Search, Save, ExternalLink, Check, Users as UsersIcon,
} from "lucide-react";
import { Button, Card, EmptyState, CardListSkeleton } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface HostnameRow {
  id: string;
  hostname: string;
  type: string;
  isVerified: boolean;
  isPrimary: boolean;
  tlsManagedBy?: string;
}

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  plan: "FREE" | "PRO" | "GROUP" | "ENTERPRISE";
  status: "ACTIVE" | "TRIAL" | "SUSPENDED" | "CHURNED" | "ARCHIVED";
  primaryColor: string;
  locale: string;
  currency: string;
  timezone: string;
  region: string;
  hipaaCovered: boolean;
  gdprCovered: boolean;
  maxUsers: number | null;
  maxBranches: number | null;
  maxPatients: number | null;
  trialEndsAt: string | null;
  createdAt: string;
  hostnames: HostnameRow[];
  _count?: { users: number; branches: number; patients: number; hostnames: number };
}

const PLAN_STYLES: Record<TenantRow["plan"], { bg: string; text: string }> = {
  FREE:       { bg: "bg-stone-100",   text: "text-stone-700" },
  PRO:        { bg: "bg-blue-100",    text: "text-blue-700" },
  GROUP:      { bg: "bg-violet-100",  text: "text-violet-700" },
  ENTERPRISE: { bg: "bg-amber-100",   text: "text-amber-700" },
};

const STATUS_STYLES: Record<TenantRow["status"], { bg: string; text: string; dot: string }> = {
  ACTIVE:    { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  TRIAL:     { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500" },
  SUSPENDED: { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500" },
  CHURNED:   { bg: "bg-stone-100",  text: "text-stone-700",   dot: "bg-stone-500" },
  ARCHIVED:  { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500" },
};

export default function TenantsAdminPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "SUPER_ADMIN";

  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [editing, setEditing] = useState<TenantRow | null>(null);
  const [creating, setCreating] = useState(false);

  const tenantsQuery = useQuery({
    queryKey: ["tenants", search, statusFilter],
    queryFn: async (): Promise<TenantRow[]> => {
      const p = new URLSearchParams();
      if (search.trim()) p.set("q", search.trim());
      if (statusFilter) p.set("status", statusFilter);
      const r = await fetch(`/api/admin/tenants?${p.toString()}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    enabled: canEdit,
  });

  if (!canEdit) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        SUPER_ADMIN access required.
      </div>
    );
  }

  const tenants = tenantsQuery.data ?? [];
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tenants) map.set(t.status, (map.get(t.status) ?? 0) + 1);
    return map;
  }, [tenants]);

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="ADMIN-TENANTS">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 leading-tight">Tenants</h1>
            <p className="text-sm text-stone-500 mt-0.5">Manage clinics and their hostnames</p>
          </div>
        </div>
        <Button iconLeft={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>
          New Tenant
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by slug, name, legal name…"
            className="w-full pl-10 pr-3 py-2 text-sm rounded-xl border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-white"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusPill label="All" active={!statusFilter} onClick={() => setStatusFilter("")} count={tenants.length} />
          {(["ACTIVE", "TRIAL", "SUSPENDED", "CHURNED", "ARCHIVED"] as const).map((s) => (
            <StatusPill key={s} label={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} count={counts.get(s) ?? 0} accent={STATUS_STYLES[s]} />
          ))}
        </div>
      </div>

      {tenantsQuery.isLoading ? (
        <CardListSkeleton rows={4} withMeta />
      ) : tenants.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={<Building2 className="w-8 h-8" />}
            title="No tenants"
            description="Create the first tenant to start managing the platform."
            action={<Button iconLeft={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>Create first tenant</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {tenants.map((t) => (
            <TenantCard key={t.id} tenant={t} onEdit={() => setEditing(t)} />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <TenantDrawer
          existing={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["tenants"] });
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function StatusPill({
  label, active, onClick, count, accent,
}: {
  label: string; active: boolean; onClick: () => void; count: number;
  accent?: { bg: string; text: string; dot: string };
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 border",
        active
          ? accent
            ? `${accent.bg} ${accent.text} border-current`
            : "bg-stone-800 text-white border-stone-800"
          : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
      )}
    >
      {accent && <span className={cn("w-1.5 h-1.5 rounded-full", accent.dot)} />}
      {label}
      <span className={cn("text-[9px] px-1 rounded", active && !accent ? "bg-white/20" : "bg-stone-100 text-stone-500")}>{count}</span>
    </button>
  );
}

function TenantCard({ tenant: t, onEdit }: { tenant: TenantRow; onEdit: () => void }) {
  const planStyle = PLAN_STYLES[t.plan];
  const statusStyle = STATUS_STYLES[t.status];
  const primary = t.hostnames.find((h) => h.isPrimary) ?? t.hostnames[0];

  return (
    <article className="group bg-white rounded-2xl border-2 border-stone-200 overflow-hidden hover:-translate-y-0.5 hover:shadow-lg transition-all">
      <div className="h-1.5" style={{ backgroundColor: t.primaryColor }} />
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-stone-900 truncate">{t.name}</p>
            <p className="text-[10px] text-stone-400 font-mono">{t.slug}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase", statusStyle.bg, statusStyle.text)}>
              <span className={cn("w-1 h-1 rounded-full", statusStyle.dot)} />
              {t.status}
            </span>
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase", planStyle.bg, planStyle.text)}>
              {t.plan}
            </span>
          </div>
        </div>

        {primary && (
          <a
            href={`https://${primary.hostname}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:underline truncate"
          >
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate">{primary.hostname}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-50" />
          </a>
        )}

        <div className="grid grid-cols-4 gap-1.5 text-center pt-2 border-t border-stone-100">
          <Stat label="Users" value={t._count?.users ?? 0} />
          <Stat label="Branches" value={t._count?.branches ?? 0} />
          <Stat label="Patients" value={t._count?.patients ?? 0} />
          <Stat label="Hosts" value={t._count?.hostnames ?? t.hostnames.length} />
        </div>

        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="w-full text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 py-1.5 rounded-md flex items-center justify-center gap-1 transition-colors"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-stone-400 font-bold">{label}</p>
      <p className="text-sm font-bold text-stone-900">{value}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function TenantDrawer({ existing, onClose, onSaved }: {
  existing: TenantRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!existing;
  const qc = useQueryClient();
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

  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [legalName, setLegalName] = useState(existing?.legalName ?? "");
  const [plan, setPlan] = useState<TenantRow["plan"]>(existing?.plan ?? "FREE");
  const [status, setStatus] = useState<TenantRow["status"]>(existing?.status ?? "TRIAL");
  const [primaryColor, setPrimaryColor] = useState(existing?.primaryColor ?? "#0284C7");
  const [timezone, setTimezone] = useState(existing?.timezone ?? "UTC");
  const [currency, setCurrency] = useState(existing?.currency ?? "PKR");
  const [region, setRegion] = useState(existing?.region ?? "global");
  const [hipaaCovered, setHipaaCovered] = useState(existing?.hipaaCovered ?? false);
  const [gdprCovered, setGdprCovered] = useState(existing?.gdprCovered ?? false);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...(isEdit ? {} : { slug }),
        name, legalName: legalName.trim() || null,
        plan, status, primaryColor,
        timezone, currency, region,
        hipaaCovered, gdprCovered,
      };
      const url = isEdit ? `/api/admin/tenants/${existing!.id}` : `/api/admin/tenants`;
      const r = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    onSuccess: () => onSaved(),
  });

  const canSave = name.trim().length > 0 && (isEdit || /^[a-z0-9-]{2,60}$/.test(slug));

  return (
    <div className="fixed inset-0 z-40">
      <div
        onClick={handleClose}
        style={{
          backdropFilter: mounted ? "blur(4px)" : "blur(0px)",
          transition: "opacity 260ms ease-out, backdrop-filter 260ms ease-out",
        }}
        className={cn("absolute inset-0 bg-slate-900/40", mounted ? "opacity-100" : "opacity-0")}
      />
      <aside
        style={{
          transform: mounted ? "translateX(0)" : "translateX(100%)",
          transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: mounted ? "-30px 0 60px -20px rgba(15, 23, 42, 0.25)" : "none",
        }}
        className="absolute top-0 bottom-0 right-0 w-full sm:w-[540px] bg-stone-50 flex flex-col will-change-transform"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <header className="shrink-0 pl-16 pr-5 sm:px-5 pt-5 pb-3 border-b border-stone-200 bg-white" style={stagger(0)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 leading-tight">
                  {isEdit ? "Edit Tenant" : "New Tenant"}
                </h2>
                <p className="text-[11px] text-stone-500 leading-tight mt-0.5">
                  {isEdit ? existing!.slug : "Provisions a clinic on the platform"}
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

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Identity */}
          <section style={stagger(1)} className="rounded-2xl bg-white border border-stone-200 p-3 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Identity</p>
            <Field label="Name *">
              <input
                type="text" value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Smile Dental Group"
                className={inputClass}
              />
            </Field>
            <Field label="Legal name (optional)">
              <input
                type="text" value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Smile Dental Group, LLC"
                className={inputClass}
              />
            </Field>
            <Field label="Slug *" hint={isEdit ? "Cannot be changed" : "URL-safe; lowercase/digits/hyphens"}>
              <input
                type="text"
                value={slug}
                disabled={isEdit}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="smile-dental"
                className={cn(inputClass, "font-mono", isEdit && "opacity-60 cursor-not-allowed")}
              />
            </Field>
          </section>

          {/* Plan + status */}
          <section style={stagger(2)} className="rounded-2xl bg-white border border-stone-200 p-3 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Plan & Status</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plan">
                <select value={plan} onChange={(e) => setPlan(e.target.value as TenantRow["plan"])} className={inputClass}>
                  <option value="FREE">Free</option>
                  <option value="PRO">Pro</option>
                  <option value="GROUP">Group</option>
                  <option value="ENTERPRISE">Enterprise</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={status} onChange={(e) => setStatus(e.target.value as TenantRow["status"])} className={inputClass}>
                  <option value="TRIAL">Trial</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="CHURNED">Churned</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </Field>
            </div>
          </section>

          {/* Branding + locale */}
          <section style={stagger(3)} className="rounded-2xl bg-white border border-stone-200 p-3 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Branding & Locale</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Primary color">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-12 h-9 rounded-md border-2 border-stone-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className={cn(inputClass, "font-mono uppercase flex-1")}
                  />
                </div>
              </Field>
              <Field label="Region">
                <select value={region} onChange={(e) => setRegion(e.target.value)} className={inputClass}>
                  <option value="global">Global</option>
                  <option value="US">US</option>
                  <option value="EU">EU</option>
                  <option value="APAC">APAC</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Timezone">
                <input
                  type="text" value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="America/New_York"
                  className={cn(inputClass, "font-mono")}
                />
              </Field>
              <Field label="Currency">
                <input
                  type="text" value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  placeholder="PKR"
                  className={cn(inputClass, "font-mono uppercase")}
                />
              </Field>
            </div>
          </section>

          {/* Compliance */}
          <section style={stagger(4)} className="rounded-2xl bg-white border border-stone-200 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Compliance</p>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={hipaaCovered} onChange={(e) => setHipaaCovered(e.target.checked)} />
              <span>HIPAA-covered entity (US)</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={gdprCovered} onChange={(e) => setGdprCovered(e.target.checked)} />
              <span>GDPR-covered (EU/UK)</span>
            </label>
          </section>

          {/* Hostnames — only when editing */}
          {isEdit && existing && (
            <HostnamesSection tenant={existing} onChange={() => qc.invalidateQueries({ queryKey: ["tenants"] })} />
          )}

          {save.isError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {(save.error as Error).message}
            </p>
          )}
        </div>

        <footer className="shrink-0 border-t border-stone-200 p-3 flex items-center justify-end gap-2 bg-white">
          <button onClick={handleClose} className="px-3 py-2 rounded-lg text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !canSave}
            className={cn(
              "px-4 py-2 rounded-lg text-[11px] font-bold text-white flex items-center gap-1.5 shadow-md transition-all",
              !canSave ? "bg-stone-300 cursor-not-allowed" : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-lg hover:-translate-y-0.5"
            )}
          >
            {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create tenant"}
          </button>
        </footer>
      </aside>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function HostnamesSection({ tenant, onChange }: { tenant: TenantRow; onChange: () => void }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [hostname, setHostname] = useState("");
  const [makePrimary, setMakePrimary] = useState(false);

  const list = useQuery({
    queryKey: ["tenant-hostnames", tenant.id],
    queryFn: async (): Promise<HostnameRow[]> => {
      const r = await fetch(`/api/admin/tenants/${tenant.id}/hostnames`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/tenants/${tenant.id}/hostnames`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: hostname.trim().toLowerCase(), isPrimary: makePrimary }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    onSuccess: () => {
      setHostname("");
      setMakePrimary(false);
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["tenant-hostnames", tenant.id] });
      onChange();
    },
  });

  const remove = useMutation({
    mutationFn: async (hostnameId: string) => {
      const r = await fetch(`/api/admin/tenants/${tenant.id}/hostnames/${hostnameId}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-hostnames", tenant.id] });
      onChange();
    },
  });

  const rows = list.data ?? [];

  return (
    <section className="rounded-2xl bg-white border border-stone-200 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
          <Globe className="w-3 h-3" /> Hostnames
        </p>
        <button
          onClick={() => setAdding(!adding)}
          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-2.5 space-y-2">
          <input
            type="text"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="dental.acme.com"
            className={cn(inputClass, "font-mono")}
            autoFocus
          />
          <label className="flex items-center gap-1.5 text-[10px] text-stone-600">
            <input type="checkbox" checked={makePrimary} onChange={(e) => setMakePrimary(e.target.checked)} />
            Set as primary
          </label>
          {create.isError && (
            <p className="text-[10px] text-red-600">{(create.error as Error).message}</p>
          )}
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => { setAdding(false); setHostname(""); }}
              className="text-[10px] font-semibold text-stone-500 hover:text-stone-700 px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={() => create.mutate()}
              disabled={create.isPending || !hostname.trim()}
              className="text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-3 py-1 rounded-md flex items-center gap-1"
            >
              {create.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
              Attach
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-[11px] text-stone-400 italic">No hostnames yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((h) => (
            <li key={h.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-stone-50 group">
              <Globe className="w-3 h-3 text-stone-400 shrink-0" />
              <span className="font-mono flex-1 truncate">{h.hostname}</span>
              {h.isPrimary && (
                <span className="text-[9px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">PRIMARY</span>
              )}
              {h.isVerified ? (
                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">✓</span>
              ) : (
                <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">UNVERIFIED</span>
              )}
              <button
                onClick={() => {
                  if (confirm(`Detach ${h.hostname}?`)) remove.mutate(h.id);
                }}
                className="text-stone-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Detach"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─────────────── helpers ─────────────── */

const inputClass = "w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-stone-50/50";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{label}</span>
        {hint && <span className="text-[9px] text-stone-400 lowercase font-normal">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

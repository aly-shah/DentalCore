"use client";

/**
 * Audit Log Viewer — paginated, filterable, ADMIN-only.
 * Reads from /api/admin/audit (tenant-scoped via the Prisma extension).
 */
import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ScrollText, Search, User as UserIcon, Loader2, AlertTriangle, ChevronDown,
} from "lucide-react";
import { Card, EmptyState, CardListSkeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

interface AuditRow {
  id: string;
  userId: string | null;
  user: { id: string; name: string; role: string } | null;
  userName: string | null;
  action: string;
  module: string | null;
  entityType: string | null;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditPage { items: AuditRow[]; nextCursor: string | null }

const ACTION_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  CREATE: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  UPDATE: { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500" },
  DELETE: { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500" },
  LOGIN:  { bg: "bg-violet-50",  text: "text-violet-700",  dot: "bg-violet-500" },
  LOGOUT: { bg: "bg-stone-50",   text: "text-stone-700",   dot: "bg-stone-400" },
  EXPORT: { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500" },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

export default function AuditLogPage() {
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [mod, setMod] = useState("");

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (action) p.set("action", action);
    if (mod) p.set("module", mod);
    p.set("limit", "50");
    return p;
  }, [q, action, mod]);

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["audit-log", q.trim(), action, mod],
    queryFn: async ({ pageParam }): Promise<AuditPage> => {
      const url = new URLSearchParams(params);
      if (pageParam) url.set("cursor", pageParam);
      const r = await fetch(`/api/admin/audit?${url.toString()}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const rows = (data?.pages ?? []).flatMap((p) => p.items);

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="ADMIN-AUDIT">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-stone-600 to-stone-800 flex items-center justify-center shadow-md">
            <ScrollText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 leading-tight">Audit Log</h1>
            <p className="text-sm text-stone-500 mt-0.5">Every CRUD action by every user, immutable record</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by user, action, entity, details…"
            className="w-full pl-10 pr-3 py-2 text-sm rounded-xl border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-white"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-white"
          >
            <option value="">All actions</option>
            {["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "EXPORT"].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            value={mod}
            onChange={(e) => setMod(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-white"
          >
            <option value="">All modules</option>
            {[
              "PATIENT", "APPOINTMENT", "BILLING", "CONSULTATION", "PROCEDURE",
              "PRESCRIPTION", "AUTH", "ADMIN",
            ].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <CardListSkeleton rows={8} withMeta />
      ) : isError ? (
        <Card padding="lg">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-semibold">Couldn&apos;t load audit log</span>
          </div>
          <p className="text-xs text-red-500 mt-1">{(error as Error)?.message}</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={<ScrollText className="w-8 h-8" />}
            title="No matching events"
            description="Try clearing filters or widening the date range."
          />
        </Card>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden divide-y divide-stone-100">
          {rows.map((r) => {
            const style = ACTION_STYLES[r.action] ?? ACTION_STYLES.UPDATE;
            return (
              <div key={r.id} className="px-4 py-3 flex items-start gap-3 hover:bg-stone-50/60 transition-colors">
                <div className={cn("shrink-0 w-9 h-9 rounded-xl flex items-center justify-center", style.bg)}>
                  <UserIcon className={cn("w-4 h-4", style.text)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
                    <span className="font-bold text-stone-900">
                      {r.user?.name ?? r.userName ?? "System"}
                    </span>
                    <span className={cn("inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded", style.bg, style.text)}>
                      <span className={cn("w-1 h-1 rounded-full", style.dot)} />
                      {r.action}
                    </span>
                    {r.entityType && (
                      <span className="text-stone-500">
                        {r.entityType}
                        {r.entityId && (
                          <span className="ml-1 text-stone-400 font-mono text-[10px]">
                            {r.entityId.slice(0, 8)}
                          </span>
                        )}
                      </span>
                    )}
                    {r.module && (
                      <span className="text-[9px] text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                        {r.module}
                      </span>
                    )}
                  </div>
                  {r.details && (
                    <p className="text-[11px] text-stone-600 mt-1 line-clamp-2 font-mono">
                      {r.details}
                    </p>
                  )}
                </div>
                <div className="text-[10px] text-stone-400 shrink-0 whitespace-nowrap">
                  {fmtDate(r.createdAt)}
                  {r.ipAddress && (
                    <div className="font-mono mt-0.5">{r.ipAddress}</div>
                  )}
                </div>
              </div>
            );
          })}

          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full py-3 text-xs font-semibold text-blue-600 hover:bg-blue-50/50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {isFetchingNextPage
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</>
                : <>Load more <ChevronDown className="w-3.5 h-3.5" /></>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

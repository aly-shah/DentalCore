"use client";

/**
 * Unmatched WhatsApp Inbox — front desk triage for inbound messages
 * whose phone number doesn't match any known Patient row.
 *
 * Workflow: an admin/receptionist either Matches each row to an
 * existing patient (mirrors the message into that patient's Comms
 * timeline) or Dismisses it as spam / wrong number.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Inbox, MessageCircle, Search, X as XIcon, Check, Loader2, AlertTriangle,
  PhoneCall, ChevronLeft,
} from "lucide-react";
import { Card, EmptyState, CardListSkeleton } from "@/components/ui";
import { usePatients } from "@/hooks/use-queries";
import { cn } from "@/lib/utils";

interface UnmatchedRow {
  id: string;
  externalId: string;
  channel: "WHATSAPP" | "SMS";
  fromPhone: string;
  fromName: string | null;
  content: string;
  receivedAt: string;
  status: "UNMATCHED" | "MATCHED" | "DISMISSED";
}

interface PatientLite {
  id: string;
  firstName: string;
  lastName: string;
  patientCode: string;
  phone: string | null;
}

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60)         return "just now";
  if (diff < 3600)       return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)      return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400)  return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export default function WhatsAppInboxPage() {
  const [statusFilter, setStatusFilter] = useState<"UNMATCHED" | "MATCHED" | "DISMISSED">("UNMATCHED");
  const [matching, setMatching] = useState<UnmatchedRow | null>(null);
  const qc = useQueryClient();

  const inboxQuery = useQuery({
    queryKey: ["whatsapp-inbox", statusFilter],
    queryFn: async (): Promise<UnmatchedRow[]> => {
      const r = await fetch(`/api/admin/whatsapp/inbox?status=${statusFilter}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    refetchInterval: 15000,
  });

  // Get UNMATCHED count separately so the filter pill shows a live badge
  // even when viewing other statuses.
  const unmatchedCountQuery = useQuery({
    queryKey: ["whatsapp-inbox-count"],
    queryFn: async (): Promise<number> => {
      const r = await fetch(`/api/admin/whatsapp/inbox?status=UNMATCHED&limit=200`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return (j.data as unknown[]).length;
    },
    refetchInterval: 30000,
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/admin/whatsapp/inbox/${id}/dismiss`, { method: "POST" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp-inbox"] });
      qc.invalidateQueries({ queryKey: ["whatsapp-inbox-count"] });
    },
  });

  const rows = inboxQuery.data ?? [];
  const unmatchedCount = unmatchedCountQuery.data ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="ADMIN-WHATSAPP-INBOX">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/whatsapp"
            className="p-1.5 -m-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
            aria-label="Back to WhatsApp"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-md">
            <Inbox className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 leading-tight">Unmatched Inbox</h1>
            <p className="text-sm text-stone-500 mt-0.5">Inbound messages from unknown numbers — match to a patient or dismiss</p>
          </div>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {([
          { value: "UNMATCHED" as const, label: "Unmatched", count: unmatchedCount as number | undefined, tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
          { value: "MATCHED" as const,   label: "Matched",   count: undefined,                            tone: "text-blue-700 bg-blue-50 border-blue-200" },
          { value: "DISMISSED" as const, label: "Dismissed", count: undefined,                            tone: "text-stone-700 bg-stone-100 border-stone-200" },
        ]).map((p) => (
          <button
            key={p.value}
            onClick={() => setStatusFilter(p.value)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 border",
              statusFilter === p.value ? p.tone + " shadow-sm" : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"
            )}
          >
            {p.label}
            {p.count !== undefined && p.count > 0 && (
              <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full",
                statusFilter === p.value ? "bg-white/40" : "bg-emerald-500 text-white"
              )}>{p.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      {inboxQuery.isLoading ? (
        <CardListSkeleton rows={5} />
      ) : inboxQuery.isError ? (
        <Card padding="lg">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-semibold">Couldn&apos;t load inbox</span>
          </div>
          <p className="text-xs text-red-500 mt-1">{(inboxQuery.error as Error)?.message}</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={<Inbox className="w-8 h-8" />}
            title={statusFilter === "UNMATCHED" ? "Inbox zero" : `No ${statusFilter.toLowerCase()} messages`}
            description={statusFilter === "UNMATCHED"
              ? "Every inbound message has been triaged. New ones from unknown numbers will appear here."
              : "Switch filter to see other messages."}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <InboundCard
              key={row.id}
              row={row}
              onMatch={() => setMatching(row)}
              onDismiss={() => dismiss.mutate(row.id)}
              dismissing={dismiss.isPending && dismiss.variables === row.id}
            />
          ))}
        </div>
      )}

      {matching && (
        <MatchDrawer
          row={matching}
          onClose={() => setMatching(null)}
          onMatched={() => {
            setMatching(null);
            qc.invalidateQueries({ queryKey: ["whatsapp-inbox"] });
            qc.invalidateQueries({ queryKey: ["whatsapp-inbox-count"] });
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function InboundCard({ row, onMatch, onDismiss, dismissing }: {
  row: UnmatchedRow;
  onMatch: () => void;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  const isUnmatched = row.status === "UNMATCHED";
  return (
    <article className={cn(
      "bg-white rounded-2xl border-2 transition-all p-3.5",
      isUnmatched ? "border-stone-200 hover:border-emerald-300 hover:shadow-sm" : "border-stone-100 opacity-75"
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          row.channel === "SMS" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
        )}>
          <MessageCircle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-bold text-stone-900">{row.fromName ?? "Unknown sender"}</span>
            <span className="text-[10px] font-mono text-stone-500">+{row.fromPhone}</span>
            <span className="text-[10px] text-stone-400 ml-auto">{fmtTime(row.receivedAt)}</span>
          </div>
          <p className="text-[13px] text-stone-700 leading-snug whitespace-pre-wrap break-words">{row.content}</p>
          {isUnmatched && (
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-stone-100">
              <button
                onClick={onMatch}
                className="px-3 py-1.5 rounded-md text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Check className="w-3 h-3" />
                Match to patient
              </button>
              <button
                onClick={onDismiss}
                disabled={dismissing}
                className="px-3 py-1.5 rounded-md text-[11px] font-semibold text-stone-600 hover:text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors flex items-center gap-1"
              >
                {dismissing
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <XIcon className="w-3 h-3" />}
                Dismiss
              </button>
              <a
                href={`tel:+${row.fromPhone}`}
                className="ml-auto text-[10px] text-stone-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
              >
                <PhoneCall className="w-3 h-3" /> Call
              </a>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────────────────────── */

function MatchDrawer({ row, onClose, onMatched }: {
  row: UnmatchedRow;
  onClose: () => void;
  onMatched: () => void;
}) {
  const [query, setQuery] = useState(row.fromName ?? row.fromPhone);
  const { data } = usePatients(query.trim().length >= 2 ? { search: query.trim(), limit: "10" } : undefined);
  const patients = useMemo<PatientLite[]>(() => {
    return ((data?.data ?? []) as PatientLite[]).slice(0, 10);
  }, [data]);

  const match = useMutation({
    mutationFn: async (patientId: string) => {
      const r = await fetch(`/api/admin/whatsapp/inbox/${row.id}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
    },
    onSuccess: () => onMatched(),
  });

  return (
    <div className="fixed inset-0 z-40">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 bottom-0 right-0 w-full sm:w-[460px] bg-stone-50 flex flex-col"
      >
        <header className="shrink-0 pl-16 pr-5 sm:px-5 pt-5 pb-3 border-b border-stone-200 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-md shrink-0">
                <Check className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-stone-900 leading-tight">Match to patient</h2>
                <p className="text-[11px] text-stone-500 leading-tight mt-0.5">
                  From {row.fromName ?? "Unknown"} (+{row.fromPhone})
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 -m-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Original message preview */}
        <div className="shrink-0 px-5 py-3 border-b border-stone-200 bg-white">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">Message</p>
          <p className="text-xs text-stone-700 whitespace-pre-wrap break-words bg-stone-50/60 rounded-lg px-3 py-2 border border-stone-100">
            {row.content}
          </p>
        </div>

        {/* Patient search */}
        <div className="shrink-0 px-5 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, phone, or patient code…"
              className="w-full pl-10 pr-3 py-2 text-sm rounded-xl border-2 border-stone-200 focus:border-emerald-400 focus:outline-none bg-white"
            />
          </div>
        </div>

        {/* Candidate list */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-1.5">
          {query.trim().length < 2 ? (
            <p className="text-[11px] text-stone-400 italic px-1">Type at least 2 characters to search.</p>
          ) : patients.length === 0 ? (
            <p className="text-[11px] text-stone-400 italic px-1">No patients match.</p>
          ) : (
            patients.map((p) => (
              <button
                key={p.id}
                onClick={() => match.mutate(p.id)}
                disabled={match.isPending}
                className="w-full text-left bg-white rounded-xl border border-stone-200 hover:border-emerald-300 hover:shadow-sm transition-all px-3 py-2.5 flex items-center gap-3 disabled:opacity-60"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-xs font-semibold shrink-0">
                  {(p.firstName?.[0] ?? "") + (p.lastName?.[0] ?? "")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-stone-900 truncate">{p.firstName} {p.lastName}</p>
                  <p className="text-[10px] text-stone-500 font-mono">{p.patientCode}{p.phone ? ` · ${p.phone}` : ""}</p>
                </div>
                {match.isPending && match.variables === p.id && (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                )}
              </button>
            ))
          )}
          {match.isError && (
            <p className="text-[11px] text-red-600 px-1 pt-2">{(match.error as Error).message}</p>
          )}
        </div>
      </aside>
    </div>
  );
}

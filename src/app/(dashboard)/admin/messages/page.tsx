"use client";

/**
 * Cross-patient messages inbox — single page showing every recent
 * conversation across all patients. Click a row to deep-link into
 * the patient's Comms tab. Polls every 20s.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Inbox, MessageCircle, Search, Image as ImageIcon, FileText,
  Mic, Video as VideoIcon, ArrowDownLeft, ArrowUpRight, Loader2,
} from "lucide-react";
import { Card, EmptyState, CardListSkeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread" | "inbound" | "outbound";

interface ThreadRow {
  patientId: string;
  patientName: string;
  patientCode: string;
  phone: string | null;
  lastMessage: {
    id: string;
    type: string;
    direction: "INBOUND" | "OUTBOUND";
    content: string;
    mediaUrl: string | null;
    mediaMimeType: string | null;
    createdAt: string;
  };
  unreadCount: number;
  totalCount: number;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function mediaIcon(mime: string | null) {
  if (!mime) return null;
  if (mime.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (mime.startsWith("video/")) return <VideoIcon className="h-4 w-4" />;
  if (mime.startsWith("audio/")) return <Mic className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

export default function CrossPatientMessagesPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const threadsQ = useQuery({
    queryKey: ["messages-inbox", filter, q],
    queryFn: async (): Promise<ThreadRow[]> => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filter", filter);
      if (q.trim()) params.set("q", q.trim());
      const r = await fetch(`/api/admin/messages?${params}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to load");
      return j.data;
    },
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const threads = threadsQ.data ?? [];
  const totals = useMemo(() => {
    const unread = threads.reduce((s, t) => s + t.unreadCount, 0);
    return { conversations: threads.length, unread };
  }, [threads]);

  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: "all",      label: "All" },
    { id: "unread",   label: "Unread", count: totals.unread || undefined },
    { id: "inbound",  label: "Inbound" },
    { id: "outbound", label: "Outbound" },
  ];

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-5">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-blue-600" />
          <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        </div>
        <p className="text-sm text-gray-500">
          Every conversation across patients — newest first.
        </p>
      </header>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by patient, phone, or message"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap border",
                filter === f.id
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              )}
            >
              {f.label}
              {typeof f.count === "number" && (
                <span className={cn(
                  "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
                  filter === f.id ? "bg-white/20" : "bg-blue-100 text-blue-700"
                )}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {threadsQ.isLoading ? (
        <CardListSkeleton rows={6} />
      ) : threadsQ.isError ? (
        <Card>
          <div className="p-6 text-sm text-red-600">
            Couldn’t load messages — {(threadsQ.error as Error).message}
          </div>
        </Card>
      ) : threads.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-7 w-7" />}
          title="No conversations"
          description={
            filter === "unread"
              ? "You're all caught up. No unread inbound messages."
              : "Messages will appear here as patients reply to your WhatsApp or SMS."
          }
        />
      ) : (
        <Card>
          <div className="divide-y divide-gray-100">
          {threads.map((t) => {
            const inbound = t.lastMessage.direction === "INBOUND";
            const preview = t.lastMessage.content || (t.lastMessage.mediaMimeType ? "Attachment" : "");
            return (
              <Link
                key={t.patientId}
                href={`/patients/${t.patientId}?tab=comms`}
                className="flex items-start gap-3 p-4 hover:bg-blue-50/40 transition-colors"
              >
                <div className={cn(
                  "shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
                  inbound ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
                )}>
                  {inbound
                    ? <ArrowDownLeft className="h-5 w-5" />
                    : <ArrowUpRight className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-gray-900 truncate">{t.patientName}</span>
                      <span className="shrink-0 text-[10px] font-mono text-gray-400">{t.patientCode}</span>
                    </div>
                    <span className="shrink-0 text-xs text-gray-500">{fmtTime(t.lastMessage.createdAt)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                    {mediaIcon(t.lastMessage.mediaMimeType)}
                    <span className="truncate">
                      {!inbound && <span className="text-gray-400">You: </span>}
                      {preview}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px]">
                    <span className="text-gray-400">{t.lastMessage.type}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-400">{t.totalCount} message{t.totalCount === 1 ? "" : "s"}</span>
                    {t.unreadCount > 0 && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white font-semibold">
                          {t.unreadCount} new
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
          </div>
        </Card>
      )}

      {threadsQ.isFetching && !threadsQ.isLoading && (
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" /> refreshing
        </div>
      )}
    </div>
  );
}

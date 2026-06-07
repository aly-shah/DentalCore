"use client";

/**
 * Notifications & Updates hub — a dedicated sidebar destination that
 * combines the bell notifications for the current user with the clinic's
 * Voice Note Updates (pending recordings + AI-flagged follow-ups).
 */
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { VoiceNoteUpdates } from "@/components/dashboard/voice-note-updates";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading";
import { cn, formatDate } from "@/lib/utils";

interface Notif {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-notifications", user?.id],
    queryFn: async () => {
      const r = await fetch(`/api/notifications?userId=${user?.id}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to load notifications");
      return j as { data: Notif[]; unreadCount: number };
    },
    enabled: !!user?.id,
    refetchInterval: 60_000,
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true, userId: user?.id }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });

  const notifications = data?.data ?? [];
  const unread = data?.unreadCount ?? 0;
  const isDoctor = user?.role === "DOCTOR";

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-fade-in" data-id="NOTIFICATIONS-PAGE">
      <div className="flex items-center gap-2">
        <Bell className="w-5 h-5 text-blue-600" />
        <h1 className="text-lg sm:text-xl font-bold text-stone-900">Notifications &amp; Updates</h1>
      </div>

      {/* Voice note updates — pending recordings + AI-flagged follow-ups.
          Doctors see their own; admin/front-desk see clinic-wide. */}
      <VoiceNoteUpdates doctorId={isDoctor ? user?.id : undefined} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-900">
              Notifications{unread > 0 ? ` · ${unread} unread` : ""}
            </span>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-stone-100">
          {isLoading ? (
            <div className="py-8 flex justify-center"><LoadingSpinner /></div>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">You&apos;re all caught up.</p>
          ) : (
            notifications.map((n) => {
              const body = (
                <div className={cn("p-3 flex items-start gap-3", !n.isRead && "bg-blue-50/40")}>
                  <span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", n.isRead ? "bg-stone-200" : "bg-blue-500")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-900">{n.title}</p>
                    <p className="text-xs text-stone-500">{n.message}</p>
                    <p className="text-[10px] text-stone-400 mt-0.5">{formatDate(n.createdAt)}</p>
                  </div>
                </div>
              );
              return n.link
                ? <Link key={n.id} href={n.link} className="block hover:bg-stone-50">{body}</Link>
                : <div key={n.id}>{body}</div>;
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

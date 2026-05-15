"use client";

/**
 * Front-desk inbox for online booking requests submitted via /book.
 * Each row can be confirmed (creates Patient if needed + Appointment)
 * or rejected (notifies the requester).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, Inbox, Clock, User, Phone, Mail, Stethoscope, Check, X as XIcon,
  Loader2, AlertTriangle, CalendarCheck, MessageCircle,
} from "lucide-react";
import { Card, EmptyState, CardListSkeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

type Status = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";

interface BookingRow {
  id: string;
  status: Status;
  source: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  treatmentName: string | null;
  preferredDate: string;
  preferredStart: string;
  preferredEnd: string;
  appointmentId: string | null;
  rejectionReason: string | null;
  doctor: { id: string; name: string } | null;
  patient: { id: string; firstName: string; lastName: string; patientCode: string } | null;
  branch: { id: string; name: string } | null;
  createdAt: string;
}

interface DoctorOpt { id: string; name: string }

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function BookingRequestsPage() {
  const [status, setStatus] = useState<Status>("PENDING");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<BookingRow | null>(null);
  const qc = useQueryClient();

  const rowsQ = useQuery({
    queryKey: ["booking-requests", status, q],
    queryFn: async (): Promise<BookingRow[]> => {
      const params = new URLSearchParams({ status });
      if (q.trim()) params.set("q", q.trim());
      const r = await fetch(`/api/admin/booking-requests?${params}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "load_failed");
      return j.data;
    },
    refetchInterval: 30_000,
  });

  const rows = rowsQ.data ?? [];
  const counts = useMemo(() => ({
    pending: rows.filter((r) => r.status === "PENDING").length,
  }), [rows]);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-blue-600" />
          <h1 className="text-2xl font-semibold tracking-tight">Online bookings</h1>
        </div>
        <p className="text-sm text-gray-500">Requests from /book — confirm to create an appointment.</p>
      </header>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 overflow-x-auto">
          {(["PENDING", "CONFIRMED", "REJECTED", "CANCELLED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap border",
                status === s
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              )}
            >
              {s.charAt(0) + s.slice(1).toLowerCase()}
              {s === "PENDING" && counts.pending > 0 && status !== s && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold">
                  {counts.pending}
                </span>
              )}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, phone, email…"
          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {rowsQ.isLoading ? (
        <CardListSkeleton rows={6} />
      ) : rowsQ.isError ? (
        <Card><div className="p-6 text-sm text-red-600">Couldn't load — {(rowsQ.error as Error).message}</div></Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="h-7 w-7" />}
          title={status === "PENDING" ? "No pending bookings" : `No ${status.toLowerCase()} bookings`}
          description="Requests submitted from the public /book page will appear here."
        />
      ) : (
        <Card>
          <div className="divide-y divide-gray-100">
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => setActive(r)}
                className="w-full text-left p-4 hover:bg-blue-50/40 transition-colors flex items-start gap-3"
              >
                <div className="shrink-0 h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Calendar className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900 truncate">{r.name}</span>
                    <span className="shrink-0 text-xs text-gray-500">{timeAgo(r.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {fmtDate(r.preferredDate)} · {r.preferredStart}–{r.preferredEnd}
                    {r.treatmentName && <span className="text-gray-400"> · {r.treatmentName}</span>}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{r.phone}</span>
                    {r.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{r.email}</span>}
                    {r.doctor && <span className="inline-flex items-center gap-1"><Stethoscope className="w-3 h-3" />{r.doctor.name}</span>}
                    {r.patient && (
                      <Link
                        href={`/patients/${r.patient.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-600 hover:underline"
                      >
                        {r.patient.patientCode}
                      </Link>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {active && (
        <DetailDrawer
          row={active}
          onClose={() => setActive(null)}
          onDone={() => {
            setActive(null);
            qc.invalidateQueries({ queryKey: ["booking-requests"] });
          }}
        />
      )}
    </div>
  );
}

function DetailDrawer({
  row, onClose, onDone,
}: {
  row: BookingRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [doctorId, setDoctorId] = useState<string>(row.doctor?.id ?? "");
  const [notes, setNotes] = useState<string>(row.notes ?? "");
  const [notify, setNotify] = useState(true);
  const [rejectReason, setRejectReason] = useState("");
  const [mode, setMode] = useState<"confirm" | "reject">("confirm");

  const doctorsQ = useQuery({
    queryKey: ["booking-requests", "doctors"],
    queryFn: async (): Promise<DoctorOpt[]> => {
      const r = await fetch("/api/booking/options");
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "load_failed");
      return j.data.doctors;
    },
  });

  const confirm = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/booking-requests/${row.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId: doctorId || undefined, notes, notify }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "confirm_failed");
      return j.data;
    },
    onSuccess: onDone,
  });

  const reject = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/booking-requests/${row.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason || undefined, notify }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "reject_failed");
    },
    onSuccess: onDone,
  });

  const canConfirm = row.status === "PENDING" && !!doctorId;
  const canReject  = row.status === "PENDING";

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="w-full max-w-md bg-white h-full overflow-y-auto shadow-xl">
        <header className="flex items-center justify-between p-4 border-b border-stone-100">
          <h3 className="font-semibold text-stone-900">Booking request</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-md"><XIcon className="w-4 h-4" /></button>
        </header>

        <div className="p-4 space-y-3 text-sm">
          <div className="bg-stone-50 rounded-xl p-3 space-y-1">
            <p className="font-semibold text-stone-900">{row.name}</p>
            <p className="text-stone-600"><Phone className="inline w-3.5 h-3.5 mr-1.5 text-stone-400" />{row.phone}</p>
            {row.email && <p className="text-stone-600"><Mail className="inline w-3.5 h-3.5 mr-1.5 text-stone-400" />{row.email}</p>}
            {row.patient ? (
              <p className="text-xs text-emerald-600">Existing patient · {row.patient.patientCode}</p>
            ) : (
              <p className="text-xs text-amber-600">New contact — patient row will be created on confirm</p>
            )}
          </div>

          <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3 space-y-1">
            <p className="text-xs uppercase tracking-wider font-semibold text-blue-700">Requested slot</p>
            <p className="text-stone-900 font-medium">
              <Calendar className="inline w-3.5 h-3.5 mr-1.5 text-blue-500" />
              {fmtDate(row.preferredDate)}
              <Clock className="inline w-3.5 h-3.5 ml-3 mr-1.5 text-blue-500" />
              {row.preferredStart}–{row.preferredEnd}
            </p>
            {row.treatmentName && <p className="text-stone-600">{row.treatmentName}</p>}
            {row.notes && <p className="text-xs text-stone-500 italic">"{row.notes}"</p>}
          </div>

          {row.status === "PENDING" && (
            <>
              <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
                <button
                  onClick={() => setMode("confirm")}
                  className={cn("flex-1 py-1.5 rounded-md text-xs font-semibold",
                    mode === "confirm" ? "bg-emerald-600 text-white" : "text-stone-600")}>
                  <Check className="inline w-3.5 h-3.5 mr-1" /> Confirm
                </button>
                <button
                  onClick={() => setMode("reject")}
                  className={cn("flex-1 py-1.5 rounded-md text-xs font-semibold",
                    mode === "reject" ? "bg-red-600 text-white" : "text-stone-600")}>
                  <XIcon className="inline w-3.5 h-3.5 mr-1" /> Reject
                </button>
              </div>

              {mode === "confirm" && (
                <>
                  <Field label="Doctor">
                    <select
                      value={doctorId}
                      onChange={(e) => setDoctorId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
                    >
                      <option value="">— pick a doctor —</option>
                      {(doctorsQ.data ?? []).map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Appointment notes (optional)">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm resize-none"
                    />
                  </Field>
                  <label className="inline-flex items-center gap-2 text-xs text-stone-600">
                    <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                    Send confirmation to patient
                  </label>
                  {confirm.isError && (
                    <p className="text-xs text-red-600 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {(confirm.error as Error).message}
                    </p>
                  )}
                  <button
                    onClick={() => confirm.mutate()}
                    disabled={!canConfirm || confirm.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:bg-stone-300"
                  >
                    {confirm.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
                    Confirm and create appointment
                  </button>
                </>
              )}

              {mode === "reject" && (
                <>
                  <Field label="Reason (optional, sent to patient)">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      placeholder="e.g. The doctor is fully booked that day — please pick another time."
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm resize-none"
                    />
                  </Field>
                  <label className="inline-flex items-center gap-2 text-xs text-stone-600">
                    <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                    Send rejection message
                  </label>
                  {reject.isError && (
                    <p className="text-xs text-red-600 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {(reject.error as Error).message}
                    </p>
                  )}
                  <button
                    onClick={() => reject.mutate()}
                    disabled={!canReject || reject.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:bg-stone-300"
                  >
                    {reject.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XIcon className="w-4 h-4" />}
                    Reject request
                  </button>
                </>
              )}
            </>
          )}

          {row.status === "CONFIRMED" && row.appointmentId && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 inline-flex items-center gap-2">
              <CheckIcon /> Confirmed.{" "}
              <Link href={`/calendar?focus=${row.appointmentId}`} className="underline">
                View appointment
              </Link>
            </div>
          )}
          {row.status === "REJECTED" && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              Rejected.{row.rejectionReason && <> Reason: {row.rejectionReason}</>}
            </div>
          )}
          {row.status === "PENDING" && (
            <div className="pt-2 text-[11px] text-stone-400 inline-flex items-center gap-1">
              <MessageCircle className="w-3 h-3" />
              Confirmation goes via WhatsApp (or SMS / Email fallback).
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-stone-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function CheckIcon() { return <Check className="w-4 h-4 inline" />; }

"use client";

/**
 * Patient Portal — read-only view of a patient's upcoming visits,
 * invoices, prescriptions, and pending follow-ups. Accessed via a
 * tokenized link (?t=TOKEN). No password — the token is the credential.
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Calendar, Pill, Receipt, CalendarClock, AlertTriangle,
  CheckCircle2, Stethoscope, Loader2, CreditCard,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatDate, formatCurrency } from "@/lib/utils";

interface PortalData {
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    patientCode: string;
    phone: string | null;
    email: string | null;
    outstandingBalance: number;
  };
  appointments: {
    id: string;
    appointmentCode: string;
    date: string;
    startTime: string;
    endTime: string;
    type: string;
    status: string;
    doctor: { name: string } | null;
  }[];
  invoices: {
    id: string;
    invoiceNumber: string;
    total: number;
    amountPaid: number;
    balanceDue: number;
    status: string;
    dueDate: string | null;
    createdAt: string;
  }[];
  prescriptions: {
    id: string;
    createdAt: string;
    items: { medicineName: string; dosage: string | null; frequency: string | null; duration: string | null }[];
  }[];
  followUps: {
    id: string;
    reason: string;
    dueDate: string | null;
    status: string;
  }[];
}

export default function PatientPortalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    }>
      <PortalInner />
    </Suspense>
  );
}

function PortalInner() {
  const params = useSearchParams();
  const token = params.get("t");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PortalData | null>(null);
  const [tab, setTab] = useState<"visits" | "billing" | "rx" | "followups">("visits");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const pay = async (invoiceId: string) => {
    if (!token) return;
    setPayingId(invoiceId);
    setPayError(null);
    try {
      const r = await fetch(`/api/portal/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, invoiceId }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "checkout_failed");
      window.location.href = j.data.checkoutUrl;
    } catch (e) {
      setPayError((e as Error).message);
      setPayingId(null);
    }
  };

  useEffect(() => {
    if (!token) {
      setError("missing_token");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/portal/data?t=${encodeURIComponent(token)}`);
        const j = await r.json();
        if (cancelled) return;
        if (!j.success) {
          setError(j.error || "load_failed");
        } else {
          setData(j.data);
        }
      } catch {
        if (!cancelled) setError("network_error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !data) {
    const messages: Record<string, { title: string; body: string }> = {
      missing_token:  { title: "Link required",   body: "Your access link is incomplete. Please open the full link from your clinic." },
      invalid_token:  { title: "Link not found",  body: "This portal link isn't valid. Ask your clinic to send a new one." },
      revoked:        { title: "Link revoked",    body: "This link was revoked. Please contact the clinic for a new one." },
      expired:        { title: "Link expired",    body: "This link has expired. Please contact the clinic for a new one." },
      network_error:  { title: "Connection problem", body: "Can't reach the portal. Check your connection and try again." },
      load_failed:    { title: "Couldn't load",    body: "Something went wrong loading your records. Please try again." },
    };
    const m = messages[error ?? "load_failed"] ?? messages.load_failed;
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <Card className="max-w-sm w-full">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 mx-auto flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="font-semibold text-stone-900">{m.title}</h2>
            <p className="text-sm text-stone-500 mt-1">{m.body}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const name = `${data.patient.firstName} ${data.patient.lastName}`;
  const upcoming = data.appointments.filter((a) => new Date(a.date) >= new Date(new Date().setHours(0, 0, 0, 0)));
  const past = data.appointments.filter((a) => new Date(a.date) < new Date(new Date().setHours(0, 0, 0, 0)));
  const openInvoices = data.invoices.filter((i) => ["PENDING", "PARTIAL", "OVERDUE"].includes(i.status));
  const balanceDue = openInvoices.reduce((s, i) => s + i.balanceDue, 0);

  const tabs = [
    { id: "visits" as const,    label: "Visits",       count: data.appointments.length, icon: <Calendar      className="w-4 h-4" /> },
    { id: "billing" as const,   label: "Billing",      count: data.invoices.length,     icon: <Receipt       className="w-4 h-4" /> },
    { id: "rx" as const,        label: "Prescriptions",count: data.prescriptions.length,icon: <Pill          className="w-4 h-4" /> },
    { id: "followups" as const, label: "Follow-ups",   count: data.followUps.length,    icon: <CalendarClock className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-stone-50 pb-12">
      {/* ── Header ── */}
      <div className="bg-white border-b border-stone-100">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Avatar name={name} size="md" className="ring-2 ring-blue-200" />
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-stone-900 truncate">{name}</h1>
            <p className="text-xs text-stone-400">{data.patient.patientCode}</p>
          </div>
          <Stethoscope className="w-5 h-5 text-blue-500 shrink-0" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* ── Summary card ── */}
        <Card>
          <CardContent className="p-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase font-semibold text-stone-400">Next visit</p>
              {upcoming.length > 0 ? (
                <>
                  <p className="text-sm font-bold text-stone-900 mt-0.5">
                    {formatDate(upcoming[upcoming.length - 1].date)} · {upcoming[upcoming.length - 1].startTime}
                  </p>
                  <p className="text-xs text-stone-500">
                    {upcoming[upcoming.length - 1].doctor?.name ?? "Doctor"}
                  </p>
                </>
              ) : (
                <p className="text-sm text-stone-500 mt-0.5">No upcoming visits</p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-stone-400">Balance</p>
              <p className={`text-sm font-bold mt-0.5 ${balanceDue > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {formatCurrency(balanceDue)}
              </p>
              <p className="text-xs text-stone-500">
                {openInvoices.length} open invoice{openInvoices.length === 1 ? "" : "s"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Tabs ── */}
        <div className="flex gap-1.5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
                tab === t.id
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-white text-stone-500 border-stone-200"
              }`}
            >
              {t.icon} {t.label}
              <span className="text-[10px] opacity-60">({t.count})</span>
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        {tab === "visits" && (
          <div className="space-y-2">
            {upcoming.length > 0 && (
              <>
                <p className="text-[11px] uppercase font-semibold text-stone-400 px-1">Upcoming</p>
                {upcoming.map((a) => <AppointmentRow key={a.id} a={a} />)}
              </>
            )}
            {past.length > 0 && (
              <>
                <p className="text-[11px] uppercase font-semibold text-stone-400 px-1 pt-2">Past</p>
                {past.slice(0, 6).map((a) => <AppointmentRow key={a.id} a={a} />)}
              </>
            )}
            {data.appointments.length === 0 && <Empty text="No visits on record" />}
          </div>
        )}

        {tab === "billing" && (
          <div className="space-y-2">
            {payError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                Couldn't start payment: {payError}
              </p>
            )}
            {data.invoices.length === 0
              ? <Empty text="No invoices on record" />
              : data.invoices.map((inv) => {
                const payable = inv.balanceDue > 0 && inv.status !== "PAID" && inv.status !== "CANCELLED";
                return (
                  <Card key={inv.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                          <Receipt className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900 truncate">{inv.invoiceNumber}</p>
                          <p className="text-xs text-stone-400">{formatDate(inv.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-stone-900">{formatCurrency(inv.total)}</p>
                          <Badge
                            variant={inv.status === "PAID" ? "success" : inv.status === "OVERDUE" ? "danger" : "warning"}
                            className="text-[10px]"
                          >
                            {inv.status}
                          </Badge>
                        </div>
                      </div>
                      {payable && (
                        <button
                          onClick={() => pay(inv.id)}
                          disabled={payingId === inv.id}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-60 hover:bg-blue-700 transition-colors"
                        >
                          {payingId === inv.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <CreditCard className="w-4 h-4" />}
                          Pay {formatCurrency(inv.balanceDue)}
                        </button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        )}

        {tab === "rx" && (
          <div className="space-y-2">
            {data.prescriptions.length === 0
              ? <Empty text="No prescriptions on record" />
              : data.prescriptions.map((rx) => (
                <Card key={rx.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Pill className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-medium text-stone-900">{formatDate(rx.createdAt)}</span>
                    </div>
                    {rx.items.map((it, j) => (
                      <p key={j} className="text-xs text-stone-600 ml-6">
                        {it.medicineName}
                        {it.dosage    && ` · ${it.dosage}`}
                        {it.frequency && ` · ${it.frequency}`}
                        {it.duration  && ` for ${it.duration}`}
                      </p>
                    ))}
                  </CardContent>
                </Card>
              ))}
          </div>
        )}

        {tab === "followups" && (
          <div className="space-y-2">
            {data.followUps.length === 0
              ? <Empty text="No follow-ups scheduled" />
              : data.followUps.map((fu) => (
                <Card key={fu.id}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                      <CalendarClock className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900">{fu.reason}</p>
                      <p className="text-xs text-stone-400">
                        Due {fu.dueDate ? formatDate(fu.dueDate) : "TBD"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}

        <p className="text-center text-[11px] text-stone-400 pt-4">
          Read-only view · Powered by DentaCore
        </p>
      </div>
    </div>
  );
}

function AppointmentRow({ a }: { a: PortalData["appointments"][number] }) {
  const completed = a.status === "COMPLETED";
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          completed ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
        }`}>
          {completed ? <CheckCircle2 className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-900">
            {a.type.replace(/_/g, " ")} · {formatDate(a.date)}
          </p>
          <p className="text-xs text-stone-400">
            {a.startTime} · {a.doctor?.name ?? "Doctor"}
          </p>
        </div>
        <Badge
          variant={a.status === "COMPLETED" ? "success" : a.status === "CANCELLED" ? "danger" : "info"}
          className="text-[10px]"
        >
          {a.status.replace(/_/g, " ")}
        </Badge>
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-stone-400">{text}</div>;
}

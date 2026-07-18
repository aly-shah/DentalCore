"use client";

import { useEffect, useState } from "react";
import {
  Plus, Trash2, CheckCircle, Clock, Stethoscope, Phone,
  MessageCircle, Mail, Printer, Loader2,
} from "lucide-react";
import { SlidePanel } from "@/components/ui/slide-panel";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { appointmentStatusColors } from "@/lib/constants";
import { useAuth } from "@/lib/auth-context";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import {
  useCheckInAppointment,
  useInvoiceByAppointment,
  useCreateInvoice,
  useUpdateInvoice,
  useEmailInvoice,
  useWhatsappInvoice,
} from "@/hooks/use-queries";

type Apt = Record<string, unknown>;

interface LineItem {
  id: string;
  description: string;
  type: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface ScheduleActionPanelProps {
  appointment: Apt | null;
  isOpen: boolean;
  onClose: () => void;
  /** Raise above another slide-over when opened from one (e.g. appointment detail). */
  elevated?: boolean;
}

// ---- defensive field extraction (appointment shape varies by endpoint) ----
function patientName(a: Apt): string {
  if (a.patientName) return String(a.patientName);
  const p = a.patient as Apt | undefined;
  if (p?.firstName) return `${p.firstName} ${p.lastName || ""}`.trim();
  return "Patient";
}
function patientId(a: Apt): string | null {
  if (typeof a.patientId === "string" && a.patientId) return a.patientId;
  const p = a.patient as Apt | undefined;
  return p && typeof p.id === "string" && p.id ? p.id : null;
}
function patientPhone(a: Apt): string | null {
  const p = a.patient as Apt | undefined;
  return (p?.phone as string) || (a.patientPhone as string) || null;
}
function patientCode(a: Apt): string | null {
  const p = a.patient as Apt | undefined;
  return (p?.patientCode as string) || null;
}
function doctorName(a: Apt): string {
  if (a.doctorName) return String(a.doctorName);
  const d = a.doctor as Apt | undefined;
  return d?.name ? String(d.name) : "Unassigned";
}
function aptTime(a: Apt): string {
  return (a.startTime as string) || (a.time as string) || "";
}

const CHECKIN_STATES = new Set(["SCHEDULED", "CONFIRMED"]);
const blankItem = (): LineItem => ({
  id: `new-${Math.round(performance.now())}-${Math.random().toString(36).slice(2, 7)}`,
  description: "",
  type: "PROCEDURE",
  quantity: 1,
  unitPrice: 0,
  total: 0,
});

export function ScheduleActionPanel({ appointment, isOpen, onClose, elevated }: ScheduleActionPanelProps) {
  const { user } = useAuth();
  const emit = useModuleEmit("MOD-BILLING");

  const aptId = appointment ? String(appointment.id ?? "") : "";
  const pid = appointment ? patientId(appointment) : null;
  const status = appointment ? String(appointment.status ?? "SCHEDULED") : "SCHEDULED";

  const checkIn = useCheckInAppointment();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const emailInvoice = useEmailInvoice();
  const whatsappInvoice = useWhatsappInvoice();

  const invoiceQuery = useInvoiceByAppointment(aptId, isOpen);
  const invoice = ((invoiceQuery.data as { data?: unknown[] } | undefined)?.data?.[0] ?? null) as
    | (Record<string, unknown> & { id: string; invoiceNumber: string; items?: LineItem[]; amountPaid?: number })
    | null;

  const [items, setItems] = useState<LineItem[]>([blankItem()]);
  const [discount, setDiscount] = useState(0);
  const [seedKey, setSeedKey] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<null | "save" | "whatsapp" | "email" | "print" | "checkin">(null);

  // Seed the editable items from the server invoice whenever a different
  // invoice (or a different appointment) loads. Keyed so in-flight edits
  // aren't clobbered by an unrelated refetch.
  const currentKey = invoice?.id ? `inv:${invoice.id}` : `apt:${aptId}`;
  useEffect(() => {
    if (!isOpen || invoiceQuery.isLoading) return;
    if (currentKey === seedKey) return;
    if (invoice?.items?.length) {
      setItems(
        invoice.items.map((it) => ({
          id: String(it.id),
          description: it.description ?? "",
          type: it.type ?? "PROCEDURE",
          quantity: Number(it.quantity ?? 1),
          unitPrice: Number(it.unitPrice ?? 0),
          total: Number(it.total ?? 0),
        }))
      );
    } else {
      setItems([blankItem()]);
    }
    setDiscount(Number(invoice?.discount ?? 0));
    setFeedback(null);
    setSeedKey(currentKey);
  }, [isOpen, currentKey, seedKey, invoice, invoiceQuery.isLoading]);

  const addItem = () => setItems((xs) => [...xs, blankItem()]);
  const removeItem = (id: string) =>
    setItems((xs) => (xs.length > 1 ? xs.filter((x) => x.id !== id) : xs));
  const updateLine = (id: string, field: keyof LineItem, value: string | number) =>
    setItems((xs) =>
      xs.map((x) => {
        if (x.id !== id) return x;
        const next = { ...x, [field]: value };
        if (field === "quantity" || field === "unitPrice") {
          next.total = Number(next.quantity) * Number(next.unitPrice);
        }
        return next;
      })
    );

  const subtotal = items.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const discountAmount = Math.min(discount, subtotal);
  const total = Math.max(0, subtotal - discountAmount);
  const amountPaid = Number(invoice?.amountPaid ?? 0);
  const balanceDue = Math.max(0, total - amountPaid);

  const hasBillableItems = items.some((x) => x.description.trim() && x.total > 0);

  // Persist current edits (create or update) and return the invoice id.
  async function persist(): Promise<string | null> {
    const payload = {
      items: items
        .filter((x) => x.description.trim())
        .map((x) => ({
          description: x.description.trim(),
          type: x.type,
          quantity: Number(x.quantity) || 1,
          unitPrice: Number(x.unitPrice) || 0,
          total: Number(x.total) || 0,
        })),
      subtotal,
      discount: discountAmount,
      discountType: "FIXED",
      tax: 0,
      total,
      balanceDue,
    };
    if (invoice?.id) {
      await updateInvoice.mutateAsync({ id: invoice.id, data: payload });
      return invoice.id;
    }
    if (!pid) return null;
    const res = (await createInvoice.mutateAsync({
      patientId: pid,
      appointmentId: aptId || undefined,
      branchId: user?.branchId,
      createdById: user?.id,
      amountPaid: 0,
      ...payload,
    })) as { data?: { id?: string } } | undefined;
    return res?.data?.id ?? null;
  }

  const handleCheckIn = async () => {
    setBusy("checkin");
    setFeedback(null);
    try {
      await checkIn.mutateAsync(aptId);
      emit(SystemEvents.APPOINTMENT_CHECKED_IN, { patientName: appointment ? patientName(appointment) : "" });
      await invoiceQuery.refetch();
      setFeedback({ ok: true, text: "Patient checked in. A draft invoice is ready below." });
    } catch (e) {
      setFeedback({ ok: false, text: e instanceof Error ? e.message : "Check-in failed" });
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    setBusy("save");
    setFeedback(null);
    try {
      const id = await persist();
      if (!id) throw new Error("Could not save invoice — patient is missing.");
      emit(SystemEvents.INVOICE_CREATED, { total }, pid ? { patientId: pid } : undefined);
      setFeedback({ ok: true, text: "Invoice saved." });
    } catch (e) {
      setFeedback({ ok: false, text: e instanceof Error ? e.message : "Could not save invoice" });
    } finally {
      setBusy(null);
    }
  };

  const handleSend = async (channel: "whatsapp" | "email" | "print") => {
    setBusy(channel);
    setFeedback(null);
    try {
      const id = await persist();
      if (!id) throw new Error("Save the invoice first — patient is missing.");
      if (channel === "print") {
        window.open(`/api/billing/invoices/${id}/print`, "_blank");
        setFeedback({ ok: true, text: "Opened the printable invoice in a new tab." });
      } else if (channel === "whatsapp") {
        const r = (await whatsappInvoice.mutateAsync({ id, data: { includePortalLink: true } })) as { data?: { sentTo?: string } };
        setFeedback({ ok: true, text: `Invoice sent on WhatsApp to ${r?.data?.sentTo ?? "the patient"}.` });
      } else {
        const r = (await emailInvoice.mutateAsync({ id, data: { includePayLink: true } })) as { data?: { sentTo?: string } };
        setFeedback({ ok: true, text: `Invoice emailed to ${r?.data?.sentTo ?? "the patient"}.` });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      const friendly =
        msg.includes("no_phone") ? "No phone number on file for this patient."
        : msg.includes("no_email") ? "No email on file for this patient."
        : msg;
      setFeedback({ ok: false, text: friendly });
    } finally {
      setBusy(null);
    }
  };

  if (!appointment) return null;

  const showCheckIn = CHECKIN_STATES.has(status);
  const statusVariant = (appointmentStatusColors[status] ?? "default") as
    "success" | "warning" | "danger" | "info" | "default";

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={patientName(appointment)}
      subtitle={patientCode(appointment) ? `${patientCode(appointment)} · Appointment` : "Appointment"}
      width="xl"
      elevated={elevated}
      data-id="SCHEDULE-ACTION-PANEL"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleSave} disabled={busy !== null || !hasBillableItems}>
            {busy === "save" ? "Saving…" : invoice?.id ? "Save Invoice" : "Create Invoice"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Appointment summary */}
        <div className="flex items-center gap-3">
          <Avatar name={patientName(appointment)} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-stone-900 truncate">{patientName(appointment)}</p>
              <Badge variant={statusVariant}>{status.replace("_", " ")}</Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-stone-500 mt-0.5">
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{aptTime(appointment) || "—"}</span>
              <span className="inline-flex items-center gap-1"><Stethoscope className="w-3 h-3" />{doctorName(appointment)}</span>
              {patientPhone(appointment) && (
                <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{patientPhone(appointment)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Feedback banner */}
        {feedback && (
          <div className={`text-sm rounded-xl px-4 py-2.5 border ${feedback.ok ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-red-50 border-red-100 text-red-600"}`}>
            {feedback.text}
          </div>
        )}

        {/* Check-in */}
        {showCheckIn && (
          <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-stone-900">Not checked in yet</p>
              <p className="text-xs text-stone-500">Check the patient in to start their visit and open billing.</p>
            </div>
            <Button onClick={handleCheckIn} disabled={busy !== null} iconLeft={busy === "checkin" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}>
              {busy === "checkin" ? "Checking in…" : "Check In"}
            </Button>
          </div>
        )}
        {!showCheckIn && status === "CHECKED_IN" && (
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle className="w-4 h-4" /> Checked in
          </div>
        )}

        {/* Invoice */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Invoice</h3>
              {invoice?.invoiceNumber && <p className="text-xs text-stone-400">{invoice.invoiceNumber}</p>}
            </div>
            <Button variant="ghost" size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={addItem}>
              Add item
            </Button>
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateLine(item.id, "description", e.target.value)}
                  placeholder="Item / service"
                  className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateLine(item.id, "quantity", parseInt(e.target.value) || 1)}
                  className="w-14 px-2 py-2 text-sm text-center border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  aria-label="Quantity"
                />
                <input
                  type="number"
                  min={0}
                  value={item.unitPrice}
                  onChange={(e) => updateLine(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-2 text-sm text-right border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  aria-label="Unit price"
                />
                <span className="w-24 text-sm text-right font-medium text-stone-900">{formatCurrency(item.total)}</span>
                <button onClick={() => removeItem(item.id)} className="p-1 text-stone-400 hover:text-red-500 transition-colors" aria-label="Remove item">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-stone-200 mt-4 pt-4 flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Subtotal</span>
                <span className="text-stone-900">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-sm gap-3">
                <span className="text-stone-500">Discount</span>
                <input
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-sm text-right border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              {amountPaid > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Paid</span>
                  <span className="text-stone-900">{formatCurrency(amountPaid)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-stone-200 pt-2">
                <span className="font-semibold text-stone-900">{amountPaid > 0 ? "Balance due" : "Total"}</span>
                <span className="text-lg font-bold text-stone-900">{formatCurrency(amountPaid > 0 ? balanceDue : total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Send */}
        <div>
          <h3 className="text-sm font-semibold text-stone-900 mb-1">Send invoice</h3>
          <p className="text-xs text-stone-500 mb-3">Saves the latest changes, then sends it to the patient.</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => handleSend("whatsapp")} disabled={busy !== null || !hasBillableItems}
              iconLeft={busy === "whatsapp" ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4 text-emerald-600" />}>
              WhatsApp
            </Button>
            <Button variant="outline" onClick={() => handleSend("email")} disabled={busy !== null || !hasBillableItems}
              iconLeft={busy === "email" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4 text-blue-600" />}>
              Email
            </Button>
            <Button variant="outline" onClick={() => handleSend("print")} disabled={busy !== null || !hasBillableItems}
              iconLeft={busy === "print" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4 text-stone-600" />}>
              Print
            </Button>
          </div>
        </div>
      </div>
    </SlidePanel>
  );
}

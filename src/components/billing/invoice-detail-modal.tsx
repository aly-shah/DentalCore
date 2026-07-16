"use client";

import { Printer, CreditCard } from "lucide-react";
import { Modal, Button, Badge } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { invoiceStatusColors } from "@/lib/constants";
import { useInvoice } from "@/hooks/use-queries";
import type { Invoice, InvoiceItem, Payment } from "@/types";

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Summary row from the list; full detail (line items, payments) is fetched by id. */
  invoice: Invoice;
  onCollect?: (invoice: Invoice) => void;
}

const statusBadgeVariant = (status: string) =>
  (invoiceStatusColors[status] || "default") as
    "success" | "warning" | "danger" | "info" | "default" | "primary";

export function InvoiceDetailModal({ isOpen, onClose, invoice, onCollect }: InvoiceDetailModalProps) {
  // Fetch the full invoice (items + payments); fall back to the list summary
  // while it loads so the modal always has something to show.
  const { data, isLoading } = useInvoice(invoice.id);
  const full = ((data?.data as Invoice | undefined) ?? invoice);

  const items = (full.items ?? []) as InvoiceItem[];
  const payments = (full.payments ?? []) as Payment[];
  const paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const balance = Math.max(0, (full.total || 0) - paid);
  const canCollect = full.status !== "PAID" && full.status !== "DRAFT" && full.status !== "CANCELLED";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={full.invoiceNumber}
      subtitle={`${full.patientName || ""}${full.createdAt ? ` · ${formatDate(full.createdAt)}` : ""}`}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            iconLeft={<Printer className="w-4 h-4" />}
            onClick={() => window.open(`/api/billing/invoices/${full.id}/print`, "_blank")}
          >
            Print
          </Button>
          {canCollect && onCollect && (
            <Button
              variant="primary"
              iconLeft={<CreditCard className="w-4 h-4" />}
              onClick={() => onCollect(full)}
            >
              Collect Payment
            </Button>
          )}
          <Button variant="soft" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Badge variant={statusBadgeVariant(full.status)} dot>{full.status}</Badge>
          {full.patientName && <span className="text-sm text-stone-500">{full.patientName}</span>}
        </div>

        {/* Line items */}
        <div className="rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium px-3 py-2">Description</th>
                <th className="text-right font-medium px-3 py-2 w-12">Qty</th>
                <th className="text-right font-medium px-3 py-2">Unit</th>
                <th className="text-right font-medium px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-stone-400">
                    {isLoading ? "Loading…" : "No line items on this invoice yet."}
                  </td>
                </tr>
              ) : (
                items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-stone-800">{it.description}</td>
                    <td className="px-3 py-2 text-right text-stone-500">{it.quantity}</td>
                    <td className="px-3 py-2 text-right text-stone-500">{formatCurrency(it.unitPrice)}</td>
                    <td className="px-3 py-2 text-right font-medium text-stone-800">{formatCurrency(it.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="ml-auto w-full sm:w-64 space-y-1.5 text-sm">
          <Row label="Subtotal" value={formatCurrency(full.subtotal || 0)} />
          {!!full.discount && <Row label="Discount" value={`- ${formatCurrency(full.discount)}`} />}
          {!!full.tax && <Row label="Tax" value={formatCurrency(full.tax)} />}
          <Row label="Total" value={formatCurrency(full.total || 0)} strong />
          {paid > 0 && <Row label="Paid" value={`- ${formatCurrency(paid)}`} />}
          <Row label="Balance due" value={formatCurrency(balance)} strong />
        </div>

        {/* Payments */}
        {payments.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">Payments</p>
            <div className="rounded-xl border border-stone-200 divide-y divide-stone-100">
              {payments.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-stone-600">
                    {p.method?.replace(/_/g, " ") || "Payment"}
                    {p.createdAt ? ` · ${formatDate(p.createdAt)}` : ""}
                  </span>
                  <span className="font-medium text-stone-800">{formatCurrency(p.amount || 0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-semibold text-stone-800" : "text-stone-500"}>{label}</span>
      <span className={strong ? "font-semibold text-stone-900" : "text-stone-700"}>{value}</span>
    </div>
  );
}

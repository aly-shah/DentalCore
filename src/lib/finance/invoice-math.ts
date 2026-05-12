/**
 * Pure invoice + payment math.
 *
 * Extracted from /api/billing/payments and /api/billing/refunds so the
 * business rules can be unit-tested in isolation.
 */

export type InvoiceStatus = "DRAFT" | "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";

export interface InvoiceFinancials {
  total: number;
  amountPaid: number;
  balanceDue: number;
  status: InvoiceStatus;
}

export interface PaymentRecord {
  amount: number;
}

/**
 * Sum the amounts of all completed payments.
 */
export function totalPaid(payments: PaymentRecord[]): number {
  return payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
}

/**
 * Compute the invoice's financials given its total and the set of payments
 * that have been applied to it.
 *
 * Rules:
 *  - amountPaid is the sum of payments
 *  - balanceDue is max(total - amountPaid, 0)  — never negative
 *  - status:
 *     • amountPaid <= 0           → keep current (DRAFT/PENDING)
 *     • 0 < amountPaid < total    → PARTIAL
 *     • amountPaid >= total       → PAID
 */
export function computeInvoiceFinancials(
  total: number,
  payments: PaymentRecord[],
  currentStatus: InvoiceStatus = "PENDING"
): InvoiceFinancials {
  const paid = totalPaid(payments);
  const balanceDue = Math.max(total - paid, 0);

  let status: InvoiceStatus = currentStatus;
  if (currentStatus === "CANCELLED") {
    status = "CANCELLED";
  } else if (paid <= 0) {
    status = currentStatus === "DRAFT" ? "DRAFT" : "PENDING";
  } else if (paid >= total) {
    status = "PAID";
  } else {
    status = "PARTIAL";
  }

  return { total, amountPaid: paid, balanceDue, status };
}

/**
 * Validation: can this refund be processed against an invoice?
 *
 * A refund is valid when:
 *  - amount > 0
 *  - cumulative refunds + this refund <= amount actually paid to the invoice
 *  - invoice is not in DRAFT (nothing to refund yet)
 */
export interface RefundCheck {
  invoiceStatus: InvoiceStatus;
  paid: number;
  alreadyRefunded: number;
  requested: number;
}

export type RefundValidation =
  | { ok: true }
  | { ok: false; reason: "INVALID_AMOUNT" | "EXCEEDS_PAID" | "INVOICE_NOT_PAID" | "INVOICE_CANCELLED" };

export function validateRefund(check: RefundCheck): RefundValidation {
  if (check.requested <= 0) return { ok: false, reason: "INVALID_AMOUNT" };
  if (check.invoiceStatus === "CANCELLED") return { ok: false, reason: "INVOICE_CANCELLED" };
  if (check.invoiceStatus === "DRAFT" || check.paid <= 0) return { ok: false, reason: "INVOICE_NOT_PAID" };
  if (check.alreadyRefunded + check.requested > check.paid) return { ok: false, reason: "EXCEEDS_PAID" };
  return { ok: true };
}

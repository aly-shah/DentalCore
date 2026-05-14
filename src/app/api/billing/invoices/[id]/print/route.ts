/**
 * @system DentaCore ERP — Invoice Print View
 * @route GET /api/billing/invoices/:id/print — printable HTML invoice
 *
 * Returns standalone HTML with a "Print / Save as PDF" button. Browser
 * print dialog handles PDF generation (matches the prescription pattern).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CLINIC_TZ } from "@/lib/utils";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            firstName: true, lastName: true, patientCode: true,
            phone: true, email: true, address: true, city: true,
          },
        },
        branch: { select: { name: true, address: true, phone: true, email: true } },
        items: true,
        payments: { orderBy: { processedAt: "asc" } },
        createdBy: { select: { name: true } },
        appointment: { select: { appointmentCode: true, date: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }

    const p = invoice.patient;
    const b = invoice.branch;
    const issuedDate = new Date(invoice.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: CLINIC_TZ });
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: CLINIC_TZ }) : "—";

    const statusColors: Record<string, { bg: string; text: string }> = {
      DRAFT:    { bg: "#f5f5f4", text: "#57534e" },
      PENDING:  { bg: "#fef3c7", text: "#92400e" },
      PARTIAL:  { bg: "#dbeafe", text: "#1e40af" },
      PAID:     { bg: "#d1fae5", text: "#065f46" },
      OVERDUE:  { bg: "#fee2e2", text: "#991b1b" },
      CANCELLED:{ bg: "#f5f5f4", text: "#78716c" },
      VOID:     { bg: "#fef2f2", text: "#7f1d1d" },
    };
    const status = invoice.status as keyof typeof statusColors;
    const sc = statusColors[status] ?? statusColors.PENDING;

    const itemsHtml = invoice.items.map((it, i) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e7e5e4;color:#78716c;font-size:13px;width:32px;">${i + 1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e7e5e4;color:#1c1917;font-size:14px;">
          <div style="font-weight:600;">${escapeHtml(it.description)}</div>
          <div style="font-size:11px;color:#78716c;margin-top:2px;text-transform:uppercase;letter-spacing:0.04em;">${it.type}</div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e7e5e4;color:#44403c;font-size:14px;text-align:center;">${it.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e7e5e4;color:#44403c;font-size:14px;text-align:right;">${currency(it.unitPrice)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e7e5e4;color:#1c1917;font-size:14px;text-align:right;font-weight:600;">${currency(it.total)}</td>
      </tr>
    `).join("");

    const paymentsHtml = invoice.payments.length === 0 ? "" : `
      <h3 style="margin:24px 0 8px;font-size:13px;font-weight:700;color:#1c1917;letter-spacing:0.04em;text-transform:uppercase;">Payments</h3>
      <table style="width:100%;border-collapse:collapse;">
        ${invoice.payments.map((pay) => `
          <tr>
            <td style="padding:6px 12px;border-bottom:1px solid #f5f5f4;color:#57534e;font-size:13px;width:160px;">
              ${new Date(pay.processedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: CLINIC_TZ })}
            </td>
            <td style="padding:6px 12px;border-bottom:1px solid #f5f5f4;color:#57534e;font-size:13px;">${pay.method}${pay.reference ? ` · ${escapeHtml(pay.reference)}` : ""}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f5f5f4;color:#1c1917;font-size:13px;font-weight:600;text-align:right;">${currency(pay.amount)}</td>
          </tr>
        `).join("")}
      </table>
    `;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    @media print { body { margin: 0; } .no-print { display: none !important; } }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; margin: 0; background: #fafaf9; color: #1c1917; }
    .wrap { max-width: 820px; margin: 24px auto; padding: 32px 40px; background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    @media print { .wrap { box-shadow: none; margin: 0; padding: 24px; border-radius: 0; max-width: none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:2px solid #1c1917;">
      <div>
        <div style="font-size:26px;font-weight:800;color:#1c1917;letter-spacing:-0.02em;">${escapeHtml(b?.name ?? "DentaCore")}</div>
        <div style="font-size:12px;color:#57534e;margin-top:4px;">${escapeHtml(b?.address ?? "")}</div>
        <div style="font-size:12px;color:#57534e;">${escapeHtml(b?.phone ?? "")}${b?.email ? ` · ${escapeHtml(b.email)}` : ""}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:24px;font-weight:800;color:#1c1917;letter-spacing:0.02em;">INVOICE</div>
        <div style="font-size:13px;color:#44403c;margin-top:4px;font-family:monospace;">${escapeHtml(invoice.invoiceNumber)}</div>
        <div style="display:inline-block;margin-top:8px;padding:4px 10px;border-radius:999px;background:${sc.bg};color:${sc.text};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">
          ${invoice.status}
        </div>
      </div>
    </div>

    <!-- Bill to / dates -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px;">
      <div>
        <div style="font-size:11px;color:#78716c;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Bill To</div>
        <div style="font-size:14px;color:#1c1917;font-weight:600;margin-top:4px;">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</div>
        <div style="font-size:12px;color:#57534e;">${escapeHtml(p.patientCode)}</div>
        ${p.phone ? `<div style="font-size:12px;color:#57534e;">${escapeHtml(p.phone)}</div>` : ""}
        ${p.email ? `<div style="font-size:12px;color:#57534e;">${escapeHtml(p.email)}</div>` : ""}
        ${p.address ? `<div style="font-size:12px;color:#57534e;">${escapeHtml(p.address)}${p.city ? `, ${escapeHtml(p.city)}` : ""}</div>` : ""}
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:#78716c;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Issued</div>
        <div style="font-size:14px;color:#1c1917;margin-top:4px;">${issuedDate}</div>
        <div style="font-size:11px;color:#78716c;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-top:12px;">Due</div>
        <div style="font-size:14px;color:#1c1917;margin-top:4px;">${dueDate}</div>
      </div>
    </div>

    <!-- Items -->
    <table style="width:100%;border-collapse:collapse;margin-top:24px;">
      <thead>
        <tr style="background:#fafaf9;border-bottom:2px solid #e7e5e4;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#78716c;text-transform:uppercase;letter-spacing:0.06em;">#</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#78716c;text-transform:uppercase;letter-spacing:0.06em;">Description</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#78716c;text-transform:uppercase;letter-spacing:0.06em;">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#78716c;text-transform:uppercase;letter-spacing:0.06em;">Unit</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#78716c;text-transform:uppercase;letter-spacing:0.06em;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <!-- Totals -->
    <div style="display:flex;justify-content:flex-end;margin-top:24px;">
      <table style="min-width:280px;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 12px;color:#57534e;font-size:13px;">Subtotal</td>
          <td style="padding:6px 12px;text-align:right;color:#1c1917;font-size:13px;">${currency(invoice.subtotal)}</td>
        </tr>
        ${invoice.discount > 0 ? `
        <tr>
          <td style="padding:6px 12px;color:#57534e;font-size:13px;">Discount${invoice.discountType === "PERCENTAGE" ? ` (${invoice.discount}%)` : ""}</td>
          <td style="padding:6px 12px;text-align:right;color:#dc2626;font-size:13px;">-${currency(invoice.discountType === "PERCENTAGE" ? invoice.subtotal * (invoice.discount / 100) : invoice.discount)}</td>
        </tr>` : ""}
        ${invoice.tax > 0 ? `
        <tr>
          <td style="padding:6px 12px;color:#57534e;font-size:13px;">Tax</td>
          <td style="padding:6px 12px;text-align:right;color:#1c1917;font-size:13px;">${currency(invoice.tax)}</td>
        </tr>` : ""}
        <tr style="border-top:2px solid #1c1917;">
          <td style="padding:10px 12px;color:#1c1917;font-size:15px;font-weight:700;">Total</td>
          <td style="padding:10px 12px;text-align:right;color:#1c1917;font-size:15px;font-weight:700;">${currency(invoice.total)}</td>
        </tr>
        ${invoice.amountPaid > 0 ? `
        <tr>
          <td style="padding:6px 12px;color:#065f46;font-size:13px;">Paid</td>
          <td style="padding:6px 12px;text-align:right;color:#065f46;font-size:13px;font-weight:600;">${currency(invoice.amountPaid)}</td>
        </tr>` : ""}
        ${invoice.balanceDue > 0 ? `
        <tr style="background:#fef3c7;">
          <td style="padding:8px 12px;color:#92400e;font-size:14px;font-weight:700;">Balance Due</td>
          <td style="padding:8px 12px;text-align:right;color:#92400e;font-size:14px;font-weight:700;">${currency(invoice.balanceDue)}</td>
        </tr>` : ""}
      </table>
    </div>

    ${paymentsHtml}

    ${invoice.notes ? `
    <div style="margin-top:24px;padding:12px 16px;background:#fafaf9;border-radius:8px;border-left:3px solid #d6d3d1;">
      <div style="font-size:11px;color:#78716c;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Notes</div>
      <div style="font-size:13px;color:#44403c;margin-top:4px;line-height:1.5;">${escapeHtml(invoice.notes)}</div>
    </div>` : ""}

    <!-- Footer -->
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e7e5e4;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#a8a29e;">
      <div>Generated by ${escapeHtml(invoice.createdBy?.name ?? "DentaCore")}${invoice.appointment ? ` · ${escapeHtml(invoice.appointment.appointmentCode)}` : ""}</div>
      <div>Thank you for choosing ${escapeHtml(b?.name ?? "us")}.</div>
    </div>

    <div class="no-print" style="text-align:center;margin-top:24px;">
      <button onclick="window.print()" style="background:#2563eb;color:white;border:none;padding:12px 32px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">
        Print / Save as PDF
      </button>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    logger.api("GET", "/api/billing/invoices/[id]/print", error);
    return NextResponse.json({ success: false, error: "Failed to render invoice" }, { status: 500 });
  }
}

/** Minimal HTML-entity escape so user-supplied text can't break the layout. */
function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

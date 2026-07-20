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
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(v);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id } = await params;

    // Thermal roll width. Default 80mm; pass ?w=58 for 58mm printers.
    const widthMm = new URL(request.url).searchParams.get("w") === "58" ? 58 : 80;

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
    const issuedDate = new Date(invoice.createdAt).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: CLINIC_TZ });
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: CLINIC_TZ }) : "";

    const itemsHtml = invoice.items.map((it, i) => `
      <div class="item">
        <div class="desc">${i + 1}. ${escapeHtml(it.description)}</div>
        <div class="row"><span>${it.quantity} × ${currency(it.unitPrice)}</span><span>${currency(it.total)}</span></div>
      </div>`).join("");

    const paymentsHtml = invoice.payments.length === 0 ? "" : `
      <div class="hr"></div>
      <div class="lbl">PAYMENTS</div>
      ${invoice.payments.map((pay) => `
        <div class="row"><span>${new Date(pay.processedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: CLINIC_TZ })} · ${escapeHtml(pay.method)}</span><span>${currency(pay.amount)}</span></div>`).join("")}
    `;

    // Compact thermal receipt (80mm default, ?w=58 for 58mm). Auto-opens the
    // print dialog so the button prints straight to the thermal printer; the
    // window closes itself afterward.
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    @page { size: ${widthMm}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #f4f4f5; }
    body { font-family: "Courier New", ui-monospace, monospace; color: #000; }
    .receipt {
      width: ${widthMm}mm; margin: 8px auto; padding: 4mm 3mm;
      background: #fff; font-size: 12px; line-height: 1.4;
    }
    @media print {
      html, body { background: #fff; }
      .receipt { margin: 0; width: auto; box-shadow: none; }
      .no-print { display: none !important; }
    }
    .center { text-align: center; }
    .name { font-size: 15px; font-weight: 700; letter-spacing: 0.02em; }
    .muted { color: #333; font-size: 11px; }
    .hr { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .row > span:last-child { white-space: nowrap; }
    .lbl { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 2px; }
    .item { margin: 4px 0; }
    .item .desc { word-break: break-word; }
    .item .row { color: #333; font-size: 11px; }
    .tot { font-size: 14px; font-weight: 700; }
    .bal { font-size: 14px; font-weight: 700; }
    .status { display:inline-block; border:1px solid #000; padding:1px 6px; font-size:10px; font-weight:700; letter-spacing:0.06em; margin-top:4px; }
    .btns { text-align: center; margin: 10px auto; width: ${widthMm}mm; }
    .btns button { border: none; border-radius: 8px; padding: 10px 18px; font-size: 13px; font-weight: 600; cursor: pointer; margin: 0 4px; }
    .btns .print { background: #2563eb; color: #fff; }
    .btns .close { background: #e7e5e4; color: #1c1917; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      <div class="name">${escapeHtml(b?.name ?? "DentaCore")}</div>
      ${b?.address ? `<div class="muted">${escapeHtml(b.address)}</div>` : ""}
      ${b?.phone ? `<div class="muted">${escapeHtml(b.phone)}</div>` : ""}
      <div class="status">${escapeHtml(invoice.status)}</div>
    </div>

    <div class="hr"></div>

    <div class="row"><span>Invoice</span><span>${escapeHtml(invoice.invoiceNumber)}</span></div>
    <div class="row"><span>Date</span><span>${issuedDate}</span></div>
    ${dueDate ? `<div class="row"><span>Due</span><span>${dueDate}</span></div>` : ""}
    <div class="row"><span>Patient</span><span>${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</span></div>
    <div class="row"><span>Code</span><span>${escapeHtml(p.patientCode)}</span></div>
    ${p.phone ? `<div class="row"><span>Phone</span><span>${escapeHtml(p.phone)}</span></div>` : ""}

    <div class="hr"></div>
    <div class="lbl">ITEMS</div>
    ${itemsHtml || `<div class="muted">No line items.</div>`}

    <div class="hr"></div>
    <div class="row"><span>Subtotal</span><span>${currency(invoice.subtotal)}</span></div>
    ${invoice.discount > 0 ? `<div class="row"><span>Discount${invoice.discountType === "PERCENTAGE" ? ` (${invoice.discount}%)` : ""}</span><span>-${currency(invoice.discountType === "PERCENTAGE" ? invoice.subtotal * (invoice.discount / 100) : invoice.discount)}</span></div>` : ""}
    ${invoice.tax > 0 ? `<div class="row"><span>Tax</span><span>${currency(invoice.tax)}</span></div>` : ""}
    <div class="hr"></div>
    <div class="row tot"><span>TOTAL</span><span>${currency(invoice.total)}</span></div>
    ${invoice.amountPaid > 0 ? `<div class="row"><span>Paid</span><span>${currency(invoice.amountPaid)}</span></div>` : ""}
    ${invoice.balanceDue > 0 ? `<div class="row bal"><span>BALANCE DUE</span><span>${currency(invoice.balanceDue)}</span></div>` : ""}

    ${paymentsHtml}

    ${invoice.notes ? `<div class="hr"></div><div class="lbl">NOTES</div><div class="muted">${escapeHtml(invoice.notes)}</div>` : ""}

    <div class="hr"></div>
    <div class="center muted">
      Thank you for choosing ${escapeHtml(b?.name ?? "us")}.<br/>
      ${escapeHtml(invoice.createdBy?.name ?? "DentaCore")}${invoice.appointment ? ` · ${escapeHtml(invoice.appointment.appointmentCode)}` : ""}
    </div>
  </div>

  <div class="btns no-print">
    <button class="print" onclick="window.print()">Print</button>
    <button class="close" onclick="window.close()">Close</button>
  </div>

  <script>
    // Pop the print dialog automatically; close the tab once printing is done
    // or cancelled (only works for script-opened windows, which is our case).
    window.addEventListener("load", function () {
      setTimeout(function () { window.focus(); window.print(); }, 150);
    });
    window.addEventListener("afterprint", function () { window.close(); });
  </script>
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

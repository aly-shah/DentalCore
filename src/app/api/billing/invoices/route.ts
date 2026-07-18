/**
 * @system DentaCore ERP - Invoices List & Creation API
 * @route GET /api/billing/invoices - List invoices with filters
 * @route POST /api/billing/invoices - Create invoice
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const patientId = searchParams.get("patientId");
    const appointmentId = searchParams.get("appointmentId");
    const branchId = searchParams.get("branchId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (status) {
      // Accept a single status or a comma-separated list (e.g.
      // "PENDING,PARTIAL,OVERDUE"). A bare comma-joined string is an invalid
      // enum value and makes Prisma throw, so split it into an `in` filter.
      const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }
    if (patientId) where.patientId = patientId;
    if (appointmentId) where.appointmentId = appointmentId;
    if (branchId) where.branchId = branchId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    const [invoices, total, totalAgg, paidAgg, pendingAgg] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
          branch: { select: { id: true, name: true, code: true } },
          items: true,
          payments: true,
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.aggregate({ where, _sum: { total: true } }),
      prisma.invoice.aggregate({ where: { ...where, status: "PAID" }, _sum: { total: true } }),
      prisma.invoice.aggregate({
        where: { ...where, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
        _sum: { total: true },
      }),
    ]);

    const summary = {
      total: Number(totalAgg._sum.total || 0),
      paid: Number(paidAgg._sum.total || 0),
      pending: Number(pendingAgg._sum.total || 0),
      count: total,
    };

    return NextResponse.json({
      success: true,
      data: invoices,
      summary,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    logger.api("GET", "/api/billing/invoices", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();

    const count = await prisma.invoice.count();
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, "0")}`;

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        patientId: body.patientId,
        appointmentId: body.appointmentId || null,
        branchId: body.branchId,
        items: Array.isArray(body.items) && body.items.length > 0
          ? { create: body.items.map((it: { description: string; type?: string; quantity?: number; unitPrice?: number; total?: number }) => ({
              description: it.description,
              type: it.type || "PROCEDURE",
              quantity: it.quantity ?? 1,
              unitPrice: it.unitPrice ?? 0,
              total: it.total ?? (it.unitPrice ?? 0) * (it.quantity ?? 1),
            })) }
          : undefined,
        subtotal: body.subtotal,
        discount: body.discount || 0,
        discountType: body.discountType || "FIXED",
        tax: body.tax || 0,
        total: body.total,
        amountPaid: body.amountPaid || 0,
        balanceDue: body.balanceDue || body.total,
        status: "DRAFT",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes || null,
        createdById: body.createdById,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      userId: body.createdById || "system",
      action: "CREATE",
      module: "BILLING",
      entityType: "Invoice",
      entityId: invoice.id,
      details: { invoiceNumber: invoice.invoiceNumber },
    });

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/billing/invoices", error);
    return NextResponse.json(
      { success: false, error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}

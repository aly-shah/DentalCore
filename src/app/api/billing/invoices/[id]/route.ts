/**
 * @system DentaCore ERP - Single Invoice API
 * @route GET /api/billing/invoices/:id - Get invoice details
 * @route PUT /api/billing/invoices/:id - Update invoice
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
        branch: { select: { id: true, name: true, code: true } },
        appointment: { select: { id: true, appointmentCode: true, date: true, type: true } },
        payments: {
          include: { processedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: invoice });
  } catch (error) {
    logger.api("GET", "/api/billing/invoices/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch invoice" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Line items are sent as a full replacement set; Prisma needs a nested
    // write (deleteMany + create), not a bare array assignment.
    let itemsWrite: object | undefined;
    if (Array.isArray(body.items)) {
      itemsWrite = {
        deleteMany: {},
        create: body.items.map((it: Record<string, unknown>) => ({
          description: String(it.description ?? ""),
          type: String(it.type ?? "PROCEDURE"),
          quantity: Number(it.quantity ?? 1),
          unitPrice: Number(it.unitPrice ?? 0),
          total: Number(it.total ?? Number(it.unitPrice ?? 0) * Number(it.quantity ?? 1)),
        })),
      };
    }

    // Keep the balance consistent with the new total unless explicitly given.
    const balanceDue =
      body.balanceDue !== undefined
        ? body.balanceDue
        : body.total !== undefined
        ? Number(body.total) - Number(body.amountPaid ?? existing.amountPaid ?? 0)
        : undefined;

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        ...(itemsWrite && { items: itemsWrite }),
        ...(body.subtotal !== undefined && { subtotal: body.subtotal }),
        ...(body.discount !== undefined && { discount: body.discount }),
        ...(body.discountType && { discountType: body.discountType }),
        ...(body.tax !== undefined && { tax: body.tax }),
        ...(body.total !== undefined && { total: body.total }),
        ...(body.amountPaid !== undefined && { amountPaid: body.amountPaid }),
        ...(balanceDue !== undefined && { balanceDue }),
        ...(body.status && { status: body.status }),
        ...(body.dueDate && { dueDate: new Date(body.dueDate) }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        items: true,
        payments: true,
      },
    });

    return NextResponse.json({ success: true, data: invoice });
  } catch (error) {
    logger.api("PUT", "/api/billing/invoices/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to update invoice" },
      { status: 500 }
    );
  }
}

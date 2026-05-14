/**
 * @route GET /api/search?q=… — global search across patients, appointments,
 *   invoices, leads.
 *
 * Returns a typed union so the topbar can render each category with the
 * right click-through. Capped at 5 per category to keep the popover light.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export interface SearchHit {
  kind: "patient" | "appointment" | "invoice" | "lead";
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
  meta?: string | null;
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ success: true, data: { hits: [], q } });
    }

    const tokens = q.split(/\s+/).filter(Boolean);
    const phoneish = q.replace(/[^0-9+]/g, "");

    const [patients, appointments, invoices, leads] = await Promise.all([
      prisma.patient.findMany({
        where: {
          AND: [
            { deletedAt: null },
            {
              OR: [
                { patientCode: { contains: q, mode: "insensitive" } },
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                ...(phoneish ? [{ phone: { contains: phoneish } }] : []),
                // Two-token name search: "olivia harper"
                ...(tokens.length >= 2
                  ? [{
                      AND: [
                        { firstName: { contains: tokens[0], mode: "insensitive" as const } },
                        { lastName: { contains: tokens[1], mode: "insensitive" as const } },
                      ],
                    }]
                  : []),
              ],
            },
          ],
        },
        select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true },
        take: 5,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.appointment.findMany({
        where: {
          OR: [
            { appointmentCode: { contains: q, mode: "insensitive" } },
            {
              patient: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName:  { contains: q, mode: "insensitive" } },
                  { patientCode: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          ],
        },
        select: {
          id: true, appointmentCode: true, date: true, startTime: true, type: true, status: true,
          patient: { select: { firstName: true, lastName: true } },
        },
        take: 5,
        orderBy: { date: "desc" },
      }),
      prisma.invoice.findMany({
        where: {
          OR: [
            { invoiceNumber: { contains: q, mode: "insensitive" } },
            {
              patient: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName:  { contains: q, mode: "insensitive" } },
                  { patientCode: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          ],
        },
        select: {
          id: true, invoiceNumber: true, total: true, balanceDue: true, status: true,
          patient: { select: { firstName: true, lastName: true } },
        },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      prisma.lead.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            ...(phoneish ? [{ phone: { contains: phoneish } }] : []),
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, phone: true, status: true },
        take: 5,
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const hits: SearchHit[] = [
      ...patients.map((p) => ({
        kind: "patient" as const,
        id: p.id,
        title: `${p.firstName} ${p.lastName}`,
        subtitle: `${p.patientCode}${p.phone ? ` · ${p.phone}` : ""}`,
        href: `/patients/${p.id}`,
      })),
      ...appointments.map((a) => ({
        kind: "appointment" as const,
        id: a.id,
        title: `${a.patient.firstName} ${a.patient.lastName}`,
        subtitle: `${new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${a.startTime} · ${a.type.replace(/_/g, " ")}`,
        meta: a.status,
        href: `/appointments`,
      })),
      ...invoices.map((i) => ({
        kind: "invoice" as const,
        id: i.id,
        title: i.invoiceNumber,
        subtitle: `${i.patient.firstName} ${i.patient.lastName} · ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(i.total)}`,
        meta: i.status,
        href: `/billing/invoices/${i.id}`,
      })),
      ...leads.map((l) => ({
        kind: "lead" as const,
        id: l.id,
        title: l.name,
        subtitle: l.phone ?? null,
        meta: l.status,
        href: `/call-center`,
      })),
    ];

    return NextResponse.json({ success: true, data: { hits, q } });
  } catch (err) {
    logger.api("GET", "/api/search", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

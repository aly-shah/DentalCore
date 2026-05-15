/**
 * @system DentaCore ERP — Reports API
 * @route GET /api/reports — Get analytics data for reports
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { toClinicDay } from "@/lib/utils";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "overview";
    const days = parseInt(searchParams.get("days") || "30");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    if (type === "overview") {
      const [
        totalPatients, newPatients, totalAppointments,
        completedAppointments, cancelledAppointments, noShows,
        totalRevenue, pendingPayments, totalFollowUps, overdueFollowUps,
      ] = await Promise.all([
        prisma.patient.count({ where: { isActive: true } }),
        prisma.patient.count({ where: { createdAt: { gte: startDate } } }),
        prisma.appointment.count({ where: { createdAt: { gte: startDate } } }),
        prisma.appointment.count({ where: { status: "COMPLETED", createdAt: { gte: startDate } } }),
        prisma.appointment.count({ where: { status: "CANCELLED", createdAt: { gte: startDate } } }),
        prisma.appointment.count({ where: { status: "NO_SHOW", createdAt: { gte: startDate } } }),
        prisma.payment.aggregate({ where: { status: "COMPLETED", createdAt: { gte: startDate } }, _sum: { amount: true } }),
        prisma.invoice.aggregate({ where: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } }, _sum: { balanceDue: true } }),
        prisma.followUp.count({ where: { createdAt: { gte: startDate } } }),
        prisma.followUp.count({ where: { status: "PENDING", dueDate: { lt: new Date() } } }),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          totalPatients, newPatients, totalAppointments,
          completedAppointments, cancelledAppointments, noShows,
          completionRate: totalAppointments > 0 ? Math.round((completedAppointments / totalAppointments) * 100) : 0,
          noShowRate: totalAppointments > 0 ? Math.round((noShows / totalAppointments) * 100) : 0,
          totalRevenue: Number(totalRevenue._sum.amount || 0),
          pendingPayments: Number(pendingPayments._sum.balanceDue || 0),
          totalFollowUps, overdueFollowUps,
        },
      });
    }

    if (type === "revenue") {
      // Daily revenue for the period
      const payments = await prisma.payment.findMany({
        where: { status: "COMPLETED", createdAt: { gte: startDate } },
        select: { amount: true, method: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });

      // Group by date
      const dailyRevenue: Record<string, number> = {};
      const methodSplit: Record<string, number> = {};
      for (const p of payments) {
        const dateKey = toClinicDay(p.createdAt);
        dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + Number(p.amount);
        methodSplit[p.method] = (methodSplit[p.method] || 0) + Number(p.amount);
      }

      return NextResponse.json({
        success: true,
        data: {
          dailyRevenue: Object.entries(dailyRevenue).map(([date, amount]) => ({ date, amount })),
          methodSplit: Object.entries(methodSplit).map(([method, amount]) => ({ method, amount })),
          total: payments.reduce((sum, p) => sum + Number(p.amount), 0),
        },
      });
    }

    if (type === "appointments") {
      const statusCounts = await prisma.appointment.groupBy({
        by: ["status"],
        where: { createdAt: { gte: startDate } },
        _count: true,
      });

      const typeCounts = await prisma.appointment.groupBy({
        by: ["type"],
        where: { createdAt: { gte: startDate } },
        _count: true,
      });

      // Doctor load
      const doctorLoad = await prisma.appointment.groupBy({
        by: ["doctorId"],
        where: { createdAt: { gte: startDate } },
        _count: true,
      });
      const doctorIds = doctorLoad.map((d) => d.doctorId);
      const doctors = await prisma.user.findMany({
        where: { id: { in: doctorIds } },
        select: { id: true, name: true },
      });
      const doctorMap = Object.fromEntries(doctors.map((d) => [d.id, d.name]));

      return NextResponse.json({
        success: true,
        data: {
          byStatus: statusCounts.map((s) => ({ status: s.status, count: s._count })),
          byType: typeCounts.map((t) => ({ type: t.type, count: t._count })),
          byDoctor: doctorLoad.map((d) => ({ doctor: doctorMap[d.doctorId] || "Unknown", count: d._count })),
        },
      });
    }

    if (type === "patients") {
      const genderSplit = await prisma.patient.groupBy({
        by: ["gender"],
        where: { isActive: true },
        _count: true,
      });

      // Registration trend (last N days)
      const registrations = await prisma.patient.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      const dailyRegs: Record<string, number> = {};
      for (const p of registrations) {
        const dateKey = toClinicDay(p.createdAt);
        dailyRegs[dateKey] = (dailyRegs[dateKey] || 0) + 1;
      }

      return NextResponse.json({
        success: true,
        data: {
          genderSplit: genderSplit.map((g) => ({ gender: g.gender, count: g._count })),
          registrationTrend: Object.entries(dailyRegs).map(([date, count]) => ({ date, count })),
        },
      });
    }

    if (type === "retention") {
      // For each patient first seen in the period, did they come back?
      // "Returned" = ≥2 completed appointments in any window.
      const cohort = await prisma.patient.findMany({
        where: { createdAt: { gte: startDate } },
        select: { id: true, createdAt: true },
      });
      const totalCohort = cohort.length;
      if (totalCohort === 0) {
        return NextResponse.json({
          success: true,
          data: { totalCohort: 0, returned: 0, returnRate: 0, byMonth: [] },
        });
      }

      const completedByPatient = await prisma.appointment.groupBy({
        by: ["patientId"],
        where: { patientId: { in: cohort.map((p) => p.id) }, status: "COMPLETED" },
        _count: { _all: true },
      });
      const completedMap = new Map(completedByPatient.map((r) => [r.patientId, r._count._all]));
      const returned = cohort.filter((p) => (completedMap.get(p.id) ?? 0) >= 2).length;

      // Cohort breakdown by YYYY-MM
      const buckets = new Map<string, { cohort: number; returned: number }>();
      for (const p of cohort) {
        const k = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, "0")}`;
        const e = buckets.get(k) ?? { cohort: 0, returned: 0 };
        e.cohort += 1;
        if ((completedMap.get(p.id) ?? 0) >= 2) e.returned += 1;
        buckets.set(k, e);
      }
      const byMonth = [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({
          month,
          cohort: v.cohort,
          returned: v.returned,
          rate: v.cohort > 0 ? Math.round((v.returned / v.cohort) * 100) : 0,
        }));

      return NextResponse.json({
        success: true,
        data: {
          totalCohort,
          returned,
          returnRate: Math.round((returned / totalCohort) * 100),
          byMonth,
        },
      });
    }

    if (type === "doctorProductivity") {
      // Per-doctor: appointments seen, completion rate, revenue collected,
      // avg revenue per visit. Revenue is summed from completed payments
      // on invoices for that doctor's procedures.
      const doctors = await prisma.user.findMany({
        where: { role: "DOCTOR", isActive: true },
        select: { id: true, name: true },
      });

      const rows = await Promise.all(
        doctors.map(async (d) => {
          // Revenue per doctor = sum of amountPaid on invoices for
          // appointments this doctor delivered in the window.
          const [appointments, completed, invoices] = await Promise.all([
            prisma.appointment.count({ where: { doctorId: d.id, createdAt: { gte: startDate } } }),
            prisma.appointment.count({
              where: { doctorId: d.id, status: "COMPLETED", createdAt: { gte: startDate } },
            }),
            prisma.invoice.findMany({
              where: {
                appointment: { doctorId: d.id, createdAt: { gte: startDate } },
              },
              select: { amountPaid: true },
            }),
          ]);
          const revenue = invoices.reduce((s, i) => s + Number(i.amountPaid ?? 0), 0);
          return {
            doctorId: d.id,
            doctor: d.name,
            appointments,
            completed,
            completionRate: appointments > 0 ? Math.round((completed / appointments) * 100) : 0,
            revenue,
            avgRevenuePerVisit: completed > 0 ? Math.round(revenue / completed) : 0,
          };
        })
      );
      rows.sort((a, b) => b.revenue - a.revenue);
      return NextResponse.json({ success: true, data: { rows } });
    }

    if (type === "leadFunnel") {
      // Lead → consultation → treatment plan accepted → completed.
      // Cohort = leads created in window. We follow each lead through
      // its converted Patient (Lead.convertedPatientId).
      const leads = await prisma.lead.findMany({
        where: { createdAt: { gte: startDate } },
        select: { id: true, status: true, convertedPatientId: true },
      });
      const totalLeads = leads.length;
      const contacted = leads.filter((l) => l.status !== "NEW").length;
      const convertedPatients = leads.filter((l) => !!l.convertedPatientId).map((l) => l.convertedPatientId!);

      // Convert→ consulted via first ConsultationNote, plan accepted via
      // a TreatmentPlan with status ACCEPTED, completed via plan COMPLETED.
      const [consulted, planned, accepted, completed] = convertedPatients.length === 0
        ? [0, 0, 0, 0]
        : await Promise.all([
            prisma.consultationNote.findMany({
              where: { patientId: { in: convertedPatients } },
              distinct: ["patientId"],
              select: { patientId: true },
            }).then((r) => r.length),
            prisma.treatmentPlan.findMany({
              where: { patientId: { in: convertedPatients } },
              distinct: ["patientId"],
              select: { patientId: true },
            }).then((r) => r.length),
            prisma.treatmentPlan.findMany({
              where: { patientId: { in: convertedPatients }, status: { in: ["ACCEPTED", "IN_PROGRESS", "COMPLETED"] } },
              distinct: ["patientId"],
              select: { patientId: true },
            }).then((r) => r.length),
            prisma.treatmentPlan.findMany({
              where: { patientId: { in: convertedPatients }, status: "COMPLETED" },
              distinct: ["patientId"],
              select: { patientId: true },
            }).then((r) => r.length),
          ]);

      const steps = [
        { stage: "Leads",           count: totalLeads },
        { stage: "Contacted",       count: contacted },
        { stage: "Converted",       count: convertedPatients.length },
        { stage: "Consulted",       count: consulted },
        { stage: "Plan proposed",   count: planned },
        { stage: "Plan accepted",   count: accepted },
        { stage: "Plan completed",  count: completed },
      ];

      return NextResponse.json({
        success: true,
        data: {
          totalLeads,
          steps,
          overallConversion: totalLeads > 0 ? Math.round((accepted / totalLeads) * 100) : 0,
        },
      });
    }

    return NextResponse.json({ success: false, error: "Unknown report type" }, { status: 400 });
  } catch (error) {
    logger.api("GET", "/api/reports", error);
    return NextResponse.json({ success: false, error: "Failed to generate report" }, { status: 500 });
  }
}

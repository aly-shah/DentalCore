"use client";

import { useState } from "react";
import {
  TrendingUp, Users, Calendar, CreditCard, AlertTriangle,
  CalendarClock, UserPlus, CheckCircle, Download, Repeat,
  Stethoscope, Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading";
import { useModuleAccess } from "@/modules/core/hooks";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, CLINIC_TZ } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import { Button } from "@/components/ui/button";

function useReport(type: string, days: number) {
  return useQuery({
    queryKey: ["reports", type, days],
    queryFn: () => fetch(`/api/reports?type=${type}&days=${days}`).then((r) => r.json()),
  });
}

export default function ReportsPage() {
  const access = useModuleAccess("MOD-ADMIN");
  const [period, setPeriod] = useState("30");
  const days = parseInt(period);

  const { data: overviewRes, isLoading: oLoading } = useReport("overview", days);
  const { data: revenueRes, isLoading: rLoading } = useReport("revenue", days);
  const { data: appointmentsRes, isLoading: aLoading } = useReport("appointments", days);
  const { data: patientsRes, isLoading: pLoading } = useReport("patients", days);
  const { data: retentionRes }     = useReport("retention", days);
  const { data: productivityRes }  = useReport("doctorProductivity", days);
  const { data: funnelRes }        = useReport("leadFilter", days);

  const overview = (overviewRes?.data || {}) as Record<string, number>;
  const revenue = (revenueRes?.data || {}) as { dailyRevenue?: { date: string; amount: number }[]; methodSplit?: { method: string; amount: number }[]; total?: number };
  const appointments = (appointmentsRes?.data || {}) as { byStatus?: { status: string; count: number }[]; byType?: { type: string; count: number }[]; byDoctor?: { doctor: string; count: number }[] };
  const patients = (patientsRes?.data || {}) as { genderSplit?: { gender: string; count: number }[] };
  const retention = (retentionRes?.data || {}) as { totalCohort?: number; returned?: number; returnRate?: number; byMonth?: { month: string; cohort: number; returned: number; rate: number }[] };
  const productivity = (productivityRes?.data || {}) as { rows?: { doctor: string; appointments: number; completed: number; completionRate: number; revenue: number; avgRevenuePerVisit: number }[] };
  const funnel = (funnelRes?.data || {}) as { steps?: { stage: string; count: number }[]; overallConversion?: number };

  if (!access.canView) return <div className="flex items-center justify-center py-20 text-stone-500">No access.</div>;
  const isLoading = oLoading || rLoading || aLoading || pLoading;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900">Reports & Analytics</h1>
          <p className="text-sm text-stone-400 mt-0.5">Real-time clinic performance data</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" iconLeft={<Download className="w-3.5 h-3.5" />} onClick={() => downloadCSV([{ "Total Patients": overview.totalPatients || 0, "New Patients": overview.newPatients || 0, Appointments: overview.totalAppointments || 0, "Completion Rate": `${overview.completionRate || 0}%`, Revenue: overview.totalRevenue || 0, "Pending Payments": overview.pendingPayments || 0 }], "reports_overview")}>Export</Button>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)}
          options={[{ value: "7", label: "Last 7 days" }, { value: "14", label: "Last 14 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} />
        </div>
      </div>

      {isLoading ? <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <KPI icon={<Users className="w-5 h-5" />} label="Total Patients" value={overview.totalPatients || 0} color="text-blue-600" bg="bg-blue-50" />
            <KPI icon={<UserPlus className="w-5 h-5" />} label="New Patients" value={overview.newPatients || 0} color="text-emerald-600" bg="bg-emerald-50" />
            <KPI icon={<Calendar className="w-5 h-5" />} label="Appointments" value={overview.totalAppointments || 0} color="text-blue-600" bg="bg-blue-50" />
            <KPI icon={<CheckCircle className="w-5 h-5" />} label="Completion" value={`${overview.completionRate || 0}%`} color="text-emerald-600" bg="bg-emerald-50" />
            <KPI icon={<CreditCard className="w-5 h-5" />} label="Revenue" value={formatCurrency(overview.totalRevenue || 0)} color="text-violet-600" bg="bg-violet-50" />
            <KPI icon={<AlertTriangle className="w-5 h-5" />} label="Pending" value={formatCurrency(overview.pendingPayments || 0)} color="text-red-600" bg="bg-red-50" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card><CardHeader><div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" /><span className="text-sm font-semibold text-stone-900">Revenue Trend</span><Badge variant="success" className="text-[10px]">{formatCurrency(revenue.total || 0)}</Badge></div></CardHeader>
              <CardContent className="p-4 pt-0">
                {(revenue.dailyRevenue || []).length > 0 ? <div className="space-y-1.5">{(revenue.dailyRevenue || []).slice(-10).map((d) => {
                  const max = Math.max(...(revenue.dailyRevenue || []).map((x) => x.amount), 1);
                  return <div key={d.date} className="flex items-center gap-2 text-xs"><span className="w-16 text-stone-400 shrink-0">{new Date(d.date + "T00:00:00").toLocaleDateString("en-PK", { month: "short", day: "numeric", timeZone: CLINIC_TZ })}</span><div className="flex-1 h-5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.round((d.amount / max) * 100)}%` }} /></div><span className="w-20 text-right font-medium text-stone-700">{formatCurrency(d.amount)}</span></div>;
                })}</div> : <p className="text-sm text-stone-400 py-4 text-center">No revenue data</p>}
              </CardContent></Card>

            <Card><CardHeader><div className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-violet-500" /><span className="text-sm font-semibold text-stone-900">Payment Methods</span></div></CardHeader>
              <CardContent className="p-4 pt-0">
                {(revenue.methodSplit || []).length > 0 ? <div className="space-y-2.5">{(revenue.methodSplit || []).map((m) => {
                  const total = (revenue.methodSplit || []).reduce((s, x) => s + x.amount, 0) || 1;
                  const pct = Math.round((m.amount / total) * 100);
                  const colors: Record<string, string> = { CASH: "bg-emerald-400", CARD: "bg-blue-400", BANK_TRANSFER: "bg-violet-400", DIGITAL_WALLET: "bg-amber-400", INSURANCE: "bg-sky-400" };
                  return <div key={m.method} className="space-y-1"><div className="flex items-center justify-between text-xs"><span className="text-stone-600 font-medium">{m.method.replace(/_/g, " ")}</span><span className="text-stone-900 font-bold">{formatCurrency(m.amount)} <span className="text-stone-400 font-normal">({pct}%)</span></span></div><div className="h-2 bg-stone-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${colors[m.method] || "bg-stone-400"}`} style={{ width: `${pct}%` }} /></div></div>;
                })}</div> : <p className="text-sm text-stone-400 py-4 text-center">No payment data</p>}
              </CardContent></Card>

            <Card><CardHeader><div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-500" /><span className="text-sm font-semibold text-stone-900">Appointments by Status</span></div></CardHeader>
              <CardContent className="p-4 pt-0"><div className="grid grid-cols-2 gap-2">{(appointments.byStatus || []).map((s) => {
                const colors: Record<string, string> = { COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200", SCHEDULED: "bg-blue-50 text-blue-700 border-blue-200", CANCELLED: "bg-red-50 text-red-700 border-red-200", NO_SHOW: "bg-amber-50 text-amber-700 border-amber-200", CHECKED_IN: "bg-blue-50 text-blue-700 border-blue-200", IN_PROGRESS: "bg-violet-50 text-violet-700 border-violet-200", WAITING: "bg-amber-50 text-amber-700 border-amber-200", CONFIRMED: "bg-sky-50 text-sky-700 border-sky-200" };
                return <div key={s.status} className={`rounded-xl border p-3 ${colors[s.status] || "bg-stone-50 text-stone-700 border-stone-200"}`}><p className="text-lg font-bold">{s.count}</p><p className="text-[10px] font-medium uppercase tracking-wider">{s.status.replace(/_/g, " ")}</p></div>;
              })}</div></CardContent></Card>

            <Card><CardHeader><div className="flex items-center gap-2"><Users className="w-4 h-4 text-blue-500" /><span className="text-sm font-semibold text-stone-900">Doctor Utilization</span></div></CardHeader>
              <CardContent className="p-4 pt-0">{(appointments.byDoctor || []).length > 0 ? <div className="space-y-2">{(appointments.byDoctor || []).sort((a, b) => b.count - a.count).map((d) => {
                const max = Math.max(...(appointments.byDoctor || []).map((x) => x.count), 1);
                return <div key={d.doctor} className="flex items-center gap-2 text-xs"><span className="w-28 text-stone-600 font-medium truncate">{d.doctor}</span><div className="flex-1 h-4 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.round((d.count / max) * 100)}%` }} /></div><span className="w-8 text-right font-bold text-stone-900">{d.count}</span></div>;
              })}</div> : <p className="text-sm text-stone-400 py-4 text-center">No data</p>}</CardContent></Card>

            <Card><CardHeader><div className="flex items-center gap-2"><CalendarClock className="w-4 h-4 text-amber-500" /><span className="text-sm font-semibold text-stone-900">Follow-Ups</span></div></CardHeader>
              <CardContent className="p-4 pt-0"><div className="grid grid-cols-2 gap-3"><div className="bg-stone-50 rounded-xl p-3 text-center"><p className="text-2xl font-bold text-stone-900">{overview.totalFollowUps || 0}</p><p className="text-[10px] text-stone-400 uppercase">Total</p></div><div className="bg-red-50 rounded-xl p-3 text-center"><p className="text-2xl font-bold text-red-600">{overview.overdueFollowUps || 0}</p><p className="text-[10px] text-red-400 uppercase">Overdue</p></div></div></CardContent></Card>

            <Card><CardHeader><div className="flex items-center gap-2"><Users className="w-4 h-4 text-indigo-500" /><span className="text-sm font-semibold text-stone-900">Patient Demographics</span></div></CardHeader>
              <CardContent className="p-4 pt-0"><div className="flex items-center gap-3">{(patients.genderSplit || []).map((g) => {
                const colors: Record<string, string> = { MALE: "bg-blue-100 text-blue-700", FEMALE: "bg-pink-100 text-pink-700", OTHER: "bg-stone-100 text-stone-700" };
                return <div key={g.gender} className={`flex-1 rounded-xl p-3 text-center ${colors[g.gender] || "bg-stone-100"}`}><p className="text-xl font-bold">{g.count}</p><p className="text-[10px] font-medium uppercase">{g.gender}</p></div>;
              })}</div></CardContent></Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-stone-900">Patient Retention</span>
                  <Badge variant="success" className="text-[10px]">
                    {retention.returnRate ?? 0}% returned
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {(retention.byMonth ?? []).length > 0 ? (
                  <div className="space-y-1.5">
                    {(retention.byMonth ?? []).map((m) => (
                      <div key={m.month} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-stone-400 shrink-0">{m.month}</span>
                        <div className="flex-1 h-5 bg-stone-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${m.rate}%` }} />
                        </div>
                        <span className="w-24 text-right font-medium text-stone-700">
                          {m.returned}/{m.cohort}
                          <span className="text-stone-400 font-normal"> · {m.rate}%</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-stone-400 py-4 text-center">No cohort data yet</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-semibold text-stone-900">Lead Conversion Filter</span>
                  <Badge variant="default" className="text-[10px]">
                    {funnel.overallConversion ?? 0}% lead→accepted
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {(funnel.steps ?? []).length > 0 ? (
                  <div className="space-y-1.5">
                    {(() => {
                      const top = (funnel.steps ?? [])[0]?.count || 1;
                      return (funnel.steps ?? []).map((s) => {
                        const pct = Math.round((s.count / top) * 100);
                        return (
                          <div key={s.stage} className="flex items-center gap-2 text-xs">
                            <span className="w-32 text-stone-600 shrink-0">{s.stage}</span>
                            <div className="flex-1 h-5 bg-stone-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-12 text-right font-bold text-stone-900">{s.count}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <p className="text-sm text-stone-400 py-4 text-center">No leads in this window</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-violet-500" />
                  <span className="text-sm font-semibold text-stone-900">Doctor Productivity</span>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {(productivity.rows ?? []).length > 0 ? (
                  <div className="overflow-x-auto -mx-4 px-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-stone-400 text-left">
                          <th className="font-normal py-1.5">Doctor</th>
                          <th className="font-normal py-1.5 text-right">Visits</th>
                          <th className="font-normal py-1.5 text-right">Completed</th>
                          <th className="font-normal py-1.5 text-right">Completion %</th>
                          <th className="font-normal py-1.5 text-right">Revenue</th>
                          <th className="font-normal py-1.5 text-right">Avg / visit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(productivity.rows ?? []).map((r) => (
                          <tr key={r.doctor} className="border-t border-stone-100">
                            <td className="py-1.5 font-medium text-stone-700">{r.doctor}</td>
                            <td className="py-1.5 text-right">{r.appointments}</td>
                            <td className="py-1.5 text-right">{r.completed}</td>
                            <td className="py-1.5 text-right text-emerald-600 font-semibold">{r.completionRate}%</td>
                            <td className="py-1.5 text-right font-bold text-stone-900">{formatCurrency(r.revenue)}</td>
                            <td className="py-1.5 text-right text-stone-500">{formatCurrency(r.avgRevenuePerVisit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-stone-400 py-4 text-center">No doctor data</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function KPI({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: string | number; color: string; bg: string }) {
  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-stone-100 shadow-[var(--shadow-surface-1)] p-3.5 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg} ${color}`}>{icon}</div>
      <div><p className="text-lg font-bold text-stone-900">{value}</p><p className="text-[10px] text-stone-400">{label}</p></div>
    </div>
  );
}

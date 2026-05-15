"use client";

import {
  Calendar, Users, CreditCard, DollarSign, UserPlus, Receipt,
  BarChart3, UserCog, Brain, Sparkles, Smile, Clock,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { WhatsAppStatusBadge } from "@/components/admin/whatsapp-status-badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useDashboardStats, useAppointments } from "@/hooks/use-queries";
import { timeAgo, getClinicToday, CLINIC_TZ } from "@/lib/utils";
import { appointmentStatusColors } from "@/lib/constants";
import Link from "next/link";
import { useModuleStore } from "@/modules/core/store";
import { AddPatientModal } from "@/components/patients/add-patient-modal";
import { CreateAppointmentModal } from "@/components/appointments/create-appointment-modal";
import { CreateInvoiceModal } from "@/components/billing/create-invoice-modal";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";

// Extract patient/doctor name from appointment (handles nested API format)
function getAptPatientName(apt: Record<string, unknown>): string {
  if (apt.patientName) return String(apt.patientName);
  const p = apt.patient as Record<string, unknown> | undefined;
  if (p?.firstName) return `${p.firstName} ${p.lastName || ""}`.trim();
  return "Patient";
}
function getAptDoctorName(apt: Record<string, unknown>): string {
  if (apt.doctorName) return String(apt.doctorName);
  const d = apt.doctor as Record<string, unknown> | undefined;
  if (d?.name) return String(d.name);
  return "Doctor";
}
function getAptPatientId(apt: Record<string, unknown>): string | null {
  if (typeof apt.patientId === "string" && apt.patientId) return apt.patientId;
  const p = apt.patient as Record<string, unknown> | undefined;
  if (p && typeof p.id === "string" && p.id) return p.id;
  return null;
}

const quickActions = [
  { label: "New Patient", icon: <UserPlus className="w-5 h-5" />, href: "/patients/new", dataId: "PATIENT-PROFILE-CREATE", bg: "bg-blue-50", text: "text-blue-600" },
  { label: "Book Appointment", icon: <Calendar className="w-5 h-5" />, href: "/appointments", dataId: "APPT-CREATE", bg: "bg-emerald-50", text: "text-emerald-600" },
  { label: "Create Invoice", icon: <Receipt className="w-5 h-5" />, href: "/billing", dataId: "BILL-CREATE", bg: "bg-amber-50", text: "text-amber-600" },
  { label: "AI Assistant", icon: <Brain className="w-5 h-5" />, href: "/ai", dataId: "AI-TRANSCRIBE-START", bg: "bg-indigo-50", text: "text-indigo-600" },
  { label: "Staff", icon: <UserCog className="w-5 h-5" />, href: "/admin/users", dataId: "ADMIN-USERS", bg: "bg-rose-50", text: "text-rose-600" },
  { label: "Reports", icon: <BarChart3 className="w-5 h-5" />, href: "/admin/reports", dataId: "ADMIN-REPORTS", bg: "bg-sky-50", text: "text-sky-600" },
];

export function AdminDashboard() {
  const { activities, unreadCount, waitingQueue, counters } = useModuleStore();
  const { user } = useAuth();
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showBookAppointment, setShowBookAppointment] = useState(false);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-PK", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: CLINIC_TZ });

  // API data
  const { data: statsData, isLoading: statsLoading, isError: statsError } = useDashboardStats("admin");
  const stats = (statsData?.data as Record<string, unknown>) || {};
  const todayAppointments = (stats.todayAppointments as number) || 0;
  const activePatients = (stats.activePatients as number) || 0;
  const pendingBills = (stats.pendingBills as number) || 0;
  const revenue = (stats.revenue as number) || 0;

  const today = getClinicToday();
  const { data: aptsData, isLoading: aptsLoading, isError: aptsError } = useAppointments({ date: today });
  const todayApts = (Array.isArray(aptsData?.data) ? aptsData.data : []).slice(0, 6) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="DASH-ADMIN">
      {/* Welcome Card */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-4 sm:p-6 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <Sparkles className="w-5 h-5 text-blue-200" />
              <p className="text-blue-100 text-sm">Welcome back</p>
            </div>
            <h1 className="text-lg sm:text-xl font-semibold">{greeting}, {user?.name || "there"}</h1>
            <p className="text-blue-100 mt-1 text-sm">{todayLabel} &mdash; Here&apos;s your clinic at a glance.</p>
          </div>
          {/* WhatsApp connection status — hidden when integration disabled. */}
          <WhatsAppStatusBadge className="bg-white/90 backdrop-blur shadow-sm" />
        </div>
      </div>

      {/* Error banner */}
      {(statsError || aptsError) && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
          Unable to load some dashboard data. Please try refreshing.
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Today's Appointments" value={statsLoading ? 0 : todayAppointments} icon={<Calendar className="w-6 h-6" />} trend={12} trendLabel="vs last week" color="primary" />
        <StatCard label="Active Patients" value={statsLoading ? 0 : activePatients.toLocaleString()} icon={<Users className="w-6 h-6" />} trend={5} trendLabel="this month" color="success" />
        <StatCard label="Pending Bills" value={statsLoading ? 0 : pendingBills} icon={<CreditCard className="w-6 h-6" />} color="warning" />
        <StatCard label="Revenue" value={statsLoading ? "Rs 0" : `Rs ${revenue.toLocaleString()}`} icon={<DollarSign className="w-6 h-6" />} trend={18} trendLabel="vs last month" color="info" />
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Today's Schedule */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-semibold text-stone-900">Today&apos;s Schedule</h2>
            <Link href="/appointments" className="text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors">
              View All
            </Link>
          </div>
          <div className="space-y-3">
            {aptsLoading ? (
              <div className="text-sm text-stone-400 py-8 text-center">Loading appointments...</div>
            ) : todayApts.length === 0 ? (
              <div className="text-sm text-stone-400 py-8 text-center">No appointments scheduled for today.</div>
            ) : (
              todayApts.map((apt) => {
                const pid = getAptPatientId(apt);
                const cls = `bg-white rounded-2xl border border-stone-100 shadow-sm p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 hover:shadow-md transition-shadow ${pid ? "cursor-pointer hover:border-blue-200" : ""}`;
                const inner = (
                  <>
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 sm:flex-1">
                      <div className="shrink-0 min-w-[42px] sm:min-w-[52px] text-center">
                        <p className="text-sm font-semibold text-stone-900 leading-tight">{(apt.startTime as string) || "—"}</p>
                        <p className="text-[11px] text-stone-400 leading-tight">{(apt.endTime as string) || "—"}</p>
                      </div>
                      <div className="hidden sm:block w-px h-10 bg-stone-100" />
                      <Avatar name={getAptPatientName(apt)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900 truncate">{getAptPatientName(apt)}</p>
                        <p className="text-xs text-stone-500 truncate">{getAptDoctorName(apt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap pl-[54px] sm:pl-0 sm:shrink-0">
                      {(apt.type as string) ? (
                        <Badge variant="info">{((apt.type as string) || "").replace(/_/g, " ")}</Badge>
                      ) : null}
                      <Badge
                        variant={appointmentStatusColors[(apt.status as string) || ""] as "success" | "warning" | "danger" | "info" | "default"}
                      >
                        {((apt.status as string) || "").replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </>
                );
                return pid ? (
                  <Link key={apt.id as string} href={`/patients/${pid}`} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <div key={apt.id as string} className={cls}>
                    {inner}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <h2 className="text-base sm:text-lg font-semibold text-stone-900">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3">
            {quickActions.map((action) =>
              ["PATIENT-PROFILE-CREATE", "APPT-CREATE", "BILL-CREATE"].includes(action.dataId) ? (
                <button
                  key={action.label}
                  data-id={action.dataId}
                  onClick={() => {
                    if (action.dataId === "PATIENT-PROFILE-CREATE") setShowAddPatient(true);
                    else if (action.dataId === "APPT-CREATE") setShowBookAppointment(true);
                    else if (action.dataId === "BILL-CREATE") setShowCreateInvoice(true);
                  }}
                  className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 sm:p-5 flex flex-col items-center gap-3 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${action.bg} ${action.text} group-hover:scale-105 transition-transform`}>
                    {action.icon}
                  </div>
                  <span className="text-sm font-medium text-stone-700 text-center">{action.label}</span>
                </button>
              ) : (
                <Link
                  key={action.label}
                  href={action.href}
                  data-id={action.dataId}
                  className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 sm:p-5 flex flex-col items-center gap-3 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${action.bg} ${action.text} group-hover:scale-105 transition-transform`}>
                    {action.icon}
                  </div>
                  <span className="text-sm font-medium text-stone-700 text-center">{action.label}</span>
                </Link>
              )
            )}
          </div>
        </div>
      </div>

      {/* Braces overview */}
      <BracesOverviewCard />

      {/* Status banners */}
      {(waitingQueue.length > 0 || unreadCount > 0) && (
        <div className="space-y-2">
          {waitingQueue.length > 0 && (
            <div className="p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
              <span className="font-medium">{waitingQueue.length}</span> patient{waitingQueue.length !== 1 ? "s" : ""} in waiting queue
            </div>
          )}
          {unreadCount > 0 && (
            <div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
              <span className="font-medium">{unreadCount}</span> unread notification{unreadCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}

      {/* Slide Panels */}
      <AddPatientModal isOpen={showAddPatient} onClose={() => setShowAddPatient(false)} />
      <CreateAppointmentModal isOpen={showBookAppointment} onClose={() => setShowBookAppointment(false)} />
      <CreateInvoiceModal isOpen={showCreateInvoice} onClose={() => setShowCreateInvoice(false)} />
    </div>
  );
}

interface OrthoCaseSummary {
  id: string;
  patientId: string;
  status: string;
  type: string;
  patient: { id: string; firstName: string; lastName: string; patientCode: string } | null;
  visits: { nextVisitDate: string | null }[];
}

function BracesOverviewCard() {
  const { data: allActive } = useQuery({
    queryKey: ["ortho-cases", "active"],
    queryFn: async () => {
      const r = await fetch("/api/ortho-cases?status=ACTIVE");
      const j = await r.json();
      return (j?.data ?? []) as OrthoCaseSummary[];
    },
  });
  const { data: dueSoon } = useQuery({
    queryKey: ["ortho-cases", "active", "due7"],
    queryFn: async () => {
      const r = await fetch("/api/ortho-cases?status=ACTIVE&dueWithinDays=7");
      const j = await r.json();
      return (j?.data ?? []) as OrthoCaseSummary[];
    },
  });

  const activeCount = allActive?.length ?? 0;
  const due = dueSoon ?? [];

  if (activeCount === 0 && due.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smile className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-stone-900">Orthodontics</h3>
          </div>
          <Link href="/patients" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
            View all patients →
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg bg-blue-50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-blue-700 font-semibold">
              <Smile className="w-3.5 h-3.5" />
              Active cases
            </div>
            <div className="text-2xl font-bold text-blue-700 mt-1">{activeCount}</div>
          </div>
          <div className="rounded-lg bg-amber-50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-700 font-semibold">
              <Clock className="w-3.5 h-3.5" />
              Adjustments next 7 days
            </div>
            <div className="text-2xl font-bold text-amber-700 mt-1">{due.length}</div>
          </div>
          <div className="rounded-lg bg-stone-50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
              <Calendar className="w-3.5 h-3.5" />
              Upcoming list
            </div>
            <div className="text-stone-700 mt-1">
              {due.length === 0 ? (
                <span className="text-stone-400 italic text-xs">None scheduled.</span>
              ) : (
                <ul className="space-y-1 mt-1">
                  {due.slice(0, 3).map((c) => (
                    <li key={c.id} className="truncate text-xs">
                      <Link href={`/patients/${c.patientId}`} className="text-stone-700 hover:text-blue-700">
                        {c.patient
                          ? `${c.patient.firstName} ${c.patient.lastName}`
                          : "Patient"}
                      </Link>
                    </li>
                  ))}
                  {due.length > 3 && (
                    <li className="text-[10px] text-stone-400">+{due.length - 3} more</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

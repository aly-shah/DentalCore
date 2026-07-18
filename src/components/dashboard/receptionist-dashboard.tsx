"use client";

import {
  Calendar, UserCheck, Clock, CheckCircle, UserPlus, DoorOpen,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { VoiceNoteUpdates } from "@/components/dashboard/voice-note-updates";
import { useDashboardStats, useAppointments } from "@/hooks/use-queries";
import Link from "next/link";
import { useModuleStore } from "@/modules/core/store";
import { useAuth } from "@/lib/auth-context";
import { ScheduleActionPanel } from "@/components/dashboard/schedule-action-panel";
import { useState } from "react";

import { getClinicToday, CLINIC_TZ } from "@/lib/utils";
const quickActions = [
  { label: "Register Patient", icon: <UserPlus className="w-6 h-6" />, href: "/patients", bg: "bg-blue-50", text: "text-blue-600" },
  { label: "Book Appointment", icon: <Calendar className="w-6 h-6" />, href: "/appointments", bg: "bg-emerald-50", text: "text-emerald-600" },
  { label: "Check In", icon: <UserCheck className="w-6 h-6" />, href: "/appointments/check-in", bg: "bg-amber-50", text: "text-amber-600" },
  { label: "Room View", icon: <DoorOpen className="w-6 h-6" />, href: "/rooms", bg: "bg-sky-50", text: "text-sky-600" },
];

function getAptName(apt: Record<string, unknown>): string {
  if (apt.patientName) return String(apt.patientName);
  const p = apt.patient as Record<string, unknown> | undefined;
  if (p?.firstName) return `${p.firstName} ${p.lastName || ""}`.trim();
  return "Patient";
}
function getAptDoc(apt: Record<string, unknown>): string {
  if (apt.doctorName) return String(apt.doctorName);
  const d = apt.doctor as Record<string, unknown> | undefined;
  if (d?.name) return String(d.name);
  return "Doctor";
}

export function ReceptionistDashboard() {
  const { activities, waitingQueue } = useModuleStore();
  const { user } = useAuth();
  const [selectedApt, setSelectedApt] = useState<Record<string, unknown> | null>(null);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-PK", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: CLINIC_TZ });

  // API data
  const { data: statsData, isLoading: statsLoading, isError: statsError } = useDashboardStats("receptionist");
  const stats = (statsData?.data as Record<string, unknown>) || {};
  const totalAppointments = (stats.appointments as number) || 0;
  const checkedIn = (stats.checkedIn as number) || 0;
  const waiting = (stats.waiting as number) || 0;
  const completed = (stats.completed as number) || 0;

  const today = getClinicToday();
  const { data: aptsData, isLoading: aptsLoading, isError: aptsError } = useAppointments({ date: today });
  const todayApts = (Array.isArray(aptsData?.data) ? aptsData.data : []).slice(0, 8) as Array<Record<string, unknown>>;
  const checkInQueue = todayApts.filter(
    (a) => a.status === "SCHEDULED" || a.status === "CONFIRMED" || a.status === "CHECKED_IN" || a.status === "WAITING"
  );

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="DASH-RECEPTION">
      {/* Welcome Card */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-4 sm:p-6 text-white shadow-sm">
        <p className="text-blue-100 text-sm">Front Desk</p>
        <h1 className="text-lg sm:text-xl font-semibold">{greeting}, {user?.name || "there"}</h1>
        <p className="text-blue-100 mt-1 text-sm">{todayLabel} &mdash; Here&apos;s your check-in overview.</p>
      </div>

      {/* Error banner */}
      {(statsError || aptsError) && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
          Unable to load some dashboard data. Please try refreshing.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Appointments" value={statsLoading ? 0 : totalAppointments} icon={<Calendar className="w-6 h-6" />} color="primary" />
        <StatCard label="Checked In" value={statsLoading ? 0 : checkedIn} icon={<UserCheck className="w-6 h-6" />} color="success" />
        <StatCard label="Waiting" value={statsLoading ? 0 : waiting} icon={<Clock className="w-6 h-6" />} color="warning" />
        <StatCard label="Completed" value={statsLoading ? 0 : completed} icon={<CheckCircle className="w-6 h-6" />} color="info" />
      </div>

      {/* Voice Note Updates — clinic-wide follow-ups/actions the doctor flagged */}
      <VoiceNoteUpdates />

      {/* Check-In Queue */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold text-stone-900">Check-In Queue</h2>
          <Link href="/appointments/check-in" className="text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors">
            View All
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {aptsLoading ? (
            <div className="text-sm text-stone-400 py-8 text-center col-span-2">Loading queue...</div>
          ) : checkInQueue.length === 0 ? (
            <div className="text-sm text-stone-400 py-8 text-center col-span-2">No patients in the check-in queue.</div>
          ) : (
            checkInQueue.map((apt) => {
              const needsCheckIn = apt.status === "SCHEDULED" || apt.status === "CONFIRMED";
              const isCheckedIn = apt.status === "CHECKED_IN";
              const isWaiting = apt.status === "WAITING";

              return (
                <div
                  key={apt.id as string}
                  onClick={() => setSelectedApt(apt)}
                  className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 sm:p-5 flex items-center gap-4 hover:shadow-md hover:border-blue-200 transition-shadow cursor-pointer"
                >
                  <Avatar name={getAptName(apt)} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{getAptName(apt)}</p>
                    <p className="text-xs text-stone-500">{(apt.startTime as string) || "—"} &middot; {getAptDoc(apt)}</p>
                  </div>
                  {needsCheckIn && (
                    <Button
                      size="sm"
                      data-id="APPT-CHECKIN-CONFIRM"
                      onClick={(e) => { e.stopPropagation(); setSelectedApt(apt); }}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 font-medium"
                    >
                      CHECK IN
                    </Button>
                  )}
                  {isCheckedIn && <Badge variant="success">Checked In</Badge>}
                  {isWaiting && <Badge variant="warning" dot>Waiting</Badge>}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Live Waiting Queue */}
      {waitingQueue.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Live Waiting Queue ({waitingQueue.length})</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {waitingQueue.slice(0, 6).map((entry) => (
              <div key={entry.appointmentId} className="bg-white rounded-xl border border-stone-100 shadow-sm p-3 flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 truncate">{entry.patientName}</p>
                  <p className="text-xs text-stone-500">{entry.doctorName} &middot; {entry.stage.toLowerCase()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-base sm:text-lg font-semibold text-stone-900">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 sm:p-5 flex flex-col items-center gap-3 hover:shadow-md hover:border-blue-200 transition-all group"
            >
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${action.bg} ${action.text} group-hover:scale-105 transition-transform`}>
                {action.icon}
              </div>
              <span className="text-sm font-medium text-stone-700 text-center">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <ScheduleActionPanel appointment={selectedApt} isOpen={!!selectedApt} onClose={() => setSelectedApt(null)} />
    </div>
  );
}

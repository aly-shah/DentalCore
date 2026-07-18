"use client";

import { useState, useMemo } from "react";
import {
  LogIn,
  Clock,
  UserX,
  CheckCircle2,
  Users,
  Search,
  Timer,
  Heart,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { AppointmentStatus } from "@/types";
import type { Appointment } from "@/types";
import {
  appointmentTypeLabels,
  appointmentStatusColors,
} from "@/lib/constants";
import { useModuleAccess, useModuleEmit } from "@/modules/core/hooks";
import { useAppointments, useCheckInAppointment, useNoShowAppointment } from "@/hooks/use-queries";
import { ScheduleActionPanel } from "@/components/dashboard/schedule-action-panel";
import { LoadingSpinner } from "@/components/ui/loading";
import { SystemEvents } from "@/modules/core/events";

import { getClinicToday } from "@/lib/utils";
const today = getClinicToday();

function minutesSince(checkinTime: string | undefined): string {
  if (!checkinTime) return "";
  const [h, m] = checkinTime.split(":").map(Number);
  const now = new Date();
  const diff = (now.getHours() - h) * 60 + (now.getMinutes() - m);
  if (diff <= 0) return "Just now";
  return `${diff} min`;
}

function minutesSinceNum(checkinTime: string | undefined): number {
  if (!checkinTime) return 0;
  const [h, m] = checkinTime.split(":").map(Number);
  const now = new Date();
  return Math.max(0, (now.getHours() - h) * 60 + (now.getMinutes() - m));
}

export default function CheckInPage() {
  const access = useModuleAccess("MOD-APPOINTMENT");
  const emit = useModuleEmit("MOD-APPOINTMENT");
  const checkInMutation = useCheckInAppointment();
  const noShowMutation = useNoShowAppointment();
  const [search, setSearch] = useState("");
  const [localStatuses, setLocalStatuses] = useState<Record<string, AppointmentStatus>>({});
  const [selectedApt, setSelectedApt] = useState<Record<string, unknown> | null>(null);

  const { data: appointmentsResponse, isLoading } = useAppointments({ date: today });
  const allAppointments = (appointmentsResponse?.data || []) as Appointment[];

  const todayAppointments = useMemo(() => {
    return allAppointments
      // `date` arrives as a full ISO timestamp (…T00:00:00.000Z); compare the
      // calendar-day prefix so it matches getClinicToday()'s YYYY-MM-DD.
      .filter((a) => String(a.date).slice(0, 10) === today)
      .filter(
        (a) =>
          a.status !== AppointmentStatus.CANCELLED &&
          a.status !== AppointmentStatus.NO_SHOW
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [allAppointments]);

  const filtered = useMemo(() => {
    if (!search) return todayAppointments;
    const q = search.toLowerCase();
    return todayAppointments.filter((a) => {
      return (
        a.patientName.toLowerCase().includes(q) ||
        ((a as Appointment & { patientPhone?: string }).patientPhone || "").includes(q)
      );
    });
  }, [todayAppointments, search]);

  const getStatus = (id: string, original: AppointmentStatus) =>
    localStatuses[id] || original;

  const handleCheckIn = async (id: string) => {
    const appt = todayAppointments.find((a) => a.id === id);
    // Optimistic update
    setLocalStatuses((prev) => ({ ...prev, [id]: AppointmentStatus.CHECKED_IN }));
    try {
      await checkInMutation.mutateAsync(id);
      if (appt) {
        emit(SystemEvents.APPOINTMENT_CHECKED_IN, {
          patientName: appt.patientName,
          doctorName: appt.doctorName,
        }, { patientId: appt.patientId, appointmentId: appt.id });
        // Check-in creates the draft invoice — open it so the front desk can
        // bill. Reflect the just-applied CHECKED_IN status in the panel.
        setSelectedApt({ ...appt, status: AppointmentStatus.CHECKED_IN } as unknown as Record<string, unknown>);
      }
    } catch {
      // Revert optimistic update
      setLocalStatuses((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleNoShow = async (id: string) => {
    if (!confirm("Mark this patient as no-show?")) return;
    setLocalStatuses((prev) => ({ ...prev, [id]: AppointmentStatus.NO_SHOW }));
    try {
      await noShowMutation.mutateAsync({ id, reason: "Patient did not arrive" });
      const appt = todayAppointments.find((a) => a.id === id);
      if (appt) {
        emit(SystemEvents.APPOINTMENT_NO_SHOW, {
          patientName: appt.patientName,
        }, { patientId: appt.patientId, appointmentId: appt.id });
      }
    } catch {
      setLocalStatuses((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const waitingPatients = filtered.filter((a) => {
    const status = getStatus(a.id, a.status);
    return (
      status === AppointmentStatus.WAITING ||
      status === AppointmentStatus.CHECKED_IN
    );
  });

  const scheduledCount = filtered.filter((a) => {
    const status = getStatus(a.id, a.status);
    return status === AppointmentStatus.SCHEDULED || status === AppointmentStatus.CONFIRMED;
  }).length;

  const typeBadgeVariant = (type: string): "primary" | "success" | "warning" | "default" => {
    switch (type) {
      case "CONSULTATION": return "primary";
      case "PROCEDURE": return "success";
      case "FOLLOW_UP": return "warning";
      default: return "default";
    }
  };

  const todayFormatted = new Date(today).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div data-id="APPT-CHECKIN" className="flex flex-col space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            Check-In
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-sm text-stone-500">{todayFormatted}</span>
            <Badge variant="primary">
              {filtered.length} patients today
            </Badge>
            {scheduledCount > 0 && (
              <Badge variant="warning">
                {scheduledCount} awaiting check-in
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Search Bar - Large & Prominent */}
      <div className="relative">
        <div className="bg-white rounded-2xl border-2 border-stone-200 shadow-sm focus-within:border-blue-400 focus-within:shadow-md focus-within:shadow-blue-100/50 transition-all duration-200">
          <div className="flex items-center px-5 py-1">
            <Search className="w-5 h-5 text-stone-400 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient name or phone number..."
              className="w-full px-4 py-4 text-base bg-transparent text-stone-900 placeholder:text-stone-400 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-stone-400 hover:text-stone-600 cursor-pointer p-1"
              >
                <UserX className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Queue - Main Column */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
              Today&apos;s Queue
            </h2>
            <span className="text-xs text-stone-400">({filtered.length})</span>
          </div>

          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Heart className="w-7 h-7 text-stone-400" />
              </div>
              <p className="text-stone-500 text-sm font-medium">
                No patients found.
              </p>
              <p className="text-stone-400 text-xs mt-1">
                Try searching by name or phone number.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {filtered.map((appt) => {
              const status = getStatus(appt.id, appt.status);
              const isCheckedIn =
                status === AppointmentStatus.CHECKED_IN ||
                status === AppointmentStatus.WAITING;
              const isCompleted = status === AppointmentStatus.COMPLETED;
              const isInProgress = status === AppointmentStatus.IN_PROGRESS;
              const isNoShow = status === AppointmentStatus.NO_SHOW;
              const canCheckIn =
                status === AppointmentStatus.SCHEDULED ||
                status === AppointmentStatus.CONFIRMED;

              return (
                <Card
                  key={appt.id}
                  className={`transition-all duration-200 ${
                    isCheckedIn ? "border-emerald-200 bg-emerald-50/30" : ""
                  } ${isNoShow ? "opacity-50" : ""}`}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-5 gap-3 sm:gap-4">
                    {/* Left: Patient Info */}
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      <Avatar name={appt.patientName} size="xl" />
                      <div className="min-w-0">
                        <p className="text-base sm:text-lg font-semibold text-stone-900 truncate">
                          {appt.patientName}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-sm text-stone-500">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-stone-400" />
                            {appt.startTime} - {appt.endTime}
                          </span>
                          <span className="text-stone-300">|</span>
                          <span>{appt.doctorName}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2.5">
                          <Badge variant={typeBadgeVariant(appt.type)}>
                            {appointmentTypeLabels[appt.type] || appt.type}
                          </Badge>
                          {isCheckedIn && appt.checkinTime && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                              <Timer className="w-3 h-3" />
                              Waiting {minutesSince(appt.checkinTime)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-3 flex-shrink-0 w-full sm:w-auto">
                      {canCheckIn && (
                        <>
                          <Button
                            size="lg"
                            variant="primary"
                            iconLeft={<LogIn className="w-5 h-5" />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCheckIn(appt.id);
                            }}
                            className="rounded-2xl px-8 py-3.5 text-base shadow-sm shadow-blue-200"
                          >
                            Check In
                          </Button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNoShow(appt.id);
                            }}
                            className="text-xs text-stone-400 hover:text-red-500 transition-colors cursor-pointer font-medium"
                          >
                            Mark as No Show
                          </button>
                        </>
                      )}
                      {isCheckedIn && (
                        <>
                          <div className="flex items-center gap-2 bg-emerald-100 text-emerald-700 rounded-2xl px-5 py-3">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="font-semibold text-sm">Checked In</span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            iconLeft={<Receipt className="w-4 h-4" />}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedApt({ ...appt, status: getStatus(appt.id, appt.status) } as unknown as Record<string, unknown>);
                            }}
                            className="rounded-2xl"
                          >
                            Invoice
                          </Button>
                        </>
                      )}
                      {isInProgress && (
                        <Badge variant="info" dot>
                          In Consultation
                        </Badge>
                      )}
                      {isCompleted && (
                        <Badge variant="success" dot>
                          Completed
                        </Badge>
                      )}
                      {isNoShow && (
                        <Badge variant="danger" dot>
                          No Show
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Waiting Room Panel */}
        <div className="flex flex-col gap-4">
          <Card className="sticky top-6">
            <CardHeader className="border-b-0 pb-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900">
                      Waiting Room
                    </h3>
                    <p className="text-xs text-stone-400">Currently waiting</p>
                  </div>
                </div>
                <Badge variant="primary">{waitingPatients.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {waitingPatients.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="w-12 h-12 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Users className="w-5 h-5 text-stone-400" />
                  </div>
                  <p className="text-sm text-stone-400 font-medium">
                    No patients waiting
                  </p>
                  <p className="text-xs text-stone-300 mt-0.5">
                    Patients will appear here after check-in
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {waitingPatients.map((appt) => {
                    const waitMin = minutesSinceNum(appt.checkinTime);
                    const isLongWait = waitMin > 20;
                    return (
                      <div
                        key={appt.id}
                        className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-stone-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar name={appt.patientName} size="sm" />
                          <div>
                            <p className="text-sm font-medium text-stone-900">
                              {appt.patientName}
                            </p>
                            <p className="text-xs text-stone-400">
                              {appt.doctorName}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span
                            className={`text-xs font-semibold ${
                              isLongWait ? "text-red-500" : "text-amber-600"
                            }`}
                          >
                            {appt.checkinTime
                              ? `${minutesSince(appt.checkinTime)} wait`
                              : "Just arrived"}
                          </span>
                          <span className="text-[10px] text-stone-400">
                            Appt: {appt.startTime}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ScheduleActionPanel
        appointment={selectedApt}
        isOpen={!!selectedApt}
        onClose={() => setSelectedApt(null)}
      />
    </div>
  );
}

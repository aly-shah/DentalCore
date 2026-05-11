"use client";

import { useState } from "react";
import {
  CalendarClock,
  AlertTriangle,
  Clock,
  CalendarDays,
  CheckCircle,
  Phone,
  Check,
  User,
  Stethoscope,
} from "lucide-react";
import {
  Button,
  Card,
  Badge,
  StatCard,
  SearchInput,
} from "@/components/ui";
import { formatDate, toClinicDay } from "@/lib/utils";
import { useModuleAccess, useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useFollowUps, useUpdateFollowUp, useCreateFollowUp } from "@/hooks/use-queries";
import { LoadingSpinner } from "@/components/ui/loading";

const followUpStatusColors: Record<
  string,
  "success" | "warning" | "danger" | "info" | "default"
> = {
  PENDING: "warning",
  COMPLETED: "success",
  MISSED: "danger",
  CANCELLED: "default",
};

export default function FollowUpsPage() {
  const access = useModuleAccess("MOD-FOLLOWUP");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL");

  const emit = useModuleEmit("MOD-FOLLOWUP");
  const { data: followUpsResponse, isLoading } = useFollowUps();
  const updateFollowUp = useUpdateFollowUp();
  const createFollowUp = useCreateFollowUp();
  // The API returns Prisma rows with nested patient/doctor objects — flatten and
  // null-guard them here so the page never crashes on missing/odd data.
  type RawFollowUp = {
    id?: string;
    patientId?: string | null;
    doctorId?: string | null;
    reason?: string | null;
    dueDate?: string | null;
    status?: string | null;
    patient?: { firstName?: string | null; lastName?: string | null } | null;
    doctor?: { name?: string | null } | null;
  };
  const rawFollowUps = Array.isArray(followUpsResponse?.data)
    ? (followUpsResponse?.data as RawFollowUp[])
    : [];
  const followUps = rawFollowUps.map((f) => ({
    id: f.id ?? "",
    patientId: f.patientId ?? "",
    doctorId: f.doctorId ?? "",
    patientName:
      [f.patient?.firstName, f.patient?.lastName].filter(Boolean).join(" ") ||
      "Unknown patient",
    doctorName: f.doctor?.name ?? "Unassigned",
    reason: f.reason ?? "",
    dueDate: f.dueDate ?? "",
    dueDay: f.dueDate ? toClinicDay(f.dueDate) : "",
    status: f.status ?? "PENDING",
  }));

  const today = new Date();
  const todayStr = toClinicDay(today);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const dueToday = followUps.filter(
    (f) => f.dueDay === todayStr && f.status === "PENDING"
  ).length;
  const overdueCount = followUps.filter(
    (f) =>
      !!f.dueDate &&
      new Date(f.dueDate) < today &&
      f.status !== "COMPLETED" &&
      f.status !== "CANCELLED" &&
      f.dueDay !== todayStr
  ).length;
  const thisWeek = followUps.filter((f) => {
    if (!f.dueDate) return false;
    const due = new Date(f.dueDate);
    return due >= today && due <= weekEnd && f.status === "PENDING";
  }).length;
  const completed = followUps.filter(
    (f) => f.status === "COMPLETED"
  ).length;

  const filters = ["ALL", "PENDING", "COMPLETED", "MISSED", "CANCELLED"];

  const q = search.toLowerCase();
  const filtered = followUps.filter((f) => {
    const matchesSearch =
      f.patientName.toLowerCase().includes(q) ||
      f.doctorName.toLowerCase().includes(q) ||
      f.reason.toLowerCase().includes(q);
    const matchesStatus = activeFilter === "ALL" || f.status === activeFilter;
    return matchesSearch && matchesStatus;
  });

  const isOverdue = (followUp: { dueDate: string; dueDay: string; status: string }) => {
    return (
      !!followUp.dueDate &&
      new Date(followUp.dueDate) < today &&
      followUp.status !== "COMPLETED" &&
      followUp.status !== "CANCELLED" &&
      followUp.dueDay !== todayStr
    );
  };

  const isDueToday = (followUp: { dueDay: string; status: string }) => {
    return followUp.dueDay === todayStr && followUp.status === "PENDING";
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  return (
    <div data-id="PATIENT-TAB-FOLLOWUPS" className="animate-fade-in space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">Follow-Ups</h1>
        <p className="text-sm text-stone-400 mt-0.5">
          Track post-visit follow-ups, reminders, and patient progress
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Due Today"
          value={dueToday}
          icon={<Clock className="w-5 h-5" />}
          color="warning"
        />
        <StatCard
          label="Overdue"
          value={overdueCount}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="danger"
        />
        <StatCard
          label="This Week"
          value={thisWeek}
          icon={<CalendarDays className="w-5 h-5" />}
          color="info"
        />
        <StatCard
          label="Completed"
          value={completed}
          icon={<CheckCircle className="w-5 h-5" />}
          color="success"
        />
      </div>

      {/* Search + Filter Chips */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
        <SearchInput
          placeholder="Search patients, doctors, or reasons..."
          value={search}
          onChange={setSearch}
          className="w-full sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                activeFilter === f
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              {f === "ALL"
                ? "All"
                : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Follow-Up Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {filtered.map((followUp) => {
          const overdue = isOverdue(followUp);
          const dueToday = isDueToday(followUp);

          return (
            <Card
              key={followUp.id}
              padding="lg"
              className={`bg-white rounded-2xl shadow-sm animate-fade-in ${
                overdue
                  ? "border-2 border-red-200"
                  : dueToday
                  ? "border-2 border-amber-200"
                  : "border border-stone-100"
              }`}
            >
              {/* Patient + Status */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold ${
                      overdue
                        ? "bg-red-50 text-red-600"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {followUp.patientName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-900">
                      {followUp.patientName}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-stone-400">
                      <Stethoscope className="w-3 h-3" />
                      {followUp.doctorName}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={followUpStatusColors[followUp.status]} dot>
                    {followUp.status}
                  </Badge>
                  {overdue && (
                    <Badge variant="danger">Overdue</Badge>
                  )}
                  {dueToday && (
                    <Badge variant="warning">Today</Badge>
                  )}
                </div>
              </div>

              {/* Reason */}
              <p className="text-sm text-stone-600 mb-3 line-clamp-2 leading-relaxed">
                {followUp.reason}
              </p>

              {/* Due date */}
              <div className="flex items-center gap-2 text-xs text-stone-400 mb-4">
                <CalendarClock className="w-3.5 h-3.5" />
                <span>Due: {followUp.dueDate ? formatDate(followUp.dueDate) : "—"}</span>
              </div>

              {/* Actions */}
              {followUp.status === "PENDING" && (
                <div className="flex items-center gap-2 pt-3 border-t border-stone-100">
                  <Button
                    size="sm"
                    variant="outline"
                    iconLeft={<Phone className="w-3.5 h-3.5" />}
                    onClick={() => {
                      const dueDate = prompt("Enter new follow-up date (YYYY-MM-DD):");
                      if (dueDate) {
                        createFollowUp.mutate({
                          patientId: followUp.patientId,
                          doctorId: followUp.doctorId,
                          reason: followUp.reason,
                          dueDate,
                        });
                        emit(SystemEvents.FOLLOWUP_SCHEDULED, { patientName: followUp.patientName, dueDate });
                      }
                    }}
                  >
                    Schedule
                  </Button>
                  <Button
                    size="sm"
                    variant="success"
                    iconLeft={<Check className="w-3.5 h-3.5" />}
                    onClick={() => {
                      updateFollowUp.mutate({ id: followUp.id, data: { status: "COMPLETED" } });
                      emit(SystemEvents.FOLLOWUP_COMPLETED, { id: followUp.id, patientName: followUp.patientName });
                    }}
                  >
                    Complete
                  </Button>
                </div>
              )}
              {followUp.status === "MISSED" && (
                <div className="flex items-center gap-2 pt-3 border-t border-stone-100">
                  <Button
                    size="sm"
                    variant="outline"
                    iconLeft={<Phone className="w-3.5 h-3.5" />}
                    onClick={() => {
                      const dueDate = prompt("Enter new follow-up date (YYYY-MM-DD):");
                      if (dueDate) {
                        updateFollowUp.mutate({ id: followUp.id, data: { status: "CANCELLED" } });
                        createFollowUp.mutate({
                          patientId: followUp.patientId,
                          doctorId: followUp.doctorId,
                          reason: followUp.reason,
                          dueDate,
                        });
                        emit(SystemEvents.FOLLOWUP_SCHEDULED, { patientName: followUp.patientName, dueDate });
                      }
                    }}
                  >
                    Reschedule
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <CalendarClock className="w-12 h-12 text-stone-200 mx-auto mb-3" />
          <p className="text-sm text-stone-400">No follow-ups found</p>
        </div>
      )}
    </div>
  );
}

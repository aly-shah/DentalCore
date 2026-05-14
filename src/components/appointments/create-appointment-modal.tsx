"use client";

import { useState } from "react";
import {
  Clock, User, Stethoscope, Calendar, CheckCircle, MapPin,
} from "lucide-react";
import { SlidePanel } from "@/components/ui/slide-panel";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { usePatients, usePatient, useStaff, useRooms, useCreateAppointment, useTreatments, usePatientAppointments } from "@/hooks/use-queries";
import { UserRole } from "@/types";
import type { Patient, User as UserType, Room } from "@/types";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useAuth } from "@/lib/auth-context";
import { cn, getClinicToday } from "@/lib/utils";

interface CreateAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedPatientId?: string;
}

// Time slots are handled by TimePicker component

export function CreateAppointmentModal({ isOpen, onClose, preselectedPatientId }: CreateAppointmentModalProps) {
  const emit = useModuleEmit("MOD-APPOINTMENT");
  const { user } = useAuth();
  const createAppointment = useCreateAppointment();

  const { data: patientsResponse } = usePatients();
  const allPatients = (patientsResponse?.data || []) as Patient[];
  const { data: staffResponse } = useStaff();
  const allUsers = (staffResponse?.data || []) as UserType[];
  const { data: roomsResponse } = useRooms();
  const allRooms = (roomsResponse?.data || []) as Room[];

  const [patientSearch, setPatientSearch] = useState("");
  const [patientId, setPatientId] = useState(preselectedPatientId || "");

  // Track what we last applied so we re-apply when either isOpen or preselectedPatientId changes
  const [appliedKey, setAppliedKey] = useState("");
  const currentKey = isOpen ? `open-${preselectedPatientId || "none"}` : "closed";
  if (currentKey !== appliedKey) {
    setAppliedKey(currentKey);
    if (isOpen && preselectedPatientId) {
      setPatientId(preselectedPatientId);
      setPatientSearch("");
    }
  }
  const [type, setType] = useState("CONSULTATION");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(getClinicToday());
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [roomId, setRoomId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Recurring series
  const [recurring, setRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<"WEEKLY" | "BIWEEKLY" | "MONTHLY" | "EVERY_N_WEEKS">("WEEKLY");
  const [recurrenceCount, setRecurrenceCount] = useState("4");
  const [recurrenceIntervalWeeks, setRecurrenceIntervalWeeks] = useState("4");

  // Fetch treatments/procedures from DB
  const { data: treatmentsRes } = useTreatments();
  const treatments = ((treatmentsRes?.data || []) as { id: string; name: string; category: string; duration: number; basePrice: number }[]);

  // Fetch selected patient's appointment history
  const { data: patientApptsRes } = usePatientAppointments(patientId);
  const patientAppointments = ((patientApptsRes?.data || []) as { id: string; status: string; type: string; doctorId: string; doctorName?: string }[]);
  const hasCompletedVisit = patientAppointments.some((a) => a.status === "COMPLETED" || a.status === "IN_PROGRESS");
  const lastDoctor = patientAppointments[0]?.doctorId || "";

  // Fetch individual patient when preselected (list only returns 20)
  const { data: singlePatientRes } = usePatient(patientId);
  const singlePatient = (singlePatientRes?.data || null) as Patient | null;

  const doctors = allUsers.filter((u) => u.role === UserRole.DOCTOR);
  const availableRooms = allRooms.filter((r) => r.isAvailable);
  const selectedPatient = allPatients.find((p) => p.id === patientId) || singlePatient;

  // Sort: patient's last doctor first, then assigned doctor, then alphabetical
  const sortedDoctors = [...doctors].sort((a, b) => {
    if (a.id === lastDoctor) return -1;
    if (b.id === lastDoctor) return 1;
    if (selectedPatient?.assignedDoctorId === a.id) return -1;
    if (selectedPatient?.assignedDoctorId === b.id) return 1;
    return a.name.localeCompare(b.name);
  });

  // Dynamic appointment types based on patient history
  const appointmentTypes = [
    { v: "CONSULTATION", l: "Consultation", d: "30", always: true },
    { v: "PROCEDURE", l: "Procedure", d: "45", always: true },
    { v: "FOLLOW_UP", l: "Follow-Up", d: "20", always: false },
    { v: "REVIEW", l: "Review", d: "15", always: false },
    { v: "EMERGENCY", l: "Emergency", d: "30", always: true },
  ].filter((t) => t.always || hasCompletedVisit);
  const filteredPatients = patientSearch.length >= 2
    ? allPatients.filter((p) =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(patientSearch.toLowerCase()) ||
        p.phone.includes(patientSearch) ||
        p.patientCode.toLowerCase().includes(patientSearch.toLowerCase())
      ).slice(0, 6)
    : [];

  const handleReset = () => {
    setPatientSearch(""); setPatientId(""); setType("CONSULTATION");
    setDoctorId(""); setDate(getClinicToday());
    setTime(""); setDuration("30"); setRoomId("");
    setNotes(""); setError(""); setSuccess(false);
    setRecurring(false); setRecurrencePattern("WEEKLY");
    setRecurrenceCount("4"); setRecurrenceIntervalWeeks("4");
  };

  const handleSubmit = async () => {
    if (!patientId) { setError("Select a patient"); return; }
    if (!doctorId) { setError("Select a doctor"); return; }
    if (!date) { setError("Select a date"); return; }
    if (!time) { setError("Select a time"); return; }
    setError("");

    const durMins = parseInt(duration) || 30;
    const [h, m] = time.split(":").map(Number);
    const endH = h + Math.floor((m + durMins) / 60);
    const endM = (m + durMins) % 60;
    const endTime = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;

    try {
      await createAppointment.mutateAsync({
        patientId, doctorId,
        branchId: user?.branchId || undefined,
        roomId: roomId || undefined,
        date, startTime: time, endTime,
        durationMinutes: durMins,
        type, priority: "NORMAL",
        notes: notes.trim() || undefined,
        createdById: user?.id || undefined,
        ...(recurring ? {
          recurrence: {
            pattern: recurrencePattern,
            count: Math.max(2, Math.min(52, parseInt(recurrenceCount, 10) || 2)),
            ...(recurrencePattern === "EVERY_N_WEEKS"
              ? { intervalWeeks: Math.max(1, Math.min(52, parseInt(recurrenceIntervalWeeks, 10) || 4)) }
              : {}),
          },
        } : {}),
      });

      const doc = doctors.find((d) => d.id === doctorId);
      emit(SystemEvents.APPOINTMENT_BOOKED, {
        patientName: selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : "",
        doctorName: doc?.name ?? "", date,
      }, { patientId, appointmentId: "new" });

      setSuccess(true);
      setTimeout(() => { handleReset(); onClose(); }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to book appointment");
    }
  };

  const handleClose = () => { handleReset(); onClose(); };

  const fmtTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={handleClose}
      title="Book Appointment"
      subtitle="Schedule a new visit"
      width="md"
      data-id="APPT-CREATE"
      footer={success ? undefined : (
        <>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createAppointment.isPending || !patientId || !doctorId || !time}>
            {createAppointment.isPending
              ? "Booking..."
              : recurring
                ? `Book ${recurrenceCount}× series`
                : "Book Appointment"}
          </Button>
        </>
      )}
    >
      {success ? (
        <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-stone-900">Appointment Booked</h3>
          <p className="text-sm text-stone-500 mt-1">
            {selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : ""} {time ? `at ${fmtTime(time)}` : ""}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5 animate-fade-in">{error}</div>}

          {/* Patient */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Patient</span>
            </div>
            {selectedPatient ? (
              <div className="flex items-center justify-between px-3.5 py-3 bg-blue-50 rounded-xl border border-blue-200">
                <div>
                  <p className="text-sm font-semibold text-stone-900">{selectedPatient.firstName} {selectedPatient.lastName}</p>
                  <p className="text-xs text-stone-500">{selectedPatient.patientCode} · {selectedPatient.phone}</p>
                </div>
                <button onClick={() => { setPatientId(""); setPatientSearch(""); }} className="text-xs text-red-500 hover:underline cursor-pointer">Change</button>
              </div>
            ) : (
              <div className="relative">
                <SearchInput placeholder="Search name, phone, or ID..." value={patientSearch} onChange={setPatientSearch} debounceMs={150} />
                {filteredPatients.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white rounded-xl border border-stone-200 shadow-lg max-h-48 overflow-y-auto">
                    {filteredPatients.map((p) => (
                      <button key={p.id} onClick={() => { setPatientId(p.id); setPatientSearch(""); }}
                        className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-stone-50 transition-colors text-left cursor-pointer border-b border-stone-50 last:border-b-0">
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-xs font-bold text-blue-600">
                          {p.firstName[0]}{p.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-stone-900">{p.firstName} {p.lastName}</p>
                          <p className="text-xs text-stone-400">{p.patientCode} · {p.phone}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Type */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Stethoscope className="w-4 h-4 text-violet-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Type</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {appointmentTypes.map((t) => (
                <button key={t.v} onClick={() => { setType(t.v); setDuration(t.d); }}
                  className={cn(
                    "py-2 rounded-xl border-2 text-xs font-medium transition-all cursor-pointer",
                    type === t.v ? "border-violet-400 bg-violet-50 text-violet-700" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                  )}>{t.l}</button>
              ))}
            </div>
            {/* Treatments/procedures from catalog */}
            {treatments.length > 0 && type === "PROCEDURE" && (
              <div className="mt-2">
                <p className="text-[10px] text-stone-400 uppercase tracking-wider mb-1.5">Available Procedures</p>
                <div className="flex flex-wrap gap-1.5">
                  {treatments.slice(0, 8).map((t) => (
                    <button key={t.id} onClick={() => { setDuration(String(t.duration)); setNotes(t.name); }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-all",
                        notes === t.name ? "border-blue-300 bg-blue-50 text-blue-700" : "border-stone-200 text-stone-500 hover:border-stone-300"
                      )}>
                      {t.name} <span className="text-stone-400">({t.duration}min)</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Doctor */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Stethoscope className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Doctor</span>
            </div>
            <Select placeholder="Select doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}
              options={sortedDoctors.map((d) => ({
                value: d.id,
                label: d.name + (d.id === lastDoctor ? " (last seen)" : d.id === selectedPatient?.assignedDoctorId ? " (assigned)" : ""),
              }))} />
            {patientId && !doctorId && lastDoctor && (
              <p className="text-xs text-blue-600 mt-1">
                Patient last seen by {sortedDoctors.find((d) => d.id === lastDoctor)?.name || "a doctor"}
              </p>
            )}
          </div>

          {/* Date + Time */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Date & Time</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DatePicker value={date} onChange={(e) => setDate(e.target.value)} />
              <TimePicker value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {/* Duration */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Duration</span>
            </div>
            <div className="flex gap-1.5">
              {["15", "20", "30", "45", "60"].map((d) => (
                <button key={d} onClick={() => setDuration(d)}
                  className={cn(
                    "flex-1 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                    duration === d ? "border-amber-300 bg-amber-50 text-amber-700" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                  )}>{d} min</button>
              ))}
            </div>
          </div>

          {/* Room (optional) */}
          {availableRooms.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Room (optional)</span>
              </div>
              <Select placeholder="Auto-assign" value={roomId} onChange={(e) => setRoomId(e.target.value)}
                options={[{ value: "", label: "Auto-assign" }, ...availableRooms.map((r) => ({ value: r.id, label: r.name }))]} />
            </div>
          )}

          {/* Notes */}
          <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

          {/* Recurring series */}
          <div className="rounded-xl border border-stone-200 bg-stone-50/40 p-3 space-y-2.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-xs font-bold text-stone-700">Repeat as a series</span>
              <span className="text-[10px] text-stone-400 ml-auto">Creates multiple appointments at once</span>
            </label>

            {recurring && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1 block">Pattern</label>
                  <select
                    value={recurrencePattern}
                    onChange={(e) => setRecurrencePattern(e.target.value as typeof recurrencePattern)}
                    className="w-full px-2 py-1.5 text-xs rounded-md border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-white"
                  >
                    <option value="WEEKLY">Weekly</option>
                    <option value="BIWEEKLY">Every 2 weeks</option>
                    <option value="MONTHLY">Monthly (4 wks)</option>
                    <option value="EVERY_N_WEEKS">Custom interval</option>
                  </select>
                </div>
                {recurrencePattern === "EVERY_N_WEEKS" && (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1 block">Every N weeks</label>
                    <input
                      type="number"
                      min={1}
                      max={52}
                      value={recurrenceIntervalWeeks}
                      onChange={(e) => setRecurrenceIntervalWeeks(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs rounded-md border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-white"
                    />
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1 block">Occurrences</label>
                  <input
                    type="number"
                    min={2}
                    max={52}
                    value={recurrenceCount}
                    onChange={(e) => setRecurrenceCount(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded-md border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </SlidePanel>
  );
}

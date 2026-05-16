"use client";

/**
 * Weekly schedules editor for doctors.
 *
 * Picking a doctor loads their current Schedule rows; the editor lets
 * you toggle each weekday on/off and tweak the working window + lunch
 * break + slot length. Save calls PUT /api/schedules to atomically
 * replace the doctor's whole week.
 *
 * These rows feed the booking wizard, staff calendar, and availability
 * finder — keep them accurate or /book will show "no availability".
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, Clock, Loader2, Save, CheckCircle2, AlertTriangle, Activity,
} from "lucide-react";
import { Card, Avatar } from "@/components/ui";
import { useStaff } from "@/hooks/use-queries";
import { useModuleAccess } from "@/modules/core/hooks";
import { UserRole, type User } from "@/types";
import { cn } from "@/lib/utils";

const DAYS = [
  { dow: 1, label: "Mon" },
  { dow: 2, label: "Tue" },
  { dow: 3, label: "Wed" },
  { dow: 4, label: "Thu" },
  { dow: 5, label: "Fri" },
  { dow: 6, label: "Sat" },
  { dow: 0, label: "Sun" },
];

interface ScheduleRow {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  slotMinutes: number;
}

interface DayDraft extends ScheduleRow {
  enabled: boolean;
}

function blankDraft(dow: number): DayDraft {
  return {
    dayOfWeek: dow,
    enabled: false,
    startTime: "09:00",
    endTime: "17:00",
    breakStart: "13:00",
    breakEnd: "14:00",
    slotMinutes: 30,
  };
}

export default function SchedulesPage() {
  const access = useModuleAccess("MOD-STAFF");
  const { data: staffResponse, isLoading: staffLoading } = useStaff();
  const users = (staffResponse?.data || []) as User[];
  const doctors = useMemo(() => users.filter((u) => u.role === UserRole.DOCTOR), [users]);
  const qc = useQueryClient();

  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedDoctor && doctors[0]) setSelectedDoctor(doctors[0].id);
  }, [doctors, selectedDoctor]);

  const scheduleQ = useQuery({
    enabled: !!selectedDoctor,
    queryKey: ["schedules", selectedDoctor],
    queryFn: async (): Promise<ScheduleRow[]> => {
      const r = await fetch(`/api/schedules?doctorId=${selectedDoctor}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "load_failed");
      return j.data;
    },
  });

  // Hydrate the editor when the doctor (or their stored schedule) changes.
  const [draft, setDraft] = useState<DayDraft[]>([]);
  useEffect(() => {
    if (scheduleQ.data == null) return;
    const byDow = new Map<number, ScheduleRow>();
    for (const r of scheduleQ.data) byDow.set(r.dayOfWeek, r);
    setDraft(DAYS.map((d) => {
      const row = byDow.get(d.dow);
      if (!row) return blankDraft(d.dow);
      return {
        dayOfWeek:   d.dow,
        enabled:     true,
        startTime:   row.startTime,
        endTime:     row.endTime,
        breakStart:  row.breakStart,
        breakEnd:    row.breakEnd,
        slotMinutes: row.slotMinutes,
      };
    }));
  }, [scheduleQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedDoctor) throw new Error("No doctor selected");
      const days = draft
        .filter((d) => d.enabled)
        .map((d) => ({
          dayOfWeek:   d.dayOfWeek,
          startTime:   d.startTime,
          endTime:     d.endTime,
          breakStart:  d.breakStart || null,
          breakEnd:    d.breakEnd || null,
          slotMinutes: d.slotMinutes,
        }));
      const r = await fetch(`/api/schedules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctorId: selectedDoctor, days }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "save_failed");
      return j.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules", selectedDoctor] }),
  });

  const updateDay = (dow: number, patch: Partial<DayDraft>) => {
    setDraft((prev) => prev.map((d) => d.dayOfWeek === dow ? { ...d, ...patch } : d));
  };

  const applyToAll = (template: DayDraft) => {
    setDraft((prev) => prev.map((d) => ({
      ...d,
      enabled:     true,
      startTime:   template.startTime,
      endTime:     template.endTime,
      breakStart:  template.breakStart,
      breakEnd:    template.breakEnd,
      slotMinutes: template.slotMinutes,
    })));
  };

  if (!access.canView) {
    return <div className="flex items-center justify-center py-20 text-stone-500">No access.</div>;
  }
  if (staffLoading) {
    return <div className="flex items-center justify-center py-20 text-stone-500">Loading…</div>;
  }
  if (doctors.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-stone-500">
        No active doctors. Add a doctor under <span className="font-mono">/admin/users</span> first.
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
          <Calendar className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">Schedules</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Weekly hours per doctor. These drive the online booking wizard and staff calendar.
          </p>
        </div>
      </header>

      <Card padding="md">
        <div className="flex flex-wrap gap-2">
          {doctors.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setSelectedDoctor(doc.id)}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition",
                selectedDoctor === doc.id
                  ? "bg-blue-50 border-blue-300 text-blue-900"
                  : "bg-white border-stone-200 text-stone-700 hover:border-stone-300"
              )}
            >
              <Avatar name={doc.name} src={doc.avatar} size="sm" />
              {doc.name}
            </button>
          ))}
        </div>
      </Card>

      {scheduleQ.isLoading ? (
        <Card padding="lg"><div className="text-sm text-stone-500">Loading schedule…</div></Card>
      ) : (
        <>
          <Card padding="md" className="space-y-3">
            {draft.map((d) => {
              const dayLabel = DAYS.find((x) => x.dow === d.dayOfWeek)?.label ?? "?";
              const invalid = d.enabled && d.startTime >= d.endTime;
              return (
                <div
                  key={d.dayOfWeek}
                  className={cn(
                    "grid grid-cols-1 sm:grid-cols-[80px_auto_1fr_auto] gap-3 items-center p-3 rounded-xl border",
                    d.enabled ? "border-blue-100 bg-blue-50/30" : "border-stone-100 bg-stone-50/50",
                    invalid && "border-red-300 bg-red-50/40"
                  )}
                >
                  <label className="inline-flex items-center gap-2 font-semibold text-stone-700">
                    <input
                      type="checkbox"
                      checked={d.enabled}
                      onChange={(e) => updateDay(d.dayOfWeek, { enabled: e.target.checked })}
                    />
                    {dayLabel}
                  </label>

                  {d.enabled ? (
                    <>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock className="w-3.5 h-3.5 text-stone-400" />
                        <TimeInput value={d.startTime} onChange={(v) => updateDay(d.dayOfWeek, { startTime: v })} />
                        <span className="text-stone-400">–</span>
                        <TimeInput value={d.endTime} onChange={(v) => updateDay(d.dayOfWeek, { endTime: v })} />
                      </div>

                      <div className="flex items-center gap-2 text-xs text-stone-500">
                        <span>Break</span>
                        <TimeInput
                          value={d.breakStart ?? ""}
                          onChange={(v) => updateDay(d.dayOfWeek, { breakStart: v || null })}
                          allowEmpty
                        />
                        <span className="text-stone-400">–</span>
                        <TimeInput
                          value={d.breakEnd ?? ""}
                          onChange={(v) => updateDay(d.dayOfWeek, { breakEnd: v || null })}
                          allowEmpty
                        />
                        <span className="ml-3">Slot</span>
                        <select
                          value={d.slotMinutes}
                          onChange={(e) => updateDay(d.dayOfWeek, { slotMinutes: parseInt(e.target.value, 10) })}
                          className="px-2 py-1 rounded-md border border-stone-200 text-xs bg-white"
                        >
                          {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                            <option key={m} value={m}>{m} min</option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => applyToAll(d)}
                        className="justify-self-end text-[11px] text-blue-600 hover:underline"
                        title="Copy these hours to every weekday"
                      >
                        Apply to all
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-stone-400 sm:col-span-3">Off</span>
                  )}
                </div>
              );
            })}
          </Card>

          <div className="flex items-center justify-end gap-3">
            {save.isError && (
              <span className="text-xs text-red-600 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {(save.error as Error).message}
              </span>
            )}
            {save.isSuccess && (
              <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Saved
              </span>
            )}
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || draft.some((d) => d.enabled && d.startTime >= d.endTime)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:bg-stone-300 hover:bg-blue-700"
            >
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save schedule
            </button>
          </div>

          <p className="text-[11px] text-stone-400">
            Tip: a doctor needs at least one enabled day for booking slots to appear on <span className="font-mono">/book</span>.
          </p>

          <DiagnosticsPanel />
        </>
      )}
    </div>
  );
}

interface DiagnosticsResponse {
  date: string;
  dayOfWeek: number;
  treatment: { id: string; name: string; duration: number } | null;
  treatments: { totalActive: number; withZeroDuration: number };
  doctors: { totalActive: number; withAnySchedule: number };
  branches: number;
  perDoctor: {
    doctorId: string;
    doctorName: string;
    reason: "ok" | "no_schedule_for_day" | "on_approved_leave" | "fully_blocked" | "no_active_branch";
    detail?: string;
    sampleSlots?: string[];
  }[];
  summary: Record<string, number>;
}

function DiagnosticsPanel() {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false);

  const diag = useQuery({
    enabled: open,
    queryKey: ["booking-diagnostics", date],
    queryFn: async (): Promise<DiagnosticsResponse> => {
      const r = await fetch(`/api/admin/booking-diagnostics?date=${date}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "load_failed");
      return j.data;
    },
  });

  const reasonColor: Record<string, string> = {
    ok:                  "bg-emerald-50 text-emerald-700 border-emerald-200",
    no_schedule_for_day: "bg-amber-50 text-amber-700 border-amber-200",
    on_approved_leave:   "bg-blue-50 text-blue-700 border-blue-200",
    fully_blocked:       "bg-stone-50 text-stone-700 border-stone-200",
    no_active_branch:    "bg-red-50 text-red-700 border-red-200",
  };
  const reasonLabel: Record<string, string> = {
    ok:                  "Available",
    no_schedule_for_day: "No schedule for this weekday",
    on_approved_leave:   "On approved leave",
    fully_blocked:       "Fully booked / blocked",
    no_active_branch:    "No active branch",
  };

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-stone-900">Booking diagnostics</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-2 py-1 rounded-md border border-stone-200 text-xs bg-white"
          />
          <button
            onClick={() => setOpen(true)}
            className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold"
          >
            Run check
          </button>
        </div>
      </div>

      {!open && (
        <p className="text-xs text-stone-500">
          Click "Run check" to see why <span className="font-mono">/book</span> shows (or hides) each doctor for the chosen date.
        </p>
      )}

      {open && diag.isLoading && (
        <div className="text-sm text-stone-500 inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> running…
        </div>
      )}
      {open && diag.isError && (
        <p className="text-xs text-red-600 inline-flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {(diag.error as Error).message}
        </p>
      )}

      {open && diag.data && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Stat label="Active treatments" value={diag.data.treatments.totalActive}
              warn={diag.data.treatments.totalActive === 0} />
            <Stat label="Treatments w/ 0 duration" value={diag.data.treatments.withZeroDuration}
              warn={diag.data.treatments.withZeroDuration > 0} />
            <Stat label="Active doctors" value={diag.data.doctors.totalActive}
              warn={diag.data.doctors.totalActive === 0} />
            <Stat label="Doctors w/ schedules" value={diag.data.doctors.withAnySchedule}
              warn={diag.data.doctors.withAnySchedule < diag.data.doctors.totalActive} />
          </div>

          {diag.data.perDoctor.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              No active doctors found. Add one under <span className="font-mono">/admin/users</span>.
            </p>
          ) : (
            <div className="space-y-1.5">
              {diag.data.perDoctor.map((d) => (
                <div
                  key={d.doctorId}
                  className={cn(
                    "flex items-start justify-between gap-3 p-2.5 rounded-md border",
                    reasonColor[d.reason] ?? "bg-stone-50"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{d.doctorName}</p>
                    {d.detail && <p className="text-[11px] opacity-80">{d.detail}</p>}
                    {d.sampleSlots && d.sampleSlots.length > 0 && (
                      <p className="text-[11px] opacity-80 mt-0.5">
                        First slots: {d.sampleSlots.join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider">
                    {reasonLabel[d.reason] ?? d.reason}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-stone-400">
            Checked against {diag.data.treatment
              ? <>treatment <span className="font-mono">{diag.data.treatment.name}</span> ({diag.data.treatment.duration} min)</>
              : <>no treatment found — create one on <span className="font-mono">/admin/treatments</span></>}
            {" · "}weekday {diag.data.dayOfWeek}
          </p>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={cn(
      "p-2 rounded-md border text-center",
      warn ? "bg-amber-50 border-amber-200" : "bg-stone-50 border-stone-100"
    )}>
      <p className={cn("text-base font-bold", warn ? "text-amber-700" : "text-stone-900")}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-stone-400">{label}</p>
    </div>
  );
}

function TimeInput({
  value, onChange, allowEmpty = false,
}: {
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={allowEmpty ? "—" : "00:00"}
      className="px-2 py-1 rounded-md border border-stone-200 text-xs bg-white"
    />
  );
}

"use client";

/**
 * Calendar Blocked Slots — admin CRUD. Lets admins/doctors carve out
 * windows (lunch break, vacation, equipment maintenance, meetings) that
 * subtract from availability in /api/calendar and /api/calendar/availability.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock, Plus, X as XIcon, Trash2, Loader2,
  Wrench, Coffee, Users as UsersIcon, Ban, Save, AlertTriangle,
} from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface BlockSlot {
  id: string;
  doctorId: string | null;
  doctor: { id: string; name: string } | null;
  roomId: string | null;
  room: { id: string; name: string } | null;
  branchId: string | null;
  branch: { id: string; name: string } | null;
  date: string;
  startTime: string;
  endTime: string;
  type: "BLOCK" | "BREAK" | "MAINTENANCE" | "MEETING";
  reason: string | null;
  createdAt: string;
}

interface DoctorLite { id: string; name: string }
interface RoomLite { id: string; name: string }

const TYPE_STYLES: Record<BlockSlot["type"], { gradient: string; bg: string; text: string; icon: React.ReactNode; label: string }> = {
  BLOCK:       { gradient: "from-stone-500 to-stone-700",     bg: "bg-stone-50",  text: "text-stone-700",  icon: <Ban className="w-3 h-3" />,    label: "Block" },
  BREAK:       { gradient: "from-amber-500 to-orange-500",    bg: "bg-amber-50",  text: "text-amber-700",  icon: <Coffee className="w-3 h-3" />, label: "Break" },
  MAINTENANCE: { gradient: "from-blue-500 to-cyan-500",       bg: "bg-blue-50",   text: "text-blue-700",   icon: <Wrench className="w-3 h-3" />, label: "Maintenance" },
  MEETING:     { gradient: "from-violet-500 to-fuchsia-500",  bg: "bg-violet-50", text: "text-violet-700", icon: <UsersIcon className="w-3 h-3" />, label: "Meeting" },
};

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch { return iso; }
};

export default function BlocksAdminPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || user?.role === "DOCTOR";

  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BlockSlot | null>(null);

  // Default range: today → 60 days out
  const today = new Date();
  const future = new Date(today);
  future.setDate(today.getDate() + 60);
  const fmtDay = (d: Date) => d.toISOString().slice(0, 10);

  const blocksQuery = useQuery({
    queryKey: ["calendar-blocks", fmtDay(today), fmtDay(future)],
    queryFn: async (): Promise<BlockSlot[]> => {
      const r = await fetch(`/api/calendar/block-slot?from=${fmtDay(today)}&to=${fmtDay(future)}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data ?? [];
    },
  });

  // Group blocks by date for nicer presentation
  const grouped = useMemo(() => {
    const blocks = blocksQuery.data ?? [];
    const map = new Map<string, BlockSlot[]>();
    for (const b of blocks) {
      const day = b.date.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(b);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [blocksQuery.data]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/calendar/block-slot/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return id;
    },
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ["calendar-blocks"] });
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="ADMIN-BLOCKS">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md">
            <CalendarClock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 leading-tight">Calendar Blocks</h1>
            <p className="text-sm text-stone-500 mt-0.5">Reserve time on the schedule for breaks, maintenance, or meetings</p>
          </div>
        </div>
        {canEdit && (
          <Button iconLeft={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>
            New Block
          </Button>
        )}
      </div>

      {/* Content */}
      {blocksQuery.isLoading ? (
        <div className="flex items-center justify-center py-20 text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (blocksQuery.data ?? []).length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={<CalendarClock className="w-8 h-8" />}
            title="No blocks scheduled"
            description="No blocked time in the next 60 days. Create a block to reserve time on the calendar."
            action={
              canEdit ? (
                <Button iconLeft={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>
                  Create first block
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([day, items]) => (
            <section key={day} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="h-1.5 w-8 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" />
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-blue-700">{fmtDate(day)}</h2>
                <span className="text-[10px] text-stone-400">{items.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {items.map((b) => (
                  <BlockCard
                    key={b.id}
                    block={b}
                    canEdit={canEdit}
                    onDelete={() => setConfirmDelete(b)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {creating && (
        <CreateBlockDrawer
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["calendar-blocks"] });
          }}
        />
      )}

      {confirmDelete && (
        <DeleteConfirm
          block={confirmDelete}
          isPending={deleteMutation.isPending}
          error={deleteMutation.isError ? (deleteMutation.error as Error).message : null}
          onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function BlockCard({ block: b, canEdit, onDelete }: { block: BlockSlot; canEdit: boolean; onDelete: () => void }) {
  const s = TYPE_STYLES[b.type];
  return (
    <article className="group relative bg-white rounded-2xl border-2 border-stone-200 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className={cn("h-1 bg-gradient-to-r", s.gradient)} />
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold", s.bg, s.text)}>
                {s.icon}
                {s.label}
              </span>
            </div>
            <p className="text-base font-bold text-stone-900 leading-tight">
              {b.startTime}–{b.endTime}
            </p>
            {b.reason && <p className="text-[11px] text-stone-600 mt-0.5 line-clamp-2">{b.reason}</p>}
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-1 mt-2 pt-2 border-t border-stone-100 text-[10px] text-stone-500">
          {b.doctor && <span className="font-bold text-stone-700">Dr. {b.doctor.name.replace(/^Dr\.?\s*/i, "")}</span>}
          {b.room   && <span>{b.room.name}</span>}
          {b.branch && <span className="text-stone-400">{b.branch.name}</span>}
          {!b.doctor && !b.room && !b.branch && <span className="italic">Clinic-wide</span>}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onDelete}
              className="ml-auto px-2 py-1 rounded-md text-[10px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────────────────────── */

function CreateBlockDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    const t = setTimeout(() => setContentReady(true), 160);
    return () => { cancelAnimationFrame(r); clearTimeout(t); };
  }, []);

  const handleClose = () => {
    setContentReady(false);
    setMounted(false);
    setTimeout(onClose, 280);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stagger = (i: number) => ({
    opacity: contentReady ? 1 : 0,
    transform: contentReady ? "translateY(0)" : "translateY(10px)",
    transition: `opacity 280ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 45}ms, transform 320ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 45}ms`,
  });

  const [type, setType] = useState<BlockSlot["type"]>("BLOCK");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [doctorId, setDoctorId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [reason, setReason] = useState("");

  // Fetch doctors + rooms for dropdowns
  const doctorsQuery = useQuery({
    queryKey: ["doctors-for-blocks"],
    queryFn: async (): Promise<DoctorLite[]> => {
      const r = await fetch(`/api/staff?role=DOCTOR`);
      const j = await r.json();
      return (j?.data ?? []) as DoctorLite[];
    },
  });
  const roomsQuery = useQuery({
    queryKey: ["rooms-for-blocks"],
    queryFn: async (): Promise<RoomLite[]> => {
      const r = await fetch(`/api/rooms`);
      const j = await r.json();
      return (j?.data ?? []) as RoomLite[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/calendar/block-slot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          date,
          startTime,
          endTime,
          doctorId: doctorId || null,
          roomId: roomId || null,
          reason: reason.trim() || null,
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    onSuccess: () => onCreated(),
  });

  const canSave = date && startTime && endTime && startTime < endTime;

  return (
    <div className="fixed inset-0 z-40">
      <div
        onClick={handleClose}
        style={{
          backdropFilter: mounted ? "blur(4px)" : "blur(0px)",
          transition: "opacity 260ms ease-out, backdrop-filter 260ms ease-out",
        }}
        className={cn("absolute inset-0 bg-slate-900/40", mounted ? "opacity-100" : "opacity-0")}
      />
      <aside
        style={{
          transform: mounted ? "translateX(0)" : "translateX(100%)",
          transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: mounted ? "-30px 0 60px -20px rgba(15, 23, 42, 0.25), -10px 0 30px -10px rgba(15, 23, 42, 0.15)" : "none",
        }}
        className="absolute top-0 bottom-0 right-0 w-full sm:w-[460px] bg-stone-50 flex flex-col will-change-transform"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="New calendar block"
      >
        <header className="shrink-0 pl-16 pr-5 sm:px-5 pt-5 pb-3 border-b border-stone-200 bg-white" style={stagger(0)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shadow-md bg-gradient-to-br", TYPE_STYLES[type].gradient)}>
                <CalendarClock className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-stone-900 leading-tight">New Calendar Block</h2>
                <p className="text-[11px] text-stone-500 leading-tight mt-0.5">Reserve time so it doesn&apos;t get booked</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 -m-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Type */}
          <section style={stagger(1)} className="rounded-2xl bg-white border border-stone-200 p-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2 block">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TYPE_STYLES) as BlockSlot["type"][]).map((t) => {
                const s = TYPE_STYLES[t];
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={cn(
                      "px-3 py-2 rounded-xl border-2 text-xs font-bold transition-all flex items-center gap-2",
                      type === t
                        ? "border-transparent bg-gradient-to-r text-white shadow-sm " + s.gradient
                        : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                    )}
                  >
                    {s.icon}
                    {s.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Date + time */}
          <section style={stagger(2)} className="rounded-2xl bg-white border border-stone-200 p-3 space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-stone-50/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Start</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-stone-50/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">End</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-stone-50/50"
                />
              </div>
            </div>
            {startTime >= endTime && (
              <p className="text-[11px] text-red-600 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Start time must be before end time
              </p>
            )}
          </section>

          {/* Scope */}
          <section style={stagger(3)} className="rounded-2xl bg-white border border-stone-200 p-3 space-y-3">
            <p className="text-[10px] text-stone-400 leading-tight">
              Leave both blank to block the entire clinic.
            </p>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Doctor (optional)</label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-stone-50/50"
              >
                <option value="">All doctors</option>
                {(doctorsQuery.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Room (optional)</label>
              <select
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-stone-50/50"
              >
                <option value="">All rooms</option>
                {(roomsQuery.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </section>

          {/* Reason */}
          <section style={stagger(4)} className="rounded-2xl bg-white border border-stone-200 p-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Reason (optional)</label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Equipment calibration, team huddle…"
              className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none resize-none bg-stone-50/50"
            />
          </section>

          {save.isError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {(save.error as Error).message}
            </p>
          )}
        </div>

        <footer className="shrink-0 border-t border-stone-200 p-3 flex items-center justify-end gap-2 bg-white">
          <button onClick={handleClose} className="px-3 py-2 rounded-lg text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !canSave}
            className={cn(
              "px-4 py-2 rounded-lg text-[11px] font-bold text-white flex items-center gap-1.5 shadow-md transition-all",
              !canSave
                ? "bg-stone-300 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-cyan-600 hover:shadow-lg hover:-translate-y-0.5"
            )}
          >
            {save.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Save className="w-3.5 h-3.5" />}
            {save.isPending ? "Saving…" : "Create block"}
          </button>
        </footer>
      </aside>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function DeleteConfirm({ block: b, isPending, error, onConfirm, onCancel }: {
  block: BlockSlot;
  isPending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={onCancel} className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900">Remove this block?</h2>
            <p className="text-[11px] text-stone-500">Time slot becomes bookable again.</p>
          </div>
        </div>
        <p className="text-sm text-stone-600 mb-2">
          <span className="font-semibold">{fmtDate(b.date)}</span>{" "}
          <span className="text-stone-500">{b.startTime}–{b.endTime}</span>
          {b.doctor && <> · {b.doctor.name}</>}
        </p>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>
        )}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-2 rounded-lg text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center gap-1.5"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {isPending ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

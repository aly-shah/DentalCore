"use client";

import { useState, type ReactNode, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Activity,
  CalendarDays,
  Users as UsersIcon,
  LogOut,
  Search,
  Clock,
  Hourglass,
  PlayCircle,
  CheckCircle2,
  ChevronRight,
  Stethoscope,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatients } from "@/hooks/use-queries";
import { getClinicToday } from "@/lib/utils";
import {
  PatientSummaryView,
  PatientActionBar,
  usePatientSummary,
} from "./patient-summary-view";

/* ───────── helpers ───────── */
type Apt = Record<string, unknown>;

function aptPatientName(a: Apt): string {
  if (typeof a.patientName === "string" && a.patientName) return a.patientName;
  const p = a.patient as Record<string, unknown> | undefined;
  if (p && typeof p.firstName === "string") return `${p.firstName} ${p.lastName || ""}`.trim();
  return "Patient";
}
function aptPatientCode(a: Apt): string {
  const p = a.patient as Record<string, unknown> | undefined;
  if (p && typeof p.patientCode === "string") return p.patientCode;
  return typeof a.patientCode === "string" ? a.patientCode : "";
}
function aptPatientId(a: Apt): string | null {
  if (typeof a.patientId === "string" && a.patientId) return a.patientId;
  const p = a.patient as Record<string, unknown> | undefined;
  return p && typeof p.id === "string" ? p.id : null;
}
const up = (s: unknown) => String(s || "").toUpperCase();
const DONE = ["COMPLETED"];
const CANCELLED = ["CANCELLED", "NO_SHOW"];
const WAITING = ["CHECKED_IN", "WAITING", "ARRIVED"];
const ACTIVE = ["IN_PROGRESS", "IN_TREATMENT"];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
function doctorShortName(name?: string): string {
  const clean = (name || "").replace(/^dr\.?\s*/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return `Dr. ${parts[parts.length - 1] || clean || "Doctor"}`;
}
function todayLabel(): string {
  return new Date()
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();
}

/* ───────── page ───────── */
export default function DoctorAppPage() {
  const { user, loading, login, logout } = useAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-teal-500 via-cyan-600 to-blue-600">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (!user) return <DoctorLogin login={login} />;
  if (user.role !== "DOCTOR") return <NotADoctor name={user.name} role={user.role} onLogout={logout} />;
  return <DoctorApp user={user} onLogout={logout} />;
}

/* ───────── login ───────── */
function DoctorLogin({
  login,
}: {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const r = await login(email.trim(), password);
    setBusy(false);
    if (!r.success) setErr(r.error || "Sign in failed");
    // on success the auth context updates `user` and this page re-renders
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-teal-500 via-cyan-600 to-blue-600 p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center text-white mb-6">
          <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
            <Stethoscope className="w-6 h-6" />
          </div>
          <div>
            <p className="text-lg font-bold leading-tight">Doctor App</p>
            <p className="text-xs text-white/70 leading-tight">Sign in to your clinic</p>
          </div>
        </div>
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Email</label>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="doctor@clinic.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="••••••••"
            />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-center text-[11px] text-white/60 mt-3">For clinicians only — use your doctor account</p>
      </div>
    </div>
  );
}

function NotADoctor({
  name,
  role,
  onLogout,
}: {
  name?: string;
  role?: string;
  onLogout: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-teal-500 via-cyan-600 to-blue-600 p-6 text-center text-white">
      <Stethoscope className="w-12 h-12 mb-4 opacity-90" />
      <h1 className="text-xl font-bold">Doctor App</h1>
      <p className="text-sm text-white/80 mt-2 max-w-xs">
        This app is for doctors only.{name ? ` You're signed in as ${name}` : " You're signed in"}
        {role ? ` (${String(role).replace(/_/g, " ").toLowerCase()})` : ""}.
      </p>
      <div className="flex gap-2 mt-5">
        <button
          onClick={() => onLogout()}
          className="px-5 py-2.5 rounded-xl bg-white/15 backdrop-blur text-sm font-semibold hover:bg-white/25 transition-colors"
        >
          Sign out
        </button>
        <Link
          href="/dashboard"
          className="px-5 py-2.5 rounded-xl bg-white text-teal-700 text-sm font-semibold hover:bg-white/90 transition-colors"
        >
          My dashboard
        </Link>
      </div>
    </div>
  );
}

/* ───────── the app ───────── */
function DoctorApp({ user, onLogout }: { user: { name: string }; onLogout: () => Promise<void> }) {
  const [view, setView] = useState<"today" | "schedule" | "patients">("today");
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const today = getClinicToday();

  const openPatient = (pid: string) => setActivePatientId(pid);
  const closePatient = () => setActivePatientId(null);

  const { data: appts = [] } = useQuery({
    queryKey: ["doctor-app", "appts", today],
    queryFn: async (): Promise<Apt[]> => {
      const r = await fetch(`/api/appointments?date=${today}`);
      const j = await r.json();
      const list = (j?.data ?? []) as Apt[];
      return [...list].sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));
    },
    refetchInterval: 60_000,
  });

  // Load patient summary metadata once (so the action bar knows phone +
  // today's appt) — uses the same query key as the inner view for cache hit.
  const summaryQuery = usePatientSummary(activePatientId);
  const patientPhone = summaryQuery.data?.patient.phone ?? null;
  const todayAppointmentId = summaryQuery.data?.todayAppt?.id ?? null;

  const isDone = (a: Apt) => DONE.includes(up(a.status));
  const isCx = (a: Apt) => CANCELLED.includes(up(a.status));
  const isWait = (a: Apt) => WAITING.includes(up(a.status));
  const isAct = (a: Apt) => ACTIVE.includes(up(a.status));

  const counts = {
    waiting: appts.filter(isWait).length,
    active: appts.filter(isAct).length,
    upcoming: appts.filter((a) => !isDone(a) && !isCx(a) && !isAct(a) && !isWait(a)).length,
    done: appts.filter(isDone).length,
  };
  const upcomingList = appts.filter((a) => !isDone(a) && !isCx(a));
  const completedList = appts.filter(isDone);

  return (
    <div className="fixed inset-0 flex flex-col bg-stone-50">
      {/* gradient header */}
      <div className="shrink-0 bg-gradient-to-br from-teal-500 via-cyan-600 to-blue-600 text-white px-4 sm:px-6 pt-4 pb-4">
        <div className="flex items-start justify-between gap-3 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wide text-white/70">{todayLabel()}</p>
              <p className="text-lg sm:text-xl font-bold leading-tight truncate">
                {greeting()}, {doctorShortName(user.name)}
              </p>
            </div>
          </div>
          <button
            onClick={() => onLogout()}
            aria-label="Sign out"
            className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center hover:bg-white/25 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 max-w-5xl mx-auto w-full">
          <StatTile icon={<Hourglass className="w-4 h-4" />} chip="bg-amber-400" value={counts.waiting} label="Waiting" />
          <StatTile icon={<PlayCircle className="w-4 h-4" />} chip="bg-fuchsia-500" value={counts.active} label="Active" />
          <StatTile icon={<Clock className="w-4 h-4" />} chip="bg-indigo-400" value={counts.upcoming} label="Upcoming" />
          <StatTile icon={<CheckCircle2 className="w-4 h-4" />} chip="bg-emerald-500" value={counts.done} label="Done" />
        </div>
      </div>

      {/* content */}
      <div className="flex-1 overflow-y-auto">
        {activePatientId ? (
          <PatientSummaryView patientId={activePatientId} onBack={closePatient} />
        ) : (
          <>
            {view === "today" && (
              <TodayView upcoming={upcomingList} completed={completedList} onSearch={() => setView("patients")} onOpenPatient={openPatient} />
            )}
            {view === "schedule" && <ScheduleView appts={appts} onOpenPatient={openPatient} />}
            {view === "patients" && <PatientsView onOpenPatient={openPatient} />}
          </>
        )}
      </div>

      {/* bottom bar — swaps between 3-tab nav and contextual action bar */}
      {activePatientId ? (
        <PatientActionBar
          patientId={activePatientId}
          todayAppointmentId={todayAppointmentId}
          phone={patientPhone}
        />
      ) : (
        <nav className="shrink-0 border-t border-stone-200 bg-white grid grid-cols-3 pb-[env(safe-area-inset-bottom)]">
          <TabBtn active={view === "today"} onClick={() => setView("today")} icon={<Activity className="w-5 h-5" />} label="Today" />
          <TabBtn active={view === "schedule"} onClick={() => setView("schedule")} icon={<CalendarDays className="w-5 h-5" />} label="Schedule" />
          <TabBtn active={view === "patients"} onClick={() => setView("patients")} icon={<UsersIcon className="w-5 h-5" />} label="Patients" />
        </nav>
      )}
    </div>
  );
}

function StatTile({ icon, chip, value, label }: { icon: ReactNode; chip: string; value: number; label: string }) {
  return (
    <div className="rounded-xl bg-white/15 backdrop-blur px-3 py-2.5 flex items-center gap-2.5">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 ${chip}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-base font-bold leading-none">{value}</p>
        <p className="text-[10px] text-white/85 leading-tight mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
        active ? "text-teal-600" : "text-stone-400"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ───────── views ───────── */
function Section({ title, count, icon, children }: { title: string; count: number; icon: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-1 mb-1.5 text-[11px] font-semibold tracking-wider text-stone-400">
        {icon}
        {title} ({count})
      </div>
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden divide-y divide-stone-100">{children}</div>
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 text-center text-xs text-stone-400">{children}</div>;
}

function ApptRow({ a, done, onOpenPatient }: { a: Apt; done: boolean; onOpenPatient?: (pid: string) => void }) {
  const pid = aptPatientId(a);
  const name = aptPatientName(a);
  const code = aptPatientCode(a);
  const type = String(a.type || "").replace(/_/g, " ");
  const inner = (
    <>
      <div className="shrink-0 text-center w-12">
        <p className={`text-sm font-bold leading-tight ${done ? "text-stone-400" : "text-stone-800"}`}>{String(a.startTime || "—")}</p>
        {!done && a.endTime ? <p className="text-[10px] text-stone-400 leading-tight">{String(a.endTime)}</p> : null}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${done ? "text-stone-500" : "text-stone-900"}`}>{name}</p>
        {!done && (
          <p className="text-[10px] text-stone-400 uppercase tracking-wide truncate">
            {type || "Appointment"}
            {code ? ` · ${code}` : ""}
          </p>
        )}
      </div>
      {done ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      ) : (
        <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
      )}
    </>
  );
  const cls = "flex items-center gap-3 px-3.5 py-3";
  return pid && !done && onOpenPatient ? (
    <button onClick={() => onOpenPatient(pid)} className={`${cls} active:bg-stone-50 w-full text-left`}>
      {inner}
    </button>
  ) : (
    <div className={`${cls} ${done ? "" : "opacity-95"}`}>{inner}</div>
  );
}

function TodayView({
  upcoming,
  completed,
  onSearch,
  onOpenPatient,
}: {
  upcoming: Apt[];
  completed: Apt[];
  onSearch: () => void;
  onOpenPatient: (pid: string) => void;
}) {
  return (
    <div className="px-3 sm:px-4 py-3 space-y-4 max-w-3xl mx-auto w-full">
      <button
        onClick={onSearch}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-stone-200 text-sm text-stone-400 text-left hover:border-stone-300 transition-colors"
      >
        <Search className="w-4 h-4" /> Search any patient by name or code…
      </button>
      <Section title="UPCOMING" count={upcoming.length} icon={<Clock className="w-3.5 h-3.5" />}>
        {upcoming.length === 0 ? (
          <Empty>No upcoming appointments today</Empty>
        ) : (
          upcoming.map((a) => <ApptRow key={String(a.id)} a={a} done={false} onOpenPatient={onOpenPatient} />)
        )}
      </Section>
      <Section title="COMPLETED" count={completed.length} icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
        {completed.length === 0 ? (
          <Empty>Nothing completed yet</Empty>
        ) : (
          completed.map((a) => <ApptRow key={String(a.id)} a={a} done />)
        )}
      </Section>
    </div>
  );
}

function ScheduleView({ appts, onOpenPatient }: { appts: Apt[]; onOpenPatient: (pid: string) => void }) {
  return (
    <div className="px-3 sm:px-4 py-3 space-y-3 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-wider text-stone-400">
        <CalendarDays className="w-3.5 h-3.5" />
        TODAY&apos;S SCHEDULE ({appts.length})
      </div>
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden divide-y divide-stone-100">
        {appts.length === 0 ? (
          <Empty>No appointments today</Empty>
        ) : (
          appts.map((a) => {
            const pid = aptPatientId(a);
            const st = String(a.status || "").replace(/_/g, " ").toLowerCase();
            const inner = (
              <>
                <div className="shrink-0 text-center w-12">
                  <p className="text-sm font-bold text-stone-800 leading-tight">{String(a.startTime || "—")}</p>
                  {a.endTime ? <p className="text-[10px] text-stone-400 leading-tight">{String(a.endTime)}</p> : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-900 truncate">{aptPatientName(a)}</p>
                  <p className="text-[10px] text-stone-400 uppercase truncate">
                    {String(a.type || "Appointment").replace(/_/g, " ")}
                  </p>
                </div>
                <span className="text-[10px] font-medium text-stone-500 bg-stone-100 rounded-full px-2 py-0.5 shrink-0 capitalize">
                  {st || "—"}
                </span>
              </>
            );
            return pid ? (
              <button key={String(a.id)} onClick={() => onOpenPatient(pid)} className="flex items-center gap-3 px-3.5 py-3 active:bg-stone-50 w-full text-left">
                {inner}
              </button>
            ) : (
              <div key={String(a.id)} className="flex items-center gap-3 px-3.5 py-3">
                {inner}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PatientsView({ onOpenPatient }: { onOpenPatient: (pid: string) => void }) {
  const [q, setQ] = useState("");
  const { data } = usePatients(q ? { search: q, limit: "30" } : { limit: "30" });
  const patients = ((data?.data ?? []) as Array<{
    id: string;
    firstName: string;
    lastName: string;
    patientCode: string;
    phone: string;
  }>);
  return (
    <div className="px-3 sm:px-4 py-3 space-y-3 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-stone-200">
        <Search className="w-4 h-4 text-stone-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search patients by name, phone or code…"
          className="flex-1 text-sm focus:outline-none placeholder:text-stone-400 bg-transparent"
        />
      </div>
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden divide-y divide-stone-100">
        {patients.length === 0 ? (
          <Empty>No patients found</Empty>
        ) : (
          patients.map((p) => (
            <button
              key={p.id}
              onClick={() => onOpenPatient(p.id)}
              className="flex items-center gap-3 px-3.5 py-3 active:bg-stone-50 w-full text-left"
            >
              <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-xs font-semibold shrink-0">
                {(p.firstName?.[0] || "") + (p.lastName?.[0] || "")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900 truncate">
                  {p.firstName} {p.lastName}
                </p>
                <p className="text-[10px] text-stone-400 font-mono">
                  {p.patientCode}
                  {p.phone ? ` · ${p.phone}` : ""}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

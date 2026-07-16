"use client";

import { Suspense, useState, useEffect, type ReactNode, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
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
import { DEMO_USER, DEMO_APPTS, DEMO_PATIENTS, demoSummary } from "./demo-data";
import { NotificationPrompt } from "./notification-permission";

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
function aptDoctorId(a: Apt): string | null {
  if (typeof a.doctorId === "string" && a.doctorId) return a.doctorId;
  const d = a.doctor as Record<string, unknown> | undefined;
  return d && typeof d.id === "string" ? d.id : null;
}
function aptDoctorName(a: Apt): string {
  const d = a.doctor as Record<string, unknown> | undefined;
  return d && typeof d.name === "string" ? d.name : "";
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
function displayName(name?: string, role?: string): string {
  const clean = (name || "").replace(/^dr\.?\s*/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  // Only doctors get the "Dr." honorific; other clinical staff are greeted
  // by first name so the app reads correctly for assistants and admins.
  if (role === "DOCTOR") return `Dr. ${parts[parts.length - 1] || clean || "Doctor"}`;
  return parts[0] || clean || "there";
}
function todayLabel(): string {
  return new Date()
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();
}

/* ───────── page ───────── */
function Splash() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-teal-500 via-cyan-600 to-blue-600">
      <LoadingSpinner size="lg" />
    </div>
  );
}

export default function DoctorAppPage() {
  // useSearchParams() needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<Splash />}>
      <DoctorAppRouter />
    </Suspense>
  );
}

function DoctorAppRouter() {
  const demo = useSearchParams().get("demo") === "1";
  const { user, loading, login, logout } = useAuth();

  // Review mode — no login, mock data only, zero API/PII. See demo-data.ts.
  if (demo) {
    const leaveDemo = async () => {
      window.location.href = "/doctor-app";
    };
    return <DoctorApp user={DEMO_USER} onLogout={leaveDemo} demo />;
  }

  if (loading) return <Splash />;
  if (!user) return <DoctorLogin login={login} />;
  if (!CLINICAL_ROLES.has(user.role)) return <NotClinicalStaff name={user.name} role={user.role} onLogout={logout} />;
  return <DoctorApp user={user} onLogout={logout} />;
}

// Roles that may use the clinical app. Doctors and assistants are the core
// clinical users; admins are included so they can review the same view.
const CLINICAL_ROLES = new Set(["DOCTOR", "ASSISTANT", "ADMIN", "SUPER_ADMIN"]);

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
        <p className="text-center text-[11px] text-white/60 mt-3">For clinical staff — doctors &amp; assistants</p>
        <div className="mt-4 text-center">
          <a
            href="/doctor-app?demo=1"
            className="inline-block text-[11px] font-semibold text-white/80 underline underline-offset-2 hover:text-white"
          >
            View interactive demo (no login) →
          </a>
        </div>
      </div>
    </div>
  );
}

function NotClinicalStaff({
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
      <h1 className="text-xl font-bold">Clinical App</h1>
      <p className="text-sm text-white/80 mt-2 max-w-xs">
        This app is for clinical staff (doctors and assistants).
        {name ? ` You're signed in as ${name}` : " You're signed in"}
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
function DoctorApp({ user, onLogout, demo = false }: { user: { id?: string; name: string; role?: string }; onLogout: () => Promise<void>; demo?: boolean }) {
  const [view, setView] = useState<"today" | "schedule" | "patients">("today");
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const today = getClinicToday();

  const openPatient = (pid: string) => setActivePatientId(pid);
  const closePatient = () => setActivePatientId(null);

  // greeting()/todayLabel() read the local clock; computing them during SSR
  // (UTC) vs the browser (local time) yields different text and breaks
  // hydration — which disables the app's buttons. Compute after mount only.
  const [clock, setClock] = useState<{ greet: string; label: string } | null>(null);
  useEffect(() => setClock({ greet: greeting(), label: todayLabel() }), []);

  const { data: fetchedAppts = [] } = useQuery({
    queryKey: ["doctor-app", "appts", today],
    enabled: !demo,
    queryFn: async (): Promise<Apt[]> => {
      const r = await fetch(`/api/appointments?date=${today}`);
      const j = await r.json();
      const list = (j?.data ?? []) as Apt[];
      return [...list].sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));
    },
    refetchInterval: 60_000,
  });
  const appts = demo ? DEMO_APPTS : fetchedAppts;

  // Load patient summary metadata once (so the action bar knows phone +
  // today's appt) — uses the same query key as the inner view for cache hit.
  // In demo mode we read the mock summary instead of fetching.
  const summaryQuery = usePatientSummary(demo ? null : activePatientId);
  const demoSum = demo && activePatientId ? demoSummary(activePatientId) : null;
  const patientPhone = (demo ? demoSum?.patient.phone : summaryQuery.data?.patient.phone) ?? null;
  const todayAppointmentId = (demo ? demoSum?.todayAppt?.id : summaryQuery.data?.todayAppt?.id) ?? null;

  const isDone = (a: Apt) => DONE.includes(up(a.status));
  const isCx = (a: Apt) => CANCELLED.includes(up(a.status));
  const isWait = (a: Apt) => WAITING.includes(up(a.status));
  const isAct = (a: Apt) => ACTIVE.includes(up(a.status));

  // A doctor's own appointments are their "main" list; other doctors'
  // patients are shown as a secondary "also in clinic" list so they're
  // visible but not owned. Assistants/admins (and demo) see the whole
  // clinic with no split.
  const isDoctorView = !demo && user.role === "DOCTOR" && !!user.id;
  const isMine = (a: Apt) => aptDoctorId(a) === user.id;
  const primaryAppts = isDoctorView ? appts.filter(isMine) : appts;
  const otherAppts = isDoctorView ? appts.filter((a) => !isMine(a)) : [];

  const counts = {
    waiting: primaryAppts.filter(isWait).length,
    active: primaryAppts.filter(isAct).length,
    upcoming: primaryAppts.filter((a) => !isDone(a) && !isCx(a) && !isAct(a) && !isWait(a)).length,
    done: primaryAppts.filter(isDone).length,
  };
  const upcomingList = primaryAppts.filter((a) => !isDone(a) && !isCx(a));
  const completedList = primaryAppts.filter(isDone);
  const otherUpcoming = otherAppts.filter((a) => !isDone(a) && !isCx(a));

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
              <p className="text-[11px] font-semibold tracking-wide text-white/70">
                {clock?.label ?? ""}
                {demo && (
                  <span className="ml-2 align-middle text-[9px] font-bold uppercase tracking-wider bg-white/20 text-white rounded-full px-1.5 py-0.5">
                    Demo
                  </span>
                )}
              </p>
              <p className="text-lg sm:text-xl font-bold leading-tight truncate">
                {clock?.greet ?? "Welcome"}, {displayName(user.name, user.role)}
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
          <PatientSummaryView patientId={activePatientId} onBack={closePatient} demo={demo} />
        ) : (
          <>
            {!demo && (
              <div className="px-3 sm:px-4">
                <NotificationPrompt />
              </div>
            )}
            {view === "today" && (
              <TodayView
                upcoming={upcomingList}
                completed={completedList}
                other={otherUpcoming}
                isDoctorView={isDoctorView}
                onSearch={() => setView("patients")}
                onOpenPatient={openPatient}
              />
            )}
            {view === "schedule" && (
              <ScheduleView appts={primaryAppts} other={otherAppts} isDoctorView={isDoctorView} onOpenPatient={openPatient} />
            )}
            {view === "patients" && (
              <PatientsView onOpenPatient={openPatient} demo={demo} userId={user.id} isDoctorView={isDoctorView} />
            )}
          </>
        )}
      </div>

      {/* bottom bar — swaps between 3-tab nav and contextual action bar */}
      {activePatientId ? (
        <PatientActionBar
          patientId={activePatientId}
          todayAppointmentId={todayAppointmentId}
          phone={patientPhone}
          demo={demo}
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

function ApptRow({ a, done, onOpenPatient, showDoctor = false }: { a: Apt; done: boolean; onOpenPatient?: (pid: string) => void; showDoctor?: boolean }) {
  const pid = aptPatientId(a);
  const name = aptPatientName(a);
  const code = aptPatientCode(a);
  const type = String(a.type || "").replace(/_/g, " ");
  const doctor = showDoctor ? aptDoctorName(a) : "";
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
            {doctor ? `${doctor} · ` : ""}
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
  other,
  isDoctorView,
  onSearch,
  onOpenPatient,
}: {
  upcoming: Apt[];
  completed: Apt[];
  other: Apt[];
  isDoctorView: boolean;
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
      <Section title={isDoctorView ? "MY UPCOMING" : "UPCOMING"} count={upcoming.length} icon={<Clock className="w-3.5 h-3.5" />}>
        {upcoming.length === 0 ? (
          <Empty>{isDoctorView ? "None of your patients are waiting" : "No upcoming appointments today"}</Empty>
        ) : (
          upcoming.map((a) => <ApptRow key={String(a.id)} a={a} done={false} onOpenPatient={onOpenPatient} />)
        )}
      </Section>
      <Section title={isDoctorView ? "MY COMPLETED" : "COMPLETED"} count={completed.length} icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
        {completed.length === 0 ? (
          <Empty>Nothing completed yet</Empty>
        ) : (
          completed.map((a) => <ApptRow key={String(a.id)} a={a} done />)
        )}
      </Section>
      {isDoctorView && other.length > 0 && (
        <Section title="ALSO IN CLINIC" count={other.length} icon={<UsersIcon className="w-3.5 h-3.5" />}>
          {other.map((a) => <ApptRow key={String(a.id)} a={a} done={false} onOpenPatient={onOpenPatient} showDoctor />)}
        </Section>
      )}
    </div>
  );
}

function ScheduleList({ appts, showDoctor = false, onOpenPatient }: { appts: Apt[]; showDoctor?: boolean; onOpenPatient: (pid: string) => void }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden divide-y divide-stone-100">
      {appts.length === 0 ? (
        <Empty>No appointments</Empty>
      ) : (
        appts.map((a) => {
          const pid = aptPatientId(a);
          const st = String(a.status || "").replace(/_/g, " ").toLowerCase();
          const doctor = showDoctor ? aptDoctorName(a) : "";
          const inner = (
            <>
              <div className="shrink-0 text-center w-12">
                <p className="text-sm font-bold text-stone-800 leading-tight">{String(a.startTime || "—")}</p>
                {a.endTime ? <p className="text-[10px] text-stone-400 leading-tight">{String(a.endTime)}</p> : null}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900 truncate">{aptPatientName(a)}</p>
                <p className="text-[10px] text-stone-400 uppercase truncate">
                  {doctor ? `${doctor} · ` : ""}
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
  );
}

function ScheduleHeader({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-wider text-stone-400">
      {icon}
      {children}
    </div>
  );
}

function ScheduleView({ appts, other, isDoctorView, onOpenPatient }: { appts: Apt[]; other: Apt[]; isDoctorView: boolean; onOpenPatient: (pid: string) => void }) {
  return (
    <div className="px-3 sm:px-4 py-3 space-y-3 max-w-3xl mx-auto w-full">
      <ScheduleHeader icon={<CalendarDays className="w-3.5 h-3.5" />}>
        {isDoctorView ? `MY SCHEDULE (${appts.length})` : `TODAY'S SCHEDULE (${appts.length})`}
      </ScheduleHeader>
      <ScheduleList appts={appts} onOpenPatient={onOpenPatient} />
      {isDoctorView && other.length > 0 && (
        <>
          <ScheduleHeader icon={<UsersIcon className="w-3.5 h-3.5" />}>OTHER DOCTORS ({other.length})</ScheduleHeader>
          <ScheduleList appts={other} showDoctor onOpenPatient={onOpenPatient} />
        </>
      )}
    </div>
  );
}

type PatientRow = {
  id: string;
  firstName: string;
  lastName: string;
  patientCode: string;
  phone: string;
  assignedDoctorId?: string | null;
};

function PatientsView({ onOpenPatient, demo = false, userId, isDoctorView }: { onOpenPatient: (pid: string) => void; demo?: boolean; userId?: string; isDoctorView: boolean }) {
  const [q, setQ] = useState("");
  // Default view for a doctor is their own assigned patients; searching
  // widens to every patient in the clinic (their patients are still tagged
  // "Yours"). Assistants/admins always see the full list.
  const searching = q.trim().length > 0;
  const params: Record<string, string> | undefined = demo
    ? undefined
    : searching
      ? { search: q, limit: "30" }
      : isDoctorView && userId
        ? { doctorId: userId, limit: "50" }
        : { limit: "30" };
  const { data } = usePatients(params, { enabled: !demo });
  const fetched = (data?.data ?? []) as PatientRow[];
  const patients = demo
    ? DEMO_PATIENTS.filter((p) => {
        const needle = q.trim().toLowerCase();
        if (!needle) return true;
        return (
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(needle) ||
          p.patientCode.toLowerCase().includes(needle) ||
          p.phone.includes(needle)
        );
      })
    : fetched;
  const showMineHeader = isDoctorView && !searching;
  return (
    <div className="px-3 sm:px-4 py-3 space-y-3 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-stone-200">
        <Search className="w-4 h-4 text-stone-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search any patient by name, phone or code…"
          className="flex-1 text-sm focus:outline-none placeholder:text-stone-400 bg-transparent"
        />
      </div>
      {(showMineHeader || searching) && (
        <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-wider text-stone-400">
          <UsersIcon className="w-3.5 h-3.5" />
          {showMineHeader ? `MY PATIENTS (${patients.length})` : `SEARCH RESULTS (${patients.length})`}
        </div>
      )}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden divide-y divide-stone-100">
        {patients.length === 0 ? (
          <Empty>{showMineHeader ? "No patients assigned to you yet — search to find anyone." : "No patients found"}</Empty>
        ) : (
          patients.map((p) => {
            const mine = isDoctorView && !!userId && (p as PatientRow).assignedDoctorId === userId;
            return (
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
                {mine && searching && (
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 rounded-full px-1.5 py-0.5 shrink-0">
                    Yours
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

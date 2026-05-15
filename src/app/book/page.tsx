"use client";

/**
 * Public booking wizard at /book — anyone can submit a request without
 * logging in. The request lands in /admin/booking-requests for the
 * front desk to confirm.
 *
 * Three steps:
 *   1. Pick a treatment (with optional doctor preference)
 *   2. Pick a date + time slot
 *   3. Enter contact details and submit
 *
 * The page is fully client-rendered: it talks to /api/booking/options
 * and /api/booking/slots which are public.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Stethoscope, Calendar, Clock, User, Loader2, ArrowRight, ArrowLeft,
  CheckCircle2, AlertTriangle, Sparkles,
} from "lucide-react";

interface Treatment {
  id: string;
  name: string;
  category: string;
  duration: number;
  description: string | null;
  basePrice: number;
}
interface Doctor {
  id: string;
  name: string;
  speciality: string | null;
  branchId: string;
}
interface DaySlots {
  date: string;
  slots: { time: string; endTime: string; doctorId: string; doctorName: string }[];
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function PublicBookingPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // Step 1 selections
  const [treatmentId, setTreatmentId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | "ANY">("ANY");

  // Step 2 selections
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [days, setDays] = useState<DaySlots[]>([]);
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const [chosenSlot, setChosenSlot] = useState<DaySlots["slots"][number] | null>(null);

  // Step 3 inputs
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [hp, setHp] = useState(""); // honeypot — must stay empty
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmationId, setConfirmationId] = useState<string | null>(null);

  // Initial load — fetch treatments + doctors.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/booking/options");
        const j = await r.json();
        if (!j.success) throw new Error(j.error || "load_failed");
        setTreatments(j.data.treatments);
        setDoctors(j.data.doctors);
      } catch (e) {
        setOptionsError((e as Error).message);
      } finally {
        setOptionsLoading(false);
      }
    })();
  }, []);

  // When the user picks a treatment / doctor, fetch the slot grid.
  useEffect(() => {
    if (step !== 2 || !treatmentId) return;
    setSlotsLoading(true);
    setSlotsError(null);
    const params = new URLSearchParams({ treatmentId });
    if (doctorId !== "ANY") params.set("doctorId", doctorId);
    fetch(`/api/booking/slots?${params}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error(j.error || "load_failed");
        setDays(j.data.days);
      })
      .catch((e) => setSlotsError((e as Error).message))
      .finally(() => setSlotsLoading(false));
  }, [step, treatmentId, doctorId]);

  const treatment = useMemo(
    () => treatments.find((t) => t.id === treatmentId) ?? null,
    [treatments, treatmentId]
  );
  const treatmentsByCategory = useMemo(() => {
    const m = new Map<string, Treatment[]>();
    for (const t of treatments) {
      const arr = m.get(t.category) ?? [];
      arr.push(t);
      m.set(t.category, arr);
    }
    return Array.from(m.entries());
  }, [treatments]);

  const submit = async () => {
    if (!treatmentId || !chosenSlot || !chosenDate) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch("/api/booking/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treatmentId,
          doctorId: chosenSlot.doctorId,
          preferredDate: chosenDate,
          preferredStart: chosenSlot.time,
          name, phone, email, notes, hp,
        }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "submit_failed");
      setConfirmationId(j.data.id);
      setStep(4);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (optionsLoading) {
    return <Center><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></Center>;
  }
  if (optionsError) {
    return (
      <Center>
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-stone-600">Couldn't load booking options ({optionsError}). Please try again later.</p>
        </div>
      </Center>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-100">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Stethoscope className="w-5 h-5 text-blue-500" />
          <h1 className="text-base font-bold text-stone-900">Book an appointment</h1>
          <span className="ml-auto text-[11px] text-stone-400">Step {step === 4 ? "✓" : step} of 3</span>
        </div>
        {step !== 4 && (
          <div className="max-w-2xl mx-auto px-4 pb-3 flex items-center gap-1">
            {[1, 2, 3].map((n) => (
              <div key={n} className={`flex-1 h-1.5 rounded-full ${n <= step ? "bg-blue-500" : "bg-stone-200"}`} />
            ))}
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* ─── Step 1: treatment + doctor ─── */}
        {step === 1 && (
          <>
            <h2 className="text-base font-semibold text-stone-900">What do you need?</h2>
            <div className="space-y-3">
              {treatmentsByCategory.map(([category, items]) => (
                <section key={category}>
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-400 mb-1.5 px-1">
                    {category.replace(/_/g, " ")}
                  </p>
                  <div className="space-y-2">
                    {items.map((t) => {
                      const selected = treatmentId === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setTreatmentId(t.id)}
                          className={`w-full text-left p-3 rounded-xl border transition-all ${
                            selected
                              ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
                              : "bg-white border-stone-200 hover:border-stone-300"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-stone-900">{t.name}</span>
                            <span className="text-[11px] text-stone-400 shrink-0">{t.duration} min</span>
                          </div>
                          {t.description && (
                            <p className="text-xs text-stone-500 mt-1 line-clamp-2">{t.description}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            {treatmentId && (
              <section className="pt-2">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-400 mb-1.5 px-1">
                  Doctor
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDoctorId("ANY")}
                    className={`p-3 rounded-xl border text-left ${
                      doctorId === "ANY"
                        ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
                        : "bg-white border-stone-200"
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-blue-500 mb-1" />
                    <p className="text-sm font-semibold text-stone-900">Any available</p>
                    <p className="text-xs text-stone-500">Fastest scheduling</p>
                  </button>
                  {doctors.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDoctorId(d.id)}
                      className={`p-3 rounded-xl border text-left ${
                        doctorId === d.id
                          ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
                          : "bg-white border-stone-200"
                      }`}
                    >
                      <Stethoscope className="w-4 h-4 text-stone-400 mb-1" />
                      <p className="text-sm font-semibold text-stone-900">{d.name}</p>
                      {d.speciality && <p className="text-xs text-stone-500">{d.speciality}</p>}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <NavRow
              onNext={() => setStep(2)}
              nextDisabled={!treatmentId}
            />
          </>
        )}

        {/* ─── Step 2: date + time ─── */}
        {step === 2 && treatment && (
          <>
            <h2 className="text-base font-semibold text-stone-900">Pick a time</h2>
            <p className="text-xs text-stone-500">
              {treatment.name} · {treatment.duration} min
              {doctorId !== "ANY" && ` · ${doctors.find((d) => d.id === doctorId)?.name ?? ""}`}
            </p>

            {slotsLoading ? (
              <Center><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></Center>
            ) : slotsError ? (
              <p className="text-sm text-red-600">Couldn't load times: {slotsError}</p>
            ) : days.every((d) => d.slots.length === 0) ? (
              <div className="bg-white border border-stone-200 rounded-xl p-6 text-center text-sm text-stone-500">
                No available slots in the next two weeks. Please call the clinic to book.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {days.map((d) => {
                    const has = d.slots.length > 0;
                    const active = chosenDate === d.date;
                    return (
                      <button
                        key={d.date}
                        disabled={!has}
                        onClick={() => { setChosenDate(d.date); setChosenSlot(null); }}
                        className={`shrink-0 px-3 py-2 rounded-xl border text-xs font-medium whitespace-nowrap ${
                          active ? "bg-blue-600 text-white border-blue-600"
                            : has ? "bg-white text-stone-700 border-stone-200"
                                  : "bg-stone-100 text-stone-400 border-stone-100 cursor-not-allowed"
                        }`}
                      >
                        {formatDay(d.date)}
                        <span className={`ml-1.5 text-[10px] ${active ? "opacity-80" : "opacity-50"}`}>
                          {has ? `${d.slots.length}` : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {chosenDate && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {(days.find((d) => d.date === chosenDate)?.slots ?? []).map((s, i) => {
                      const active = chosenSlot?.time === s.time && chosenSlot.doctorId === s.doctorId;
                      return (
                        <button
                          key={`${s.time}-${s.doctorId}-${i}`}
                          onClick={() => setChosenSlot(s)}
                          className={`px-3 py-2.5 rounded-xl border text-sm font-semibold ${
                            active ? "bg-blue-600 text-white border-blue-600"
                                   : "bg-white text-stone-800 border-stone-200 hover:border-blue-300"
                          }`}
                        >
                          {s.time}
                          {doctorId === "ANY" && (
                            <p className={`text-[10px] mt-0.5 font-normal ${active ? "opacity-80" : "text-stone-500"}`}>
                              {s.doctorName.replace(/^Dr\.? */, "Dr ").slice(0, 18)}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <NavRow
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
              nextDisabled={!chosenSlot}
            />
          </>
        )}

        {/* ─── Step 3: contact details ─── */}
        {step === 3 && treatment && chosenSlot && chosenDate && (
          <>
            <h2 className="text-base font-semibold text-stone-900">Your details</h2>
            <div className="bg-white border border-stone-200 rounded-xl p-4 text-sm space-y-1">
              <p><Calendar className="inline w-3.5 h-3.5 mr-1.5 text-blue-500" /> {formatDay(chosenDate)}</p>
              <p><Clock className="inline w-3.5 h-3.5 mr-1.5 text-blue-500" /> {chosenSlot.time}–{chosenSlot.endTime}</p>
              <p><User className="inline w-3.5 h-3.5 mr-1.5 text-blue-500" /> {chosenSlot.doctorName}</p>
              <p className="text-xs text-stone-500 pt-1">{treatment.name} · {treatment.duration} min</p>
            </div>

            <div className="space-y-3">
              <Field label="Full name *">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </Field>
              <Field label="Phone *">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" maxLength={30}
                  placeholder="+92 300 0000000"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </Field>
              <Field label="Email (optional)">
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" maxLength={200}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </Field>
              <Field label="Anything we should know?">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none" />
              </Field>
              {/* Honeypot — hidden from humans, visible to dumb bots. */}
              <input
                type="text" name="company" autoComplete="off" tabIndex={-1}
                value={hp} onChange={(e) => setHp(e.target.value)}
                aria-hidden="true"
                style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px" }}
              />
            </div>

            {submitError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 inline-flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {submitError === "slot_unavailable" ? "Sorry, that time was just taken — please pick another." :
                 submitError === "rate_limited"    ? "Too many requests from your network — please try again in a few minutes." :
                                                     `Couldn't submit: ${submitError}`}
              </p>
            )}

            <NavRow
              onBack={() => setStep(2)}
              onNext={submit}
              nextLabel={submitting ? "Sending…" : "Request appointment"}
              nextDisabled={!name.trim() || !phone.trim() || submitting}
            />
          </>
        )}

        {/* ─── Step 4: confirmation ─── */}
        {step === 4 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-stone-900">Request received</h2>
            <p className="text-sm text-stone-500 mt-1 max-w-sm mx-auto">
              We'll review your preferred time and message you to confirm. Reference:
              <span className="font-mono ml-1">{confirmationId?.slice(0, 8)}</span>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-stone-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function NavRow({
  onBack, onNext, nextLabel = "Continue", nextDisabled = false,
}: {
  onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-4">
      {onBack ? (
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      ) : <span />}
      {onNext && (
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:bg-stone-300 hover:bg-blue-700"
        >
          {nextLabel} <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">{children}</div>;
}

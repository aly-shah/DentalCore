"use client";

import { useState } from "react";
import { SlidePanel } from "@/components/ui/slide-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCreatePatient } from "@/hooks/use-queries";
import {
  patientAgePayload,
  usePatientAgeField,
  validatePatientAge,
} from "@/hooks/use-patient-age-field";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import {
  User, Phone, Mail, MapPin, Heart, ChevronDown, ChevronUp, CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AddPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const initialForm = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  age: "",
  gender: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  emergencyContact: "",
  emergencyPhone: "",
  bloodType: "",
  notes: "",
};

export function AddPatientModal({ isOpen, onClose }: AddPatientModalProps) {
  const emit = useModuleEmit("MOD-PATIENT");
  const { user } = useAuth();
  const router = useRouter();
  const createPatient = useCreatePatient();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [success, setSuccess] = useState(false);
  const [newPatientId, setNewPatientId] = useState("");

  const { ageValue, onDobChange, onAgeChange } = usePatientAgeField(form, setForm);

  const set = (field: keyof typeof initialForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const setGender = (g: string) => setForm((f) => ({ ...f, gender: g }));

  const handleSubmit = async () => {
    if (!form.firstName.trim()) { setError("First name is required"); return; }
    if (!form.lastName.trim()) { setError("Last name is required"); return; }
    if (!form.phone.trim()) { setError("Phone number is required"); return; }
    const ageError = validatePatientAge(form);
    if (ageError) { setError(ageError); return; }
    if (!form.gender) { setError("Please select gender"); return; }
    setError("");

    try {
      const result = await createPatient.mutateAsync({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        ...patientAgePayload(form),
        gender: form.gender,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        emergencyContact: form.emergencyContact.trim() || undefined,
        emergencyPhone: form.emergencyPhone.trim() || undefined,
        bloodType: form.bloodType || undefined,
        notes: form.notes.trim() || undefined,
        branchId: user?.branchId || undefined,
      });

      emit(SystemEvents.PATIENT_CREATED, {
        patientName: `${form.firstName} ${form.lastName}`,
      });

      const patient = (result as unknown as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      setNewPatientId((patient?.id as string) || "");
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register patient");
    }
  };

  const handleClose = () => {
    setForm(initialForm);
    setError("");
    setShowMore(false);
    setSuccess(false);
    setNewPatientId("");
    onClose();
  };

  const handleViewProfile = () => {
    handleClose();
    if (newPatientId) router.push(`/patients/${newPatientId}`);
  };

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={handleClose}
      title="New Patient"
      subtitle="Quick registration — details can be added later"
      width="md"
      data-id="PATIENT-PROFILE-CREATE"
      footer={success ? undefined : (
        <>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createPatient.isPending}>
            {createPatient.isPending ? "Registering..." : "Register Patient"}
          </Button>
        </>
      )}
    >
      {success ? (
        <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-stone-900">Patient Registered</h3>
          <p className="text-sm text-stone-500 mt-1">{form.firstName} {form.lastName}</p>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" onClick={handleClose}>Close</Button>
            <Button onClick={handleViewProfile}>View Profile</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5 animate-fade-in">
              {error}
            </div>
          )}

          {/* ---- ESSENTIAL FIELDS ---- */}

          {/* Name */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Name</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="First name *" value={form.firstName} onChange={set("firstName")} />
              <Input placeholder="Last name *" value={form.lastName} onChange={set("lastName")} />
            </div>
          </div>

          {/* Gender — tap buttons */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Gender</span>
            </div>
            <div className="flex gap-2">
              {[
                { value: "MALE", label: "Male", emoji: "👨" },
                { value: "FEMALE", label: "Female", emoji: "👩" },
                { value: "OTHER", label: "Other", emoji: "🧑" },
              ].map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGender(g.value)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all cursor-pointer",
                    form.gender === g.value
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                  )}
                >
                  <span className="mr-1.5">{g.emoji}</span>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* DOB or Age — exact birthday preferred, age accepted when unknown */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Date of Birth *</span>
            </div>
            <div className="flex gap-3 items-center">
              <div className="flex-1">
                <Input type="date" value={form.dateOfBirth} onChange={onDobChange} />
              </div>
              <span className="shrink-0 text-xs text-stone-400">or</span>
              <div className="shrink-0 w-28">
                <Input
                  inputMode="numeric"
                  placeholder="Age"
                  value={ageValue}
                  onChange={onAgeChange}
                  iconRight={<span className="text-xs text-stone-400">yrs</span>}
                />
              </div>
            </div>
          </div>

          {/* Phone */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Phone className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Contact</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input type="tel" placeholder="Phone number *" value={form.phone} onChange={set("phone")} />
              <Input type="email" placeholder="Email (optional)" value={form.email} onChange={set("email")} />
            </div>
          </div>

          {/* ---- OPTIONAL FIELDS (collapsible) ---- */}
          <button
            onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-2 w-full text-sm text-stone-400 hover:text-stone-600 transition-colors cursor-pointer py-1"
          >
            <div className="flex-1 border-t border-stone-100" />
            <span className="flex items-center gap-1 shrink-0 text-xs font-medium">
              {showMore ? "Less details" : "More details"}
              {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
            <div className="flex-1 border-t border-stone-100" />
          </button>

          {showMore && (
            <div className="space-y-4 animate-fade-in">
              {/* Address */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Address</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Street address" value={form.address} onChange={set("address")} />
                  <Input placeholder="City" value={form.city} onChange={set("city")} />
                </div>
              </div>

              {/* Emergency */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Emergency Contact</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Contact name" value={form.emergencyContact} onChange={set("emergencyContact")} />
                  <Input placeholder="Contact phone" value={form.emergencyPhone} onChange={set("emergencyPhone")} />
                </div>
              </div>

              {/* Blood Type */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Blood Type</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((bt) => (
                    <button
                      key={bt}
                      onClick={() => setForm((f) => ({ ...f, bloodType: f.bloodType === bt ? "" : bt }))}
                      className={cn(
                        "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer",
                        form.bloodType === bt
                          ? "border-red-300 bg-red-50 text-red-700"
                          : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                      )}
                    >
                      {bt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <Input placeholder="Any notes (allergies, conditions...)" value={form.notes} onChange={set("notes")} />
            </div>
          )}
        </div>
      )}
    </SlidePanel>
  );
}

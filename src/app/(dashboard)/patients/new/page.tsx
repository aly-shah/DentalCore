"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, User, Heart, Shield, CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCreatePatient } from "@/hooks/use-queries";
import {
  patientAgePayload,
  usePatientAgeField,
  validatePatientAge,
} from "@/hooks/use-patient-age-field";
import { useModuleAccess, useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useAuth } from "@/lib/auth-context";

const initialForm = {
  firstName: "",
  middleName: "",
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
  skinType: "",
  notes: "",
  insuranceProvider: "",
  policyNumber: "",
  coverageType: "",
  insuranceExpiry: "",
};

export default function NewPatientPage() {
  const router = useRouter();
  const access = useModuleAccess("MOD-PATIENT");
  const emit = useModuleEmit("MOD-PATIENT");
  const { user } = useAuth();
  const createPatient = useCreatePatient();

  const [activeTab, setActiveTab] = useState("personal");
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const { ageValue, onDobChange, onAgeChange } = usePatientAgeField(form, setForm);

  const set = (field: keyof typeof initialForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = (): string | null => {
    if (!form.firstName.trim()) return "First name is required";
    if (!form.lastName.trim()) return "Last name is required";
    if (!form.phone.trim()) return "Phone number is required";
    const ageError = validatePatientAge(form);
    if (ageError) return ageError;
    if (!form.gender) return "Gender is required";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");

    try {
      const result = await createPatient.mutateAsync({
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || undefined,
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
        skinType: form.skinType || undefined,
        notes: form.notes.trim() || undefined,
        branchId: user?.branchId || undefined,
      });

      emit(SystemEvents.PATIENT_CREATED, {
        patientName: `${form.firstName} ${form.lastName}`,
      });

      setSuccess(true);

      // Navigate to the new patient's profile after a brief delay
      const newPatient = (result as unknown as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      setTimeout(() => {
        if (newPatient?.id) {
          router.push(`/patients/${newPatient.id}`);
        } else {
          router.push("/patients");
        }
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create patient");
    }
  };

  if (!access.canCreate) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have permission to register patients.
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
        <h2 className="text-xl font-semibold text-stone-900">Patient Registered</h2>
        <p className="text-sm text-stone-500 mt-1">{form.firstName} {form.lastName} has been added successfully</p>
        <p className="text-xs text-stone-400 mt-3">Redirecting to patient profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" iconLeft={<ArrowLeft className="w-4 h-4" />} onClick={() => router.back()}>
            Back
          </Button>
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-stone-900">Register New Patient</h1>
            <p className="text-xs text-stone-400">Fill in patient details to create a new record</p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5">{error}</div>
      )}

      {/* Form */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <Tabs value={activeTab} onChange={(v) => setActiveTab(v)}>
            <TabsList>
              <TabsTrigger value="personal">
                <User className="w-3.5 h-3.5 mr-1.5" />
                Personal
              </TabsTrigger>
              <TabsTrigger value="medical">
                <Heart className="w-3.5 h-3.5 mr-1.5" />
                Medical
              </TabsTrigger>
              <TabsTrigger value="insurance">
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                Insurance
              </TabsTrigger>
            </TabsList>

            {/* Personal */}
            <TabsContent value="personal">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input label="First Name" placeholder="First name" required value={form.firstName} onChange={set("firstName")} />
                  <Input label="Middle Name" placeholder="Middle name" value={form.middleName} onChange={set("middleName")} />
                  <Input label="Last Name" placeholder="Last name" required value={form.lastName} onChange={set("lastName")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input label="Date of Birth" type="date" value={form.dateOfBirth} onChange={onDobChange} helperText="Or enter age →" />
                  <Input label="Age" inputMode="numeric" value={ageValue} onChange={onAgeChange} placeholder="e.g. 32" helperText={form.dateOfBirth ? "From date of birth" : "Years"} />
                  <Select label="Gender" required placeholder="Select" value={form.gender} onChange={set("gender")}
                    options={[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }, { value: "OTHER", label: "Other" }]} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Phone" type="tel" placeholder="+92 300 0000000" required value={form.phone} onChange={set("phone")} />
                  <Input label="Email" type="email" placeholder="patient@email.com" value={form.email} onChange={set("email")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Address" placeholder="Street address" value={form.address} onChange={set("address")} />
                  <Input label="City" placeholder="City" value={form.city} onChange={set("city")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Emergency Contact" placeholder="Contact name" value={form.emergencyContact} onChange={set("emergencyContact")} />
                  <Input label="Emergency Phone" type="tel" placeholder="+92 300 0000000" value={form.emergencyPhone} onChange={set("emergencyPhone")} />
                </div>
                <div className="flex justify-end pt-2">
                  <Button onClick={() => setActiveTab("medical")}>Next</Button>
                </div>
              </div>
            </TabsContent>

            {/* Medical */}
            <TabsContent value="medical">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select label="Blood Type" placeholder="Select" value={form.bloodType} onChange={set("bloodType")}
                    options={["O+","O-","A+","A-","B+","B-","AB+","AB-"].map((v) => ({ value: v, label: v }))} />
                  <Select label="Oral Hygiene Status" placeholder="Select" value={form.skinType} onChange={set("skinType")}
                    options={[
                      { value: "TYPE_I", label: "Excellent" },
                      { value: "TYPE_II", label: "Good — mild plaque" },
                      { value: "TYPE_III", label: "Fair — gingivitis" },
                      { value: "TYPE_IV", label: "Poor — generalized gingivitis" },
                      { value: "TYPE_V", label: "Mild/moderate periodontitis" },
                      { value: "TYPE_VI", label: "Severe periodontitis" },
                    ]} />
                </div>
                <Input label="Notes" placeholder="Allergies, medications, conditions..." value={form.notes} onChange={set("notes")} />
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setActiveTab("personal")}>Back</Button>
                  <Button onClick={() => setActiveTab("insurance")}>Next</Button>
                </div>
              </div>
            </TabsContent>

            {/* Insurance */}
            <TabsContent value="insurance">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Insurance Provider" placeholder="Provider name" value={form.insuranceProvider} onChange={set("insuranceProvider")} />
                  <Input label="Policy Number" placeholder="Policy number" value={form.policyNumber} onChange={set("policyNumber")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select label="Coverage Type" placeholder="Select" value={form.coverageType} onChange={set("coverageType")}
                    options={[
                      { value: "full", label: "Full Coverage" },
                      { value: "partial", label: "Partial Coverage" },
                      { value: "cosmetic", label: "Cosmetic Only" },
                      { value: "medical", label: "Medical Only" },
                      { value: "none", label: "No Insurance" },
                    ]} />
                  <Input label="Expiration Date" type="date" value={form.insuranceExpiry} onChange={set("insuranceExpiry")} />
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setActiveTab("medical")}>Back</Button>
                  <Button onClick={handleSubmit} disabled={createPatient.isPending}>
                    {createPatient.isPending ? "Registering..." : "Register Patient"}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

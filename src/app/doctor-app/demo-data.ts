/**
 * Doctor App — self-contained demo dataset.
 *
 * Powers the no-login review mode at /doctor-app?demo=1. Everything here is
 * fabricated: no real patients, no API calls, no PII. When demo mode is on
 * the page reads from these constants instead of fetching, so a reviewer can
 * open the live URL and see the full UI without a doctor account.
 */
import type { SummaryPayload } from "./patient-summary-view";
import type { ToothStatus } from "@/components/patients/tabs/dental-chart/types";

type Apt = Record<string, unknown>;

export const DEMO_USER = { name: "Dr. Maya Lin", role: "DOCTOR" } as const;

const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** Patients referenced by the appointment list + the Patients tab. */
interface DemoPatient {
  id: string;
  firstName: string;
  lastName: string;
  patientCode: string;
  phone: string;
}

export const DEMO_PATIENTS: DemoPatient[] = [
  { id: "demo-p1", firstName: "Sarah", lastName: "Chen", patientCode: "P-1024", phone: "+1 415 555 0132" },
  { id: "demo-p2", firstName: "Marcus", lastName: "Reed", patientCode: "P-0991", phone: "+1 415 555 0148" },
  { id: "demo-p3", firstName: "Aisha", lastName: "Khan", patientCode: "P-1107", phone: "+1 415 555 0190" },
  { id: "demo-p4", firstName: "David", lastName: "Okafor", patientCode: "P-0876", phone: "+1 415 555 0177" },
  { id: "demo-p5", firstName: "Elena", lastName: "Rossi", patientCode: "P-1153", phone: "+1 415 555 0163" },
  { id: "demo-p6", firstName: "Tom", lastName: "Becker", patientCode: "P-1190", phone: "+1 415 555 0125" },
];

const patientById = (id: string) => DEMO_PATIENTS.find((p) => p.id === id)!;

function mkAppt(
  patientId: string,
  startTime: string,
  endTime: string,
  type: string,
  status: string,
): Apt {
  const p = patientById(patientId);
  return {
    id: `demo-appt-${patientId}`,
    patientId,
    startTime,
    endTime,
    type,
    status,
    patient: {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      patientCode: p.patientCode,
      phone: p.phone,
    },
  };
}

/** Today's appointments, spanning every status the dashboard tiles count. */
export const DEMO_APPTS: Apt[] = [
  mkAppt("demo-p1", "09:00", "09:45", "ROOT_CANAL", "IN_PROGRESS"),
  mkAppt("demo-p2", "09:30", "10:00", "CHECKUP", "CHECKED_IN"),
  mkAppt("demo-p3", "10:15", "11:00", "CROWN_FITTING", "CONFIRMED"),
  mkAppt("demo-p4", "11:30", "12:00", "CONSULTATION", "SCHEDULED"),
  mkAppt("demo-p5", "08:15", "08:45", "SCALING", "COMPLETED"),
  mkAppt("demo-p6", "08:45", "09:00", "FOLLOW_UP", "COMPLETED"),
];

/* ───────────── patient summaries (drill-in view) ───────────── */

const BASE_SUMMARY: SummaryPayload = {
  patient: {
    id: "", firstName: "", lastName: "", patientCode: "",
    gender: "OTHER", age: null, phone: null, email: null,
    bloodType: null, isVip: false, profileImage: null,
    assignedDoctor: { id: "demo-doc", name: "Dr. Maya Lin" },
    tags: [],
  },
  allergies: [],
  lastNote: null,
  latestRx: null,
  latestTriage: null,
  problemTeeth: [],
  openPlan: null,
  finance: { outstandingBalance: 0, openInvoices: [] },
  todayAppt: null,
  nextAppt: null,
};

const SUMMARIES: Record<string, SummaryPayload> = {
  "demo-p1": {
    ...BASE_SUMMARY,
    patient: {
      ...BASE_SUMMARY.patient,
      id: "demo-p1", firstName: "Sarah", lastName: "Chen", patientCode: "P-1024",
      gender: "FEMALE", age: 34, phone: "+1 415 555 0132", email: "sarah.chen@example.com",
      bloodType: "O+", isVip: true, tags: ["Anxious", "Recall due"],
    },
    allergies: [{ allergen: "Penicillin", severity: "Severe" }, { allergen: "Latex", severity: "Moderate" }],
    lastNote: {
      chiefComplaint: "Sharp pain upper-left molar on chewing",
      diagnosis: "Irreversible pulpitis #26",
      treatmentPlan: "Initiate root canal therapy, 2 visits",
      advice: "Soft diet, ibuprofen PRN",
      createdAt: daysAgoIso(12),
      doctor: { name: "Dr. Maya Lin" },
    },
    latestRx: {
      createdAt: daysAgoIso(12),
      items: [
        { medicineName: "Amoxicillin substitute — Clindamycin", dosage: "300mg", frequency: "TID", duration: "5 days" },
        { medicineName: "Ibuprofen", dosage: "400mg", frequency: "PRN", duration: "5 days" },
      ],
    },
    latestTriage: {
      temperature: 36.8, systolicBP: 128, diastolicBP: 82, heartRate: 88,
      oxygenSaturation: 98, painLevel: 7, urgencyLevel: "HIGH", createdAt: daysAgoIso(0),
    },
    problemTeeth: [
      { fdi: 26, status: "PULPITIS", conditions: "Deep caries, irreversible pulpitis", plannedTreatment: "RCT", priority: "HIGH" },
      { fdi: 36, status: "FILLED", conditions: "Composite restoration", plannedTreatment: null, priority: "LOW" },
      { fdi: 47, status: "CARIES", conditions: "Occlusal caries", plannedTreatment: "Filling", priority: "MEDIUM" },
    ],
    openPlan: {
      id: "demo-plan-1", title: "Root canal + crown #26", status: "IN_PROGRESS",
      totalCost: 1850, estimatedPatientPortion: 740, completedCount: 1,
      items: [
        { id: "i1", description: "RCT #26 — pulp extirpation", status: "COMPLETED", total: 650, fdi: 26 },
        { id: "i2", description: "RCT #26 — obturation", status: "PENDING", total: 600, fdi: 26 },
        { id: "i3", description: "Porcelain crown #26", status: "PENDING", total: 600, fdi: 26 },
      ],
    },
    finance: {
      outstandingBalance: 740,
      openInvoices: [{ id: "inv1", invoiceNumber: "INV-2048", total: 740, balanceDue: 740, status: "OVERDUE", dueDate: daysAgoIso(3) }],
    },
    todayAppt: { id: "demo-appt-demo-p1", startTime: "09:00", endTime: "09:45", type: "ROOT_CANAL", status: "IN_PROGRESS", doctorId: "demo-doc" },
    nextAppt: null,
  },

  "demo-p2": {
    ...BASE_SUMMARY,
    patient: {
      ...BASE_SUMMARY.patient,
      id: "demo-p2", firstName: "Marcus", lastName: "Reed", patientCode: "P-0991",
      gender: "MALE", age: 52, phone: "+1 415 555 0148", bloodType: "A-", tags: ["Hypertension"],
    },
    allergies: [],
    lastNote: {
      chiefComplaint: "Routine 6-month checkup",
      diagnosis: "Generalised mild gingivitis",
      treatmentPlan: "Scaling + oral hygiene instruction",
      advice: "Electric toothbrush, floss daily",
      createdAt: daysAgoIso(184),
      doctor: { name: "Dr. Maya Lin" },
    },
    latestTriage: {
      temperature: 36.6, systolicBP: 142, diastolicBP: 90, heartRate: 76,
      oxygenSaturation: 99, painLevel: 0, urgencyLevel: "ROUTINE", createdAt: daysAgoIso(0),
    },
    problemTeeth: [
      { fdi: 16, status: "GINGIVITIS", conditions: "Marginal inflammation", plannedTreatment: "Scaling", priority: "LOW" },
    ],
    finance: { outstandingBalance: 0, openInvoices: [] },
    todayAppt: { id: "demo-appt-demo-p2", startTime: "09:30", endTime: "10:00", type: "CHECKUP", status: "CHECKED_IN", doctorId: "demo-doc" },
    nextAppt: null,
  },

  "demo-p3": {
    ...BASE_SUMMARY,
    patient: {
      ...BASE_SUMMARY.patient,
      id: "demo-p3", firstName: "Aisha", lastName: "Khan", patientCode: "P-1107",
      gender: "FEMALE", age: 28, phone: "+1 415 555 0190", bloodType: "B+", tags: ["New patient"],
    },
    lastNote: {
      chiefComplaint: "Chipped front tooth after fall",
      diagnosis: "Enamel fracture #11",
      treatmentPlan: "Crown fitting",
      advice: null,
      createdAt: daysAgoIso(21),
      doctor: { name: "Dr. Maya Lin" },
    },
    problemTeeth: [
      { fdi: 11, status: "FRACTURED", conditions: "Enamel-dentine fracture", plannedTreatment: "Crown", priority: "HIGH" },
    ],
    openPlan: {
      id: "demo-plan-3", title: "Crown #11", status: "PLANNED",
      totalCost: 900, estimatedPatientPortion: 900, completedCount: 0,
      items: [{ id: "j1", description: "Porcelain crown #11", status: "PENDING", total: 900, fdi: 11 }],
    },
    finance: { outstandingBalance: 0, openInvoices: [] },
    todayAppt: { id: "demo-appt-demo-p3", startTime: "10:15", endTime: "11:00", type: "CROWN_FITTING", status: "CONFIRMED", doctorId: "demo-doc" },
    nextAppt: null,
  },
};

/** AI pre-visit briefing items, keyed by patient. */
export interface DemoAiItem {
  text: string;
  category: "ALLERGY" | "MEDICAL" | "DENTAL" | "FINANCIAL" | "OPERATIONAL" | "ROUTINE";
  severity: "INFO" | "ATTENTION" | "URGENT";
}

const AI_BRIEFINGS: Record<string, DemoAiItem[]> = {
  "demo-p1": [
    { text: "SEVERE penicillin allergy — do not prescribe amoxicillin; clindamycin is on file.", category: "ALLERGY", severity: "URGENT" },
    { text: "Mid-treatment RCT on #26 — today is the obturation visit.", category: "DENTAL", severity: "ATTENTION" },
    { text: "Pain level reported 7/10 at check-in; patient flagged as anxious.", category: "MEDICAL", severity: "ATTENTION" },
    { text: "$740 invoice is overdue — front desk may want to flag at checkout.", category: "FINANCIAL", severity: "INFO" },
  ],
  "demo-p2": [
    { text: "BP elevated at 142/90 — note for any adrenaline-containing anaesthetic.", category: "MEDICAL", severity: "ATTENTION" },
    { text: "Routine scaling visit; mild gingivitis from last note 6 months ago.", category: "DENTAL", severity: "INFO" },
  ],
  "demo-p3": [
    { text: "New patient — first restorative visit. Crown fitting on #11.", category: "OPERATIONAL", severity: "INFO" },
    { text: "Recent trauma (fall) — confirm no occult root fracture before cementing.", category: "DENTAL", severity: "ATTENTION" },
  ],
};

/** Returns a demo summary for any patient id, falling back to a light record. */
export function demoSummary(patientId: string): SummaryPayload {
  if (SUMMARIES[patientId]) return SUMMARIES[patientId];
  const p = DEMO_PATIENTS.find((x) => x.id === patientId);
  return {
    ...BASE_SUMMARY,
    patient: {
      ...BASE_SUMMARY.patient,
      id: patientId,
      firstName: p?.firstName ?? "Demo",
      lastName: p?.lastName ?? "Patient",
      patientCode: p?.patientCode ?? "P-0000",
      phone: p?.phone ?? null,
    },
    lastNote: {
      chiefComplaint: "Routine recall",
      diagnosis: "No active pathology",
      treatmentPlan: "Reassess at next recall",
      advice: null,
      createdAt: daysAgoIso(90),
      doctor: { name: "Dr. Maya Lin" },
    },
  };
}

export function demoAiBriefing(patientId: string): DemoAiItem[] {
  return AI_BRIEFINGS[patientId] ?? [
    { text: "No notable flags from the record for this visit.", category: "ROUTINE", severity: "INFO" },
  ];
}

/* ───────────── dental chart (mobile mini-chart) ───────────── */

export interface DemoTooth {
  fdi: number;
  status: ToothStatus;
  conditions?: string;
  plannedTreatment?: string;
  completedTreatment?: string;
  priority?: "EMERGENCY" | "HIGH" | "MEDIUM" | "COSMETIC";
}

export interface DemoChart {
  dentition: "ADULT" | "PEDIATRIC" | "MIXED";
  teeth: DemoTooth[];
}

const DEMO_CHARTS: Record<string, DemoChart> = {
  "demo-p1": {
    dentition: "ADULT",
    teeth: [
      { fdi: 26, status: "ROOT_CANAL", conditions: "Deep caries, irreversible pulpitis", plannedTreatment: "Obturation + crown", priority: "HIGH" },
      { fdi: 36, status: "FILLING", completedTreatment: "Composite filling" },
      { fdi: 47, status: "CARIES", conditions: "Occlusal caries", plannedTreatment: "Filling", priority: "MEDIUM" },
      { fdi: 16, status: "CROWN", completedTreatment: "Crown (PFM)" },
      { fdi: 24, status: "FILLING", completedTreatment: "Composite filling" },
      { fdi: 38, status: "MISSING" },
      { fdi: 48, status: "MISSING" },
    ],
  },
  "demo-p2": {
    dentition: "ADULT",
    teeth: [
      { fdi: 16, status: "FILLING", conditions: "Marginal inflammation", completedTreatment: "Amalgam filling" },
      { fdi: 26, status: "CARIES", conditions: "Early occlusal caries", plannedTreatment: "Filling", priority: "MEDIUM" },
      { fdi: 46, status: "TREATED", completedTreatment: "Scaling" },
    ],
  },
  "demo-p3": {
    dentition: "ADULT",
    teeth: [
      { fdi: 11, status: "FRACTURE", conditions: "Enamel-dentine fracture", plannedTreatment: "Crown", priority: "HIGH" },
      { fdi: 21, status: "HEALTHY" },
    ],
  },
  // A pediatric example so the chart's primary-dentition rendering is reviewable.
  "demo-p6": {
    dentition: "PEDIATRIC",
    teeth: [
      { fdi: 54, status: "CARIES", conditions: "Caries", plannedTreatment: "Filling", priority: "MEDIUM" },
      { fdi: 64, status: "FILLING", completedTreatment: "GIC filling" },
      { fdi: 75, status: "EXTRACTION_NEEDED", conditions: "Non-restorable", plannedTreatment: "Extraction", priority: "HIGH" },
    ],
  },
};

export function demoChart(patientId: string): DemoChart {
  return DEMO_CHARTS[patientId] ?? { dentition: "ADULT", teeth: [] };
}

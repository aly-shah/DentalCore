/**
 * One-off: wipe demo/mock CLINICAL + PATIENT data, keep the clinic setup.
 *
 * KEEPS: User (all staff incl. doctors), Branch, Room, Treatment catalog,
 * Package/PackageTreatment, TreatmentTemplate, Schedule, DoctorLeave, Tenant,
 * Setting, AIModelVersion.
 *
 * CLEARS: every patient / appointment / billing / clinical / lead record.
 *
 * Verified against the schema: no kept table has a foreign key into a cleared
 * table (Room.currentPatientId is a plain string, not a relation), so a
 * TRUNCATE ... CASCADE of the cleared set cannot touch the kept tables.
 *
 * Run on the VPS:  npx tsx prisma/cleanup-demo-data.ts
 */
// Load DATABASE_URL from the app's .env (tsx doesn't do this automatically).
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Tables to TRUNCATE (everything that is patient/clinical/financial demo data).
const CLEAR_TABLES = [
  "AISuggestionFeedback", "AISuggestionLog", "AITranscription", "Allergy",
  "Appointment", "AuditLog", "BeforeAfterImage", "BlockedSlot", "BookingRequest",
  "CallLog", "CommunicationLog", "Consent", "ConsultationNote", "DentalChart",
  "FollowUp", "Invoice", "InvoiceItem", "LabTest", "Lead", "MedicalHistory",
  "Notification", "OrthoCase", "OrthoVisit", "Patient", "PatientDocument",
  "PatientPackage", "PatientPortalToken", "PatientTag", "Payment",
  "PaymentSession", "Prescription", "PrescriptionItem", "Procedure", "Product",
  "Refund", "SkinHistory", "ToothEvent", "ToothRecord", "TreatmentPlan",
  "TreatmentPlanItem", "TreatmentPlanPhase", "Triage", "UnmatchedInboundMessage",
  "VoiceNote",
] as const;

async function snapshot(label: string) {
  const [users, doctors, branches, rooms, treatments, patients, appointments, invoices] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "DOCTOR" } }),
      prisma.branch.count(),
      prisma.room.count(),
      prisma.treatment.count(),
      prisma.patient.count(),
      prisma.appointment.count(),
      prisma.invoice.count(),
    ]);
  console.log(
    `\n[${label}] users=${users} (doctors=${doctors}) branches=${branches} ` +
    `rooms=${rooms} treatments=${treatments} | patients=${patients} ` +
    `appointments=${appointments} invoices=${invoices}`
  );
}

async function main() {
  console.log("Cleaning demo/mock patient data (keeping staff + clinic setup)…");
  await snapshot("before");

  const list = CLEAR_TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE;`);

  // Detach any lingering occupancy so rooms read as free.
  await prisma.room.updateMany({
    data: {
      currentPatientId: null,
      currentPatientName: null,
      currentDoctorName: null,
      occupiedSince: null,
      status: "AVAILABLE",
      isAvailable: true,
    },
  });

  await snapshot("after");
  console.log("\n✔ Done. Staff, doctors, branches, rooms and treatments are intact.");
}

main()
  .catch((e) => {
    console.error("Cleanup failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  mockBranches, mockUsers, mockPatients, mockTreatments, mockAppointments,
  mockRooms, mockInvoices, mockFollowUps, mockLeads, mockPackages,
  mockNotifications, mockCallLogs, mockConsultationNotes, mockLabTests,
  mockTriageRecords, mockAITranscriptions, mockAuditLogs, mockDocuments,
  mockCommunicationLogs, mockSkinHistory, mockMedicalHistory, mockPrescriptions,
  mockPatientPackages,
} from "../src/lib/mock-data";

const prisma = new PrismaClient();

function toDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

async function safeDelete(label: string, fn: () => Promise<unknown>) {
  try { await fn(); }
  catch (e: unknown) {
    const code = (e as { code?: string }).code;
    // P2021 = table does not exist — fine on first run
    if (code !== "P2021") throw e;
    console.log(`  (skip clear ${label}: table missing — first run)`);
  }
}

async function main() {
  console.log("Seeding DentaCore...");

  // Clear (order matters — children before parents)
  await safeDelete("auditLog", () => prisma.auditLog.deleteMany());
  await safeDelete("notification", () => prisma.notification.deleteMany());
  await safeDelete("aITranscription", () => prisma.aITranscription.deleteMany());
  await safeDelete("communicationLog", () => prisma.communicationLog.deleteMany());
  await safeDelete("callLog", () => prisma.callLog.deleteMany());
  await safeDelete("patientPackage", () => prisma.patientPackage.deleteMany());
  await safeDelete("packageTreatment", () => prisma.packageTreatment.deleteMany());
  await safeDelete("package", () => prisma.package.deleteMany());
  await safeDelete("payment", () => prisma.payment.deleteMany());
  await safeDelete("refund", () => prisma.refund.deleteMany());
  await safeDelete("invoiceItem", () => prisma.invoiceItem.deleteMany());
  await safeDelete("invoice", () => prisma.invoice.deleteMany());
  await safeDelete("prescriptionItem", () => prisma.prescriptionItem.deleteMany());
  await safeDelete("prescription", () => prisma.prescription.deleteMany());
  await safeDelete("procedure", () => prisma.procedure.deleteMany());
  await safeDelete("labTest", () => prisma.labTest.deleteMany());
  await safeDelete("patientDocument", () => prisma.patientDocument.deleteMany());
  await safeDelete("followUp", () => prisma.followUp.deleteMany());
  await safeDelete("triage", () => prisma.triage.deleteMany());
  await safeDelete("consultationNote", () => prisma.consultationNote.deleteMany());
  await safeDelete("appointment", () => prisma.appointment.deleteMany());
  await safeDelete("skinHistory", () => prisma.skinHistory.deleteMany());
  await safeDelete("medicalHistory", () => prisma.medicalHistory.deleteMany());
  await safeDelete("allergy", () => prisma.allergy.deleteMany());
  await safeDelete("patientTag", () => prisma.patientTag.deleteMany());
  await safeDelete("patient", () => prisma.patient.deleteMany());
  await safeDelete("treatment", () => prisma.treatment.deleteMany());
  await safeDelete("room", () => prisma.room.deleteMany());
  await safeDelete("lead", () => prisma.lead.deleteMany());
  await safeDelete("user", () => prisma.user.deleteMany());
  await safeDelete("branch", () => prisma.branch.deleteMany());

  for (const b of mockBranches) {
    await prisma.branch.create({ data: { id: b.id, name: b.name, address: b.address, phone: b.phone, email: b.email, isActive: b.isActive } });
  }
  console.log(`  Branches: ${mockBranches.length}`);

  const hash = await bcrypt.hash("password", 10);
  for (const u of mockUsers) {
    await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, passwordHash: hash, isActive: u.isActive, lastLoginAt: toDate(u.lastLogin), branchId: u.branchId } });
  }
  console.log(`  Users: ${mockUsers.length} (password for all: "password")`);

  for (const t of mockTreatments) {
    await prisma.treatment.create({ data: { id: t.id, name: t.name, category: t.category as string, description: t.description, duration: t.duration, basePrice: t.basePrice, isActive: t.isActive } });
  }
  console.log(`  Treatments: ${mockTreatments.length}`);

  for (const r of mockRooms) {
    await prisma.room.create({ data: { id: r.id, branchId: r.branchId, name: r.name, type: r.type as string, status: r.status as string, isAvailable: r.isAvailable, capacity: r.capacity, currentPatientId: r.currentPatientId, currentPatientName: r.currentPatientName, currentDoctorName: r.currentDoctorName, occupiedSince: toDate(r.occupiedSince) } });
  }
  console.log(`  Rooms: ${mockRooms.length}`);

  for (const p of mockPatients) {
    await prisma.patient.create({ data: { id: p.id, patientCode: p.patientCode, firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone, dateOfBirth: toDate(p.dateOfBirth), gender: p.gender as any, address: p.address, city: p.city, emergencyContact: p.emergencyContact, emergencyPhone: p.emergencyPhone, bloodType: p.bloodType, branchId: p.branchId, assignedDoctorId: p.assignedDoctorId, isActive: p.isActive, skinType: p.skinType, lastVisit: toDate(p.lastVisit), nextAppointment: toDate(p.nextAppointment), outstandingBalance: p.outstandingBalance, allergies: { create: (p.allergies || []).map((a) => ({ allergen: a })) } } });
  }
  console.log(`  Patients: ${mockPatients.length}`);

  // The UI's LeadStatus enum (src/types) has values the Prisma LeadStatus enum
  // lacks (INTERESTED, NOT_INTERESTED). Map those to the closest DB values so
  // the seed persists cleanly; remaining values pass through unchanged.
  const leadStatusToDb: Record<string, string> = { INTERESTED: "QUALIFIED", NOT_INTERESTED: "LOST" };
  for (const l of mockLeads) {
    const status = leadStatusToDb[l.status as string] ?? (l.status as string);
    await prisma.lead.create({ data: { id: l.id, name: l.name, phone: l.phone, email: l.email, source: l.source as string, status: status as any, interest: l.interest, assignedToId: l.assignedToId, branchId: l.branchId, notes: l.notes, convertedPatientId: l.convertedPatientId, callbackDate: toDate(l.callbackDate) } });
  }
  console.log(`  Leads: ${mockLeads.length}`);

  // The UI's WorkflowStage enum is finer-grained than the Prisma
  // AppointmentWorkflowStage enum (BOOKED/CHECKIN/CHECKOUT/BILLING/COMPLETED).
  // In-chair stages (WAITING/TREATMENT/HISTORY_UPDATE) collapse to CHECKIN.
  const workflowStageToDb: Record<string, string> = { WAITING: "CHECKIN", TREATMENT: "CHECKIN", HISTORY_UPDATE: "CHECKIN" };
  for (const a of mockAppointments) {
    const workflowStage = workflowStageToDb[a.workflowStage as string] ?? (a.workflowStage as string);
    await prisma.appointment.create({ data: { id: a.id, appointmentCode: a.appointmentCode, patientId: a.patientId, doctorId: a.doctorId, branchId: a.branchId, roomId: a.roomId, date: new Date(a.date), startTime: a.startTime, endTime: a.endTime, type: a.type as string, status: a.status as any, notes: a.notes, priority: a.priority as string, waitlistPosition: a.waitlistPosition, checkinTime: toDate(a.checkinTime), checkoutTime: toDate(a.checkoutTime), workflowStage: workflowStage as any, createdById: a.createdBy } });
  }
  console.log(`  Appointments: ${mockAppointments.length}`);

  for (const pkg of mockPackages) {
    await prisma.package.create({ data: { id: pkg.id, name: pkg.name, description: pkg.description, price: pkg.price, validityDays: pkg.validityDays, isActive: pkg.isActive, subscriberCount: pkg.subscriberCount || 0, treatments: { create: (pkg.treatments || []).map((pt) => ({ treatmentId: pt.treatmentId, treatmentName: pt.treatmentName, sessions: pt.sessions })) } } });
  }
  console.log(`  Packages: ${mockPackages.length}`);

  for (const inv of mockInvoices) {
    await prisma.invoice.create({ data: { id: inv.id, invoiceNumber: inv.invoiceNumber, patientId: inv.patientId, appointmentId: inv.appointmentId, branchId: inv.branchId, subtotal: inv.subtotal, discount: inv.discount, discountType: inv.discountType, tax: inv.tax, total: inv.total, status: inv.status as any, dueDate: toDate(inv.dueDate), notes: inv.notes, createdById: inv.createdById, items: { create: (inv.items || []).map((it) => ({ description: it.description, type: it.type, quantity: it.quantity, unitPrice: it.unitPrice, total: it.total })) } } });
  }
  console.log(`  Invoices: ${mockInvoices.length}`);

  for (const f of mockFollowUps) {
    await prisma.followUp.create({ data: { id: f.id, patientId: f.patientId, doctorId: f.doctorId, dueDate: new Date(f.dueDate), reason: f.reason, status: f.status as string, completedAt: toDate(f.completedAt) } });
  }
  console.log(`  Follow-ups: ${mockFollowUps.length}`);

  for (const n of mockNotifications) {
    await prisma.notification.create({ data: { id: n.id, userId: n.userId, title: n.title, message: n.message, type: n.type as string, isRead: n.isRead, link: n.link } });
  }
  console.log(`  Notifications: ${mockNotifications.length}`);

  for (const c of mockCallLogs) {
    await prisma.callLog.create({ data: { id: c.id, leadId: c.leadId, patientId: c.patientId, callerName: c.callerName, userId: c.userId, agentName: c.agentName, type: c.type as string, duration: c.duration, notes: c.notes, outcome: c.outcome as string } });
  }
  console.log(`  Call logs: ${mockCallLogs.length}`);

  for (const cn of mockConsultationNotes) {
    await prisma.consultationNote.create({ data: { id: cn.id, appointmentId: cn.appointmentId, patientId: cn.patientId, doctorId: cn.doctorId, chiefComplaint: cn.chiefComplaint, symptoms: cn.symptoms, examination: cn.examination, diagnosis: cn.diagnosis, treatmentPlan: cn.treatmentPlan, advice: cn.advice, followUpDate: toDate(cn.followUpDate), followUpNotes: cn.followUpNotes, isSigned: cn.isSigned || false, signedAt: toDate(cn.signedAt) } });
  }
  console.log(`  Consultation notes: ${mockConsultationNotes.length}`);

  for (const lt of mockLabTests) {
    await prisma.labTest.create({ data: { id: lt.id, patientId: lt.patientId, doctorId: lt.doctorId, appointmentId: lt.appointmentId, testName: lt.testName, status: lt.status as string, results: lt.results ? JSON.stringify(lt.results) : null, technician: lt.technician, collectedAt: toDate(lt.collectedAt), completedAt: toDate(lt.completedAt), notes: lt.notes } });
  }
  console.log(`  Lab tests: ${mockLabTests.length}`);

  for (const t of mockTriageRecords) {
    await prisma.triage.create({ data: { id: t.id, patientId: t.patientId, appointmentId: t.appointmentId, temperature: t.temperature, systolicBP: t.systolicBP, diastolicBP: t.diastolicBP, heartRate: t.heartRate, respiratoryRate: t.respiratoryRate, weight: t.weight, height: t.height, oxygenSaturation: t.oxygenSaturation, bmi: t.bmi, notes: t.notes, skinObservations: t.skinObservations, urgencyLevel: t.urgencyLevel as string, recordedById: t.recordedById } });
  }
  console.log(`  Triage: ${mockTriageRecords.length}`);

  for (const ai of mockAITranscriptions) {
    await prisma.aITranscription.create({ data: { id: ai.id, appointmentId: ai.appointmentId, patientId: ai.patientId, doctorId: ai.doctorId, rawTranscript: ai.rawTranscript, structuredNote: ai.structuredNote ? JSON.stringify(ai.structuredNote) : null, summary: ai.summary, status: ai.status as any, duration: ai.duration } });
  }
  console.log(`  AI transcripts: ${mockAITranscriptions.length}`);

  for (const al of mockAuditLogs) {
    await prisma.auditLog.create({ data: { id: al.id, userId: al.userId, userName: al.userName, action: al.action, module: al.module, entityType: al.entityType, entityId: al.entityId, details: al.details, ipAddress: al.ipAddress } });
  }
  console.log(`  Audit logs: ${mockAuditLogs.length}`);

  for (const d of mockDocuments) {
    await prisma.patientDocument.create({ data: { id: d.id, patientId: d.patientId, name: d.name, type: d.type as any, fileUrl: d.fileUrl, fileSize: d.fileSize, uploadedById: d.uploadedById, uploadedByName: d.uploadedByName, notes: d.notes } });
  }
  console.log(`  Documents: ${mockDocuments.length}`);

  for (const c of mockCommunicationLogs) {
    await prisma.communicationLog.create({ data: { id: c.id, patientId: c.patientId, type: c.type, direction: c.direction, subject: c.subject, content: c.content, sentById: c.sentById, sentByName: c.sentByName } });
  }
  console.log(`  Communications: ${mockCommunicationLogs.length}`);

  for (const s of mockSkinHistory) {
    await prisma.skinHistory.create({ data: { id: s.id, patientId: s.patientId, condition: s.condition, affectedArea: s.affectedArea, severity: s.severity as string, onsetDate: toDate(s.onsetDate), treatmentHistory: s.treatmentHistory, notes: s.notes, images: s.images?.join(",") || null } });
  }
  console.log(`  Oral health: ${mockSkinHistory.length}`);

  for (const m of mockMedicalHistory) {
    await prisma.medicalHistory.create({ data: { id: m.id, patientId: m.patientId, condition: m.condition, diagnosedDate: toDate(m.diagnosedDate), status: m.status as string, notes: m.notes } });
  }
  console.log(`  Medical history: ${mockMedicalHistory.length}`);

  for (const rx of mockPrescriptions) {
    await prisma.prescription.create({ data: { id: rx.id, patientId: rx.patientId, doctorId: rx.doctorId, appointmentId: rx.appointmentId, notes: rx.notes, items: { create: (rx.items || []).map((it) => ({ medicineName: it.medicineName, dosage: it.dosage, frequency: it.frequency, duration: it.duration, instructions: it.instructions })) } } });
  }
  console.log(`  Prescriptions: ${mockPrescriptions.length}`);

  for (const pp of mockPatientPackages) {
    await prisma.patientPackage.create({ data: { id: pp.id, patientId: pp.patientId, packageId: pp.packageId, packageName: pp.packageName, purchaseDate: new Date(pp.purchaseDate), expiryDate: toDate(pp.expiryDate), remainingSessions: pp.remainingSessions ?? undefined, status: pp.status as string, invoiceId: pp.invoiceId } });
  }
  console.log(`  Patient packages: ${mockPatientPackages.length}`);

  // ───── Default procedure templates (idempotent via @unique code) ─────
  const defaultTemplates: Array<Parameters<typeof prisma.treatmentTemplate.upsert>[0]["create"]> = [
    {
      code: "COMPOSITE_FILLING", name: "Composite Filling", category: "Restorative", cdtCode: "D2330",
      defaultDiagnosis: "Dental caries",
      defaultClinicalFindings: "Cavitated lesion on occlusal/proximal surface; positive cold response.",
      defaultProcedureNotes: "Local anesthesia administered. Caries excavated. Rubber dam isolation. Composite resin placed in increments and light-cured. Occlusion checked and adjusted.",
      defaultMaterialsUsed: "Composite resin (A2), bonding agent, etchant 37%, rubber dam.",
      defaultPostOpInstructions: "Avoid hot/cold liquids for 24 hrs. Mild sensitivity is normal for a few days. Return if persistent pain.",
      defaultFollowUpDays: 14, defaultPrice: 200, defaultDuration: 45,
    },
    {
      code: "RCT_ANTERIOR", name: "Root Canal — Anterior", category: "Endodontic", cdtCode: "D3310",
      defaultDiagnosis: "Irreversible pulpitis (anterior)",
      defaultClinicalFindings: "Spontaneous pain, lingering response to cold, percussion-positive anterior tooth.",
      defaultProcedureNotes: "Local anesthesia. Rubber dam. Access cavity prepared. Working length confirmed by apex locator and X-ray. Canal cleaned and shaped to size 35/.04. Irrigated with NaOCl + EDTA. Obturated with gutta-percha and AH Plus sealer (single cone).",
      defaultMaterialsUsed: "Gutta-percha, AH Plus sealer, NaOCl 3%, EDTA 17%, rubber dam.",
      defaultPostOpInstructions: "Avoid biting on treated tooth until permanent restoration. Mild tenderness is normal for 2-3 days.",
      defaultRxItems: [
        { medicineName: "Ibuprofen 400 mg", dosage: "1 tab", frequency: "TDS PRN", duration: "3 days" },
      ],
      defaultFollowUpDays: 7, defaultPrice: 700, defaultDuration: 60,
    },
    {
      code: "RCT_PREMOLAR", name: "Root Canal — Premolar", category: "Endodontic", cdtCode: "D3320",
      defaultDiagnosis: "Irreversible pulpitis (premolar)",
      defaultClinicalFindings: "Severe pain on cold, lingering, percussion-tender.",
      defaultProcedureNotes: "Local anesthesia. Rubber dam. Two canals located, shaped to 35/.06, obturated with gutta-percha single-cone.",
      defaultPostOpInstructions: "Soft diet 24 hrs. Tenderness expected. Schedule crown prep at follow-up.",
      defaultRxItems: [
        { medicineName: "Ibuprofen 400 mg", dosage: "1 tab", frequency: "QDS PRN", duration: "3 days" },
      ],
      defaultFollowUpDays: 10, defaultPrice: 850, defaultDuration: 75,
    },
    {
      code: "RCT_MOLAR", name: "Root Canal — Molar", category: "Endodontic", cdtCode: "D3330",
      defaultDiagnosis: "Irreversible pulpitis / apical periodontitis (molar)",
      defaultClinicalFindings: "Throbbing pain, percussion-positive, possible periapical lesion on X-ray.",
      defaultProcedureNotes: "Local anesthesia. Rubber dam. 3-4 canals located and shaped. Obturated with gutta-percha. Build-up placed.",
      defaultPostOpInstructions: "Avoid biting on tooth. Crown prep in 2 weeks. Antibiotic only if swelling.",
      defaultRxItems: [
        { medicineName: "Amoxicillin 500 mg", dosage: "1 cap", frequency: "TDS", duration: "5 days", instructions: "Only if swelling present" },
        { medicineName: "Ibuprofen 400 mg", dosage: "1 tab", frequency: "QDS PRN", duration: "5 days" },
      ],
      defaultFollowUpDays: 14, defaultPrice: 1000, defaultDuration: 90,
    },
    {
      code: "CROWN_PFM", name: "Crown (PFM)", category: "Prosthodontic", cdtCode: "D2750",
      defaultDiagnosis: "Heavily restored / root-treated tooth",
      defaultProcedureNotes: "Tooth prepared for full-coverage crown. Impressions taken (digital/PVS). Temporary crown placed. Final crown cementation at next visit.",
      defaultMaterialsUsed: "Provisional crown, PVS impression material, temporary cement.",
      defaultPostOpInstructions: "Avoid sticky foods until permanent crown. Mild gum tenderness normal.",
      defaultFollowUpDays: 14, defaultPrice: 1100, defaultDuration: 90,
    },
    {
      code: "CROWN_ZIRCONIA", name: "Crown (Zirconia)", category: "Prosthodontic", cdtCode: "D2740",
      defaultDiagnosis: "Heavily restored / root-treated tooth — aesthetic zone",
      defaultProcedureNotes: "Tooth prepared. Digital scan. Temporary crown placed. Zirconia crown delivered and cemented at next visit.",
      defaultFollowUpDays: 14, defaultPrice: 1350, defaultDuration: 90,
    },
    {
      code: "BRIDGE_3UNIT", name: "Bridge (3-unit)", category: "Prosthodontic", cdtCode: "D6240",
      defaultDiagnosis: "Missing tooth requiring fixed prosthesis",
      defaultProcedureNotes: "Abutment teeth prepared, impressions taken, provisional bridge placed. Final cementation at next visit.",
      defaultFollowUpDays: 21, defaultPrice: 3000, defaultDuration: 120,
    },
    {
      code: "EXTRACTION_SIMPLE", name: "Extraction (Simple)", category: "Surgery", cdtCode: "D7140",
      defaultDiagnosis: "Non-restorable tooth",
      defaultProcedureNotes: "Local anesthesia. Tooth luxated and delivered atraumatically. Socket inspected and irrigated. Hemostasis achieved.",
      defaultPostOpInstructions: "Bite firmly on gauze for 30 min. No spitting/rinsing for 24 hrs. Soft diet. No smoking 48 hrs. Mild swelling expected.",
      defaultRxItems: [
        { medicineName: "Ibuprofen 400 mg", dosage: "1 tab", frequency: "QDS PRN", duration: "3 days" },
      ],
      defaultFollowUpDays: 7, defaultPrice: 200, defaultDuration: 30,
    },
    {
      code: "EXTRACTION_SURGICAL", name: "Extraction (Surgical)", category: "Surgery", cdtCode: "D7210",
      defaultDiagnosis: "Impacted or surgically removed tooth",
      defaultProcedureNotes: "Local anesthesia. Flap raised, bone removal as needed, tooth sectioned and removed. Socket irrigated. Sutures placed.",
      defaultPostOpInstructions: "Ice pack 20 min on / 20 min off for first 6 hrs. Soft diet 3-4 days. No smoking. Suture removal in 7 days.",
      defaultRxItems: [
        { medicineName: "Amoxicillin 500 mg", dosage: "1 cap", frequency: "TDS", duration: "5 days" },
        { medicineName: "Ibuprofen 400 mg", dosage: "1 tab", frequency: "QDS PRN", duration: "5 days" },
        { medicineName: "Chlorhexidine Mouthwash 0.2%", dosage: "10 ml rinse", frequency: "BD", duration: "1 week" },
      ],
      defaultFollowUpDays: 7, defaultPrice: 450, defaultDuration: 60,
    },
    {
      code: "IMPLANT_SINGLE", name: "Implant (Single)", category: "Surgery", cdtCode: "D6010",
      defaultDiagnosis: "Missing tooth — implant restoration",
      defaultProcedureNotes: "Local anesthesia. Surgical guide placed. Implant osteotomy prepared. Implant placed. Healing abutment or cover screw. Sutures.",
      defaultPostOpInstructions: "Strictly no biting on surgical site for 4 weeks. Saltwater rinses after 24 hrs. Soft diet 2 weeks. Avoid pressure on area.",
      defaultRxItems: [
        { medicineName: "Amoxicillin 500 mg", dosage: "1 cap", frequency: "TDS", duration: "5 days" },
        { medicineName: "Ibuprofen 400 mg", dosage: "1 tab", frequency: "QDS PRN", duration: "5 days" },
      ],
      defaultFollowUpDays: 14, defaultPrice: 2400, defaultDuration: 90,
    },
    {
      code: "VENEER_PORCELAIN", name: "Veneer (Porcelain)", category: "Cosmetic", cdtCode: "D2962",
      defaultDiagnosis: "Aesthetic concern / discoloration / chip",
      defaultProcedureNotes: "Minimal facial preparation, impressions, temporary veneer. Final veneer bonded at next visit.",
      defaultFollowUpDays: 14, defaultPrice: 1300, defaultDuration: 75,
    },
    {
      code: "SCALING_POLISHING", name: "Scaling & Polishing", category: "Preventive", cdtCode: "D1110",
      defaultDiagnosis: "Routine recall / gingivitis",
      defaultProcedureNotes: "Ultrasonic scaling, hand scaling as needed, polishing with prophylaxis paste. OHI provided.",
      defaultPostOpInstructions: "Mild gum tenderness for 24 hrs. Brush 2x daily, floss daily. Recall in 6 months.",
      defaultFollowUpDays: 180, defaultPrice: 150, defaultDuration: 30,
    },
    {
      code: "WHITENING_INOFFICE", name: "Whitening (In-office)", category: "Cosmetic", cdtCode: "D9972",
      defaultDiagnosis: "Tooth discoloration — patient request",
      defaultProcedureNotes: "Gingival barrier placed. Hydrogen peroxide gel applied in 3 cycles of 15 min. Shade re-evaluated.",
      defaultPostOpInstructions: "Avoid staining foods/drinks (coffee, tea, red wine, curry) for 48 hrs. Sensitivity is normal for 24-48 hrs.",
      defaultFollowUpDays: 30, defaultPrice: 350, defaultDuration: 60,
    },
    {
      code: "BONDING", name: "Bonding", category: "Restorative", cdtCode: "D2391",
      defaultDiagnosis: "Small chip, gap, or discoloration",
      defaultProcedureNotes: "Tooth surface etched. Bonding agent applied. Composite shaped and light-cured. Polished.",
      defaultPostOpInstructions: "Avoid biting hard objects directly with bonded area. Mild sensitivity normal.",
      defaultFollowUpDays: 30, defaultPrice: 250, defaultDuration: 30,
    },
  ];

  for (const tpl of defaultTemplates) {
    await prisma.treatmentTemplate.upsert({
      where: { code: tpl.code },
      create: tpl,
      update: {}, // don't overwrite admin edits on subsequent seeds
    });
  }
  console.log(`  Treatment templates: ${defaultTemplates.length}`);

  console.log("\nSeed complete.");
  console.log("\nLogin with:");
  console.log("  admin@dentacore.com / password  (Admin)");
  console.log("  dr.chen@dentacore.com / password  (Dentist)");
  console.log("  reception@dentacore.com / password  (Receptionist)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });

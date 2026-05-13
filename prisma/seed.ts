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

  for (const l of mockLeads) {
    await prisma.lead.create({ data: { id: l.id, name: l.name, phone: l.phone, email: l.email, source: l.source as string, status: l.status as any, interest: l.interest, assignedToId: l.assignedToId, branchId: l.branchId, notes: l.notes, convertedPatientId: l.convertedPatientId, callbackDate: toDate(l.callbackDate) } });
  }
  console.log(`  Leads: ${mockLeads.length}`);

  for (const a of mockAppointments) {
    await prisma.appointment.create({ data: { id: a.id, appointmentCode: a.appointmentCode, patientId: a.patientId, doctorId: a.doctorId, branchId: a.branchId, roomId: a.roomId, date: new Date(a.date), startTime: a.startTime, endTime: a.endTime, type: a.type as string, status: a.status as any, notes: a.notes, priority: a.priority as string, waitlistPosition: a.waitlistPosition, checkinTime: toDate(a.checkinTime), checkoutTime: toDate(a.checkoutTime), workflowStage: a.workflowStage as any, createdById: a.createdBy } });
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

  console.log("\nSeed complete.");
  console.log("\nLogin with:");
  console.log("  admin@dentacore.com / password  (Admin)");
  console.log("  dr.chen@dentacore.com / password  (Dentist)");
  console.log("  reception@dentacore.com / password  (Receptionist)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });

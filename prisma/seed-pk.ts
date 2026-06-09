/**
 * Pakistani localized demo seed for DentaCore.
 *
 *   set -a; . ./.env; set +a; npx tsx prisma/seed-pk.ts
 *
 * Full re-seed: clears all data tables, then loads Pakistani branches,
 * staff, treatments (PKR), ~60 patients and their appointments, invoices,
 * leads, consultation notes and follow-ups. Demo login password is printed
 * at the end. Config (Tenant/Setting) and schema are left intact.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "demo@2026";

// ---- deterministic-ish helpers ----
const pick = <T>(a: T[], i: number) => a[i % a.length];
const rand = (n: number) => Math.floor(Math.random() * n);
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const daysFromNow = (d: number) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(0, 0, 0, 0); return t; };
const phone = () => `+92 3${rand(5)}${rand(10)} ${pad(1000000 + rand(8999999), 7)}`;
const cnic = () => `${35000 + rand(5000)}-${pad(1000000 + rand(8999999), 7)}-${rand(10)}`;

const maleFirst = ["Muhammad", "Ahmed", "Ali", "Bilal", "Hamza", "Usman", "Hassan", "Faisal", "Imran", "Zain", "Saad", "Asad", "Tariq", "Kashif", "Junaid", "Adnan", "Waqar", "Noman", "Shahzad", "Rizwan"];
const femaleFirst = ["Ayesha", "Fatima", "Hira", "Sana", "Maryam", "Zara", "Hina", "Nida", "Amna", "Mahnoor", "Areeba", "Komal", "Iqra", "Rabia", "Sadia", "Mehwish", "Bushra", "Anosha", "Laiba", "Sundas"];
const lastNames = ["Khan", "Ahmed", "Malik", "Hussain", "Raza", "Iqbal", "Sheikh", "Butt", "Chaudhry", "Qureshi", "Siddiqui", "Aslam", "Javed", "Farooq", "Nawaz", "Bhatti", "Mughal", "Awan", "Gondal", "Dar"];
const cities = [
  { city: "Lahore", areas: ["Gulberg", "DHA Phase 5", "Model Town", "Johar Town", "Bahria Town"] },
  { city: "Karachi", areas: ["Clifton", "DHA Phase 6", "Gulshan-e-Iqbal", "PECHS", "North Nazimabad"] },
  { city: "Islamabad", areas: ["F-8", "F-10", "E-11", "G-9", "Bahria Town"] },
];
const bloodTypes = ["A+", "B+", "O+", "AB+", "A-", "O-"];
const allergyPool = ["Penicillin", "Latex", "Local anaesthetic", "Aspirin", "None"];

async function clearAll() {
  // Truncate every app data table (config + clinical) — leaves migrations intact.
  const tables = [
    "AISuggestionFeedback","AISuggestionLog","AITranscription","Allergy","Appointment","AuditLog","BeforeAfterImage",
    "Branch","BlockedSlot","BookingRequest","CallLog","CommunicationLog","Consent","ConsultationNote","DentalChart","DoctorLeave",
    "FollowUp","Invoice","InvoiceItem","LabTest","Lead","MedicalHistory","Notification","OrthoCase","OrthoVisit",
    "Package","PackageTreatment","Patient","PatientDocument","PatientPackage","PatientPortalToken","PatientTag",
    "Payment","PaymentSession","Prescription","PrescriptionItem","Procedure","Product","Refund","Room","Schedule",
    "SkinHistory","ToothEvent","ToothRecord","Treatment","TreatmentPlan","TreatmentPlanItem","TreatmentPlanPhase",
    "TreatmentTemplate","Triage","UnmatchedInboundMessage","User","VoiceNote",
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(",")} CASCADE;`);
}

async function main() {
  console.log("Seeding Pakistani demo data…");
  await clearAll();

  // ---- Branches ----
  const branches = [
    { id: "br-lhr", name: "DentaCore Gulberg", city: "Lahore", address: "12-C Main Boulevard, Gulberg III, Lahore", phone: "+92 42 3577 1234", email: "gulberg@dentacore.pk" },
    { id: "br-khi", name: "DentaCore Clifton", city: "Karachi", address: "Block 5, Clifton, Karachi", phone: "+92 21 3530 5678", email: "clifton@dentacore.pk" },
    { id: "br-isb", name: "DentaCore F-8", city: "Islamabad", address: "F-8 Markaz, Islamabad", phone: "+92 51 2287 9012", email: "f8@dentacore.pk" },
  ];
  for (const b of branches) await prisma.branch.create({ data: { id: b.id, name: b.name, address: b.address, phone: b.phone, email: b.email, isActive: true } });

  // ---- Staff ----
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const staff = [
    { id: "u-admin", email: "admin@dentacore.pk", name: "Dr. Saad Mahmood", role: "ADMIN", branchId: "br-lhr", speciality: "Clinic Director" },
    { id: "u-doc1", email: "ayesha.khan@dentacore.pk", name: "Dr. Ayesha Khan", role: "DOCTOR", branchId: "br-lhr", speciality: "Endodontist" },
    { id: "u-doc2", email: "bilal.ahmed@dentacore.pk", name: "Dr. Bilal Ahmed", role: "DOCTOR", branchId: "br-lhr", speciality: "Oral Surgeon" },
    { id: "u-doc3", email: "hina.raza@dentacore.pk", name: "Dr. Hina Raza", role: "DOCTOR", branchId: "br-khi", speciality: "Orthodontist" },
    { id: "u-doc4", email: "usman.tariq@dentacore.pk", name: "Dr. Usman Tariq", role: "DOCTOR", branchId: "br-isb", speciality: "Prosthodontist" },
    { id: "u-recep1", email: "sana.iqbal@dentacore.pk", name: "Sana Iqbal", role: "RECEPTIONIST", branchId: "br-lhr" },
    { id: "u-recep2", email: "faisal.sheikh@dentacore.pk", name: "Faisal Sheikh", role: "RECEPTIONIST", branchId: "br-khi" },
    { id: "u-asst", email: "zara.malik@dentacore.pk", name: "Zara Malik", role: "ASSISTANT", branchId: "br-lhr" },
    { id: "u-bill", email: "imran.qureshi@dentacore.pk", name: "Imran Qureshi", role: "BILLING", branchId: "br-lhr" },
    { id: "u-call", email: "nida.aslam@dentacore.pk", name: "Nida Aslam", role: "CALL_CENTER", branchId: "br-khi" },
  ];
  for (const u of staff) await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name, phone: phone(), role: u.role, passwordHash: hash, isActive: true, branchId: u.branchId, speciality: u.speciality } });
  const doctors = staff.filter((s) => s.role === "DOCTOR");

  // ---- Treatments (PKR) ----
  const treatments = [
    { id: "t-exam", name: "Consultation & Oral Exam", category: "CONSULTATION", duration: 20, basePrice: 1500 },
    { id: "t-scale", name: "Scaling & Polishing", category: "PREVENTIVE", duration: 40, basePrice: 5000 },
    { id: "t-fill", name: "Composite Filling", category: "RESTORATIVE", duration: 45, basePrice: 4000 },
    { id: "t-rct-ant", name: "Root Canal — Anterior", category: "ENDODONTIC", duration: 60, basePrice: 15000 },
    { id: "t-rct-mol", name: "Root Canal — Molar", category: "ENDODONTIC", duration: 90, basePrice: 25000 },
    { id: "t-ext", name: "Tooth Extraction", category: "SURGICAL", duration: 30, basePrice: 3000 },
    { id: "t-ext-wis", name: "Surgical Extraction — Wisdom Tooth", category: "SURGICAL", duration: 60, basePrice: 12000 },
    { id: "t-crown-pfm", name: "Porcelain Crown (PFM)", category: "PROSTHODONTIC", duration: 60, basePrice: 18000 },
    { id: "t-crown-zir", name: "Zirconia Crown", category: "PROSTHODONTIC", duration: 60, basePrice: 35000 },
    { id: "t-implant", name: "Dental Implant", category: "SURGICAL", duration: 120, basePrice: 120000 },
    { id: "t-whiten", name: "Teeth Whitening", category: "COSMETIC", duration: 60, basePrice: 20000 },
    { id: "t-braces", name: "Braces — Full Orthodontic", category: "ORTHODONTIC", duration: 60, basePrice: 150000 },
    { id: "t-denture", name: "Complete Dentures", category: "PROSTHODONTIC", duration: 60, basePrice: 45000 },
  ];
  for (const t of treatments) await prisma.treatment.create({ data: { id: t.id, name: t.name, category: t.category, duration: t.duration, basePrice: t.basePrice, isActive: true, description: `${t.name} — Rs ${t.basePrice.toLocaleString()}` } });

  // ---- Rooms (per branch) ----
  let roomN = 0;
  const rooms: { id: string; branchId: string }[] = [];
  for (const b of branches) {
    for (let i = 1; i <= 3; i++) {
      const id = `rm-${++roomN}`;
      rooms.push({ id, branchId: b.id });
      await prisma.room.create({ data: { id, branchId: b.id, name: `Operatory ${i}`, type: i === 3 ? "PROCEDURE" : "CONSULTATION", status: "AVAILABLE", isAvailable: true, capacity: 2 } });
    }
  }

  // ---- Patients (~60) ----
  const N = 60;
  const patientIds: { id: string; branchId: string }[] = [];
  for (let i = 1; i <= N; i++) {
    const isMale = i % 2 === 0;
    const first = isMale ? pick(maleFirst, i + rand(7)) : pick(femaleFirst, i + rand(7));
    const last = pick(lastNames, i + rand(5));
    const loc = pick(cities, i);
    const branch = pick(branches, i);
    const doc = doctors.filter((d) => d.branchId === branch.id)[0] ?? pick(doctors, i);
    const id = `pt-${pad(i)}`;
    const age = 8 + rand(62);
    const dob = new Date(); dob.setFullYear(dob.getFullYear() - age); dob.setMonth(rand(12), 1 + rand(27));
    const allergens = rand(3) === 0 ? [pick(allergyPool, i)].filter((a) => a !== "None") : [];
    patientIds.push({ id, branchId: branch.id });
    await prisma.patient.create({ data: {
      id, patientCode: `PT-${pad(i)}`, firstName: first, lastName: last,
      email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "") + `${i}@gmail.com`,
      phone: phone(), dateOfBirth: dob, gender: (isMale ? "MALE" : "FEMALE") as any,
      address: `House ${rand(900) + 1}, ${pick(loc.areas, i)}`, city: loc.city,
      emergencyContact: pick(lastNames, i + 3) + " (family)", emergencyPhone: phone(),
      bloodType: pick(bloodTypes, i), branchId: branch.id, assignedDoctorId: doc.id, isActive: true,
      outstandingBalance: rand(4) === 0 ? (rand(20) + 1) * 1000 : 0,
      allergies: { create: allergens.map((a) => ({ allergen: a })) },
    } });
  }

  // ---- Appointments (~1.5 per patient: some past/completed, some upcoming) ----
  const apptStatuses = ["COMPLETED", "COMPLETED", "COMPLETED", "SCHEDULED", "CONFIRMED", "CHECKED_IN", "CANCELLED", "NO_SHOW"];
  const apptTypes = ["CONSULTATION", "FOLLOW_UP", "PROCEDURE", "CHECKUP", "EMERGENCY"];
  const times = ["09:00", "09:30", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];
  let apptN = 0; const completed: { id: string; patientId: string; branchId: string; doctorId: string; trt: typeof treatments[number] }[] = [];
  for (const p of patientIds) {
    const visits = 1 + rand(3);
    for (let v = 0; v < visits; v++) {
      apptN++;
      const status = pick(apptStatuses, apptN + v);
      const isPast = ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(status);
      const offset = isPast ? -(rand(120) + 1) : rand(30) + 1;
      const branch = branches.find((b) => b.id === p.branchId)!;
      const doc = doctors.filter((d) => d.branchId === branch.id)[0] ?? pick(doctors, apptN);
      const room = rooms.filter((r) => r.branchId === branch.id)[rand(3)];
      const trt = pick(treatments, apptN + v);
      const t = pick(times, apptN + v);
      const id = `apt-${pad(apptN)}`;
      const wf = status === "COMPLETED" ? "COMPLETED" : status === "CHECKED_IN" ? "CHECKIN" : "BOOKED";
      await prisma.appointment.create({ data: {
        id, appointmentCode: `APT-${pad(apptN)}`, patientId: p.id, doctorId: doc.id, branchId: branch.id, roomId: room?.id ?? null,
        date: daysFromNow(offset), startTime: t, endTime: t.replace(/:00$/, ":30"), type: pick(apptTypes, apptN), status: status as any,
        notes: `${trt.name} — ${branch.city}`, priority: rand(6) === 0 ? "HIGH" : "NORMAL", workflowStage: wf as any, createdById: "u-recep1",
      } });
      if (status === "COMPLETED") completed.push({ id, patientId: p.id, branchId: branch.id, doctorId: doc.id, trt });
    }
  }

  // ---- Invoices for completed appointments ----
  const invStatuses = ["PAID", "PAID", "PAID", "PENDING", "PARTIAL", "OVERDUE"];
  let invN = 0;
  for (const c of completed) {
    invN++;
    const subtotal = c.trt.basePrice;
    const discount = rand(5) === 0 ? Math.round(subtotal * 0.1) : 0;
    const total = subtotal - discount;
    const status = pick(invStatuses, invN);
    await prisma.invoice.create({ data: {
      id: `inv-${pad(invN)}`, invoiceNumber: `INV-${pad(invN)}`, patientId: c.patientId, appointmentId: c.id, branchId: c.branchId,
      subtotal, discount, discountType: "FIXED", tax: 0, total, status: status as any,
      dueDate: daysFromNow(rand(20) - 10), notes: `${c.trt.name}`, createdById: "u-bill",
      items: { create: [{ description: c.trt.name, type: "TREATMENT", quantity: 1, unitPrice: subtotal, total: subtotal }] },
    } });
  }

  // ---- Leads (call-center) ----
  const sources = ["CALL", "WEBSITE", "SOCIAL_MEDIA", "REFERRAL", "WALK_IN"];
  const leadStatuses = ["NEW", "CONTACTED", "QUALIFIED", "FOLLOW_UP", "BOOKED", "CONVERTED", "LOST"];
  const interests = ["Teeth Whitening", "Braces", "Dental Implant", "Root Canal", "Scaling & Polishing", "Crown / Bridge", "Routine Checkup"];
  for (let i = 1; i <= 18; i++) {
    const isMale = i % 2 === 0;
    const name = `${isMale ? pick(maleFirst, i) : pick(femaleFirst, i)} ${pick(lastNames, i + 2)}`;
    await prisma.lead.create({ data: {
      id: `ld-${pad(i)}`, name, phone: phone(), email: rand(2) ? `${name.split(" ")[0].toLowerCase()}${i}@gmail.com` : null,
      source: pick(sources, i) as any, status: pick(leadStatuses, i) as any, interest: pick(interests, i),
      assignedToId: "u-call", branchId: pick(branches, i).id, notes: `Enquiry about ${pick(interests, i)}`,
      callbackDate: rand(2) ? daysFromNow(rand(10) + 1) : null,
    } });
  }

  // ---- A few consultation notes + follow-ups on completed visits ----
  for (let i = 0; i < Math.min(12, completed.length); i++) {
    const c = completed[i];
    await prisma.consultationNote.create({ data: {
      patientId: c.patientId, appointmentId: c.id, doctorId: c.doctorId,
      chiefComplaint: `${c.trt.name} review`, examination: "Intra-oral exam unremarkable; treated tooth stable.",
      diagnosis: c.trt.name, treatmentPlan: `Completed ${c.trt.name}. Maintain oral hygiene.`,
      advice: "Avoid hard foods for 24h; warm saline rinses.",
      followUpDate: rand(2) ? daysFromNow(rand(20) + 7) : null,
    } });
  }
  for (let i = 0; i < 10; i++) {
    const c = pick(completed, i * 3);
    if (!c) continue;
    await prisma.followUp.create({ data: { patientId: c.patientId, doctorId: c.doctorId, dueDate: daysFromNow(rand(20) + 1), reason: `Review after ${c.trt.name}`, status: "PENDING" } });
  }

  // ============ Extended demo data (every feature) ============
  const docFor = (branchId: string) => doctors.filter((d) => d.branchId === branchId)[0] ?? pick(doctors, rand(doctors.length));
  const meds = [
    { medicineName: "Amoxicillin 500mg", dosage: "1 cap", frequency: "TDS", duration: "5 days" },
    { medicineName: "Ibuprofen 400mg", dosage: "1 tab", frequency: "QDS PRN", duration: "3 days" },
    { medicineName: "Metronidazole 400mg", dosage: "1 tab", frequency: "TDS", duration: "5 days" },
    { medicineName: "Chlorhexidine mouthwash", dosage: "10ml", frequency: "BD rinse", duration: "7 days" },
    { medicineName: "Paracetamol 500mg", dosage: "2 tab", frequency: "QDS PRN", duration: "3 days" },
  ];
  const conditions = ["Diabetes Mellitus Type 2", "Hypertension", "Asthma", "Hepatitis B", "Thyroid disorder", "Heart disease"];
  const oralConds = ["Chronic Gingivitis", "Moderate Periodontitis", "Bruxism", "Dental fluorosis", "Recurrent aphthous ulcers"];
  const tagPool = ["VIP", "Diabetic", "New Patient", "Insurance", "Cash", "High Risk", "Ortho", "Recall Due"];
  const docTypes = ["XRAY", "LAB_RESULT", "CONSENT", "REPORT", "PRESCRIPTION"];

  // Medical history (~45%), oral health (~30%), tags (~55%)
  for (let i = 0; i < patientIds.length; i++) {
    const p = patientIds[i];
    if (i % 9 < 4) await prisma.medicalHistory.create({ data: { patientId: p.id, condition: pick(conditions, i), diagnosedDate: daysFromNow(-(rand(1500) + 100)), status: pick(["ACTIVE", "CONTROLLED", "CHRONIC"], i), notes: "Disclosed at registration; relevant for treatment planning." } });
    if (i % 10 < 3) await prisma.skinHistory.create({ data: { patientId: p.id, condition: pick(oralConds, i), affectedArea: pick(["Upper anterior", "Lower posterior", "Generalised", "Full mouth"], i), severity: pick(["MILD", "MODERATE", "SEVERE"], i), onsetDate: daysFromNow(-(rand(800) + 30)), treatmentHistory: "Oral hygiene instructions given; scaling advised.", notes: "Monitor at recall." } });
    const tagN = i % 11 < 6 ? 1 + (i % 2) : 0;
    for (let t = 0; t < tagN; t++) await prisma.patientTag.create({ data: { patientId: p.id, tag: pick(tagPool, i + t) } });
  }

  // Procedures + prescriptions + triage + AI transcripts on completed visits
  let aiN = 0;
  for (let i = 0; i < completed.length; i++) {
    const c = completed[i];
    await prisma.procedure.create({ data: { patientId: c.patientId, doctorId: c.doctorId, treatmentId: c.trt.id, appointmentId: c.id, notes: `${c.trt.name} performed under LA.`, outcome: "Successful, no complications", performedAt: daysFromNow(-(rand(90) + 1)) } });
    if (i % 2 === 0) {
      const items = [pick(meds, i), pick(meds, i + 2)];
      await prisma.prescription.create({ data: { patientId: c.patientId, doctorId: c.doctorId, appointmentId: c.id, notes: `Post-${c.trt.name} medication`, items: { create: items.map((m) => ({ medicineName: m.medicineName, dosage: m.dosage, frequency: m.frequency, duration: m.duration, instructions: "After meals" })) } } });
    }
    if (i % 4 === 0) await prisma.triage.create({ data: { patientId: c.patientId, appointmentId: c.id, temperature: 36.5 + rand(15) / 10, systolicBP: 110 + rand(40), diastolicBP: 70 + rand(20), heartRate: 65 + rand(30), respiratoryRate: 14 + rand(6), weight: 50 + rand(45), height: 150 + rand(40), oxygenSaturation: 96 + rand(4), urgencyLevel: pick(["ROUTINE", "ROUTINE", "URGENT"], i), recordedById: "u-asst" } });
    if (i % 7 === 0) { aiN++; await prisma.aITranscription.create({ data: { appointmentId: c.id, patientId: c.patientId, doctorId: c.doctorId, rawTranscript: `Doctor: How is the ${c.trt.name} site feeling?\nPatient: Much better, no pain now.\nDoctor: Good, healing well. Maintain hygiene and review in two weeks.`, structuredNote: JSON.stringify({ chiefComplaint: `${c.trt.name} review`, findings: "Healing satisfactory", plan: "Review in 2 weeks" }), summary: `${c.trt.name} healing well; routine review advised.`, status: "COMPLETED" as any, duration: 60 + rand(180) } }); }
  }

  // Lab tests (~25% of patients)
  for (let i = 0; i < patientIds.length; i += 4) {
    const p = patientIds[i];
    await prisma.labTest.create({ data: { patientId: p.id, doctorId: docFor(p.branchId).id, testName: pick(["Periapical X-ray (IOPA)", "OPG / Panoramic X-ray", "CBCT Scan", "Blood Sugar (Random)", "CBC"], i), status: pick(["COMPLETED", "COMPLETED", "PROCESSING", "REQUESTED"], i), technician: "Imaging Dept", collectedAt: daysFromNow(-(rand(60) + 1)), completedAt: i % 2 ? daysFromNow(-rand(40)) : null, notes: "Findings within normal limits." } });
  }

  // Dental charts + tooth records (~40% of patients)
  for (let i = 0; i < patientIds.length; i += 2) {
    if (i % 5 >= 2) continue;
    const p = patientIds[i];
    const chart = await prisma.dentalChart.create({ data: { patientId: p.id, numberingSystem: "FDI", dentition: "ADULT", isPrimary: true, createdById: docFor(p.branchId).id, notes: "Baseline charting." } });
    for (const fdi of [16, 26, 36, 46, 11].slice(0, 2 + rand(3))) {
      await prisma.toothRecord.create({ data: { patientId: p.id, chartId: chart.id, fdi, status: pick(["HEALTHY", "CARIES", "FILLED", "RCT", "CROWN", "MISSING"], fdi + i), conditions: pick(["", "Caries (occlusal)", "Previous restoration", "Sensitivity"], i), priority: pick(["MEDIUM", "HIGH", "COSMETIC"], i), notes: null } });
    }
  }

  // Treatment plans (~20%) with phases + items
  for (let i = 0; i < patientIds.length; i += 5) {
    const p = patientIds[i];
    const doc = docFor(p.branchId);
    const t1 = pick(treatments, i), t2 = pick(treatments, i + 3);
    const total = t1.basePrice + t2.basePrice;
    await prisma.treatmentPlan.create({ data: {
      patientId: p.id, proposedById: doc.id, status: pick(["PROPOSED", "ACCEPTED", "IN_PROGRESS"], i) as any,
      title: `Comprehensive plan — ${p.id}`, diagnosis: "Multiple carious lesions; restorative + prophylaxis indicated.", priority: "MEDIUM",
      totalCost: total, estimatedPatientPortion: total, proposedAt: daysFromNow(-(rand(40) + 1)),
      phases: { create: [
        { order: 1, title: "Phase 1 — Stabilisation", description: "Extractions / fillings / RCT", status: "IN_PROGRESS" as any },
        { order: 2, title: "Phase 2 — Restorative", description: "Crowns / prosthetics", status: "PENDING" as any },
      ] },
      items: { create: [
        { description: t1.name, quantity: 1, unitPrice: t1.basePrice, total: t1.basePrice, patientPortion: t1.basePrice, status: "ACCEPTED" as any },
        { description: t2.name, quantity: 1, unitPrice: t2.basePrice, total: t2.basePrice, patientPortion: t2.basePrice, status: "PROPOSED" as any },
      ] },
    } });
  }

  // Ortho / braces cases (~8) with visits
  for (let i = 0; i < 8; i++) {
    const p = pick(patientIds, i * 7);
    const c = await prisma.orthoCase.create({ data: { patientId: p.id, doctorId: "u-doc3", type: pick(["METAL", "CERAMIC", "CLEAR_ALIGNER"], i), arches: "BOTH", status: pick(["ACTIVE", "ACTIVE", "RETENTION", "PLANNING"], i) as any, chiefComplaint: "Crowding / malocclusion", diagnosis: "Class I crowding", startDate: daysFromNow(-(rand(300) + 30)), estimatedEndDate: daysFromNow(rand(300) + 60), intervalWeeks: 4, totalCost: 150000, paidAmount: (rand(10) + 2) * 10000, notes: "Patient compliant." } });
    const visits = 2 + rand(4);
    for (let v = 0; v < visits; v++) await prisma.orthoVisit.create({ data: { caseId: c.id, type: pick(["BRACKET_PLACEMENT", "ADJUSTMENT", "WIRE_CHANGE", "ELASTICS"], v), visitDate: daysFromNow(-(rand(300))), performedById: "u-doc3", performedByName: "Dr. Hina Raza", wireUpper: "0.018 NiTi", elastics: v % 2 ? "Class II 3/16" : null, notes: "Progress satisfactory." } });
  }

  // Packages + patient subscriptions
  const packages = [
    { id: "pkg-clean", name: "Smile Care Annual", desc: "2 scaling + 2 exams per year", price: 12000, trts: [{ id: "t-scale", n: "Scaling & Polishing", s: 2 }, { id: "t-exam", n: "Consultation & Oral Exam", s: 2 }] },
    { id: "pkg-perio", name: "Perio Maintenance", desc: "Quarterly deep cleaning", price: 18000, trts: [{ id: "t-scale", n: "Scaling & Polishing", s: 4 }] },
    { id: "pkg-white", name: "Cosmetic Whitening", desc: "In-office whitening + recall", price: 22000, trts: [{ id: "t-whiten", n: "Teeth Whitening", s: 1 }] },
    { id: "pkg-fam", name: "Family Preventive", desc: "Cleanings + exams for the family", price: 30000, trts: [{ id: "t-scale", n: "Scaling & Polishing", s: 4 }, { id: "t-exam", n: "Consultation & Oral Exam", s: 4 }] },
  ];
  for (const pk of packages) await prisma.package.create({ data: { id: pk.id, name: pk.name, description: pk.desc, price: pk.price, validityDays: 365, isActive: true, subscriberCount: rand(15), treatments: { create: pk.trts.map((t) => ({ treatmentId: t.id, treatmentName: t.n, sessions: t.s })) } } });
  for (let i = 0; i < patientIds.length; i += 6) {
    const pk = pick(packages, i);
    await prisma.patientPackage.create({ data: { patientId: patientIds[i].id, packageId: pk.id, packageName: pk.name, purchaseDate: daysFromNow(-(rand(200) + 1)), expiryDate: daysFromNow(rand(200) + 100), remainingSessions: rand(4), status: "ACTIVE" } });
  }

  // Payments — settle PAID invoices fully, PARTIAL halfway (updates billing realism)
  const allInvoices = await prisma.invoice.findMany({ select: { id: true, total: true, status: true } });
  let payN = 0;
  for (const inv of allInvoices) {
    let paid = 0;
    if (inv.status === "PAID") paid = inv.total;
    else if (inv.status === "PARTIAL") paid = Math.round(inv.total / 2);
    if (paid > 0) {
      payN++;
      await prisma.payment.create({ data: { invoiceId: inv.id, amount: paid, method: pick(["CASH", "CARD", "JAZZCASH", "EASYPAISA", "BANK_TRANSFER"], payN), status: "COMPLETED" as any, processedById: "u-bill", processedByName: "Imran Qureshi", processedAt: daysFromNow(-(rand(30))) } });
      await prisma.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, balanceDue: inv.total - paid } });
    }
  }

  // Call logs, communications, online bookings
  for (let i = 0; i < 25; i++) {
    const p = pick(patientIds, i * 2);
    await prisma.callLog.create({ data: { patientId: i % 3 ? p.id : null, callerName: `${pick(maleFirst, i)} ${pick(lastNames, i)}`, userId: "u-call", agentName: "Nida Aslam", type: pick(["INBOUND", "OUTBOUND"], i), duration: rand(600), notes: pick(["Appointment query", "Rescheduling request", "Pricing enquiry", "Follow-up reminder"], i), outcome: pick(["RESOLVED", "CALLBACK", "BOOKED"], i) } });
  }
  for (let i = 0; i < 30; i++) {
    const p = pick(patientIds, i * 2 + 1);
    await prisma.communicationLog.create({ data: { patientId: p.id, type: pick(["SMS", "WHATSAPP", "EMAIL"], i), direction: pick(["OUTBOUND", "OUTBOUND", "INBOUND"], i), subject: pick(["Appointment reminder", "Follow-up", "Payment receipt", "Welcome"], i), content: pick(["Aap ki appointment kal 11:00 baje hai. — DentaCore", "Your invoice has been paid. Shukriya!", "Reminder: scaling due this month.", "Thank you for visiting DentaCore."], i), sentById: "u-recep1", sentByName: "Sana Iqbal" } });
  }
  for (let i = 0; i < 8; i++) {
    const b = pick(branches, i); const trt = pick(treatments, i);
    await prisma.bookingRequest.create({ data: { branchId: b.id, name: `${i % 2 ? pick(femaleFirst, i) : pick(maleFirst, i)} ${pick(lastNames, i + 1)}`, phone: phone(), email: `lead${i}@gmail.com`, treatmentId: trt.id, treatmentName: trt.name, reason: `Interested in ${trt.name}`, preferredDate: daysFromNow(rand(14) + 1), preferredStart: pick(["10:00", "11:00", "15:00", "16:00"], i), preferredEnd: pick(["10:30", "11:30", "15:30", "16:30"], i), status: "PENDING", source: pick(["web", "portal", "phone"], i) } });
  }

  // Pharmacy products
  const products = [
    { name: "Composite Resin Kit (A2)", cat: "RESTORATIVE", sell: 8500, cost: 6000, qty: 24 },
    { name: "Glass Ionomer Cement (GC Fuji)", cat: "RESTORATIVE", sell: 6500, cost: 4500, qty: 15 },
    { name: "Lignocaine 2% (Anaesthetic)", cat: "ANAESTHETIC", sell: 350, cost: 200, qty: 120 },
    { name: "Latex Gloves (Box/100)", cat: "DISPOSABLE", sell: 1200, cost: 800, qty: 60 },
    { name: "Surgical Face Masks (Box/50)", cat: "DISPOSABLE", sell: 600, cost: 350, qty: 80 },
    { name: "Gutta-Percha Points", cat: "ENDODONTIC", sell: 1500, cost: 900, qty: 30 },
    { name: "Diamond Burs Set", cat: "INSTRUMENT", sell: 2800, cost: 1800, qty: 18 },
    { name: "Impression Material (Alginate)", cat: "PROSTHODONTIC", sell: 2200, cost: 1500, qty: 22 },
    { name: "Sodium Hypochlorite 3%", cat: "ENDODONTIC", sell: 450, cost: 250, qty: 40 },
    { name: "Fluoride Varnish", cat: "PREVENTIVE", sell: 3500, cost: 2200, qty: 12 },
  ];
  for (let i = 0; i < products.length; i++) { const pr = products[i]; await prisma.product.create({ data: { name: pr.name, category: pr.cat, sku: `SKU-${pad(i + 1, 3)}`, brand: pick(["3M", "GC", "Dentsply", "Ivoclar", "Local"], i), unit: "unit", sellPrice: pr.sell, costPrice: pr.cost, quantity: pr.qty, reorderLevel: 10, branchId: pick(branches, i).id, isActive: true } }); }

  // Staff schedules (Mon–Sat), leaves, calendar blocks
  for (const d of doctors) for (let day = 1; day <= 6; day++) await prisma.schedule.create({ data: { doctorId: d.id, dayOfWeek: day, startTime: "10:00", endTime: "18:00", breakStart: "13:00", breakEnd: "14:00", slotMinutes: 30, isActive: true } });
  for (let i = 0; i < 3; i++) await prisma.doctorLeave.create({ data: { doctorId: pick(doctors, i).id, startDate: daysFromNow(rand(40) + 5), endDate: daysFromNow(rand(40) + 8), reason: pick(["Annual leave", "Conference (PDA)", "Personal"], i), status: "APPROVED" as any } });
  for (let i = 0; i < 5; i++) { const b = pick(branches, i); await prisma.blockedSlot.create({ data: { branchId: b.id, roomId: rooms.filter((r) => r.branchId === b.id)[0]?.id, date: daysFromNow(rand(20) + 1), startTime: "13:00", endTime: "14:00", type: pick(["BREAK", "MAINTENANCE", "MEETING"], i), reason: pick(["Lunch break", "Equipment servicing", "Staff meeting"], i) } }); }

  // Consents, documents
  for (let i = 0; i < patientIds.length; i += 5) await prisma.consent.create({ data: { patientId: patientIds[i].id, title: pick(["Treatment Consent", "Surgical Consent", "Data Privacy Consent", "Anaesthesia Consent"], i), content: "Patient consents to the proposed treatment after explanation of risks and alternatives.", signed: i % 2 === 0, signedAt: i % 2 === 0 ? daysFromNow(-(rand(60) + 1)) : null } });
  for (let i = 0; i < patientIds.length; i += 3) await prisma.patientDocument.create({ data: { patientId: patientIds[i].id, name: pick(["IOPA X-ray", "OPG Report", "Signed Consent Form", "Lab Result", "Referral Letter"], i), type: pick(docTypes, i) as any, fileUrl: "/uploads/demo-document.pdf", fileSize: 100000 + rand(900000), uploadedById: "u-recep1", uploadedByName: "Sana Iqbal", notes: null } });

  // Voice notes (mix: pending awaiting transcription + transcribed with follow-ups for the dashboard card)
  for (let i = 0; i < 10; i++) {
    const c = pick(completed, i * 5);
    const transcribed = i % 2 === 0;
    const followUp = transcribed && i % 3 === 0;
    await prisma.voiceNote.create({ data: {
      patientId: c.patientId, doctorId: c.doctorId, appointmentId: c.id, audioUrl: "/uploads/demo-voice.webm", durationSec: 30 + rand(120),
      status: transcribed ? "SAVED" : "PENDING",
      transcript: transcribed ? `Reviewed ${c.trt.name}. Healing well, advised soft diet and follow-up.` : null,
      structuredNote: transcribed ? JSON.stringify({ summary: `${c.trt.name} review — healing well.` }) : null,
      followUpRequired: followUp, followUpDate: followUp ? daysFromNow(rand(14) + 7) : null, followUpReason: followUp ? `Review ${c.trt.name}` : null,
      actioned: false,
    } });
  }

  // Notifications + audit logs
  for (let i = 0; i < 12; i++) await prisma.notification.create({ data: { userId: pick(staff, i).id, title: pick(["New booking request", "Payment received", "Lab result ready", "Appointment reminder", "Low stock alert"], i), message: pick(["A new online booking needs confirmation.", "Invoice settled via JazzCash.", "OPG report uploaded.", "3 appointments tomorrow.", "Latex gloves below reorder level."], i), type: pick(["APPOINTMENT", "BILLING", "SYSTEM"], i), isRead: i % 3 === 0, link: "/dashboard" } });
  for (let i = 0; i < 15; i++) await prisma.auditLog.create({ data: { userId: pick(staff, i).id, userName: pick(staff, i).name, action: pick(["CREATE", "UPDATE", "LOGIN", "DELETE", "EXPORT"], i), module: pick(["Patient", "Invoice", "Appointment", "Auth", "Report"], i), entityType: pick(["Patient", "Invoice", "Appointment"], i), entityId: pick(patientIds, i).id, details: "Demo audit entry", ipAddress: `103.${rand(255)}.${rand(255)}.${rand(255)}` } });

  // Procedure templates (admin → Procedure Templates), PKR-priced
  const templates = [
    { code: "COMPOSITE_FILLING", name: "Composite Filling", category: "Restorative", cdtCode: "D2330", dx: "Dental caries", price: 4000, dur: 45 },
    { code: "RCT_MOLAR", name: "Root Canal — Molar", category: "Endodontic", cdtCode: "D3330", dx: "Irreversible pulpitis (molar)", price: 25000, dur: 90 },
    { code: "CROWN_ZIRCONIA", name: "Zirconia Crown", category: "Prosthodontic", cdtCode: "D2740", dx: "Heavily restored tooth", price: 35000, dur: 90 },
    { code: "EXTRACTION", name: "Tooth Extraction", category: "Surgical", cdtCode: "D7140", dx: "Non-restorable tooth", price: 3000, dur: 30 },
    { code: "SCALING", name: "Scaling & Polishing", category: "Preventive", cdtCode: "D1110", dx: "Gingivitis / calculus", price: 5000, dur: 40 },
  ];
  for (const tp of templates) await prisma.treatmentTemplate.create({ data: { code: tp.code, name: tp.name, category: tp.category, cdtCode: tp.cdtCode, defaultDiagnosis: tp.dx, defaultProcedureNotes: `${tp.name} performed under local anaesthesia per standard protocol.`, defaultPostOpInstructions: "Avoid hard/hot foods for 24h. Maintain oral hygiene. Return if persistent pain.", defaultFollowUpDays: 14, defaultPrice: tp.price, defaultDuration: tp.dur } });

  console.log("Extended: medical history, oral health, tags, procedures, Rx, triage, AI notes, labs, dental charts, treatment plans, ortho, packages, payments, calls, comms, bookings, products, schedules, leaves, blocks, consents, documents, voice notes, notifications, audit logs, procedure templates.");

  const counts = {
    branches: branches.length, staff: staff.length, treatments: treatments.length, rooms: rooms.length,
    patients: patientIds.length, appointments: apptN, invoices: invN, leads: 18,
  };
  console.log("Done:", counts);
  console.log(`\nDemo login password for ALL staff: "${DEMO_PASSWORD}"`);
  console.log("e.g. admin@dentacore.pk / " + DEMO_PASSWORD);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

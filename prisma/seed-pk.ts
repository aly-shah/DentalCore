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

  const counts = {
    branches: branches.length, staff: staff.length, treatments: treatments.length, rooms: rooms.length,
    patients: patientIds.length, appointments: apptN, invoices: invN, leads: 18,
  };
  console.log("Done:", counts);
  console.log(`\nDemo login password for ALL staff: "${DEMO_PASSWORD}"`);
  console.log("e.g. admin@dentacore.pk / " + DEMO_PASSWORD);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

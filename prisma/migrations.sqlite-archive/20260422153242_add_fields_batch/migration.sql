-- AlterTable
ALTER TABLE "AITranscription" ADD COLUMN "language" TEXT DEFAULT 'en';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "cancellationNote" TEXT;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "timezone" TEXT;

-- AlterTable
ALTER TABLE "ConsultationNote" ADD COLUMN "affectedAreas" TEXT;
ALTER TABLE "ConsultationNote" ADD COLUMN "conditionSeverity" TEXT;
ALTER TABLE "ConsultationNote" ADD COLUMN "differentialDx" TEXT;
ALTER TABLE "ConsultationNote" ADD COLUMN "internalNotes" TEXT;
ALTER TABLE "ConsultationNote" ADD COLUMN "skinAssessment" TEXT;

-- AlterTable
ALTER TABLE "LabTest" ADD COLUMN "priority" TEXT;
ALTER TABLE "LabTest" ADD COLUMN "testCode" TEXT;

-- AlterTable
ALTER TABLE "Package" ADD COLUMN "maxRedemptions" INTEGER;

-- AlterTable
ALTER TABLE "PatientDocument" ADD COLUMN "mimeType" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "barcode" TEXT;
ALTER TABLE "Product" ADD COLUMN "description" TEXT;
ALTER TABLE "Product" ADD COLUMN "expiryDate" DATETIME;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN "equipment" TEXT;
ALTER TABLE "Room" ADD COLUMN "floor" TEXT;

-- AlterTable
ALTER TABLE "Triage" ADD COLUMN "moistureLevel" TEXT;
ALTER TABLE "Triage" ADD COLUMN "oilinessLevel" TEXT;
ALTER TABLE "Triage" ADD COLUMN "painLevel" INTEGER;
ALTER TABLE "Triage" ADD COLUMN "temperatureUnit" TEXT DEFAULT 'C';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "branchId" TEXT NOT NULL,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "discount" REAL NOT NULL DEFAULT 0,
    "discountType" TEXT NOT NULL DEFAULT 'FIXED',
    "tax" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "amountPaid" REAL NOT NULL DEFAULT 0,
    "balanceDue" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dueDate" DATETIME,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("amountPaid", "appointmentId", "balanceDue", "branchId", "createdAt", "createdById", "discount", "discountType", "dueDate", "id", "invoiceNumber", "notes", "patientId", "status", "subtotal", "tax", "total", "updatedAt") SELECT "amountPaid", "appointmentId", "balanceDue", "branchId", "createdAt", "createdById", "discount", "discountType", "dueDate", "id", "invoiceNumber", "notes", "patientId", "status", "subtotal", "tax", "total", "updatedAt" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE UNIQUE INDEX "Invoice_appointmentId_key" ON "Invoice"("appointmentId");
CREATE TABLE "new_Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "dateOfBirth" DATETIME,
    "gender" TEXT NOT NULL DEFAULT 'OTHER',
    "nationality" TEXT,
    "address" TEXT,
    "city" TEXT,
    "emergencyContact" TEXT,
    "emergencyPhone" TEXT,
    "bloodType" TEXT,
    "profileImage" TEXT,
    "notes" TEXT,
    "source" TEXT,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "isVip" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "skinType" TEXT,
    "lastVisit" DATETIME,
    "nextAppointment" DATETIME,
    "outstandingBalance" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "branchId" TEXT NOT NULL,
    "assignedDoctorId" TEXT,
    CONSTRAINT "Patient_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Patient_assignedDoctorId_fkey" FOREIGN KEY ("assignedDoctorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Patient" ("address", "assignedDoctorId", "bloodType", "branchId", "city", "createdAt", "dateOfBirth", "email", "emergencyContact", "emergencyPhone", "firstName", "gender", "id", "isActive", "lastName", "lastVisit", "nextAppointment", "notes", "outstandingBalance", "patientCode", "phone", "profileImage", "skinType", "updatedAt") SELECT "address", "assignedDoctorId", "bloodType", "branchId", "city", "createdAt", "dateOfBirth", "email", "emergencyContact", "emergencyPhone", "firstName", "gender", "id", "isActive", "lastName", "lastVisit", "nextAppointment", "notes", "outstandingBalance", "patientCode", "phone", "profileImage", "skinType", "updatedAt" FROM "Patient";
DROP TABLE "Patient";
ALTER TABLE "new_Patient" RENAME TO "Patient";
CREATE UNIQUE INDEX "Patient_patientCode_key" ON "Patient"("patientCode");
CREATE TABLE "new_Prescription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Prescription_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Prescription" ("appointmentId", "createdAt", "doctorId", "id", "notes", "patientId", "updatedAt") SELECT "appointmentId", "createdAt", "doctorId", "id", "notes", "patientId", "updatedAt" FROM "Prescription";
DROP TABLE "Prescription";
ALTER TABLE "new_Prescription" RENAME TO "Prescription";
CREATE TABLE "new_Procedure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointmentId" TEXT,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "notes" TEXT,
    "outcome" TEXT,
    "complications" TEXT,
    "beforeImages" TEXT,
    "afterImages" TEXT,
    "areasTreated" TEXT,
    "consentSigned" BOOLEAN NOT NULL DEFAULT false,
    "settings" TEXT,
    "performedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Procedure_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Procedure_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Procedure_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Procedure_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Procedure" ("afterImages", "appointmentId", "beforeImages", "complications", "createdAt", "doctorId", "id", "notes", "outcome", "patientId", "performedAt", "treatmentId") SELECT "afterImages", "appointmentId", "beforeImages", "complications", "createdAt", "doctorId", "id", "notes", "outcome", "patientId", "performedAt", "treatmentId" FROM "Procedure";
DROP TABLE "Procedure";
ALTER TABLE "new_Procedure" RENAME TO "Procedure";
CREATE TABLE "new_Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "processedById" TEXT,
    "approvedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Refund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Refund" ("amount", "createdAt", "id", "invoiceId", "processedById", "reason") SELECT "amount", "createdAt", "id", "invoiceId", "processedById", "reason" FROM "Refund";
DROP TABLE "Refund";
ALTER TABLE "new_Refund" RENAME TO "Refund";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

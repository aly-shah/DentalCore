-- CreateEnum
CREATE TYPE "AISuggestionStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'ERRORED');

-- CreateEnum
CREATE TYPE "TreatmentPlanItemStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TreatmentPlanPhaseStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TreatmentPlanStatus" AS ENUM ('DRAFT', 'PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentWorkflowStage" AS ENUM ('BOOKED', 'CHECKIN', 'CHECKOUT', 'BILLING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'FOLLOW_UP', 'BOOKED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "OrthoCaseStatus" AS ENUM ('CONSULTATION', 'RECORDS', 'PLANNING', 'ACTIVE', 'RETENTION', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TranscriptionStatus" AS ENUM ('RECORDING', 'PROCESSING', 'COMPLETED', 'ACCEPTED', 'REJECTED', 'ERRORED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('REPORT', 'IMAGE', 'CONSENT', 'PRESCRIPTION', 'LAB_RESULT', 'BEFORE_AFTER', 'XRAY', 'OTHER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "logoUrl" TEXT,
    "wordmarkUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0284C7',
    "secondaryColor" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "dateFormat" TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
    "region" TEXT NOT NULL DEFAULT 'global',
    "hipaaCovered" BOOLEAN NOT NULL DEFAULT false,
    "gdprCovered" BOOLEAN NOT NULL DEFAULT false,
    "maxUsers" INTEGER,
    "maxBranches" INTEGER,
    "maxPatients" INTEGER,
    "monthlyAiBudgetCents" INTEGER,
    "storageQuotaGB" DOUBLE PRECISION,
    "trialEndsAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantHostname" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "tlsManagedBy" TEXT NOT NULL DEFAULT 'PLATFORM',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "TenantHostname_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "timezone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'RECEPTIONIST',
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "speciality" TEXT,
    "licenseNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "patientCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender" NOT NULL DEFAULT 'OTHER',
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
    "deletedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "skinType" TEXT,
    "lastVisit" TIMESTAMP(3),
    "nextAppointment" TIMESTAMP(3),
    "outstandingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "branchId" TEXT NOT NULL,
    "assignedDoctorId" TEXT,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeforeAfterImage" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "beforeUrl" TEXT NOT NULL,
    "afterUrl" TEXT,
    "title" TEXT,
    "description" TEXT,
    "toothFdi" INTEGER,
    "procedure" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeforeAfterImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrthoCase" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'METAL',
    "arches" TEXT NOT NULL DEFAULT 'BOTH',
    "status" "OrthoCaseStatus" NOT NULL DEFAULT 'CONSULTATION',
    "chiefComplaint" TEXT,
    "diagnosis" TEXT,
    "treatmentPlan" TEXT,
    "startDate" TIMESTAMP(3),
    "estimatedEndDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "intervalWeeks" INTEGER NOT NULL DEFAULT 4,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrthoCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrthoVisit" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ADJUSTMENT',
    "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedById" TEXT,
    "performedByName" TEXT,
    "wireUpper" TEXT,
    "wireLower" TEXT,
    "elastics" TEXT,
    "notes" TEXT,
    "complications" TEXT,
    "nextVisitDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrthoVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToothRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "patientId" TEXT NOT NULL,
    "chartId" TEXT,
    "fdi" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HEALTHY',
    "conditions" TEXT,
    "treatment" TEXT,
    "plannedTreatment" TEXT,
    "completedTreatment" TEXT,
    "surfaces" JSONB,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToothRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DentalChart" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tenantId" TEXT,
    "numberingSystem" TEXT NOT NULL DEFAULT 'FDI',
    "dentition" TEXT NOT NULL DEFAULT 'ADULT',
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DentalChart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToothEvent" (
    "id" TEXT NOT NULL,
    "toothRecordId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "surface" TEXT,
    "notes" TEXT,
    "procedureId" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToothEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergy" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "allergen" TEXT NOT NULL,
    "severity" TEXT,

    CONSTRAINT "Allergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientTag" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "PatientTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "appointmentCode" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "roomId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'CONSULTATION',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "waitlistPosition" INTEGER,
    "checkinTime" TIMESTAMP(3),
    "checkoutTime" TIMESTAMP(3),
    "workflowStage" "AppointmentWorkflowStage" NOT NULL DEFAULT 'BOOKED',
    "cancellationNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "chiefComplaint" TEXT,
    "symptoms" TEXT,
    "examination" TEXT,
    "conditionSeverity" TEXT,
    "diagnosis" TEXT,
    "differentialDx" TEXT,
    "treatmentPlan" TEXT,
    "advice" TEXT,
    "internalNotes" TEXT,
    "followUpDate" TIMESTAMP(3),
    "followUpNotes" TEXT,
    "isSigned" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Treatment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "basePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "preInstructions" TEXT,
    "postInstructions" TEXT,
    "contraindications" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Treatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Procedure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "appointmentId" TEXT,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "notes" TEXT,
    "outcome" TEXT,
    "complications" TEXT,
    "areasTreated" TEXT,
    "consentSigned" BOOLEAN NOT NULL DEFAULT false,
    "settings" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Procedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicineName" TEXT NOT NULL,
    "dosage" TEXT,
    "frequency" TEXT,
    "duration" TEXT,
    "route" TEXT,
    "instructions" TEXT,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "testName" TEXT NOT NULL,
    "testCode" TEXT,
    "priority" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "results" TEXT,
    "technician" TEXT,
    "collectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientDocument" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL DEFAULT 'OTHER',
    "mimeType" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "uploadedByName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "branchId" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountType" TEXT NOT NULL DEFAULT 'FIXED',
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PROCEDURE',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "processedById" TEXT NOT NULL,
    "processedByName" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "processedById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validityDays" INTEGER NOT NULL DEFAULT 365,
    "maxRedemptions" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageTreatment" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "treatmentName" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PackageTreatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPackage" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "remainingSessions" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CALL',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "interest" TEXT,
    "assignedToId" TEXT,
    "branchId" TEXT NOT NULL,
    "notes" TEXT,
    "convertedPatientId" TEXT,
    "callbackDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "patientId" TEXT,
    "callerName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentName" TEXT,
    "type" TEXT NOT NULL DEFAULT 'INBOUND',
    "duration" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SMS',
    "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "sentById" TEXT,
    "sentByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AITranscription" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "rawTranscript" TEXT,
    "structuredNote" TEXT,
    "summary" TEXT,
    "language" TEXT DEFAULT 'en',
    "status" "TranscriptionStatus" NOT NULL DEFAULT 'COMPLETED',
    "duration" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AITranscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SYSTEM',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "dedupKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Triage" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "temperature" DOUBLE PRECISION,
    "temperatureUnit" TEXT DEFAULT 'C',
    "systolicBP" INTEGER,
    "diastolicBP" INTEGER,
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "oxygenSaturation" INTEGER,
    "painLevel" INTEGER,
    "bmi" TEXT,
    "notes" TEXT,
    "skinObservations" TEXT,
    "urgencyLevel" TEXT NOT NULL DEFAULT 'ROUTINE',
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Triage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CONSULTATION',
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "floor" TEXT,
    "equipment" TEXT,
    "currentPatientId" TEXT,
    "currentPatientName" TEXT,
    "currentDoctorName" TEXT,
    "occupiedSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkinHistory" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "affectedArea" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MILD',
    "onsetDate" TIMESTAMP(3),
    "treatmentHistory" TEXT,
    "notes" TEXT,
    "images" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkinHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalHistory" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "diagnosedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "brand" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "unit" TEXT,
    "sellPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 5,
    "expiryDate" TIMESTAMP(3),
    "branchId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakStart" TEXT,
    "breakEnd" TEXT,
    "slotMinutes" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorLeave" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorLeave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedSlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "doctorId" TEXT,
    "roomId" TEXT,
    "branchId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BLOCK',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" TIMESTAMP(3),
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tenantId" TEXT,
    "proposedById" TEXT NOT NULL,
    "acceptedById" TEXT,
    "status" "TreatmentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "diagnosis" TEXT,
    "rationale" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "proposedAt" TIMESTAMP(3),
    "presentedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "patientSignatureUrl" TEXT,
    "consentRequired" BOOLEAN NOT NULL DEFAULT false,
    "consentSigned" BOOLEAN NOT NULL DEFAULT false,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedInsuranceCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedPatientPortion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlanPhase" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimatedWeeks" INTEGER,
    "status" "TreatmentPlanPhaseStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "TreatmentPlanPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT,
    "phaseId" TEXT,
    "treatmentId" TEXT,
    "cdtCode" TEXT,
    "fdi" INTEGER,
    "surface" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "insuranceCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "patientPortion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "procedureId" TEXT,
    "performedAt" TIMESTAMP(3),
    "status" "TreatmentPlanItemStatus" NOT NULL DEFAULT 'PROPOSED',
    "notes" TEXT,

    CONSTRAINT "TreatmentPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cdtCode" TEXT,
    "defaultDiagnosis" TEXT,
    "defaultChiefComplaint" TEXT,
    "defaultClinicalFindings" TEXT,
    "defaultProcedureNotes" TEXT,
    "defaultMaterialsUsed" TEXT,
    "defaultPostOpInstructions" TEXT,
    "defaultFollowUpDays" INTEGER,
    "defaultRxItems" JSONB,
    "defaultPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultDuration" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIModelVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "systemPrompt" TEXT,
    "temperature" DOUBLE PRECISION,
    "maxTokens" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deprecatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISuggestionLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "patientId" TEXT,
    "doctorId" TEXT,
    "appointmentId" TEXT,
    "modelVersionId" TEXT NOT NULL,
    "subsystem" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "rawResponse" JSONB,
    "parsedResponse" JSONB,
    "confidence" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "costCents" DOUBLE PRECISION,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "status" "AISuggestionStatus" NOT NULL DEFAULT 'PROPOSED',
    "acceptedEntityType" TEXT,
    "acceptedEntityId" TEXT,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AISuggestionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISuggestionFeedback" (
    "id" TEXT NOT NULL,
    "suggestionLogId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "rating" INTEGER NOT NULL,
    "feedback" TEXT,
    "flagAsInaccurate" BOOLEAN NOT NULL DEFAULT false,
    "flagAsHarmful" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AISuggestionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE INDEX "Tenant_plan_idx" ON "Tenant"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "TenantHostname_hostname_key" ON "TenantHostname"("hostname");

-- CreateIndex
CREATE INDEX "TenantHostname_tenantId_idx" ON "TenantHostname"("tenantId");

-- CreateIndex
CREATE INDEX "Branch_tenantId_idx" ON "Branch"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_patientCode_key" ON "Patient"("patientCode");

-- CreateIndex
CREATE INDEX "Patient_tenantId_idx" ON "Patient"("tenantId");

-- CreateIndex
CREATE INDEX "BeforeAfterImage_patientId_idx" ON "BeforeAfterImage"("patientId");

-- CreateIndex
CREATE INDEX "BeforeAfterImage_takenAt_idx" ON "BeforeAfterImage"("takenAt");

-- CreateIndex
CREATE INDEX "OrthoCase_patientId_idx" ON "OrthoCase"("patientId");

-- CreateIndex
CREATE INDEX "OrthoCase_status_idx" ON "OrthoCase"("status");

-- CreateIndex
CREATE INDEX "OrthoVisit_caseId_idx" ON "OrthoVisit"("caseId");

-- CreateIndex
CREATE INDEX "OrthoVisit_visitDate_idx" ON "OrthoVisit"("visitDate");

-- CreateIndex
CREATE INDEX "ToothRecord_patientId_idx" ON "ToothRecord"("patientId");

-- CreateIndex
CREATE INDEX "ToothRecord_chartId_idx" ON "ToothRecord"("chartId");

-- CreateIndex
CREATE INDEX "ToothRecord_tenantId_idx" ON "ToothRecord"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ToothRecord_patientId_fdi_key" ON "ToothRecord"("patientId", "fdi");

-- CreateIndex
CREATE INDEX "DentalChart_patientId_idx" ON "DentalChart"("patientId");

-- CreateIndex
CREATE INDEX "DentalChart_tenantId_idx" ON "DentalChart"("tenantId");

-- CreateIndex
CREATE INDEX "ToothEvent_toothRecordId_occurredAt_idx" ON "ToothEvent"("toothRecordId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_appointmentCode_key" ON "Appointment"("appointmentCode");

-- CreateIndex
CREATE INDEX "Appointment_date_doctorId_idx" ON "Appointment"("date", "doctorId");

-- CreateIndex
CREATE INDEX "Appointment_branchId_date_idx" ON "Appointment"("branchId", "date");

-- CreateIndex
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "Appointment_roomId_idx" ON "Appointment"("roomId");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_date_idx" ON "Appointment"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationNote_appointmentId_key" ON "ConsultationNote"("appointmentId");

-- CreateIndex
CREATE INDEX "ConsultationNote_patientId_createdAt_idx" ON "ConsultationNote"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsultationNote_doctorId_idx" ON "ConsultationNote"("doctorId");

-- CreateIndex
CREATE INDEX "ConsultationNote_tenantId_idx" ON "ConsultationNote"("tenantId");

-- CreateIndex
CREATE INDEX "Treatment_tenantId_idx" ON "Treatment"("tenantId");

-- CreateIndex
CREATE INDEX "Procedure_patientId_performedAt_idx" ON "Procedure"("patientId", "performedAt");

-- CreateIndex
CREATE INDEX "Procedure_appointmentId_idx" ON "Procedure"("appointmentId");

-- CreateIndex
CREATE INDEX "Procedure_doctorId_idx" ON "Procedure"("doctorId");

-- CreateIndex
CREATE INDEX "Procedure_tenantId_idx" ON "Procedure"("tenantId");

-- CreateIndex
CREATE INDEX "Prescription_patientId_createdAt_idx" ON "Prescription"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Prescription_doctorId_idx" ON "Prescription"("doctorId");

-- CreateIndex
CREATE INDEX "Prescription_appointmentId_idx" ON "Prescription"("appointmentId");

-- CreateIndex
CREATE INDEX "PrescriptionItem_prescriptionId_idx" ON "PrescriptionItem"("prescriptionId");

-- CreateIndex
CREATE INDEX "LabTest_patientId_idx" ON "LabTest"("patientId");

-- CreateIndex
CREATE INDEX "LabTest_status_idx" ON "LabTest"("status");

-- CreateIndex
CREATE INDEX "PatientDocument_patientId_createdAt_idx" ON "PatientDocument"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientDocument_type_idx" ON "PatientDocument"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_appointmentId_key" ON "Invoice"("appointmentId");

-- CreateIndex
CREATE INDEX "Invoice_patientId_status_idx" ON "Invoice"("patientId", "status");

-- CreateIndex
CREATE INDEX "Invoice_branchId_createdAt_idx" ON "Invoice"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_processedAt_idx" ON "Payment"("processedAt");

-- CreateIndex
CREATE INDEX "Refund_invoiceId_idx" ON "Refund"("invoiceId");

-- CreateIndex
CREATE INDEX "Package_tenantId_idx" ON "Package"("tenantId");

-- CreateIndex
CREATE INDEX "PatientPackage_patientId_status_idx" ON "PatientPackage"("patientId", "status");

-- CreateIndex
CREATE INDEX "PatientPackage_patientId_createdAt_idx" ON "PatientPackage"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_tenantId_idx" ON "Lead"("tenantId");

-- CreateIndex
CREATE INDEX "Lead_status_branchId_idx" ON "Lead"("status", "branchId");

-- CreateIndex
CREATE INDEX "Lead_assignedToId_idx" ON "Lead"("assignedToId");

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "CommunicationLog_patientId_createdAt_idx" ON "CommunicationLog"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "FollowUp_status_dueDate_idx" ON "FollowUp"("status", "dueDate");

-- CreateIndex
CREATE INDEX "FollowUp_patientId_idx" ON "FollowUp"("patientId");

-- CreateIndex
CREATE INDEX "FollowUp_doctorId_status_idx" ON "FollowUp"("doctorId", "status");

-- CreateIndex
CREATE INDEX "FollowUp_tenantId_status_idx" ON "FollowUp"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AITranscription_appointmentId_key" ON "AITranscription"("appointmentId");

-- CreateIndex
CREATE INDEX "AITranscription_patientId_createdAt_idx" ON "AITranscription"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupKey_key" ON "Notification"("userId", "dedupKey");

-- CreateIndex
CREATE UNIQUE INDEX "Triage_appointmentId_key" ON "Triage"("appointmentId");

-- CreateIndex
CREATE INDEX "Room_tenantId_idx" ON "Room"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE INDEX "Schedule_doctorId_dayOfWeek_idx" ON "Schedule"("doctorId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "DoctorLeave_doctorId_startDate_idx" ON "DoctorLeave"("doctorId", "startDate");

-- CreateIndex
CREATE INDEX "BlockedSlot_doctorId_date_idx" ON "BlockedSlot"("doctorId", "date");

-- CreateIndex
CREATE INDEX "BlockedSlot_roomId_date_idx" ON "BlockedSlot"("roomId", "date");

-- CreateIndex
CREATE INDEX "BlockedSlot_branchId_date_idx" ON "BlockedSlot"("branchId", "date");

-- CreateIndex
CREATE INDEX "Setting_tenantId_idx" ON "Setting"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_tenantId_key_key" ON "Setting"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TreatmentPlan_patientId_status_idx" ON "TreatmentPlan"("patientId", "status");

-- CreateIndex
CREATE INDEX "TreatmentPlan_tenantId_idx" ON "TreatmentPlan"("tenantId");

-- CreateIndex
CREATE INDEX "TreatmentPlanPhase_planId_idx" ON "TreatmentPlanPhase"("planId");

-- CreateIndex
CREATE INDEX "TreatmentPlanItem_planId_idx" ON "TreatmentPlanItem"("planId");

-- CreateIndex
CREATE INDEX "TreatmentPlanItem_phaseId_idx" ON "TreatmentPlanItem"("phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentTemplate_code_key" ON "TreatmentTemplate"("code");

-- CreateIndex
CREATE INDEX "TreatmentTemplate_tenantId_idx" ON "TreatmentTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "TreatmentTemplate_category_idx" ON "TreatmentTemplate"("category");

-- CreateIndex
CREATE INDEX "AIModelVersion_name_isActive_idx" ON "AIModelVersion"("name", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AIModelVersion_name_modelId_promptVersion_key" ON "AIModelVersion"("name", "modelId", "promptVersion");

-- CreateIndex
CREATE INDEX "AISuggestionLog_tenantId_subsystem_createdAt_idx" ON "AISuggestionLog"("tenantId", "subsystem", "createdAt");

-- CreateIndex
CREATE INDEX "AISuggestionLog_patientId_idx" ON "AISuggestionLog"("patientId");

-- CreateIndex
CREATE INDEX "AISuggestionLog_status_idx" ON "AISuggestionLog"("status");

-- CreateIndex
CREATE INDEX "AISuggestionFeedback_suggestionLogId_idx" ON "AISuggestionFeedback"("suggestionLogId");

-- AddForeignKey
ALTER TABLE "TenantHostname" ADD CONSTRAINT "TenantHostname_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_assignedDoctorId_fkey" FOREIGN KEY ("assignedDoctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeforeAfterImage" ADD CONSTRAINT "BeforeAfterImage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrthoCase" ADD CONSTRAINT "OrthoCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrthoCase" ADD CONSTRAINT "OrthoCase_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrthoVisit" ADD CONSTRAINT "OrthoVisit_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "OrthoCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToothRecord" ADD CONSTRAINT "ToothRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToothRecord" ADD CONSTRAINT "ToothRecord_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "DentalChart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalChart" ADD CONSTRAINT "DentalChart_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToothEvent" ADD CONSTRAINT "ToothEvent_toothRecordId_fkey" FOREIGN KEY ("toothRecordId") REFERENCES "ToothRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergy" ADD CONSTRAINT "Allergy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientTag" ADD CONSTRAINT "PatientTag_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNote" ADD CONSTRAINT "ConsultationNote_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNote" ADD CONSTRAINT "ConsultationNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNote" ADD CONSTRAINT "ConsultationNote_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageTreatment" ADD CONSTRAINT "PackageTreatment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageTreatment" ADD CONSTRAINT "PackageTreatment_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedPatientId_fkey" FOREIGN KEY ("convertedPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITranscription" ADD CONSTRAINT "AITranscription_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITranscription" ADD CONSTRAINT "AITranscription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITranscription" ADD CONSTRAINT "AITranscription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Triage" ADD CONSTRAINT "Triage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Triage" ADD CONSTRAINT "Triage_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Triage" ADD CONSTRAINT "Triage_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkinHistory" ADD CONSTRAINT "SkinHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalHistory" ADD CONSTRAINT "MedicalHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorLeave" ADD CONSTRAINT "DoctorLeave_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedSlot" ADD CONSTRAINT "BlockedSlot_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedSlot" ADD CONSTRAINT "BlockedSlot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedSlot" ADD CONSTRAINT "BlockedSlot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlanPhase" ADD CONSTRAINT "TreatmentPlanPhase_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlanItem" ADD CONSTRAINT "TreatmentPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlanItem" ADD CONSTRAINT "TreatmentPlanItem_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "TreatmentPlanPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISuggestionLog" ADD CONSTRAINT "AISuggestionLog_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "AIModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISuggestionFeedback" ADD CONSTRAINT "AISuggestionFeedback_suggestionLogId_fkey" FOREIGN KEY ("suggestionLogId") REFERENCES "AISuggestionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Inbound booking requests submitted via the public /book page.
CREATE TABLE "BookingRequest" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "tenantId"        TEXT,
  "branchId"        TEXT,
  "name"            TEXT NOT NULL,
  "phone"           TEXT NOT NULL,
  "email"           TEXT,
  "patientId"       TEXT,
  "treatmentId"     TEXT,
  "treatmentName"   TEXT,
  "reason"          TEXT,
  "notes"           TEXT,
  "doctorId"        TEXT,
  "preferredDate"   TIMESTAMP(3) NOT NULL,
  "preferredStart"  TEXT NOT NULL,
  "preferredEnd"    TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'PENDING',
  "source"          TEXT NOT NULL DEFAULT 'web',
  "confirmedAt"     TIMESTAMP(3),
  "confirmedById"   TEXT,
  "appointmentId"   TEXT,
  "rejectedAt"      TIMESTAMP(3),
  "rejectedById"    TEXT,
  "rejectionReason" TEXT,
  "leadId"          TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BookingRequest_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BookingRequest_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BookingRequest_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BookingRequest_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BookingRequest_appointmentId_key"        ON "BookingRequest"("appointmentId");
CREATE INDEX        "BookingRequest_status_createdAt_idx"     ON "BookingRequest"("status", "createdAt");
CREATE INDEX        "BookingRequest_tenantId_idx"             ON "BookingRequest"("tenantId");
CREATE INDEX        "BookingRequest_branchId_preferredDate_idx" ON "BookingRequest"("branchId", "preferredDate");

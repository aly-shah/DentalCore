-- Deferred voice notes: record now, transcribe with AI later, then promote
-- into a ConsultationNote. Scalar-only, tenant-scoped via the Prisma extension.
CREATE TABLE "VoiceNote" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "tenantId"       TEXT,
  "patientId"      TEXT NOT NULL,
  "doctorId"       TEXT NOT NULL,
  "appointmentId"  TEXT,
  "audioUrl"       TEXT NOT NULL,
  "durationSec"    INTEGER NOT NULL DEFAULT 0,
  "status"         TEXT NOT NULL DEFAULT 'PENDING',
  "transcript"     TEXT,
  "structuredNote" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "VoiceNote_patientId_createdAt_idx" ON "VoiceNote"("patientId", "createdAt");
CREATE INDEX "VoiceNote_status_idx" ON "VoiceNote"("status");

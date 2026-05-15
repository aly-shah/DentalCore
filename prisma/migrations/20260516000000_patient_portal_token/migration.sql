-- Per-patient access tokens for the read-only Patient Portal.
CREATE TABLE "PatientPortalToken" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "patientId"   TEXT NOT NULL,
  "token"       TEXT NOT NULL,
  "expiresAt"   TIMESTAMP(3),
  "revokedAt"   TIMESTAMP(3),
  "lastUsedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,

  CONSTRAINT "PatientPortalToken_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PatientPortalToken_token_key" ON "PatientPortalToken"("token");
CREATE INDEX "PatientPortalToken_patientId_idx" ON "PatientPortalToken"("patientId");

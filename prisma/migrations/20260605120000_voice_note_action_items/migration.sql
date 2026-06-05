-- Voice-note action items: AI-extracted follow-up + tasks surfaced on the dashboard.
ALTER TABLE "VoiceNote" ADD COLUMN "followUpRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VoiceNote" ADD COLUMN "followUpDate"     TIMESTAMP(3);
ALTER TABLE "VoiceNote" ADD COLUMN "followUpReason"   TEXT;
ALTER TABLE "VoiceNote" ADD COLUMN "actionItems"      TEXT;
ALTER TABLE "VoiceNote" ADD COLUMN "actioned"         BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "VoiceNote_doctorId_status_actioned_idx" ON "VoiceNote"("doctorId", "status", "actioned");

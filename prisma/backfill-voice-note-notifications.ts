/**
 * Backfill bell notifications for voice notes that are still awaiting
 * attention (status PENDING, not yet actioned) but were saved before the
 * notify-on-save behaviour shipped.
 *
 *   npx tsx prisma/backfill-voice-note-notifications.ts
 *
 * Idempotent — notifications are upserted on (userId, dedupKey), so
 * re-running creates nothing new and never overwrites read state. Notes
 * that have since been transcribed (SAVED) or dismissed (actioned) are
 * skipped automatically. Safe to run on every deploy.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("==> Voice-note notification backfill starting…");

  const pending = await prisma.voiceNote.findMany({
    where: { status: "PENDING", actioned: false },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  console.log(`   ${pending.length} pending voice note(s) to consider`);

  let created = 0;
  for (const vn of pending) {
    const [patient, doctor] = await Promise.all([
      prisma.patient.findUnique({ where: { id: vn.patientId }, select: { firstName: true, lastName: true, branchId: true } }),
      prisma.user.findUnique({ where: { id: vn.doctorId }, select: { name: true } }),
    ]);
    const staff = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ["RECEPTIONIST", "ADMIN", "SUPER_ADMIN"] },
        ...(patient?.branchId ? { branchId: patient.branchId } : {}),
      },
      select: { id: true },
    });
    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : "a patient";
    const dedupKey = `voice-note:${vn.id}`;
    for (const u of staff) {
      const res = await prisma.notification.upsert({
        where: { userId_dedupKey: { userId: u.id, dedupKey } },
        create: {
          userId: u.id,
          dedupKey,
          title: `New voice note — ${patientName}`,
          message: `${doctor?.name ?? "A doctor"} left a voice note awaiting transcription`,
          type: "VOICE_NOTE",
          link: `/patients/${vn.patientId}`,
          createdAt: vn.createdAt,
        },
        update: {},
        select: { createdAt: true },
      });
      // Count rows that match the note's timestamp as freshly created.
      if (res.createdAt.getTime() === vn.createdAt.getTime()) created++;
    }
  }

  console.log(`==> Backfill done. Upserted notifications for ${pending.length} note(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

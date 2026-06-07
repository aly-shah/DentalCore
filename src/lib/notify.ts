import { prisma } from "@/lib/prisma";

/**
 * Create a deduped bell notification for clinic front-office staff
 * (front desk + admins) about patient activity they may need to action
 * — e.g. a doctor leaving a voice note or a consultation note with a
 * follow-up. Idempotent per `dedupKey`, so producers (including the
 * backfill script) can call it repeatedly without creating duplicates.
 *
 * Best-effort by design: callers should wrap this so a notification
 * failure never fails the primary write that triggered it.
 */
export async function notifyClinicStaff(opts: {
  branchId?: string | null;
  dedupKey: string;
  title: string;
  message: string;
  type: string;
  link: string;
}): Promise<void> {
  const staff = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["RECEPTIONIST", "ADMIN", "SUPER_ADMIN"] },
      ...(opts.branchId ? { branchId: opts.branchId } : {}),
    },
    select: { id: true },
  });
  await Promise.all(
    staff.map((u) =>
      prisma.notification.upsert({
        where: { userId_dedupKey: { userId: u.id, dedupKey: opts.dedupKey } },
        create: {
          userId: u.id,
          dedupKey: opts.dedupKey,
          title: opts.title,
          message: opts.message,
          type: opts.type,
          link: opts.link,
        },
        update: {},
      })
    )
  );
}

/**
 * Create/refresh one simple login per role.
 *
 * Idempotent: safe to re-run. Upserts by email — if the account already
 * exists it just resets the password and re-activates it.
 *
 *   npx tsx prisma/seed-role-users.ts
 *
 * All accounts share the password:  password123
 */
// Load DATABASE_URL from the app's .env — `tsx` (unlike the Prisma CLI) does
// not auto-load it, so a bare `npx tsx` run on the VPS would otherwise have no
// connection string. Does not override an already-set env var.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "password123";

// Simple emails, one per role. Ids are DB-generated (cuid) — the email is the
// login identity and the upsert key, so no fixed ids that could collide with
// existing rows.
const ROLE_USERS = [
  { email: "super@clinic.com",      role: "SUPER_ADMIN",  name: "Super Admin" },
  { email: "admin@clinic.com",      role: "ADMIN",        name: "Admin User" },
  { email: "doctor@clinic.com",     role: "DOCTOR",       name: "Doctor User" },
  { email: "reception@clinic.com",  role: "RECEPTIONIST", name: "Reception User" },
  { email: "billing@clinic.com",    role: "BILLING",      name: "Billing User" },
  { email: "callcenter@clinic.com", role: "CALL_CENTER",  name: "Call Center User" },
  { email: "assistant@clinic.com",  role: "ASSISTANT",    name: "Assistant User" },
];

async function main() {
  console.log("==> seeding role login users…");

  // Every user needs a valid branchId. Reuse an existing branch; create a
  // fallback one (matching the default tenant) if the DB has none.
  let branch = await prisma.branch.findFirst({ where: { isActive: true } });
  if (!branch) {
    const tenant = await prisma.tenant.findFirst().catch(() => null);
    branch = await prisma.branch.create({
      data: { name: "Main Dental", code: "MAIN", isActive: true, tenantId: tenant?.id ?? null },
    });
    console.log(`   created fallback branch ${branch.id}`);
  }
  console.log(`   using branch ${branch.id} (${branch.name}), tenant ${branch.tenantId ?? "—"}`);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  let ok = 0;
  for (const u of ROLE_USERS) {
    // Isolate each account so one failure never aborts the rest.
    try {
      await prisma.user.upsert({
        where: { email: u.email },
        update: { passwordHash, isActive: true, role: u.role, name: u.name },
        create: {
          email: u.email,
          name: u.name,
          role: u.role,
          passwordHash,
          isActive: true,
          branchId: branch.id,
          tenantId: branch.tenantId ?? undefined,
        },
      });
      ok++;
      console.log(`   ✓ ${u.email}  (${u.role})`);
    } catch (e) {
      console.error(`   ✗ ${u.email} — ${(e as Error).message.split("\n")[0]}`);
    }
  }

  console.log(`\nDone. ${ok}/${ROLE_USERS.length} accounts ready — password: "${PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

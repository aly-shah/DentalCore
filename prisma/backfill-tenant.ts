/**
 * Phase A tenant backfill.
 *
 * Idempotent. Run once after deploying the schema changes that add the
 * Tenant + TenantHostname tables and `tenantId` nullable columns on
 * Branch / User / Patient / Treatment / Package / Lead / Room / Product
 * / Setting.
 *
 *   npx tsx prisma/backfill-tenant.ts
 *
 * Behaviour:
 *   1. Ensures a default tenant (slug=default) exists.
 *   2. Sets tenantId on every row that doesn't have one yet.
 *   3. Registers TenantHostname rows for any hostnames passed via the
 *      HOSTNAMES env var (comma-separated) or the DEFAULT_HOSTNAMES const.
 *
 * Safe to re-run. Will NOT overwrite an existing tenantId.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_TENANT_SLUG = "default";
const DEFAULT_HOSTNAMES = ["dental.scalamedic.com", "dental.scalamatic.com"];

async function main() {
  console.log("==> Phase A tenant backfill starting…");

  // 1. Ensure default tenant
  let tenant = await prisma.tenant.findUnique({ where: { slug: DEFAULT_TENANT_SLUG } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        slug: DEFAULT_TENANT_SLUG,
        name: "DentaCore",
        plan: "ENTERPRISE", // existing customer: not a metered SaaS tenant
        status: "ACTIVE",
      },
    });
    console.log(`   ✓ created default tenant: ${tenant.id}`);
  } else {
    console.log(`   • default tenant already exists: ${tenant.id}`);
  }
  const tenantId = tenant.id;

  // 2. Register hostnames
  const hostnames = (process.env.HOSTNAMES?.split(",") ?? DEFAULT_HOSTNAMES)
    .map((h) => h.trim())
    .filter(Boolean);
  for (const hostname of hostnames) {
    const existing = await prisma.tenantHostname.findUnique({ where: { hostname } });
    if (existing) {
      console.log(`   • hostname already registered: ${hostname}`);
      continue;
    }
    await prisma.tenantHostname.create({
      data: {
        tenantId,
        hostname,
        type: "CUSTOM",
        isVerified: true,
        isPrimary: hostname === hostnames[0],
        verifiedAt: new Date(),
      },
    });
    console.log(`   ✓ registered hostname: ${hostname}`);
  }

  // 3. Backfill tenantId on every model that has the column.
  // Phase A added it on: branch, user, patient, treatment, package, lead,
  //                       room, product, setting.
  // Phase B (current) extended it to clinical/financial entities.
  const models = [
    // Phase A (top-level entities)
    "branch", "user", "patient", "treatment", "package", "lead", "room", "product", "setting",
    // Phase B (PHI / clinical)
    "appointment", "invoice", "procedure", "consultationNote",
    "auditLog", "notification", "followUp", "toothRecord",
  ] as const;

  let totalUpdated = 0;
  for (const model of models) {
    // @ts-expect-error dynamic delegate access
    const result = await prisma[model].updateMany({
      where: { tenantId: null },
      data: { tenantId },
    });
    console.log(`   ✓ ${model.padEnd(17)} → backfilled ${result.count} rows`);
    totalUpdated += result.count;
  }

  console.log(`==> Done. Total rows updated: ${totalUpdated}`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Prisma seed: reproduce the Phase 1 dev tenant as real Postgres rows under
 * tenantId "acme-docks" (same branding/catalog/pricing the dev fixtures used),
 * a real builder_admin user (the former hardcoded dev login), and a
 * platform_admin for /admin. Idempotent.
 *
 * Run: `npm run db:seed`
 */
import { prisma } from "../src/lib/db.js";
import { seedAcme, seedPlatformAdmin, ACME_ADMIN_EMAIL, PLATFORM_ADMIN_EMAIL } from "../src/lib/acmeSeed.js";

async function main(): Promise<void> {
  const tenantId = await seedAcme();
  await seedPlatformAdmin();
  // eslint-disable-next-line no-console
  console.log(
    `Seeded tenant "${tenantId}" (builder_admin: ${ACME_ADMIN_EMAIL}); platform_admin: ${PLATFORM_ADMIN_EMAIL}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

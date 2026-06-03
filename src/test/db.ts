/**
 * Test-only DB helpers. Importing this pulls in the Prisma client bound to the
 * test DATABASE_URL set by vitest.setup.ts.
 */
import { prisma } from "@/lib/db";

export { prisma };

/** Wipe all rows. Tenant deletes cascade to every tenant-owned table; platform
 * users (tenantId null) have no cascade parent, so clear users explicitly. */
export async function resetDb(): Promise<void> {
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});
}

/** A standard residential floating-dock site fixture. */
export const SAMPLE_SITE = {
  depthAtEndLowWaterFt: 6,
  seasonalFluctuationFt: 2,
  bottom: "silt" as const,
  waveExposure: "inland_lake" as const,
  seasonalIce: true,
  shoreHeightAboveWaterFt: 3,
};

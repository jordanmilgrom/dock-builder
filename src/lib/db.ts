import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client for the process. In dev, Next.js hot-reload would
 * otherwise leak connections, so we stash it on globalThis.
 *
 * NOTE: application code should not import `prisma` directly for tenant-owned
 * tables — go through `createTenantScope` (src/lib/tenantScope.ts) so every
 * query is tenant-filtered. Direct use is reserved for tenant resolution,
 * onboarding, billing, and the platform-admin surface.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

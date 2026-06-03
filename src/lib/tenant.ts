import "server-only";
/**
 * Server-side tenant context. Resolves the request's tenant (slug → row) and
 * hands back a tenant-scoped repository. Every tenant route/page/component gets
 * its tenantId from here — never from a hardcoded constant.
 */
import { headers } from "next/headers";
import type { DockType, PricingProfile } from "@/engine";
import type { Entitlements, SubscriptionTier } from "./entitlements.js";
import { prisma } from "./db.js";
import { DOCK_TYPES } from "./seed.js";
import { TENANT_SLUG_HEADER } from "./tenantRouting.js";
import { createTenantScope, type TenantScope } from "./tenantScope.js";

export interface TenantMeta {
  id: string;
  slug: string;
  name: string;
  tier: SubscriptionTier;
  subscriptionStatus: "trialing" | "active" | "past_due" | "canceled";
  trialEndsAt: string | null;
  entitlements: Entitlements;
  leadCap: number | null;
  abandonedThresholdDays: number;
  branding: {
    name: string;
    logoText: string;
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    removeBadge: boolean;
  };
}

export interface TenantContext {
  meta: TenantMeta;
  scope: TenantScope;
}

export async function loadTenantBySlug(slug: string): Promise<TenantContext | null> {
  const t = await prisma.tenant.findUnique({ where: { slug }, include: { branding: true } });
  if (!t) return null;
  return { meta: toMeta(t), scope: createTenantScope(t.id) };
}

export async function loadTenantById(id: string): Promise<TenantContext | null> {
  const t = await prisma.tenant.findUnique({ where: { id }, include: { branding: true } });
  if (!t) return null;
  return { meta: toMeta(t), scope: createTenantScope(t.id) };
}

/** Slug injected by middleware (src/middleware.ts) into the request headers. */
export function requestTenantSlug(): string {
  return headers().get(TENANT_SLUG_HEADER) ?? (process.env.DEFAULT_TENANT_SLUG || "acme-docks");
}

/** The tenant for the current request, or null if the slug resolves to nothing. */
export async function getTenantContext(): Promise<TenantContext | null> {
  return loadTenantBySlug(requestTenantSlug());
}

/** Pricing profile per dock type for the client configurator (live preview). */
export async function loadProfiles(scope: TenantScope): Promise<Partial<Record<DockType, PricingProfile>>> {
  const out: Partial<Record<DockType, PricingProfile>> = {};
  await Promise.all(
    DOCK_TYPES.map(async (dt) => {
      const p = await scope.getPricingProfile(dt);
      if (p) out[dt] = p;
    }),
  );
  return out;
}

type TenantRow = NonNullable<
  Awaited<ReturnType<typeof prisma.tenant.findUnique>>
> & { branding: Awaited<ReturnType<typeof prisma.branding.findUnique>> };

function toMeta(t: TenantRow): TenantMeta {
  const b = t.branding;
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    tier: t.tier as SubscriptionTier,
    subscriptionStatus: t.subscriptionStatus as TenantMeta["subscriptionStatus"],
    trialEndsAt: t.trialEndsAt ? t.trialEndsAt.toISOString() : null,
    entitlements: t.entitlements as unknown as Entitlements,
    leadCap: t.leadCap ?? null,
    abandonedThresholdDays: t.abandonedThresholdDays,
    branding: {
      name: b?.name ?? t.name,
      logoText: b?.logoText ?? t.name.toUpperCase(),
      logoUrl: b?.logoUrl ?? null,
      primaryColor: b?.primaryColor ?? "#0e7490",
      secondaryColor: b?.secondaryColor ?? "#0f172a",
      removeBadge: b?.removeBadge ?? false,
    },
  };
}

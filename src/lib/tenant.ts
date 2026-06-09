import "server-only";
/**
 * Server-side tenant context. Resolves the request's tenant (slug → row) and
 * hands back a tenant-scoped repository. Every tenant route/page/component gets
 * its tenantId from here — never from a hardcoded constant.
 */
import { headers } from "next/headers";
import type { DockType, PricingProfile } from "@/engine";
import { resolveByCustomDomain } from "./customDomain.js";
import type { Entitlements, SubscriptionTier } from "./entitlements.js";
import { prisma } from "./db.js";
import { DOCK_TYPES } from "./seed.js";
import { CUSTOM_HOST_HEADER, TENANT_SLUG_HEADER } from "./tenantRouting.js";
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
  /** Phase 7: Premium tenants may land customers straight on the Canvas (skip the wizard). */
  skipWizardByDefault: boolean;
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

export type RequestResolution =
  | { kind: "tenant"; ctx: TenantContext }
  | { kind: "unverified_domain"; name: string }
  | { kind: "none" };

/**
 * Resolve the request's tenant, honoring (in order): a verified custom domain,
 * then the slug (subdomain/?tenant=/default). An unverified custom domain yields
 * a placeholder result so the layout can show "Domain not verified yet".
 */
export async function getRequestResolution(): Promise<RequestResolution> {
  const customHost = headers().get(CUSTOM_HOST_HEADER);
  if (customHost) {
    const r = await resolveByCustomDomain(customHost);
    if (r.kind === "verified") {
      const ctx = await loadTenantById(r.tenantId);
      if (ctx) return { kind: "tenant", ctx };
    } else if (r.kind === "unverified") {
      return { kind: "unverified_domain", name: r.name };
    }
    // kind === "none": unknown custom host → fall through to slug resolution.
  }
  const ctx = await loadTenantBySlug(requestTenantSlug());
  return ctx ? { kind: "tenant", ctx } : { kind: "none" };
}

/** The tenant for the current request, or null if it resolves to nothing. */
export async function getTenantContext(): Promise<TenantContext | null> {
  const r = await getRequestResolution();
  return r.kind === "tenant" ? r.ctx : null;
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
    skipWizardByDefault: t.skipWizardByDefault ?? false,
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

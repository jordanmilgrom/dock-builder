import "server-only";
/**
 * Shared API-boundary guards. Resolves the request tenant + customer session and
 * enforces ownership so individual routes stay thin. All design access is
 * checked against the tenant scope (cross-tenant ids 404 before reaching data).
 */
import { requireBuilder, requireBuilderAdmin } from "./authz.js";
import { getCustomerSession } from "./session.js";
import { getTenantContext, loadTenantById, type TenantContext } from "./tenant.js";
import type { Design } from "./types.js";

export type Guard<T> = { ok: true } & T | { ok: false; status: number };

/** Resolve the tenant for the request (404 if the slug maps to nothing). */
export async function requireTenant(): Promise<Guard<{ ctx: TenantContext }>> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, status: 404 };
  return { ok: true, ctx };
}

/** Tenant + signed-in customer. */
export async function requireCustomer(): Promise<Guard<{ ctx: TenantContext; customerId: string }>> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, status: 404 };
  const session = getCustomerSession(ctx.meta.id);
  if (!session) return { ok: false, status: 401 };
  return { ok: true, ctx, customerId: session.customerId };
}

/** Signed-in builder (admin/member) + their resolved tenant context. */
export async function requireBuilderTenant(): Promise<Guard<{ ctx: TenantContext; userId: string }>> {
  const builder = requireBuilder();
  if (!builder) return { ok: false, status: 403 };
  const ctx = await loadTenantById(builder.tenantId);
  if (!ctx) return { ok: false, status: 404 };
  return { ok: true, ctx, userId: builder.userId };
}

/** builder_admin only (billing, team, custom domain) — members get 403. */
export async function requireBuilderAdminTenant(): Promise<Guard<{ ctx: TenantContext; userId: string }>> {
  const admin = requireBuilderAdmin();
  if (!admin) return { ok: false, status: 403 };
  const ctx = await loadTenantById(admin.tenantId);
  if (!ctx) return { ok: false, status: 404 };
  return { ok: true, ctx, userId: admin.userId };
}

/** Tenant + customer + ownership of a specific design. */
export async function requireCustomerDesign(
  designId: string,
): Promise<Guard<{ ctx: TenantContext; customerId: string; design: Design }>> {
  const base = await requireCustomer();
  if (!base.ok) return base;
  const design = await base.ctx.scope.getDesign(designId);
  if (!design) return { ok: false, status: 404 };
  if (design.customerId !== base.customerId) return { ok: false, status: 403 };
  return { ok: true, ctx: base.ctx, customerId: base.customerId, design };
}

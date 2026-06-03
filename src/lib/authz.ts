import "server-only";
/**
 * Role enforcement at the API boundary (§8 Phase 2 item 3). Roles:
 * platform_admin, builder_admin, builder_member, customer. Customers use the
 * tenant-bound customer session (src/lib/session.ts); builder/platform users use
 * the builder session. Magic-link only — no passwords.
 */
import type { BuilderSession, UserRole } from "./auth.js";
import { getBuilderSession } from "./session.js";

/** The current builder/platform user if their role is allowed, else null. */
export function requireBuilderRole(roles: UserRole[]): BuilderSession | null {
  const s = getBuilderSession();
  if (!s || !roles.includes(s.role)) return null;
  return s;
}

/** A builder admin/member bound to a tenant (tenantId guaranteed non-null). */
export function requireBuilder(): (BuilderSession & { tenantId: string }) | null {
  const s = requireBuilderRole(["builder_admin", "builder_member"]);
  if (!s || !s.tenantId) return null;
  return s as BuilderSession & { tenantId: string };
}

/**
 * Pure predicate: only builder_admin can manage billing, team, tier-gated
 * settings (custom domain), or delete the tenant (§5.6). builder_member is
 * blocked from those surfaces.
 */
export function roleCanAdminister(role: UserRole): boolean {
  return role === "builder_admin";
}

/** A builder_admin bound to a tenant; null for members/platform/none. */
export function requireBuilderAdmin(): (BuilderSession & { tenantId: string }) | null {
  const s = requireBuilderRole(["builder_admin"]);
  if (!s || !s.tenantId) return null;
  return s as BuilderSession & { tenantId: string };
}

export function requirePlatformAdmin(): BuilderSession | null {
  return requireBuilderRole(["platform_admin"]);
}

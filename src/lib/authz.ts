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

export function requirePlatformAdmin(): BuilderSession | null {
  return requireBuilderRole(["platform_admin"]);
}

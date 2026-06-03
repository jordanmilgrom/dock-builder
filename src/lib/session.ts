import "server-only";
import { cookies } from "next/headers";
import { BUILDER_SESSION_COOKIE, SESSION_COOKIE, readBuilderSession, readSession, type BuilderSession } from "./auth.js";

/**
 * Current customer session for a given tenant. A session minted on another
 * tenant's subdomain (different tenantId) is ignored, so cross-tenant cookie
 * reuse cannot impersonate a customer.
 */
export function getCustomerSession(tenantId: string): { customerId: string; email: string } | null {
  const value = cookies().get(SESSION_COOKIE)?.value;
  const s = readSession(value);
  if (!s || s.tenantId !== tenantId) return null;
  return { customerId: s.customerId, email: s.email };
}

/** Current builder/platform session (role enforced by callers via authz). */
export function getBuilderSession(): BuilderSession | null {
  const value = cookies().get(BUILDER_SESSION_COOKIE)?.value;
  return readBuilderSession(value);
}

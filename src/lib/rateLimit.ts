/**
 * Lightweight in-memory fixed-window rate limiter (§5.8 abuse controls).
 *
 * Used to suppress synthetic-traffic abuse of lead creation. In-memory is
 * adequate for v1 (single region); a shared store is a later concern. Pure and
 * injectable `now` so it is unit-testable.
 *
 * Limits (documented in PHASE3.md): lead creation 30/min per IP, 200/hour per tenant.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateDecision {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (b.count >= limit) return { allowed: false, remaining: 0, resetAt: b.resetAt };
  b.count += 1;
  return { allowed: true, remaining: limit - b.count, resetAt: b.resetAt };
}

/** Test/maintenance helper. */
export function resetRateLimits(): void {
  buckets.clear();
}

export const LEAD_CREATION_LIMITS = {
  perIpPerMinute: { limit: 30, windowMs: 60_000 },
  perTenantPerHour: { limit: 200, windowMs: 60 * 60_000 },
} as const;

/**
 * Enforce both lead-creation limits. Returns which scope (if any) tripped so the
 * caller can respond 429. Only counts against the tenant bucket once the IP
 * bucket has passed.
 */
export function enforceLeadCreation(
  ip: string,
  tenantId: string,
  now = Date.now(),
): { ok: true } | { ok: false; scope: "ip" | "tenant" } {
  const ipRes = checkRateLimit(`lead:ip:${ip}`, LEAD_CREATION_LIMITS.perIpPerMinute.limit, LEAD_CREATION_LIMITS.perIpPerMinute.windowMs, now);
  if (!ipRes.allowed) return { ok: false, scope: "ip" };
  const tenantRes = checkRateLimit(`lead:tenant:${tenantId}`, LEAD_CREATION_LIMITS.perTenantPerHour.limit, LEAD_CREATION_LIMITS.perTenantPerHour.windowMs, now);
  if (!tenantRes.allowed) return { ok: false, scope: "tenant" };
  return { ok: true };
}

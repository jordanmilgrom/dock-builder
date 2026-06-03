/**
 * Tier → entitlement mapping (§10 decision #2, §8 Phase 2 item 5).
 *
 * Entitlements are denormalized onto the Tenant row by the Stripe webhook so the
 * customer flow can read them cheaply. Some entitlements are "record-only" in
 * Phase 2 — the boolean is stored now, but the behavior unlocks in a later phase
 * (abandonedFollowUp → Phase 3, webhooks → Phase 5).
 *
 * Pure module — no I/O — so it is trivially unit-testable and shared by the
 * webhook handler, onboarding, and the UI gating.
 */

export type SubscriptionTier = "starter" | "pro" | "premium";

export interface Entitlements {
  /** Remove the "Powered by" badge on the hosted page + PDF. */
  removeBadge: boolean;
  /** Use the tenant's branded PDF template (logo/colors) vs. the standard one. */
  brandedPdf: boolean;
  /** Record-only in Phase 2; abandoned-lead follow-up behavior unlocks in Phase 3. */
  abandonedFollowUp: boolean;
  /** Multiple pricing profiles / multi-location (Premium). */
  multipleProfiles: boolean;
  /** Record-only in Phase 2; outbound webhooks/integrations unlock in Phase 5. */
  webhooks: boolean;
}

export interface TierPlan {
  tier: SubscriptionTier;
  entitlements: Entitlements;
  /** Leads per month; null = unlimited. */
  leadCap: number | null;
}

const PLANS: Record<SubscriptionTier, TierPlan> = {
  starter: {
    tier: "starter",
    leadCap: 100,
    entitlements: {
      removeBadge: false,
      brandedPdf: false,
      abandonedFollowUp: false,
      multipleProfiles: false,
      webhooks: false,
    },
  },
  pro: {
    tier: "pro",
    leadCap: 1000,
    entitlements: {
      removeBadge: true,
      brandedPdf: true,
      abandonedFollowUp: true, // record-only (Phase 3 unlocks behavior)
      multipleProfiles: false,
      webhooks: false,
    },
  },
  premium: {
    tier: "premium",
    leadCap: null, // unlimited
    entitlements: {
      removeBadge: true,
      brandedPdf: true,
      abandonedFollowUp: true,
      multipleProfiles: true,
      webhooks: true, // record-only (Phase 5 unlocks behavior)
    },
  },
};

export function planForTier(tier: SubscriptionTier): TierPlan {
  return PLANS[tier];
}

export function entitlementsForTier(tier: SubscriptionTier): Entitlements {
  return PLANS[tier].entitlements;
}

export function leadCapForTier(tier: SubscriptionTier): number | null {
  return PLANS[tier].leadCap;
}

/**
 * A canceled / past_due subscription should not keep paid entitlements. We fall
 * back to the Starter floor while preserving the recorded tier elsewhere.
 */
export function effectiveEntitlements(
  tier: SubscriptionTier,
  status: "trialing" | "active" | "past_due" | "canceled",
): Entitlements {
  if (status === "canceled" || status === "past_due") {
    return PLANS.starter.entitlements;
  }
  return PLANS[tier].entitlements;
}

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
  /** Remove the "Powered by" badge on the hosted page + PDF (Pro+). */
  removeBadge: boolean;
  /** Use the tenant's branded PDF template (logo/colors) vs. the standard one (Pro+). */
  brandedPdf: boolean;
  /** Abandoned-lead follow-up behavior (Pro+, unlocked in Phase 3). */
  abandonedFollowUp: boolean;
  /** Multiple pricing profiles / multi-location (Premium). */
  multipleProfiles: boolean;
  /** Embeddable widget snippet (Pro+, Phase 4). */
  embed: boolean;
  /** Custom-domain configuration (Premium, Phase 4). */
  customDomain: boolean;
  /** Analytics dashboard (Premium, Phase 4). */
  analytics: boolean;
  /** Invite builder_member teammates (Pro+, Phase 4). */
  team: boolean;
  /** Record-only; outbound webhooks/integrations unlock in Phase 5. */
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
      embed: false,
      customDomain: false,
      analytics: false,
      team: false,
      webhooks: false,
    },
  },
  pro: {
    tier: "pro",
    leadCap: 1000,
    entitlements: {
      removeBadge: true,
      brandedPdf: true,
      abandonedFollowUp: true,
      multipleProfiles: false,
      embed: true, // Phase 4
      customDomain: false,
      analytics: false,
      team: true, // Phase 4
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
      embed: true,
      customDomain: true, // Phase 4
      analytics: true, // Phase 4
      team: true,
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

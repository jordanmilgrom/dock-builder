/**
 * Stripe Billing (§8 Phase 2 item 5). One subscription per tenant, 14-day free
 * trial, three products → entitlement booleans on the tenant row.
 *
 * The event→tenant-update logic is pure (no SDK, no network) so the webhook
 * handler is unit-testable with plain fixtures (lib/stripe.webhook.test.ts).
 * We never touch card data — Stripe-hosted Checkout only.
 */

import Stripe from "stripe";
import {
  effectiveEntitlements,
  leadCapForTier,
  type Entitlements,
  type SubscriptionTier,
} from "./entitlements.js";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export const TRIAL_DAYS = 14;

let _stripe: Stripe | null = null;
/** Lazily-constructed Stripe client (server-only paths). */
export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_unset", {
      apiVersion: "2025-02-24.acacia",
    });
  }
  return _stripe;
}

/** Map a Stripe price id → our tier using the configured env mapping. */
export function tierForPriceId(
  priceId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): SubscriptionTier | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === env.STRIPE_PRICE_PREMIUM) return "premium";
  return null;
}

export function priceIdForTier(tier: SubscriptionTier, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return { starter: env.STRIPE_PRICE_STARTER, pro: env.STRIPE_PRICE_PRO, premium: env.STRIPE_PRICE_PREMIUM }[tier];
}

/** Normalize Stripe's many subscription statuses into our four. */
export function mapStripeStatus(s: string): SubscriptionStatus {
  switch (s) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    default:
      return "active";
  }
}

export interface SubscriptionSnapshot {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
}

/**
 * Extract the fields we mirror from a Stripe subscription object. Tolerates the
 * minimal shape used in fixtures and the full SDK type.
 */
export function snapshotFromSubscription(
  sub: Stripe.Subscription,
  env: NodeJS.ProcessEnv = process.env,
): SubscriptionSnapshot | null {
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const tier = tierForPriceId(priceId, env);
  if (!tier) return null;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  return {
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    tier,
    status: mapStripeStatus(sub.status),
    trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
  };
}

export interface TenantBillingUpdate {
  tier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  stripeSubscriptionId: string;
  entitlements: Entitlements;
  leadCap: number | null;
}

/**
 * The tenant-row patch for a subscription snapshot. Entitlements follow the tier
 * while active/trialing, but a past_due/canceled subscription drops to the
 * Starter floor (no paid features, 100-lead cap) without losing the recorded tier.
 */
export function tenantBillingUpdate(snap: SubscriptionSnapshot): TenantBillingUpdate {
  const downgraded = snap.status === "past_due" || snap.status === "canceled";
  return {
    tier: snap.tier,
    subscriptionStatus: snap.status,
    trialEndsAt: snap.trialEndsAt,
    stripeSubscriptionId: snap.stripeSubscriptionId,
    entitlements: effectiveEntitlements(snap.tier, snap.status),
    leadCap: downgraded ? leadCapForTier("starter") : leadCapForTier(snap.tier),
  };
}

export type SupportedEventType =
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted";

/**
 * Reduce a Stripe webhook event to a tenant billing update keyed by Stripe
 * customer id, or null if the event is irrelevant. Pure — the route applies it.
 */
export function reduceWebhookEvent(
  event: Pick<Stripe.Event, "type" | "data">,
  env: NodeJS.ProcessEnv = process.env,
): { stripeCustomerId: string; update: TenantBillingUpdate } | null {
  if (!event.type.startsWith("customer.subscription.")) return null;
  const sub = event.data.object as Stripe.Subscription;
  // A deleted subscription always means canceled, regardless of its last status.
  if (event.type === "customer.subscription.deleted") {
    const snap = snapshotFromSubscription(sub, env);
    if (!snap) return null;
    const canceled: SubscriptionSnapshot = { ...snap, status: "canceled" };
    return { stripeCustomerId: canceled.stripeCustomerId, update: tenantBillingUpdate(canceled) };
  }
  const snap = snapshotFromSubscription(sub, env);
  if (!snap) return null;
  return { stripeCustomerId: snap.stripeCustomerId, update: tenantBillingUpdate(snap) };
}

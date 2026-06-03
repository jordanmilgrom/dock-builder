import { describe, expect, it, beforeEach } from "vitest";
import type Stripe from "stripe";
import { prisma, resetDb } from "@/test/db";
import { entitlementsForTier } from "@/lib/entitlements";
import {
  mapStripeStatus,
  reduceWebhookEvent,
  snapshotFromSubscription,
  tierForPriceId,
  tenantBillingUpdate,
} from "@/lib/stripe";

const ENV = {
  STRIPE_PRICE_STARTER: "price_starter",
  STRIPE_PRICE_PRO: "price_pro",
  STRIPE_PRICE_PREMIUM: "price_premium",
} as unknown as NodeJS.ProcessEnv;

function sub(priceId: string, status: string, opts: { id?: string; customer?: string; trialEnd?: number } = {}) {
  return {
    id: opts.id ?? "sub_1",
    customer: opts.customer ?? "cus_1",
    status,
    trial_end: opts.trialEnd ?? null,
    items: { data: [{ price: { id: priceId } }] },
  } as unknown as Stripe.Subscription;
}

function event(type: string, object: unknown): Pick<Stripe.Event, "type" | "data"> {
  return { type, data: { object } } as unknown as Pick<Stripe.Event, "type" | "data">;
}

describe("stripe price/status mapping", () => {
  it("maps price ids to tiers", () => {
    expect(tierForPriceId("price_pro", ENV)).toBe("pro");
    expect(tierForPriceId("price_premium", ENV)).toBe("premium");
    expect(tierForPriceId("price_starter", ENV)).toBe("starter");
    expect(tierForPriceId("price_unknown", ENV)).toBeNull();
  });

  it("normalizes stripe statuses into our four", () => {
    expect(mapStripeStatus("trialing")).toBe("trialing");
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("unpaid")).toBe("past_due");
    expect(mapStripeStatus("canceled")).toBe("canceled");
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled");
  });
});

describe("subscription snapshot → tenant billing update", () => {
  it("active Pro grants Pro entitlements + 1000 lead cap", () => {
    const snap = snapshotFromSubscription(sub("price_pro", "active"), ENV)!;
    const update = tenantBillingUpdate(snap);
    expect(update.tier).toBe("pro");
    expect(update.subscriptionStatus).toBe("active");
    expect(update.entitlements).toEqual(entitlementsForTier("pro"));
    expect(update.entitlements.removeBadge).toBe(true);
    expect(update.entitlements.brandedPdf).toBe(true);
    expect(update.leadCap).toBe(1000);
  });

  it("Premium is unlimited leads + webhooks entitlement recorded", () => {
    const update = tenantBillingUpdate(snapshotFromSubscription(sub("price_premium", "active"), ENV)!);
    expect(update.tier).toBe("premium");
    expect(update.leadCap).toBeNull();
    expect(update.entitlements.multipleProfiles).toBe(true);
    expect(update.entitlements.webhooks).toBe(true);
  });

  it("past_due drops to the Starter floor but keeps the recorded tier", () => {
    const update = tenantBillingUpdate(snapshotFromSubscription(sub("price_pro", "past_due"), ENV)!);
    expect(update.tier).toBe("pro");
    expect(update.subscriptionStatus).toBe("past_due");
    expect(update.entitlements).toEqual(entitlementsForTier("starter"));
    expect(update.entitlements.removeBadge).toBe(false);
    expect(update.leadCap).toBe(100);
  });

  it("returns null for non-subscription events and unknown prices", () => {
    expect(reduceWebhookEvent(event("invoice.paid", {}), ENV)).toBeNull();
    expect(reduceWebhookEvent(event("customer.subscription.updated", sub("price_x", "active")), ENV)).toBeNull();
  });
});

describe("webhook event flips tenant entitlements in the DB", () => {
  beforeEach(resetDb);

  async function makeTenant(customerId: string) {
    await prisma.tenant.create({
      data: {
        id: "t_billing",
        slug: "billing-co",
        name: "Billing Co",
        tier: "starter",
        subscriptionStatus: "trialing",
        stripeCustomerId: customerId,
        entitlements: entitlementsForTier("starter") as unknown as object,
        leadCap: 100,
      },
    });
  }

  async function apply(ev: Pick<Stripe.Event, "type" | "data">) {
    const reduced = reduceWebhookEvent(ev, ENV);
    if (!reduced) return 0;
    const res = await prisma.tenant.updateMany({
      where: { stripeCustomerId: reduced.stripeCustomerId },
      data: { ...reduced.update, entitlements: reduced.update.entitlements as unknown as object },
    });
    return res.count;
  }

  it("created(trialing Pro) → updated(active) → deleted flips entitlements each step", async () => {
    await makeTenant("cus_42");

    await apply(event("customer.subscription.created", sub("price_pro", "trialing", { customer: "cus_42", id: "sub_42" })));
    let t = await prisma.tenant.findUniqueOrThrow({ where: { id: "t_billing" } });
    expect(t.tier).toBe("pro");
    expect(t.subscriptionStatus).toBe("trialing");
    expect((t.entitlements as { removeBadge: boolean }).removeBadge).toBe(true);
    expect(t.leadCap).toBe(1000);
    expect(t.stripeSubscriptionId).toBe("sub_42");

    await apply(event("customer.subscription.updated", sub("price_pro", "active", { customer: "cus_42", id: "sub_42" })));
    t = await prisma.tenant.findUniqueOrThrow({ where: { id: "t_billing" } });
    expect(t.subscriptionStatus).toBe("active");
    expect((t.entitlements as { removeBadge: boolean }).removeBadge).toBe(true);

    await apply(event("customer.subscription.deleted", sub("price_pro", "active", { customer: "cus_42", id: "sub_42" })));
    t = await prisma.tenant.findUniqueOrThrow({ where: { id: "t_billing" } });
    expect(t.subscriptionStatus).toBe("canceled");
    expect((t.entitlements as { removeBadge: boolean }).removeBadge).toBe(false);
    expect(t.leadCap).toBe(100);
  });
});

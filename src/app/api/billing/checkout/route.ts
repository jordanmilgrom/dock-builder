import { NextResponse, type NextRequest } from "next/server";
import { requireBuilder } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { priceIdForTier, stripe, TRIAL_DAYS } from "@/lib/stripe";
import type { SubscriptionTier } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start a Stripe-hosted Checkout for a tier (subscription, 14-day trial). The
 * webhook flips entitlements once the subscription is created. Card fields are
 * Stripe-hosted — never touched here.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const builder = requireBuilder();
  if (!builder) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as { tier?: SubscriptionTier };
  const tier = body?.tier;
  if (tier !== "starter" && tier !== "pro" && tier !== "premium") {
    return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
  }
  const price = priceIdForTier(tier);
  if (!price) return NextResponse.json({ error: "price_not_configured" }, { status: 500 });

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: builder.tenantId } });

  let customerId = tenant.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe().customers.create({
      email: builder.email,
      name: tenant.name,
      metadata: { tenantId: tenant.id },
    });
    customerId = customer.id;
    await prisma.tenant.update({ where: { id: tenant.id }, data: { stripeCustomerId: customerId } });
  }

  const origin = req.nextUrl.origin;
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { trial_period_days: TRIAL_DAYS, metadata: { tenantId: tenant.id } },
    success_url: `${origin}/builder?billing=success`,
    cancel_url: `${origin}/builder?billing=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}

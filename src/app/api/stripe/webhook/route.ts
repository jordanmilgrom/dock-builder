import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { reduceWebhookEvent, stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook (§8 Phase 2 item 5). Verifies the signature, reduces the event
 * to a tenant billing update, and mirrors status + entitlements onto the tenant
 * row keyed by Stripe customer id. We never see card data.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    if (!sig || !secret) throw new Error("missing signature/secret");
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return NextResponse.json({ error: `invalid_signature: ${(err as Error).message}` }, { status: 400 });
  }

  const reduced = reduceWebhookEvent(event);
  if (reduced) {
    await prisma.tenant.updateMany({
      where: { stripeCustomerId: reduced.stripeCustomerId },
      data: { ...reduced.update, entitlements: reduced.update.entitlements as unknown as object },
    });
  }
  return NextResponse.json({ received: true });
}

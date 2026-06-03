import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/session";
import { getTenantContext } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ session: null });
  const session = getCustomerSession(ctx.meta.id);
  if (!session) return NextResponse.json({ session: null, tenant: { slug: ctx.meta.slug, name: ctx.meta.name } });
  const customer = await ctx.scope.getCustomer(session.customerId);
  return NextResponse.json({
    session: { customerId: session.customerId, email: customer?.email || null },
    tenant: { slug: ctx.meta.slug, name: ctx.meta.name },
  });
}

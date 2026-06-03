import { NextResponse, type NextRequest } from "next/server";
import { requireBuilder } from "@/lib/authz";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISIBILITY = new Set(["full", "total", "starting_from", "hidden_until_contact"]);

interface Body {
  dockType: string;
  priceVisibility?: string;
  items?: { id: string; unitPrice?: number; enabled?: boolean }[];
}

/**
 * Pricing-profile editor (§4): per-dock-type price visibility / contact-gate
 * setting and per-item price + enable toggles. Every write is scoped to the
 * builder's tenant — items are updated only when they belong to that tenant's
 * profile (no cross-tenant edits).
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const builder = requireBuilder();
  if (!builder) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as Body;
  if (!body?.dockType) return NextResponse.json({ error: "missing_dockType" }, { status: 400 });

  const profile = await prisma.pricingProfile.findFirst({
    where: { tenantId: builder.tenantId, dockType: body.dockType },
  });
  if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.priceVisibility && VISIBILITY.has(body.priceVisibility)) {
    await prisma.pricingProfile.update({ where: { id: profile.id }, data: { priceVisibility: body.priceVisibility } });
  }

  for (const it of body.items ?? []) {
    const data: Record<string, unknown> = {};
    if (typeof it.unitPrice === "number" && it.unitPrice >= 0) data.unitPrice = it.unitPrice;
    if (typeof it.enabled === "boolean") data.enabled = it.enabled;
    if (Object.keys(data).length === 0) continue;
    // Scope the write by tenantId AND profile: only this tenant's items are touched.
    await prisma.pricingItem.updateMany({
      where: { id: it.id, tenantId: builder.tenantId, profileId: profile.id },
      data,
    });
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { requireBuilderTenant } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the tenant's pricing profiles (any builder). */
export async function GET(): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  return NextResponse.json({ profiles: await auth.ctx.scope.listPricingProfiles() });
}

/** Create an additional pricing profile (Premium multipleProfiles). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  if (!auth.ctx.meta.entitlements.multipleProfiles) {
    return NextResponse.json({ error: "feature_locked", message: "Multiple pricing profiles are a Premium feature." }, { status: 403 });
  }
  const body = (await req.json()) as { name?: string; dockType?: string; labor?: { perFt2?: number; flat?: number } };
  if (!body.name || !body.dockType) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  const created = await auth.ctx.scope.createPricingProfile({
    name: body.name,
    dockType: body.dockType,
    ...(body.labor ? { labor: body.labor } : {}),
  });
  if (!created) return NextResponse.json({ error: "no_default_profile" }, { status: 400 });
  return NextResponse.json({ ok: true, profile: created });
}

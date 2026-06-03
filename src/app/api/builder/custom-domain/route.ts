import { NextResponse, type NextRequest } from "next/server";
import { setCustomDomain, verifyCustomDomain } from "@/lib/customDomain";
import { requireBuilderAdminTenant } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Configure a custom domain (Premium, builder_admin). Returns the DNS records. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireBuilderAdminTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  if (!auth.ctx.meta.entitlements.customDomain) {
    return NextResponse.json({ error: "feature_locked", message: "Custom domains are a Premium feature." }, { status: 403 });
  }
  const body = (await req.json()) as { domain?: string };
  const result = await setCustomDomain(auth.ctx.meta.id, body.domain ?? "");
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true, ...result });
}

/** Poll DNS to verify the TXT record (Premium, builder_admin). */
export async function PUT(): Promise<NextResponse> {
  const auth = await requireBuilderAdminTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  if (!auth.ctx.meta.entitlements.customDomain) {
    return NextResponse.json({ error: "feature_locked" }, { status: 403 });
  }
  const result = await verifyCustomDomain(auth.ctx.meta.id);
  return NextResponse.json({ ok: result.verified, ...result });
}

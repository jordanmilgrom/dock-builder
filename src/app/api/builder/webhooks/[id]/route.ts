import { NextResponse, type NextRequest } from "next/server";
import { requireBuilderAdminTenant } from "@/lib/routeAuth";
import { testFireEndpoint } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Test-fire an endpoint to confirm URL + signature path (builder_admin). */
export async function POST(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireBuilderAdminTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  if (!auth.ctx.meta.entitlements.webhooks) return NextResponse.json({ error: "feature_locked" }, { status: 403 });
  const result = await testFireEndpoint(auth.ctx.scope, params.id);
  return NextResponse.json(result);
}

/** Revoke an endpoint (builder_admin). */
export async function DELETE(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireBuilderAdminTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const ok = await auth.ctx.scope.deleteWebhookEndpoint(params.id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

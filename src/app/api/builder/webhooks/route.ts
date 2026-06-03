import { NextResponse, type NextRequest } from "next/server";
import { requireBuilderAdminTenant, requireBuilderTenant } from "@/lib/routeAuth";
import { createEndpoint, WEBHOOK_EVENT_KINDS } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List webhook endpoints (secret never returned). */
export async function GET(): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  return NextResponse.json({ endpoints: await auth.ctx.scope.listWebhookEndpoints(), eventKinds: WEBHOOK_EVENT_KINDS });
}

/** Create an endpoint (builder_admin + Premium). Returns the signing secret ONCE. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireBuilderAdminTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  if (!auth.ctx.meta.entitlements.webhooks) {
    return NextResponse.json({ error: "feature_locked", message: "Webhooks are a Premium feature." }, { status: 403 });
  }
  const body = (await req.json()) as { url?: string; eventKinds?: string[] };
  const result = await createEndpoint(auth.ctx.scope, body.url ?? "", body.eventKinds ?? []);
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  // Secret shown exactly once.
  return NextResponse.json({ ok: true, endpoint: result.endpoint, secret: result.secret });
}

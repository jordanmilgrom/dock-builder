import { NextResponse, type NextRequest } from "next/server";
import type { DockConfig } from "@/engine";
import { evaluate, saveRevision } from "@/lib/designService";
import { requireCustomerDesign } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireCustomerDesign(params.id);
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const revision = await auth.ctx.scope.getRevision(auth.design.currentRevisionId);
  if (!revision) return NextResponse.json({ error: "no_revision" }, { status: 404 });
  return NextResponse.json({ design: auth.design, revision, ...(await evaluate(auth.ctx.scope, revision.config)) });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireCustomerDesign(params.id);
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const body = (await req.json()) as { config?: DockConfig };
  if (!body?.config) return NextResponse.json({ error: "missing_config" }, { status: 400 });
  const revision = await saveRevision(auth.ctx.scope, params.id, body.config, auth.customerId);
  if (!revision) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ revision, ...(await evaluate(auth.ctx.scope, revision.config)) });
}

import { NextResponse, type NextRequest } from "next/server";
import { restoreOrBranch } from "@/lib/designService";
import { requireCustomerDesign } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireCustomerDesign(params.id);
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const revisions = (await auth.ctx.scope.listRevisions(params.id)).map((r) => ({
    id: r.id,
    version: r.version,
    changeSummary: r.changeSummary,
    authorRole: r.authorRole,
    createdAt: r.createdAt,
    total: r.estimateSnapshot?.total ?? null,
    currency: r.estimateSnapshot?.currency ?? "USD",
    isCurrent: r.id === auth.design.currentRevisionId,
  }));
  return NextResponse.json({ revisions });
}

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireCustomerDesign(params.id);
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const body = (await req.json()) as { fromVersion?: number; mode?: "restore" | "branch" };
  if (typeof body?.fromVersion !== "number" || (body.mode !== "restore" && body.mode !== "branch")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const revision = await restoreOrBranch(auth.ctx.scope, params.id, body.fromVersion, body.mode, auth.customerId);
  if (!revision) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ revision });
}

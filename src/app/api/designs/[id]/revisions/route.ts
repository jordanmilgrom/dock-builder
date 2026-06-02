import { NextResponse, type NextRequest } from "next/server";
import { restoreOrBranch } from "@/lib/designService";
import { getSession } from "@/lib/session";
import * as store from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

function authorize(designId: string): { ok: true; customerId: string } | { ok: false; status: number } {
  const session = getSession();
  if (!session) return { ok: false, status: 401 };
  const design = store.getDesign(designId);
  if (!design) return { ok: false, status: 404 };
  if (design.customerId !== session.customerId) return { ok: false, status: 403 };
  return { ok: true, customerId: session.customerId };
}

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = authorize(params.id);
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const design = store.getDesign(params.id)!;
  const revisions = store.listRevisions(params.id).map((r) => ({
    id: r.id,
    version: r.version,
    changeSummary: r.changeSummary,
    authorRole: r.authorRole,
    createdAt: r.createdAt,
    total: r.estimateSnapshot?.total ?? null,
    currency: r.estimateSnapshot?.currency ?? "USD",
    isCurrent: r.id === design.currentRevisionId,
  }));
  return NextResponse.json({ revisions });
}

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = authorize(params.id);
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const body = (await req.json()) as { fromVersion?: number; mode?: "restore" | "branch" };
  if (typeof body?.fromVersion !== "number" || (body.mode !== "restore" && body.mode !== "branch")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const revision = restoreOrBranch(params.id, body.fromVersion, body.mode, auth.customerId);
  if (!revision) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ revision });
}

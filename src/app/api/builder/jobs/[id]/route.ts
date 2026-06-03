import { NextResponse, type NextRequest } from "next/server";
import { advanceJob } from "@/lib/jobs";
import { requireBuilderTenant } from "@/lib/routeAuth";
import type { JobStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Advance a job phase or update its notes (any builder; jobTracking entitled). */
export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  if (!auth.ctx.meta.entitlements.jobTracking) {
    return NextResponse.json({ error: "feature_locked" }, { status: 403 });
  }
  const body = (await req.json()) as { to?: JobStatus };
  if (!body.to) return NextResponse.json({ error: "missing_to" }, { status: 400 });
  const result = await advanceJob(auth.ctx.scope, params.id, body.to);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 409 });
  }
  return NextResponse.json({ ok: true, status: result.status });
}

/** Update job notes. */
export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  if (!auth.ctx.meta.entitlements.jobTracking) {
    return NextResponse.json({ error: "feature_locked" }, { status: 403 });
  }
  const body = (await req.json()) as { notes?: string };
  if (typeof body.notes !== "string") return NextResponse.json({ error: "missing_notes" }, { status: 400 });
  const updated = await auth.ctx.scope.updateJob(params.id, { notes: body.notes.slice(0, 5000) });
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

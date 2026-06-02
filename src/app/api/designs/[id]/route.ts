import { NextResponse, type NextRequest } from "next/server";
import type { DockConfig } from "@/engine";
import { evaluate, saveRevision } from "@/lib/designService";
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
  const revision = store.getRevision(design.currentRevisionId);
  if (!revision) return NextResponse.json({ error: "no_revision" }, { status: 404 });
  return NextResponse.json({ design, revision, ...evaluate(revision.config) });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = authorize(params.id);
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const body = (await req.json()) as { config?: DockConfig };
  if (!body?.config) return NextResponse.json({ error: "missing_config" }, { status: 400 });
  const revision = saveRevision(params.id, body.config, auth.customerId);
  if (!revision) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ revision, ...evaluate(revision.config) });
}

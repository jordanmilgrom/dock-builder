import { NextResponse, type NextRequest } from "next/server";
import type { DockConfig } from "@/engine";
import { sendQuote } from "@/lib/leadService";
import { requireBuilderTenant } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Builder sends a quote or re-quote (§5.5). Optional `config` revises first. */
export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as { config?: DockConfig };

  const result = await sendQuote(auth.ctx.scope, params.id, auth.userId, body.config ? { config: body.config } : {});
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({
    ok: true,
    status: result.lead.status,
    quotedRevisionId: result.lead.quotedRevisionId,
    revision: { id: result.revision.id, version: result.revision.version },
  });
}

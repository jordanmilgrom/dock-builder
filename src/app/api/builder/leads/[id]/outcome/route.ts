import { NextResponse, type NextRequest } from "next/server";
import { setOutcome } from "@/lib/leadService";
import { requireBuilderTenant } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Close the quote phase: accepted (Won) or closed (Lost) — builder vocabulary. */
export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const body = (await req.json()) as { outcome?: "accepted" | "closed" };
  if (body.outcome !== "accepted" && body.outcome !== "closed") {
    return NextResponse.json({ error: "invalid_outcome" }, { status: 400 });
  }
  const result = await setOutcome(auth.ctx.scope, params.id, body.outcome);
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, status: result.status });
}

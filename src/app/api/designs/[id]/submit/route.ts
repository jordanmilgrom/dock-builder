import { NextResponse, type NextRequest } from "next/server";
import { submitDesign } from "@/lib/leadService";
import { requireCustomerDesign } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Customer submits a design for the builder to review (§5.4 → submitted). */
export async function POST(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireCustomerDesign(params.id);
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });

  const result = await submitDesign(auth.ctx.scope, params.id);
  if ("error" in result) {
    const status = result.error === "no_lead" ? 400 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, status: result.status });
}

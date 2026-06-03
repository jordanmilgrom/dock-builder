import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireBuilderTenant } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Builder settings: abandoned-lead threshold override (§10 #7), range 1–30. */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const body = (await req.json()) as { abandonedThresholdDays?: number };
  const days = body.abandonedThresholdDays;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 30) {
    return NextResponse.json({ error: "out_of_range" }, { status: 400 });
  }
  await prisma.tenant.update({ where: { id: auth.ctx.meta.id }, data: { abandonedThresholdDays: days } });
  return NextResponse.json({ ok: true, abandonedThresholdDays: days });
}

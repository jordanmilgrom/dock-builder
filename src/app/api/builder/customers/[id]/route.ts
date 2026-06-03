import { NextResponse, type NextRequest } from "next/server";
import { requireBuilderTenant } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const NOTES_MAX = 5000;

/** Update a customer's CRM notes (§5.6). 5,000-char cap enforced here. */
export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  const body = (await req.json()) as { notes?: string };
  if (typeof body.notes !== "string") return NextResponse.json({ error: "missing_notes" }, { status: 400 });
  if (body.notes.length > NOTES_MAX) return NextResponse.json({ error: "notes_too_long" }, { status: 400 });

  // updateCustomer is tenant-scoped: a customer id from another tenant updates 0 rows.
  const updated = await auth.ctx.scope.updateCustomer(params.id, { notes: body.notes });
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { requireBuilderAdminTenant, requireBuilderTenant } from "@/lib/routeAuth";
import { inviteMember, listTeam } from "@/lib/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List members + pending invitations (any builder). */
export async function GET(): Promise<NextResponse> {
  const auth = await requireBuilderTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  return NextResponse.json(await listTeam(auth.ctx.meta.id));
}

/** Invite a teammate (builder_admin only, gated by entitlements.team). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireBuilderAdminTenant();
  if (!auth.ok) return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  if (!auth.ctx.meta.entitlements.team) {
    return NextResponse.json({ error: "feature_locked", message: "Team is a Pro feature." }, { status: 403 });
  }
  const body = (await req.json()) as { email?: string };
  const result = await inviteMember(auth.ctx.meta.id, body.email ?? "");
  if ("error" in result) return NextResponse.json(result, { status: 400 });

  // Dev: surface the accept link (no SMTP). Prod would email it.
  const acceptUrl = `${req.nextUrl.origin}/api/invitations/accept?token=${encodeURIComponent(result.token)}`;
  return NextResponse.json({ ok: true, email: result.email, expiresAt: result.expiresAt, acceptUrl });
}

import { NextResponse, type NextRequest } from "next/server";
import { BUILDER_SESSION_COOKIE, createBuilderSessionValue, SESSION_MAX_AGE_SEC } from "@/lib/auth";
import { acceptInvitation } from "@/lib/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Accept a team invitation (magic link). Signs the new member in → /builder. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const result = await acceptInvitation(token);
  if ("error" in result) {
    return NextResponse.redirect(new URL(`/builder/login?invite=${result.error}`, req.nextUrl.origin));
  }
  const res = NextResponse.redirect(new URL("/builder", req.nextUrl.origin));
  res.cookies.set(
    BUILDER_SESSION_COOKIE,
    createBuilderSessionValue({ userId: result.userId, email: result.email, role: "builder_member", tenantId: result.tenantId }),
    { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SEC },
  );
  return res;
}

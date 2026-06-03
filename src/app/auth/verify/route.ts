import { NextResponse, type NextRequest } from "next/server";
import {
  BUILDER_SESSION_COOKIE,
  createBuilderSessionValue,
  createSessionCookieValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  verifyMagicToken,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createTenantScope } from "@/lib/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SEC } as const;

/** Verify a magic link, sign in (customer OR builder/platform), and redirect. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token") ?? undefined;
  const m = verifyMagicToken(token);
  if (!m) return NextResponse.redirect(new URL("/?error=invalid_link", req.nextUrl.origin));

  if (m.kind === "builder") {
    const user = await prisma.user.findFirst({
      where: { email: m.email.toLowerCase(), tenantId: m.tenantId },
    });
    if (!user) return NextResponse.redirect(new URL("/?error=no_account", req.nextUrl.origin));
    const dest = user.role === "platform_admin" ? "/admin" : "/builder";
    const res = NextResponse.redirect(new URL(dest, req.nextUrl.origin));
    res.cookies.set(
      BUILDER_SESSION_COOKIE,
      createBuilderSessionValue({ userId: user.id, email: user.email, role: user.role, tenantId: user.tenantId }),
      COOKIE_OPTS,
    );
    return res;
  }

  // Customer sign-in, scoped to the link's tenant.
  if (!m.tenantId) return NextResponse.redirect(new URL("/?error=invalid_link", req.nextUrl.origin));
  const scope = createTenantScope(m.tenantId);
  const customer = await scope.upsertCustomer(m.email);
  const res = NextResponse.redirect(new URL("/designs", req.nextUrl.origin));
  res.cookies.set(SESSION_COOKIE, createSessionCookieValue(customer.id, m.email, m.tenantId), COOKIE_OPTS);
  return res;
}

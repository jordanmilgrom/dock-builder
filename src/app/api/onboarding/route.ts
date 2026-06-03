import { NextResponse, type NextRequest } from "next/server";
import { BUILDER_SESSION_COOKIE, createBuilderSessionValue, SESSION_MAX_AGE_SEC } from "@/lib/auth";
import { signUpBuilder } from "@/lib/onboarding";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Builder self-serve signup → tenant + trial, then sign the owner in (§5.2). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as { email?: string; tenantName?: string; slug?: string };
  if (!body?.email || !body?.tenantName || !body?.slug) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const result = await signUpBuilder({ email: body.email, tenantName: body.tenantName, slug: body.slug });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const user = await prisma.user.findFirstOrThrow({ where: { id: result.userId } });
  const res = NextResponse.json({
    ok: true,
    tenantId: result.tenantId,
    slug: result.slug,
    trialEndsAt: result.trialEndsAt,
    hostedHint: `?tenant=${result.slug}`,
  });
  res.cookies.set(
    BUILDER_SESSION_COOKIE,
    createBuilderSessionValue({ userId: user.id, email: user.email, role: user.role, tenantId: user.tenantId }),
    { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SEC },
  );
  return res;
}

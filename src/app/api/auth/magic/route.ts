import { NextResponse, type NextRequest } from "next/server";
import { createMagicToken } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Request a customer magic sign-in link (dev: returned in the response). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "unknown_tenant" }, { status: 404 });
  const body = (await req.json()) as { email?: string };
  if (!body?.email || !EMAIL_RE.test(body.email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const token = createMagicToken(body.email, { kind: "customer", tenantId: ctx.meta.id });
  const magicLink = `${req.nextUrl.origin}/auth/verify?token=${encodeURIComponent(token)}`;
  return NextResponse.json({ ok: true, magicLink });
}

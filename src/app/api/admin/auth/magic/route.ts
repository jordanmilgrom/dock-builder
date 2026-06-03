import { NextResponse, type NextRequest } from "next/server";
import { createMagicToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Request a platform_admin magic-link (tenantId null; dev: returned inline). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as { email?: string };
  if (!body?.email || !EMAIL_RE.test(body.email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const token = createMagicToken(body.email, { kind: "builder", tenantId: null });
  const magicLink = `${req.nextUrl.origin}/auth/verify?token=${encodeURIComponent(token)}`;
  return NextResponse.json({ ok: true, magicLink });
}

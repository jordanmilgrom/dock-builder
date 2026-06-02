import { NextResponse, type NextRequest } from "next/server";
import { createMagicToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Request a magic sign-in link (dev: returned in the response, not emailed). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as { email?: string };
  if (!body?.email || !EMAIL_RE.test(body.email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const magicLink = `${req.nextUrl.origin}/auth/verify?token=${encodeURIComponent(createMagicToken(body.email))}`;
  return NextResponse.json({ ok: true, magicLink });
}

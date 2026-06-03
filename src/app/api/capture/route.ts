import { NextResponse, type NextRequest } from "next/server";
import {
  createMagicToken,
  createSessionCookieValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
} from "@/lib/auth";
import { captureContact } from "@/lib/designService";
import { requireCustomerDesign } from "@/lib/routeAuth";
import type { ConsentSource } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  email: string;
  optedIn: boolean;
  source: ConsentSource;
  designId: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as Body;
  if (!body?.email || !EMAIL_RE.test(body.email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const auth = await requireCustomerDesign(body.designId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "no_session" : "forbidden" }, { status: auth.status });
  }

  await captureContact(auth.ctx.scope, auth.customerId, body.designId, body.email, !!body.optedIn, body.source);

  // Dev-grade magic link (no SMTP): surface it so the customer can "come back".
  const magicLink = `${req.nextUrl.origin}/auth/verify?token=${encodeURIComponent(
    createMagicToken(body.email, { kind: "customer", tenantId: auth.ctx.meta.id }),
  )}`;

  const res = NextResponse.json({ ok: true, magicLink });
  res.cookies.set(SESSION_COOKIE, createSessionCookieValue(auth.customerId, body.email, auth.ctx.meta.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return res;
}

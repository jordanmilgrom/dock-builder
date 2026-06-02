import { NextResponse, type NextRequest } from "next/server";
import {
  createMagicToken,
  createSessionCookieValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
} from "@/lib/auth";
import { captureContact } from "@/lib/designService";
import { getSession } from "@/lib/session";
import * as store from "@/lib/store";
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
  const session = getSession();
  if (!session) return NextResponse.json({ error: "no_session" }, { status: 401 });

  const design = store.getDesign(body.designId);
  if (!design || design.customerId !== session.customerId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  captureContact(session.customerId, body.designId, body.email, !!body.optedIn, body.source);

  // Dev-grade magic link (no SMTP in Phase 1): surface it to the caller so the
  // customer can "come back" to their drafts.
  const origin = req.nextUrl.origin;
  const magicLink = `${origin}/auth/verify?token=${encodeURIComponent(createMagicToken(body.email))}`;

  const res = NextResponse.json({ ok: true, magicLink });
  // Refresh the session cookie now that it carries an email.
  res.cookies.set(SESSION_COOKIE, createSessionCookieValue(session.customerId, body.email), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return res;
}

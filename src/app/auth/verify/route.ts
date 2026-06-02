import { NextResponse, type NextRequest } from "next/server";
import {
  createSessionCookieValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  verifyMagicToken,
} from "@/lib/auth";
import * as store from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verify a magic link, sign the customer in, and send them to their designs. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token") ?? undefined;
  const email = verifyMagicToken(token);
  if (!email) {
    return NextResponse.redirect(new URL("/?error=invalid_link", req.nextUrl.origin));
  }
  const customer = store.upsertCustomer(email);
  const res = NextResponse.redirect(new URL("/designs", req.nextUrl.origin));
  res.cookies.set(SESSION_COOKIE, createSessionCookieValue(customer.id, email), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return res;
}

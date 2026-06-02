/**
 * Email + magic-link identity (spec §10 decision #4). No passwords, no OAuth.
 *
 * Dev-grade: HMAC-signed tokens (node crypto). The save/price gates capture an
 * email and mint a magic link; verifying it sets a signed session cookie. In
 * this dev environment the link is returned to the caller / logged rather than
 * emailed (no SMTP in Phase 1).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.AUTH_SECRET ?? "dev-only-insecure-secret-change-in-prod";
export const SESSION_COOKIE = "dock_session";
const MAGIC_TTL_MS = 1000 * 60 * 30; // 30 min
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function encode(obj: unknown): string {
  const body = b64url(JSON.stringify(obj));
  return `${body}.${sign(body)}`;
}

function decode<T>(token: string | undefined): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

interface MagicPayload {
  email: string;
  exp: number;
}
interface SessionPayload {
  customerId: string;
  email: string;
  exp: number;
}

export function createMagicToken(email: string, now = Date.now()): string {
  return encode({ email, exp: now + MAGIC_TTL_MS } satisfies MagicPayload);
}

export function verifyMagicToken(token: string | undefined, now = Date.now()): string | null {
  const p = decode<MagicPayload>(token);
  if (!p || p.exp < now) return null;
  return p.email;
}

export function createSessionCookieValue(customerId: string, email: string, now = Date.now()): string {
  return encode({ customerId, email, exp: now + SESSION_TTL_MS } satisfies SessionPayload);
}

export function readSession(cookieValue: string | undefined, now = Date.now()): { customerId: string; email: string } | null {
  const p = decode<SessionPayload>(cookieValue);
  if (!p || p.exp < now) return null;
  return { customerId: p.customerId, email: p.email };
}

export const SESSION_MAX_AGE_SEC = Math.floor(SESSION_TTL_MS / 1000);

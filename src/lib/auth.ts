/**
 * Email + magic-link identity (§10 decision #4). No passwords, no OAuth — for
 * both customers AND builder users (Phase 2). HMAC-signed tokens (node crypto).
 *
 * Sessions are tenant-bound: a customer session minted on tenant A's subdomain
 * carries tenantId A and is rejected when presented to tenant B. Builder/platform
 * sessions carry a role enforced at the API boundary (src/lib/authz.ts).
 *
 * Dev-grade: links are returned to the caller / logged rather than emailed.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.AUTH_SECRET ?? "dev-only-insecure-secret-change-in-prod";
export const SESSION_COOKIE = "dock_session";
export const BUILDER_SESSION_COOKIE = "dock_builder_session";
const MAGIC_TTL_MS = 1000 * 60 * 30; // 30 min
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type MagicKind = "customer" | "builder";
export type UserRole = "platform_admin" | "builder_admin" | "builder_member";

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

// ---- Magic links -----------------------------------------------------------

interface MagicPayload {
  email: string;
  kind: MagicKind;
  /** Tenant the link is scoped to (customer links + builder links). */
  tenantId: string | null;
  exp: number;
}

export interface MagicResult {
  email: string;
  kind: MagicKind;
  tenantId: string | null;
}

export function createMagicToken(
  email: string,
  opts: { kind?: MagicKind; tenantId?: string | null } = {},
  now = Date.now(),
): string {
  return encode({
    email,
    kind: opts.kind ?? "customer",
    tenantId: opts.tenantId ?? null,
    exp: now + MAGIC_TTL_MS,
  } satisfies MagicPayload);
}

export function verifyMagicToken(token: string | undefined, now = Date.now()): MagicResult | null {
  const p = decode<MagicPayload>(token);
  if (!p || p.exp < now) return null;
  return { email: p.email, kind: p.kind ?? "customer", tenantId: p.tenantId ?? null };
}

// ---- Customer session ------------------------------------------------------

interface SessionPayload {
  customerId: string;
  email: string;
  tenantId: string;
  exp: number;
}

export function createSessionCookieValue(
  customerId: string,
  email: string,
  tenantId: string,
  now = Date.now(),
): string {
  return encode({ customerId, email, tenantId, exp: now + SESSION_TTL_MS } satisfies SessionPayload);
}

export function readSession(
  cookieValue: string | undefined,
  now = Date.now(),
): { customerId: string; email: string; tenantId: string } | null {
  const p = decode<SessionPayload>(cookieValue);
  if (!p || p.exp < now) return null;
  return { customerId: p.customerId, email: p.email, tenantId: p.tenantId };
}

// ---- Builder / platform session --------------------------------------------

interface BuilderSessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  /** null for platform_admin. */
  tenantId: string | null;
  exp: number;
}

export interface BuilderSession {
  userId: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
}

export function createBuilderSessionValue(
  user: BuilderSession,
  now = Date.now(),
): string {
  return encode({ ...user, exp: now + SESSION_TTL_MS } satisfies BuilderSessionPayload);
}

export function readBuilderSession(cookieValue: string | undefined, now = Date.now()): BuilderSession | null {
  const p = decode<BuilderSessionPayload>(cookieValue);
  if (!p || p.exp < now) return null;
  return { userId: p.userId, email: p.email, role: p.role, tenantId: p.tenantId };
}

export const SESSION_MAX_AGE_SEC = Math.floor(SESSION_TTL_MS / 1000);

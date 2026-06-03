import "server-only";
/**
 * Outbound webhooks (§5.9, §7.3, Phase 5). Tenant builders register HTTPS
 * endpoints; lead/job/design events enqueue signed deliveries that a cron drains
 * with a retry schedule. Gated by entitlements.webhooks (Premium).
 *
 * Signature: `X-Dock-Signature: t={ts},v1={HMAC_SHA256(secret, ts + "." + body)}`.
 * Verification recipe in WEBHOOKS.md.
 *
 * The signing secret is symmetric, so it must be stored to sign — it is shown
 * exactly once at creation and never returned by read APIs.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./db.js";
import type { TenantScope } from "./tenantScope.js";
import type { WebhookEndpointSummary } from "./types.js";

export const WEBHOOK_EVENT_KINDS = [
  "lead.created",
  "lead.submitted",
  "lead.quoted",
  "lead.accepted",
  "lead.closed",
  "job.in_production",
  "job.install_scheduled",
  "job.complete",
  "design.revised",
] as const;
export type WebhookEventKind = (typeof WEBHOOK_EVENT_KINDS)[number];

/** Retry gaps between delivery attempts (§ default): 30s, 5m, 30m, 2h, 12h. */
export const RETRY_DELAYS_MS = [30_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
export const MAX_ATTEMPTS = 5;

export const SIGNATURE_HEADER = "x-dock-signature";

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

/** Build the signature header value for a payload at a given unix timestamp. */
export function signPayload(secret: string, timestampSec: number, body: string): string {
  const mac = createHmac("sha256", secret).update(`${timestampSec}.${body}`).digest("hex");
  return `t=${timestampSec},v1=${mac}`;
}

/** Verify a signature header (used by receivers; exposed for tests + docs). */
export function verifySignature(secret: string, header: string, body: string): boolean {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const ts = Number(parts.t);
  if (!Number.isFinite(ts) || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  const a = Buffer.from(parts.v1);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface WebhookPayload {
  event: WebhookEventKind;
  at: string;
  data: Record<string, unknown>;
}

export function buildEventPayload(kind: WebhookEventKind, data: Record<string, unknown>, now = new Date()): WebhookPayload {
  return { event: kind, at: now.toISOString(), data };
}

// ---- Endpoint management (tenant-scoped) -----------------------------------

export async function createEndpoint(
  scope: TenantScope,
  url: string,
  eventKinds: string[],
): Promise<{ endpoint: WebhookEndpointSummary; secret: string } | { error: "invalid_url" | "no_events" }> {
  if (!/^https:\/\/.+/i.test(url)) return { error: "invalid_url" };
  const kinds = eventKinds.filter((k) => (WEBHOOK_EVENT_KINDS as readonly string[]).includes(k));
  if (kinds.length === 0) return { error: "no_events" };
  const secret = generateWebhookSecret();
  const endpoint = await scope.createWebhookEndpoint({ url, secret, eventKinds: kinds });
  return { endpoint, secret };
}

/** Fire an event to every subscribed endpoint for the tenant (enqueue only). */
export async function fireEvent(
  scope: TenantScope,
  kind: WebhookEventKind,
  data: Record<string, unknown>,
): Promise<number> {
  return scope.enqueueWebhookEvent(kind, buildEventPayload(kind, data));
}

/** Immediately send a signed test delivery to confirm URL + signature path. */
export async function testFireEndpoint(
  scope: TenantScope,
  endpointId: string,
  opts: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, tenantId: scope.tenantId } });
  if (!endpoint) return { ok: false, error: "not_found" };
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const body = JSON.stringify(buildEventPayload("lead.created", { test: true }, now));
  const sig = signPayload(endpoint.secret, Math.floor(now.getTime() / 1000), body);
  try {
    const res = await fetchImpl(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: sig },
      body,
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ---- Queue drain (platform cron) -------------------------------------------

export interface DrainResult {
  processed: number;
  delivered: number;
  retried: number;
  failed: number;
}

/**
 * Dispatch all due deliveries. Cross-tenant (cron), so it queries prisma
 * directly but signs each with its endpoint's own secret. `fetchImpl`/`now` are
 * injectable for tests.
 */
export async function drainWebhooks(opts: { fetchImpl?: typeof fetch; now?: Date; limit?: number } = {}): Promise<DrainResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "pending", nextAttemptAt: { lte: now } },
    include: { endpoint: true },
    orderBy: { nextAttemptAt: "asc" },
    take: opts.limit ?? 100,
  });

  const result: DrainResult = { processed: 0, delivered: 0, retried: 0, failed: 0 };
  for (const d of due) {
    result.processed += 1;
    const attempt = d.attempt + 1;
    const body = JSON.stringify(d.payload);
    const sig = signPayload(d.endpoint.secret, Math.floor(now.getTime() / 1000), body);

    let ok = false;
    let errMsg: string | null = null;
    try {
      const res = await fetchImpl(d.endpoint.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: sig },
        body,
      });
      ok = res.ok;
      if (!ok) errMsg = `status ${res.status}`;
    } catch (err) {
      errMsg = (err as Error).message;
    }

    if (ok) {
      await prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: "delivered", attempt, lastError: null } });
      await prisma.webhookEndpoint.update({ where: { id: d.endpointId }, data: { lastDeliveryAt: now, lastDeliveryStatus: "delivered" } });
      result.delivered += 1;
    } else if (attempt >= MAX_ATTEMPTS) {
      await prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: "failed", attempt, lastError: errMsg } });
      await prisma.webhookEndpoint.update({ where: { id: d.endpointId }, data: { lastDeliveryAt: now, lastDeliveryStatus: "failed" } });
      result.failed += 1;
    } else {
      const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]!;
      await prisma.webhookDelivery.update({
        where: { id: d.id },
        data: { status: "pending", attempt, lastError: errMsg, nextAttemptAt: new Date(now.getTime() + delay) },
      });
      result.retried += 1;
    }
  }
  return result;
}

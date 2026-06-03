/**
 * Builder notification delivery (§8 Phase 3 item 5).
 *
 * v1 ships ONE channel — email — behind a `notifyBuilder(channel, payload)`
 * interface so Phase 5 can add SMS / webhook without touching callers. Transport
 * selection:
 *   - tests/dev → `logTransport` (records calls in memory; assertable);
 *   - production with `SMTP_URL` set → `smtpTransport` (integration point);
 *   - production without `SMTP_URL` → `noopTransport`.
 *
 * No heavy mail-vendor SDK is pulled in; if `SMTP_URL` is unset, sending no-ops.
 * Entitlement gating (abandoned notifications are Pro+) lives here as a pure
 * predicate so the emit layer and tests share one rule.
 */

import type { Entitlements } from "./entitlements.js";

export type NotifyChannel = "email"; // Phase 5: "sms" | "webhook"
export type NotificationType = "new_lead" | "abandoned_lead";

export interface NotifyPayload {
  tenantId: string;
  type: NotificationType;
  /** Recipient builder address. */
  to: string;
  subject: string;
  body: string;
  leadId?: string;
}

export interface NotifyResult {
  channel: NotifyChannel;
  delivered: boolean;
  transport: string;
}

export interface Transport {
  readonly name: string;
  send(channel: NotifyChannel, payload: NotifyPayload): Promise<boolean>;
}

/** In-memory transport for tests/dev. Inspect `logTransport.calls`. */
export const logTransport: Transport & { calls: { channel: NotifyChannel; payload: NotifyPayload }[] } = {
  name: "log",
  calls: [],
  async send(channel, payload) {
    this.calls.push({ channel, payload });
    return true;
  },
};

/** Clears recorded calls — call in test `beforeEach`. */
export function resetLogTransport(): void {
  logTransport.calls.length = 0;
}

const noopTransport: Transport = {
  name: "noop",
  async send() {
    return false;
  },
};

/**
 * Production SMTP. Deliberately dependency-free: the real send is wired here in
 * ops (e.g. nodemailer against SMTP_URL). Without SMTP_URL this is never
 * selected; with it, this is the single seam to implement.
 */
const smtpTransport: Transport = {
  name: "smtp",
  async send(channel, payload) {
    // Integration point — ops wires SMTP_URL to a client here. We never block
    // the request on email; failures are swallowed so the CRM flow proceeds.
    // eslint-disable-next-line no-console
    console.info(`[notify:smtp] ${channel} → ${payload.to} (${payload.type})`);
    return true;
  },
};

/** Resolve the active transport from the environment. */
export function resolveTransport(env: NodeJS.ProcessEnv = process.env): Transport {
  if (env.NODE_ENV === "production") return env.SMTP_URL ? smtpTransport : noopTransport;
  return logTransport;
}

/**
 * Deliver a builder notification over a channel. The transport is injectable so
 * tests can pass `logTransport` explicitly; otherwise it is resolved from env.
 */
export async function notifyBuilder(
  channel: NotifyChannel,
  payload: NotifyPayload,
  transport: Transport = resolveTransport(),
): Promise<NotifyResult> {
  const delivered = await transport.send(channel, payload);
  return { channel, delivered, transport: transport.name };
}

/** Abandoned-lead notifications are gated on the Pro+ entitlement (§10 #2). */
export function abandonedNotificationAllowed(entitlements: Pick<Entitlements, "abandonedFollowUp">): boolean {
  return entitlements.abandonedFollowUp === true;
}

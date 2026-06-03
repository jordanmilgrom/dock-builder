/**
 * Builder notification delivery (§8 Phase 3 item 5; Phase 5 channels).
 *
 * `notifyBuilder(channel, payload)` fans out across channels behind one
 * interface. Channels: email (Phase 3), sms (Twilio) + slack (Phase 5). Transport
 * selection: tests/dev → `logTransport` (assertable); production wires SMTP /
 * Twilio / Slack from env + tenant config, and no-ops when unconfigured. No
 * vendor SDKs — direct HTTPS. Entitlement gating lives here as pure predicates.
 */

import type { Entitlements } from "./entitlements.js";

export type NotifyChannel = "email" | "sms" | "slack";
export type NotificationType = "new_lead" | "abandoned_lead";

export interface NotifyPayload {
  tenantId: string;
  type: NotificationType;
  /** Email recipient (email channel). */
  to: string;
  subject: string;
  body: string;
  leadId?: string;
  /** SMS recipient (sms channel). */
  smsTo?: string;
  /** Slack incoming-webhook URL (slack channel). */
  slackWebhookUrl?: string;
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

/** Production SMTP seam (dependency-free; ops wires SMTP_URL). */
const smtpTransport: Transport = {
  name: "smtp",
  async send(channel, payload) {
    // eslint-disable-next-line no-console
    console.info(`[notify:smtp] ${channel} → ${payload.to} (${payload.type})`);
    return true;
  },
};

/** Twilio SMS via direct HTTPS POST to the Messages API (no SDK). */
export function makeTwilioTransport(opts: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {}): Transport {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    name: "twilio",
    async send(_channel, payload) {
      const sid = env.TWILIO_ACCOUNT_SID;
      const token = env.TWILIO_AUTH_TOKEN;
      const from = env.TWILIO_FROM_NUMBER;
      if (!sid || !token || !from || !payload.smsTo) return false; // no-op when unconfigured
      const auth = Buffer.from(`${sid}:${token}`).toString("base64");
      const form = new URLSearchParams({ To: payload.smsTo, From: from, Body: `${payload.subject}: ${payload.body}` });
      const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      return res.ok;
    },
  };
}

/** Slack incoming webhook via direct HTTPS POST. */
export function makeSlackTransport(opts: { fetchImpl?: typeof fetch } = {}): Transport {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    name: "slack",
    async send(_channel, payload) {
      if (!payload.slackWebhookUrl) return false; // no-op when unconfigured
      const res = await fetchImpl(payload.slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `*${payload.subject}*\n${payload.body}`,
          blocks: [{ type: "section", text: { type: "mrkdwn", text: `*${payload.subject}*\n${payload.body}` } }],
        }),
      });
      return res.ok;
    },
  };
}

/** Email transport for the current env (Phase 3 back-compat). */
export function resolveTransport(env: NodeJS.ProcessEnv = process.env): Transport {
  if (env.NODE_ENV === "production") return env.SMTP_URL ? smtpTransport : noopTransport;
  return logTransport;
}

/** Transport for a given channel in the current env. */
export function resolveChannelTransport(channel: NotifyChannel, env: NodeJS.ProcessEnv = process.env): Transport {
  if (env.NODE_ENV !== "production") return logTransport; // tests/dev: record everything
  switch (channel) {
    case "email":
      return env.SMTP_URL ? smtpTransport : noopTransport;
    case "sms":
      return env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER
        ? makeTwilioTransport({ env })
        : noopTransport;
    case "slack":
      return makeSlackTransport(); // self-no-ops without a payload URL
  }
}

/** Deliver a single notification over a channel (transport injectable for tests). */
export async function notifyBuilder(
  channel: NotifyChannel,
  payload: NotifyPayload,
  transport: Transport = resolveChannelTransport(channel),
): Promise<NotifyResult> {
  const delivered = await transport.send(channel, payload);
  return { channel, delivered, transport: transport.name };
}

// ---- Entitlement gating (pure) ---------------------------------------------

export function abandonedNotificationAllowed(entitlements: Pick<Entitlements, "abandonedFollowUp">): boolean {
  return entitlements.abandonedFollowUp === true;
}
export function smsAllowed(entitlements: Pick<Entitlements, "smsNotifications">): boolean {
  return entitlements.smsNotifications === true;
}
export function slackAllowed(entitlements: Pick<Entitlements, "slackNotifications">): boolean {
  return entitlements.slackNotifications === true;
}

// ---- Multi-channel fan-out -------------------------------------------------

export interface DispatchInput {
  tenantId: string;
  type: NotificationType;
  subject: string;
  body: string;
  leadId?: string;
  emailRecipients: string[];
  smsTo?: string | null;
  slackWebhookUrl?: string | null;
  entitlements: Pick<Entitlements, "smsNotifications" | "slackNotifications">;
  /** Per-channel transport overrides (tests). */
  transports?: Partial<Record<NotifyChannel, Transport>>;
}

/**
 * Fan a notification out to email (always) + SMS + Slack (when configured and
 * entitled). Each channel is isolated: one channel throwing never blocks others.
 */
export async function dispatchNotification(input: DispatchInput): Promise<NotifyResult[]> {
  const base = { tenantId: input.tenantId, type: input.type, subject: input.subject, body: input.body, leadId: input.leadId };
  const jobs: Promise<NotifyResult>[] = [];

  const safe = (channel: NotifyChannel, payload: NotifyPayload): Promise<NotifyResult> =>
    notifyBuilder(channel, payload, input.transports?.[channel]).catch(() => ({ channel, delivered: false, transport: "error" }));

  for (const to of input.emailRecipients) jobs.push(safe("email", { ...base, to }));
  if (input.smsTo && smsAllowed(input.entitlements)) jobs.push(safe("sms", { ...base, to: "", smsTo: input.smsTo }));
  if (input.slackWebhookUrl && slackAllowed(input.entitlements)) {
    jobs.push(safe("slack", { ...base, to: "", slackWebhookUrl: input.slackWebhookUrl }));
  }
  return Promise.all(jobs);
}

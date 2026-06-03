import { describe, expect, it, vi } from "vitest";
import { entitlementsForTier } from "@/lib/entitlements";
import {
  dispatchNotification,
  makeSlackTransport,
  makeTwilioTransport,
  notifyBuilder,
  slackAllowed,
  smsAllowed,
  type NotifyPayload,
  type Transport,
} from "@/lib/notifications";

const base: NotifyPayload = {
  tenantId: "t1",
  type: "new_lead",
  to: "",
  subject: "New lead",
  body: "Someone submitted a design.",
};

const TWILIO_ENV = {
  TWILIO_ACCOUNT_SID: "AC123",
  TWILIO_AUTH_TOKEN: "tok",
  TWILIO_FROM_NUMBER: "+15550001111",
} as unknown as NodeJS.ProcessEnv;

describe("SMS (Twilio) transport", () => {
  it("POSTs the correct Twilio Messages shape with Basic auth", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 201 })) as unknown as typeof fetch;
    const t = makeTwilioTransport({ fetchImpl, env: TWILIO_ENV });
    const res = await notifyBuilder("sms", { ...base, smsTo: "+15557654321" }, t);
    expect(res.delivered).toBe(true);

    const spy = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("AC123:tok").toString("base64")}`);
    const body = String(init.body);
    expect(body).toContain("To=%2B15557654321");
    expect(body).toContain("From=%2B15550001111");
    expect(body).toContain("Body=");
  });

  it("no-ops (no fetch) when Twilio env is missing", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const t = makeTwilioTransport({ fetchImpl, env: {} as NodeJS.ProcessEnv });
    const res = await notifyBuilder("sms", { ...base, smsTo: "+1555" }, t);
    expect(res.delivered).toBe(false);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

describe("Slack transport", () => {
  it("POSTs a block message to the configured webhook URL", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    const t = makeSlackTransport({ fetchImpl });
    const res = await notifyBuilder("slack", { ...base, slackWebhookUrl: "https://hooks.slack.com/x" }, t);
    expect(res.delivered).toBe(true);

    const spy = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://hooks.slack.com/x");
    const json = JSON.parse(String(init.body));
    expect(json.text).toContain("New lead");
    expect(json.blocks[0].type).toBe("section");
  });

  it("no-ops without a webhook URL", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const res = await notifyBuilder("slack", { ...base }, makeSlackTransport({ fetchImpl }));
    expect(res.delivered).toBe(false);
  });
});

describe("entitlement gating", () => {
  it("SMS is Premium-only; Slack is Pro+", () => {
    expect(smsAllowed(entitlementsForTier("starter"))).toBe(false);
    expect(smsAllowed(entitlementsForTier("pro"))).toBe(false);
    expect(smsAllowed(entitlementsForTier("premium"))).toBe(true);
    expect(slackAllowed(entitlementsForTier("starter"))).toBe(false);
    expect(slackAllowed(entitlementsForTier("pro"))).toBe(true);
    expect(slackAllowed(entitlementsForTier("premium"))).toBe(true);
  });
});

describe("multi-channel fan-out + isolation", () => {
  function recorder(): Transport & { count: number } {
    return { name: "rec", count: 0, async send() { this.count++; return true; } };
  }
  const exploder: Transport = { name: "boom", async send() { throw new Error("kaboom"); } };

  it("fans out to email + sms + slack when configured and entitled", async () => {
    const email = recorder();
    const sms = recorder();
    const slack = recorder();
    const results = await dispatchNotification({
      tenantId: "t1",
      type: "new_lead",
      subject: "s",
      body: "b",
      emailRecipients: ["a@b.com", "c@d.com"],
      smsTo: "+1555",
      slackWebhookUrl: "https://hooks.slack/x",
      entitlements: entitlementsForTier("premium"),
      transports: { email, sms, slack },
    });
    expect(results).toHaveLength(4); // 2 email + sms + slack
    expect(email.count).toBe(2);
    expect(sms.count).toBe(1);
    expect(slack.count).toBe(1);
  });

  it("skips SMS/Slack when not entitled", async () => {
    const results = await dispatchNotification({
      tenantId: "t1", type: "new_lead", subject: "s", body: "b",
      emailRecipients: ["a@b.com"],
      smsTo: "+1555",
      slackWebhookUrl: "https://hooks.slack/x",
      entitlements: entitlementsForTier("starter"), // no sms, no slack
    });
    expect(results.map((r) => r.channel)).toEqual(["email"]);
  });

  it("isolates a failing channel from the others", async () => {
    const email = recorder();
    const results = await dispatchNotification({
      tenantId: "t1", type: "new_lead", subject: "s", body: "b",
      emailRecipients: ["a@b.com"],
      slackWebhookUrl: "https://hooks.slack/x",
      entitlements: entitlementsForTier("premium"),
      transports: { email, slack: exploder },
    });
    const slack = results.find((r) => r.channel === "slack")!;
    const mail = results.find((r) => r.channel === "email")!;
    expect(slack.delivered).toBe(false);
    expect(slack.transport).toBe("error");
    expect(mail.delivered).toBe(true); // unaffected
  });
});

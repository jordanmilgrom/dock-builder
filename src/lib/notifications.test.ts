import { beforeEach, describe, expect, it } from "vitest";
import { entitlementsForTier } from "@/lib/entitlements";
import {
  abandonedNotificationAllowed,
  logTransport,
  notifyBuilder,
  resetLogTransport,
  resolveTransport,
  type NotifyPayload,
} from "@/lib/notifications";

const payload: NotifyPayload = {
  tenantId: "t_1",
  type: "new_lead",
  to: "builder@example.com",
  subject: "New lead",
  body: "A customer just submitted a design.",
  leadId: "lead_1",
};

describe("notifyBuilder", () => {
  beforeEach(resetLogTransport);

  it("routes to the log transport in tests and records the payload", async () => {
    const res = await notifyBuilder("email", payload, logTransport);
    expect(res).toEqual({ channel: "email", delivered: true, transport: "log" });
    expect(logTransport.calls).toHaveLength(1);
    expect(logTransport.calls[0]!.channel).toBe("email");
    expect(logTransport.calls[0]!.payload).toMatchObject({
      tenantId: "t_1",
      type: "new_lead",
      to: "builder@example.com",
      leadId: "lead_1",
    });
  });

  it("defaults to the log transport when NODE_ENV is not production", async () => {
    const t = resolveTransport({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
    expect(t.name).toBe("log");
  });

  it("no-ops in production without SMTP_URL, uses smtp when set", () => {
    expect(resolveTransport({ NODE_ENV: "production" } as NodeJS.ProcessEnv).name).toBe("noop");
    expect(resolveTransport({ NODE_ENV: "production", SMTP_URL: "smtp://x" } as NodeJS.ProcessEnv).name).toBe("smtp");
  });
});

describe("abandoned notifications are entitlement-gated (§10 #2)", () => {
  it("allows only when abandonedFollowUp is true (Pro+)", () => {
    expect(abandonedNotificationAllowed(entitlementsForTier("starter"))).toBe(false);
    expect(abandonedNotificationAllowed(entitlementsForTier("pro"))).toBe(true);
    expect(abandonedNotificationAllowed(entitlementsForTier("premium"))).toBe(true);
  });
});

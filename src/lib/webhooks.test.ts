import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma, resetDb, makeTenant } from "@/test/db";
import { entitlementsForTier } from "@/lib/entitlements";
import {
  RETRY_DELAYS_MS,
  createEndpoint,
  drainWebhooks,
  fireEvent,
  signPayload,
  verifySignature,
} from "@/lib/webhooks";

const okFetch = vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
const failFetch = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;

describe("webhook signing (§7.3)", () => {
  it("signature is deterministic and verifies; wrong secret fails", () => {
    const sig = signPayload("whsec_abc", 1700000000, '{"event":"lead.created"}');
    expect(sig).toBe(signPayload("whsec_abc", 1700000000, '{"event":"lead.created"}'));
    expect(sig).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    expect(verifySignature("whsec_abc", sig, '{"event":"lead.created"}')).toBe(true);
    expect(verifySignature("whsec_wrong", sig, '{"event":"lead.created"}')).toBe(false);
    expect(verifySignature("whsec_abc", sig, '{"event":"tampered"}')).toBe(false);
  });
});

describe("endpoint management", () => {
  beforeEach(resetDb);

  it("creates, lists (secret never returned), and revokes endpoints", async () => {
    const scope = await makeTenant("wh-co", { tier: "premium" });
    const created = await createEndpoint(scope, "https://ex.test/hook", ["lead.created", "job.complete"]);
    if ("error" in created) throw new Error(created.error);
    expect(created.secret).toMatch(/^whsec_/);

    const list = await scope.listWebhookEndpoints();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("secret");
    expect(list[0]!.eventKinds).toContain("lead.created");

    expect(await scope.deleteWebhookEndpoint(list[0]!.id)).toBe(true);
    expect(await scope.listWebhookEndpoints()).toHaveLength(0);
  });

  it("rejects non-https URLs and empty event kinds", async () => {
    const scope = await makeTenant("wh-co-2", { tier: "premium" });
    expect(await createEndpoint(scope, "http://insecure", ["lead.created"])).toEqual({ error: "invalid_url" });
    expect(await createEndpoint(scope, "https://ex.test", ["nonsense"])).toEqual({ error: "no_events" });
  });

  it("non-Premium tenants are not entitled to webhooks (route returns 403)", () => {
    expect(entitlementsForTier("pro").webhooks).toBe(false);
    expect(entitlementsForTier("premium").webhooks).toBe(true);
  });
});

describe("queue drain + retry schedule", () => {
  beforeEach(resetDb);

  it("delivers on 2xx and stamps the endpoint", async () => {
    const scope = await makeTenant("wh-drain", { tier: "premium" });
    const created = await createEndpoint(scope, "https://ex.test/hook", ["lead.created"]);
    if ("error" in created) throw new Error(created.error);
    expect(await fireEvent(scope, "lead.created", { hello: "world" })).toBe(1);

    const res = await drainWebhooks({ fetchImpl: okFetch, now: new Date() });
    expect(res.delivered).toBe(1);
    const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { tenantId: scope.tenantId } });
    expect(delivery.status).toBe("delivered");
    const endpoint = await prisma.webhookEndpoint.findFirstOrThrow({ where: { id: created.endpoint.id } });
    expect(endpoint.lastDeliveryStatus).toBe("delivered");
  });

  it("retries on failure with the documented schedule, then fails after 5 attempts", async () => {
    const scope = await makeTenant("wh-retry", { tier: "premium" });
    await createEndpoint(scope, "https://ex.test/hook", ["lead.created"]);
    await fireEvent(scope, "lead.created", { n: 1 });

    // Pin the delivery's due time so absolute schedule assertions are stable.
    let now = new Date("2026-01-01T00:00:00.000Z");
    await prisma.webhookDelivery.updateMany({ where: { tenantId: scope.tenantId }, data: { nextAttemptAt: now } });
    // Attempt 1 fails → scheduled +30s.
    await drainWebhooks({ fetchImpl: failFetch, now });
    let d = await prisma.webhookDelivery.findFirstOrThrow({ where: { tenantId: scope.tenantId } });
    expect(d.attempt).toBe(1);
    expect(d.status).toBe("pending");
    expect(d.nextAttemptAt.getTime()).toBe(now.getTime() + RETRY_DELAYS_MS[0]!);

    // Attempts 2–4: advance clock to each nextAttemptAt, expect the next delay.
    for (let i = 1; i < 4; i++) {
      now = d.nextAttemptAt;
      await drainWebhooks({ fetchImpl: failFetch, now });
      d = await prisma.webhookDelivery.findFirstOrThrow({ where: { tenantId: scope.tenantId } });
      expect(d.attempt).toBe(i + 1);
      expect(d.nextAttemptAt.getTime()).toBe(now.getTime() + RETRY_DELAYS_MS[i]!);
    }

    // 5th attempt → terminal failure.
    now = d.nextAttemptAt;
    await drainWebhooks({ fetchImpl: failFetch, now });
    d = await prisma.webhookDelivery.findFirstOrThrow({ where: { tenantId: scope.tenantId } });
    expect(d.attempt).toBe(5);
    expect(d.status).toBe("failed");
  });
});

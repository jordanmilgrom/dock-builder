/**
 * End-to-end jobs + webhooks flow (§8 Phase 5 end-state): builder accepts a lead
 * → Job created → walks in_production → install_scheduled → complete → customer
 * label tracks → the job.complete webhook is delivered to the (mocked) receiver.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb, SAMPLE_SITE } from "@/test/db";
import { seedAcme, SEEDED_WEBHOOK_URL } from "@/lib/acmeSeed";
import { resetLogTransport } from "@/lib/notifications";
import { createTenantScope } from "@/lib/tenantScope";
import { captureContact, createDesignFromSite } from "@/lib/designService";
import { builderOpenLead, sendQuote, setOutcome, submitDesign } from "@/lib/leadService";
import { advanceJob, jobStatusLabel } from "@/lib/jobs";
import { drainWebhooks } from "@/lib/webhooks";

describe("jobs flow", () => {
  beforeEach(async () => {
    await resetDb();
    resetLogTransport();
  });

  it("accept → job phases → customer labels track → job.complete webhook delivered", async () => {
    const tenantId = await seedAcme(); // Premium + seeded webhook endpoint
    const scope = createTenantScope(tenantId);

    // Customer designs + submits.
    const customer = await scope.createAnonymousCustomer();
    const created = await createDesignFromSite(scope, customer.id, SAMPLE_SITE);
    if ("error" in created) throw new Error("draft_cap");
    await captureContact(scope, customer.id, created.design.id, "buyer@jobs.test", true, "save_gate");
    await submitDesign(scope, created.design.id);
    const lead = await scope.findLeadByDesign(created.design.id);

    // Builder reviews, quotes, accepts → Job created (Premium has jobTracking).
    await builderOpenLead(scope, lead!.id);
    await sendQuote(scope, lead!.id, "builder_1");
    await setOutcome(scope, lead!.id, "accepted", { jobTracking: true });

    let job = await scope.getJobByLead(lead!.id);
    expect(job!.status).toBe("in_production");
    expect(jobStatusLabel(job!.status, "customer")).toBe("Being built");

    // Walk the job through to complete.
    await advanceJob(scope, job!.id, "install_scheduled");
    job = await scope.getJob(job!.id);
    expect(jobStatusLabel(job!.status, "customer")).toBe("Installation scheduled");

    await advanceJob(scope, job!.id, "complete");
    job = await scope.getJob(job!.id);
    expect(job!.status).toBe("complete");
    expect(jobStatusLabel(job!.status, "customer")).toBe("Complete");
    expect(jobStatusLabel(job!.status, "customer")).not.toMatch(/\b(won|lost)\b/i);

    // Drain the outbound queue against a mock receiver; assert job.complete fired.
    const received: { url: string; event: string }[] = [];
    const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      received.push({ url: String(url), event: body.event });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await drainWebhooks({ fetchImpl: mockFetch });
    expect(result.delivered).toBeGreaterThan(0);
    const complete = received.find((r) => r.event === "job.complete");
    expect(complete).toBeDefined();
    expect(complete!.url).toBe(SEEDED_WEBHOOK_URL);
    // The whole accepted→complete lifecycle also fired lead.* events to the endpoint.
    expect(received.some((r) => r.event === "lead.accepted")).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, makeTenant, seedCapturedLead } from "@/test/db";
import { resetLogTransport } from "@/lib/notifications";
import { advanceJob, canTransitionJob, createJobIfEntitled, jobStatusLabel } from "@/lib/jobs";
import { builderOpenLead, sendQuote, setOutcome, submitDesign } from "@/lib/leadService";
import type { TenantScope } from "@/lib/tenantScope";

/** Drive a fresh lead to "quoted" so it can be accepted. */
async function quoteLead(scope: TenantScope): Promise<string> {
  const seed = await seedCapturedLead(scope);
  await submitDesign(scope, seed.designId);
  await builderOpenLead(scope, seed.leadId);
  const q = await sendQuote(scope, seed.leadId, "builder_1");
  if ("error" in q) throw new Error(q.error);
  return seed.leadId;
}

describe("job tracking (§5.4 job phase)", () => {
  beforeEach(async () => {
    await resetDb();
    resetLogTransport();
  });

  it("quoted → accepted on an entitled tenant creates an in_production Job", async () => {
    const scope = await makeTenant("jobs-pro", { tier: "pro" });
    const leadId = await quoteLead(scope);
    const result = await setOutcome(scope, leadId, "accepted", { jobTracking: true });
    if ("error" in result) throw new Error(result.error);

    const job = await scope.getJobByLead(leadId);
    expect(job).toBeDefined();
    expect(job!.status).toBe("in_production");
    expect(job!.milestones.length).toBeGreaterThanOrEqual(1);
    // Lead status semantics unchanged — Job is its own machine.
    expect((await scope.getLead(leadId))!.status).toBe("accepted");
  });

  it("does NOT create a Job for a non-entitled (Starter) tenant", async () => {
    const scope = await makeTenant("jobs-starter"); // starter: jobTracking false
    const leadId = await quoteLead(scope);
    await setOutcome(scope, leadId, "accepted", { jobTracking: false });
    expect(await scope.getJobByLead(leadId)).toBeUndefined();
  });

  it("advances in_production → install_scheduled → complete and rejects bad jumps", async () => {
    const scope = await makeTenant("jobs-adv", { tier: "premium" });
    const leadId = await quoteLead(scope);
    await setOutcome(scope, leadId, "accepted", { jobTracking: true });
    const job = (await scope.getJobByLead(leadId))!;

    // Illegal jump rejected.
    expect(await advanceJob(scope, job.id, "complete")).toEqual({ error: "bad_state" });

    const s1 = await advanceJob(scope, job.id, "install_scheduled");
    if ("error" in s1) throw new Error(s1.error);
    expect(s1.status).toBe("install_scheduled");

    const s2 = await advanceJob(scope, job.id, "complete");
    if ("error" in s2) throw new Error(s2.error);
    expect(s2.status).toBe("complete");
    expect(s2.milestones.length).toBe(3); // in_production + 2 advances
  });

  it("transition rules + customer labels never leak Won/Lost", () => {
    expect(canTransitionJob("in_production", "install_scheduled")).toBe(true);
    expect(canTransitionJob("install_scheduled", "complete")).toBe(true);
    expect(canTransitionJob("in_production", "complete")).toBe(false);
    expect(canTransitionJob("complete", "in_production")).toBe(false);

    expect(jobStatusLabel("in_production", "customer")).toBe("Being built");
    expect(jobStatusLabel("install_scheduled", "customer")).toBe("Installation scheduled");
    expect(jobStatusLabel("complete", "customer")).toBe("Complete");
    for (const s of ["in_production", "install_scheduled", "complete"] as const) {
      expect(jobStatusLabel(s, "customer")).not.toMatch(/\b(won|lost)\b/i);
    }
  });

  it("createJobIfEntitled is idempotent and gated", async () => {
    const scope = await makeTenant("jobs-idem", { tier: "pro" });
    const leadId = await quoteLead(scope);
    await setOutcome(scope, leadId, "accepted", { jobTracking: true });
    const j1 = await scope.getJobByLead(leadId);
    const j2 = await createJobIfEntitled(scope, leadId, { jobTracking: true });
    expect(j2?.id).toBe(j1!.id); // no duplicate
    expect(await createJobIfEntitled(scope, leadId, { jobTracking: false })).toBeNull();
  });
});

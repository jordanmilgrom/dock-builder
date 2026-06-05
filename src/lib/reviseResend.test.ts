import { beforeEach, describe, expect, it } from "vitest";
import type { DockConfig } from "@/engine";
import { resetDb, makeTenant, seedCapturedLead } from "@/test/db";
import { resetLogTransport } from "@/lib/notifications";
import { builderOpenLead, sendQuote, submitDesign } from "@/lib/leadService";

describe("revise-and-resend loop (§5.5)", () => {
  beforeEach(async () => {
    await resetDb();
    resetLogTransport();
  });

  it("re-quote produces a new builder revision, preserves the original, keeps status quoted, records audit trail", async () => {
    const scope = await makeTenant("revise-co", { tier: "pro" });
    const seed = await seedCapturedLead(scope, { email: "buyer@revise.com" });
    const BUILDER_ID = "user_builder_1";

    // Customer submits, builder opens (→ in_review), builder sends first quote.
    await submitDesign(scope, seed.designId);
    await builderOpenLead(scope, seed.leadId);

    const first = await sendQuote(scope, seed.leadId, BUILDER_ID);
    if ("error" in first) throw new Error(first.error);
    expect(first.lead.status).toBe("quoted");
    expect(first.lead.quotedRevisionId).toBe(first.revision.id);
    const originalRevisionId = first.revision.id;
    const originalLength = first.revision.config.overall.lengthFt;

    // Builder revises the design and re-quotes (head is still the original v1).
    const editedConfig: DockConfig = {
      ...first.revision.config,
      overall: { ...first.revision.config.overall, lengthFt: originalLength + 6 },
    };
    const second = await sendQuote(scope, seed.leadId, BUILDER_ID, { config: editedConfig });
    if ("error" in second) throw new Error(second.error);

    // Re-quote does NOT advance status, but records the new revision.
    expect(second.lead.status).toBe("quoted");
    expect(second.revision.id).not.toBe(originalRevisionId);
    expect(second.lead.quotedRevisionId).toBe(second.revision.id);
    expect(second.revision.version).toBeGreaterThan(first.revision.version);

    // Original submission preserved as the earliest immutable revision.
    const revisions = await scope.listRevisions(seed.designId);
    expect(revisions[0]!.version).toBe(1);
    expect(revisions[0]!.config.overall.lengthFt).toBe(originalLength);
    expect(revisions[0]!.authorRole).toBe("customer");

    // Audit trail: the new revision is builder-authored with a change summary.
    const builderRev = revisions.find((r) => r.id === second.revision.id)!;
    expect(builderRev.authorRole).toBe("builder");
    expect(builderRev.authorId).toBe(BUILDER_ID);
    expect(builderRev.changeSummary).toBeTruthy();
    expect(builderRev.createdAt).toBeTruthy();
  });

  it("rejects a quote on a started lead with precondition_not_submitted", async () => {
    const scope = await makeTenant("revise-co-2", { tier: "pro" });
    const seed = await seedCapturedLead(scope); // still "started"
    const res = await sendQuote(scope, seed.leadId, "u1");
    expect(res).toEqual({ error: "precondition_not_submitted" });
  });

  it("also rejects a quote on an abandoned lead with precondition_not_submitted", async () => {
    const scope = await makeTenant("revise-co-3", { tier: "pro" });
    const seed = await seedCapturedLead(scope);
    await scope.updateLead(seed.leadId, { status: "abandoned" });
    const res = await sendQuote(scope, seed.leadId, "u1");
    expect(res).toEqual({ error: "precondition_not_submitted" });
  });
});

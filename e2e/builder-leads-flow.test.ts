/**
 * End-to-end builder CRM loop (§8 Phase 3 end-state): a builder sees a submitted
 * lead, opens it (auto → in_review), edits the design, sends a quote, and the
 * customer sees a "Quote ready" status — never "quoted" or "Won".
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { DockConfig } from "@/engine";
import { prisma, resetDb, makeTenant, seedCapturedLead } from "@/test/db";
import { logTransport, resetLogTransport } from "@/lib/notifications";
import { builderOpenLead, listLeadSummaries, sendQuote, submitDesign } from "@/lib/leadService";
import { leadStatusLabel } from "@/lib/leadStatus";

const THRESHOLD = 3;

describe("builder leads flow", () => {
  beforeEach(async () => {
    await resetDb();
    resetLogTransport();
  });

  it("submitted → in_review (auto) → quoted; customer sees customer-vocabulary labels", async () => {
    const scope = await makeTenant("flow-co", { tier: "pro", abandonedThresholdDays: THRESHOLD });
    const seed = await seedCapturedLead(scope, { email: "buyer@flow.com" });

    // Customer submits → new-lead notification fires to the builder.
    await submitDesign(scope, seed.designId);
    expect(logTransport.calls.some((c) => c.payload.type === "new_lead")).toBe(true);

    // Builder logs into the inbox and sees the submitted lead.
    let inbox = await listLeadSummaries(scope, THRESHOLD);
    const row = inbox.find((s) => s.lead.id === seed.leadId)!;
    expect(row.derivedStatus).toBe("submitted");
    expect(leadStatusLabel(row.derivedStatus, "builder")).toBe("New — submitted");

    // Opening the lead auto-advances to in_review (free "seen" signal).
    const opened = await builderOpenLead(scope, seed.leadId);
    expect(opened?.status).toBe("in_review");

    // Builder edits the design and sends the quote.
    const head = (await scope.getRevision((await scope.getDesign(seed.designId))!.currentRevisionId))!;
    const edited: DockConfig = { ...head.config, overall: { ...head.config.overall, lengthFt: head.config.overall.lengthFt + 2 } };
    const quoted = await sendQuote(scope, seed.leadId, "builder_user", { config: edited });
    if ("error" in quoted) throw new Error(quoted.error);
    expect(quoted.lead.status).toBe("quoted");

    // Builder vocabulary vs customer vocabulary.
    expect(leadStatusLabel("quoted", "builder")).toBe("Quote sent");
    const customerLabel = leadStatusLabel("quoted", "customer");
    expect(customerLabel).toBe("Quote ready");
    expect(customerLabel).not.toMatch(/\b(won|lost|quoted)\b/i);

    // Customer's design history shows the builder-authored revision in the timeline.
    const revisions = await scope.listRevisions(seed.designId);
    expect(revisions.some((r) => r.authorRole === "builder")).toBe(true);
    expect(revisions[0]!.authorRole).toBe("customer"); // original preserved first

    // Across every state the customer could see, no Won/Lost leakage.
    for (const r of inbox) void r;
    for (const s of ["submitted", "in_review", "quoted", "accepted", "closed"] as const) {
      expect(leadStatusLabel(s, "customer")).not.toMatch(/\b(won|lost)\b/i);
    }

    // A notification row is persisted for the dashboard panel.
    const notes = await prisma.notification.count({ where: { tenantId: scope.tenantId } });
    expect(notes).toBeGreaterThanOrEqual(1);

    inbox = await listLeadSummaries(scope, THRESHOLD);
    expect(inbox.find((s) => s.lead.id === seed.leadId)!.derivedStatus).toBe("quoted");
  });
});

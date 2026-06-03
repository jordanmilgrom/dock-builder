import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDb, makeTenant, seedCapturedLead } from "@/test/db";
import { logTransport, resetLogTransport } from "@/lib/notifications";
import { submitDesign } from "@/lib/leadService";
import { runAbandonedSweep } from "@/lib/sweepAbandoned";

const NOW = new Date("2026-06-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

async function setActivity(leadId: string, when: Date) {
  await prisma.lead.update({ where: { id: leadId }, data: { lastActivityAt: when } });
}

describe("abandoned sweep (§8 Phase 3 item 6)", () => {
  beforeEach(async () => {
    await resetDb();
    resetLogTransport();
  });

  it("flips eligible started leads, leaves ineligible ones, honors per-tenant threshold + entitlement gate", async () => {
    // Pro tenant, threshold 3 days.
    const pro = await makeTenant("pro-co", { tier: "pro", abandonedThresholdDays: 3 });
    const stalePro = await seedCapturedLead(pro, { email: "stale@pro.com" });
    const freshPro = await seedCapturedLead(pro, { email: "fresh@pro.com" });
    const submittedPro = await seedCapturedLead(pro, { email: "submitted@pro.com" });
    await setActivity(stalePro.leadId, daysAgo(5)); // past 3 → abandoned
    await setActivity(freshPro.leadId, daysAgo(1)); // within 3 → stays
    await submitDesign(pro, submittedPro.designId); // submitted → never abandoned

    // Starter tenant, threshold 3: stale lead flips, but NO notification (gated).
    const starter = await makeTenant("starter-co", { tier: "starter", abandonedThresholdDays: 3 });
    const staleStarter = await seedCapturedLead(starter, { email: "stale@starter.com" });
    await setActivity(staleStarter.leadId, daysAgo(5));

    // Long-threshold tenant (30): a 5-day-stale lead is NOT yet abandoned.
    const patient = await makeTenant("patient-co", { tier: "pro", abandonedThresholdDays: 30 });
    const stalePatient = await seedCapturedLead(patient, { email: "stale@patient.com" });
    await setActivity(stalePatient.leadId, daysAgo(5));

    resetLogTransport(); // ignore the submit's new-lead email
    const result = await runAbandonedSweep(NOW);

    // Two leads flip: pro stale + starter stale.
    expect(result.abandoned).toBe(2);
    // Only the Pro tenant's abandoned lead notifies (entitlement-gated).
    expect(result.notified).toBe(1);

    const status = async (id: string) => (await prisma.lead.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(stalePro.leadId)).toBe("abandoned");
    expect(await status(freshPro.leadId)).toBe("started");
    expect(await status(submittedPro.leadId)).toBe("submitted");
    expect(await status(staleStarter.leadId)).toBe("abandoned");
    expect(await status(stalePatient.leadId)).toBe("started");

    // The single email is the Pro abandoned notification.
    expect(logTransport.calls).toHaveLength(1);
    expect(logTransport.calls[0]!.payload.type).toBe("abandoned_lead");
    expect(logTransport.calls[0]!.payload.to).toBe("owner@pro-co.com");
  });

  it("is idempotent — a second sweep flips nothing new", async () => {
    const pro = await makeTenant("pro2", { tier: "pro", abandonedThresholdDays: 3 });
    const stale = await seedCapturedLead(pro);
    await setActivity(stale.leadId, daysAgo(5));
    expect((await runAbandonedSweep(NOW)).abandoned).toBe(1);
    expect((await runAbandonedSweep(NOW)).abandoned).toBe(0);
  });
});

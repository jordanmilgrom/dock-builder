import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDb, makeTenant, seedCapturedLead } from "@/test/db";
import { backfillLeadStatuses } from "@/lib/backfill";

describe("lead-status backfill (§8 migration)", () => {
  beforeEach(resetDb);

  it("sets started when no submittedAt, submitted when submittedAt is present, and is idempotent", async () => {
    const scope = await makeTenant("backfill-co");
    const a = await seedCapturedLead(scope, { email: "a@x.com" });
    const b = await seedCapturedLead(scope, { email: "b@x.com" });
    const c = await seedCapturedLead(scope, { email: "c@x.com" });

    // Simulate pre-Phase-3 rows: legacy/unknown status values.
    await prisma.lead.update({ where: { id: a.leadId }, data: { status: "legacy", submittedAt: null } });
    await prisma.lead.update({ where: { id: b.leadId }, data: { status: "started", submittedAt: new Date() } });
    await prisma.lead.update({ where: { id: c.leadId }, data: { status: "quoted", submittedAt: new Date() } });

    const res = await backfillLeadStatuses();
    expect(res.updated).toBe(2); // a (legacy→started) + b (started→submitted)

    const status = async (id: string) => (await prisma.lead.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(a.leadId)).toBe("started");
    expect(await status(b.leadId)).toBe("submitted");
    expect(await status(c.leadId)).toBe("quoted"); // advanced state never downgraded

    // Idempotent.
    expect((await backfillLeadStatuses()).updated).toBe(0);
  });
});

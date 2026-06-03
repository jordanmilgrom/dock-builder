/**
 * End-to-end Phase 1 customer flow against a Postgres-backed tenant (§8 migration
 * acceptance): questionnaire → recommendation → seeded design → save + capture →
 * version history → branded PDF roundtrip — all scoped to acme-docks.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { recommendDockType, type DockConfig } from "@/engine";
import { prisma, resetDb, SAMPLE_SITE } from "@/test/db";
import { seedAcme } from "@/lib/acmeSeed";
import { createTenantScope } from "@/lib/tenantScope";
import {
  captureContact,
  createDesignFromSite,
  evaluate,
  restoreOrBranch,
  saveRevision,
} from "@/lib/designService";
import { buildDesignPdf } from "@/lib/pdf";

describe("acme-docks customer flow (Postgres-backed)", () => {
  let tenantId: string;

  beforeAll(async () => {
    await resetDb();
    tenantId = await seedAcme();
  });

  it("runs the full questionnaire → recommendation → save → capture → PDF roundtrip", async () => {
    const scope = createTenantScope(tenantId);

    // 1) Questionnaire → recommendation (engine, unchanged).
    const rec = recommendDockType(SAMPLE_SITE);
    expect(rec.dockType).toBeTruthy();

    // 2) Anonymous customer starts a design from the site (seeded starter design).
    const customer = await scope.createAnonymousCustomer();
    const created = await createDesignFromSite(scope, customer.id, SAMPLE_SITE);
    if ("error" in created) throw new Error("draft_cap unexpectedly hit");
    expect(created.revision.version).toBe(1);
    expect(created.design.tenantId).toBe(tenantId);

    // 3) Live evaluate: validation + tenant-priced estimate.
    const evald = await evaluate(scope, created.revision.config);
    expect(evald.estimate.total).toBeGreaterThan(0);
    expect(evald.estimate.currency).toBe("USD");

    // 4) Edit + save → immutable v2.
    const edited: DockConfig = {
      ...created.revision.config,
      overall: { ...created.revision.config.overall, lengthFt: created.revision.config.overall.lengthFt + 4 },
    };
    const v2 = await saveRevision(scope, created.design.id, edited, customer.id);
    expect(v2?.version).toBe(2);

    // 5) Capture contact + consent → a Lead exists, email attached to the customer.
    await captureContact(scope, customer.id, created.design.id, "buyer@lake.test", true, "save_gate");
    const lead = await scope.findLeadByDesign(created.design.id);
    expect(lead?.customerContact.email).toBe("buyer@lake.test");
    expect((await scope.getCustomer(customer.id))?.email).toBe("buyer@lake.test");

    // 6) Version history → restore v1 creates a new head (v3).
    const restored = await restoreOrBranch(scope, created.design.id, 1, "restore", customer.id);
    expect(restored?.version).toBe(3);
    const revisions = await scope.listRevisions(created.design.id);
    expect(revisions.map((r) => r.version)).toEqual([1, 2, 3]);

    // 7) Branded PDF roundtrip using the tenant's cloned branding.
    const branding = await scope.getBranding();
    expect(branding).toBeDefined();
    const head = (await scope.getRevision((await scope.getDesign(created.design.id))!.currentRevisionId))!;
    const pdf = await buildDesignPdf({
      branding: branding!,
      revision: head,
      projectName: created.design.name,
      customerEmail: "buyer@lake.test",
    });
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("persisted everything under the acme-docks tenant", async () => {
    const designs = await prisma.design.count({ where: { tenantId } });
    const leads = await prisma.lead.count({ where: { tenantId } });
    expect(designs).toBeGreaterThanOrEqual(1);
    expect(leads).toBeGreaterThanOrEqual(1);
  });
});

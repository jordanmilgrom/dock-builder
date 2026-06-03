import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDb, SAMPLE_SITE } from "@/test/db";
import { signUpBuilder } from "@/lib/onboarding";
import { createTenantScope, type TenantScope } from "@/lib/tenantScope";
import { createDesignFromSite, captureContact } from "@/lib/designService";

/** Stand up a tenant with the cloned catalog and return its scope. */
async function makeTenant(slug: string): Promise<TenantScope> {
  const res = await signUpBuilder({ email: `owner@${slug}.com`, tenantName: slug, slug });
  if ("error" in res) throw new Error(`signup failed: ${res.error}`);
  return createTenantScope(res.tenantId);
}

/** Seed a customer + design + revision + lead inside a scope. */
async function seedDesign(scope: TenantScope) {
  const customer = await scope.createAnonymousCustomer();
  const created = await createDesignFromSite(scope, customer.id, SAMPLE_SITE);
  if ("error" in created) throw new Error("draft_cap");
  await captureContact(scope, customer.id, created.design.id, "buyer@example.com", true, "save_gate");
  return { customerId: customer.id, designId: created.design.id, revisionId: created.revision.id };
}

describe("tenant scope isolation", () => {
  let a: TenantScope;
  let b: TenantScope;
  let seedA: Awaited<ReturnType<typeof seedDesign>>;

  beforeEach(async () => {
    await resetDb();
    a = await makeTenant("alpha-docks");
    b = await makeTenant("bravo-docks");
    seedA = await seedDesign(a);
  });

  it("tenant A can read its own rows", async () => {
    expect(await a.getDesign(seedA.designId)).toBeDefined();
    expect(await a.getCustomer(seedA.customerId)).toBeDefined();
    expect(await a.getRevision(seedA.revisionId)).toBeDefined();
    expect(await a.findLeadByDesign(seedA.designId)).toBeDefined();
  });

  it("tenant B cannot READ tenant A's rows", async () => {
    expect(await b.getDesign(seedA.designId)).toBeUndefined();
    expect(await b.getCustomer(seedA.customerId)).toBeUndefined();
    expect(await b.getRevision(seedA.revisionId)).toBeUndefined();
    expect(await b.findLeadByDesign(seedA.designId)).toBeUndefined();
    expect(await b.listRevisions(seedA.designId)).toEqual([]);
    expect(await b.listDesignsByCustomer(seedA.customerId)).toEqual([]);
  });

  it("tenant B cannot WRITE tenant A's rows (update affects 0 rows)", async () => {
    const res = await b.updateDesign(seedA.designId, { name: "HIJACKED", status: "submitted" });
    expect(res).toBeUndefined();

    const updateCust = await b.updateCustomer(seedA.customerId, { email: "attacker@evil.com" });
    expect(updateCust).toBeUndefined();

    // A's rows are untouched.
    const stillA = await a.getDesign(seedA.designId);
    expect(stillA?.name).not.toBe("HIJACKED");
    expect(stillA?.status).toBe("draft");
    const cust = await a.getCustomer(seedA.customerId);
    expect(cust?.email).toBe("buyer@example.com");
  });

  it("tenant B cannot attach a revision to tenant A's design", async () => {
    const rev = {
      id: "rev_inject",
      designId: seedA.designId,
      version: 99,
      config: { schemaVersion: 1, tenantId: b.tenantId, dockType: "floating" } as never,
      schemaVersion: 1,
      estimateSnapshot: null,
      authorRole: "customer" as const,
      authorId: "x",
      createdAt: new Date().toISOString(),
      changeSummary: "inject",
    };
    await expect(b.addRevision(rev)).rejects.toThrow();
    // No stray revision landed.
    expect(await prisma.revision.findFirst({ where: { id: "rev_inject" } })).toBeNull();
  });

  it("counts and lead totals are tenant-local", async () => {
    expect(await a.countLeads()).toBe(1);
    expect(await b.countLeads()).toBe(0);
    expect(await a.countDrafts(seedA.customerId)).toBe(1);
  });

  it("a row id from A is invisible to B even via email lookup", async () => {
    expect(await b.findCustomerByEmail("buyer@example.com")).toBeUndefined();
    expect(await a.findCustomerByEmail("buyer@example.com")).toBeDefined();
  });
});

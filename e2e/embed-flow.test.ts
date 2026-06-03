/**
 * End-to-end embed flow (§5.7): the loader points an iframe at the tenant's
 * /embed page; a customer completes the questionnaire inside it; the lead lands
 * in the right tenant.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, makeTenant, SAMPLE_SITE } from "@/test/db";
import { buildEmbedLoader, embedIframeUrl } from "@/lib/embed";
import { captureContact, createDesignFromSite } from "@/lib/designService";
import { submitDesign } from "@/lib/leadService";

const APP_ORIGIN = "https://app.com";

describe("embed flow", () => {
  beforeEach(resetDb);

  it("loader boots the tenant iframe and the resulting lead lands in that tenant", async () => {
    const slug = "embed-co";
    const scope = await makeTenant(slug, { tier: "pro" }); // Pro+ → embed entitled

    // Loader + iframe URL carry the tenant.
    const loader = buildEmbedLoader(APP_ORIGIN);
    expect(loader).toContain("/embed?tenant=");
    expect(embedIframeUrl(APP_ORIGIN, slug)).toBe(`${APP_ORIGIN}/embed?tenant=${slug}`);

    // Inside the iframe: customer designs + submits (same Phase 1/3 path).
    const customer = await scope.createAnonymousCustomer();
    const created = await createDesignFromSite(scope, customer.id, SAMPLE_SITE);
    if ("error" in created) throw new Error("draft_cap");
    await captureContact(scope, customer.id, created.design.id, "lead@embed.test", true, "save_gate");
    const lead = await submitDesign(scope, created.design.id);
    if ("error" in lead) throw new Error(lead.error);

    expect(lead.tenantId).toBe(scope.tenantId);
    expect(lead.status).toBe("submitted");
    expect(lead.customerContact.email).toBe("lead@embed.test");
  });

  it("Starter tenants are not entitled to embed", async () => {
    const scope = await makeTenant("starter-embed");
    void scope;
    const { entitlementsForTier } = await import("@/lib/entitlements");
    expect(entitlementsForTier("starter").embed).toBe(false);
  });
});

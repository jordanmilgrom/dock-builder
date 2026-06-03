import { beforeEach, describe, expect, it } from "vitest";
import { entitlementsForTier } from "@/lib/entitlements";
import { resetDb, makeTenant, SAMPLE_SITE } from "@/test/db";
import { createDesignFromSite, priceConfig } from "@/lib/designService";

describe("multiple pricing profiles (Premium)", () => {
  beforeEach(resetDb);

  it("Premium tenant creates a second profile and a design priced against it differs from default", async () => {
    const scope = await makeTenant("prem-profiles", { tier: "premium" });

    // Default set exists (one per dock type).
    const before = await scope.listPricingProfiles();
    expect(before.some((p) => p.isDefault && p.dockType === "floating")).toBe(true);

    // A second "North location" profile with a higher labor rate.
    const north = await scope.createPricingProfile({ name: "North location", dockType: "floating", labor: { perFt2: 60 } });
    expect(north).toBeDefined();
    const after = await scope.listPricingProfiles();
    expect(after.length).toBe(before.length + 1);

    // Same config, priced against default vs the North profile.
    const customer = await scope.createAnonymousCustomer();
    const created = await createDesignFromSite(scope, customer.id, SAMPLE_SITE, { dockType: "floating" });
    if ("error" in created) throw new Error("draft_cap");
    const config = created.revision.config;

    const defaultPrice = await priceConfig(scope, config);
    const northPrice = await priceConfig(scope, config, { pricingProfileId: north!.id });
    expect(northPrice.labor).toBeGreaterThan(defaultPrice.labor);
    expect(northPrice.total).toBeGreaterThan(defaultPrice.total);

    // A design pinned to the profile uses it on save.
    await scope.updateDesign(created.design.id, { pricingProfileId: north!.id });
    const pinned = await scope.getDesign(created.design.id);
    expect(pinned?.pricingProfileId).toBe(north!.id);
  });

  it("non-Premium tenants are not entitled to multiple profiles (route returns 403)", () => {
    expect(entitlementsForTier("starter").multipleProfiles).toBe(false);
    expect(entitlementsForTier("pro").multipleProfiles).toBe(false);
    expect(entitlementsForTier("premium").multipleProfiles).toBe(true);
  });
});

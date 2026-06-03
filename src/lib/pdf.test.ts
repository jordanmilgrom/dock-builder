import { describe, expect, it } from "vitest";
import {
  generateStartingDesign,
  pricingEngine,
  recommendDockType,
  validationEngine,
  type PricingProfile,
  type SiteConditions,
} from "@/engine";
import { buildDesignPdf } from "./pdf.js";
import { buildRevision } from "./versioning.js";
import { ACME_BRAND, ACME_TENANT_ID, acmeCatalog } from "./seed.js";
import type { Branding } from "./types.js";

const branding: Branding = {
  tenantId: ACME_TENANT_ID,
  name: ACME_BRAND.name,
  logoText: ACME_BRAND.logoText,
  primaryColor: ACME_BRAND.primaryColor,
  secondaryColor: ACME_BRAND.secondaryColor,
  removeBadge: false,
};

/** Build an engine PricingProfile from the default catalog (no DB needed). */
function profileFor(dockType: PricingProfile["dockType"]): PricingProfile {
  const p = acmeCatalog().pricingProfiles.find((x) => x.dockType === dockType)!;
  return { tenantId: ACME_TENANT_ID, ...p };
}

const site: SiteConditions = {
  depthAtEndLowWaterFt: 6,
  seasonalFluctuationFt: 1.5,
  bottom: "sand",
  waveExposure: "inland_lake",
  seasonalIce: false,
  shoreHeightAboveWaterFt: 3,
};

describe("Phase 1 roundtrip: questionnaire → recommendation → config → PDF", () => {
  it("produces a non-empty, well-formed branded PDF", async () => {
    const rec = recommendDockType(site);
    expect(rec.dockType).toBe("floating");

    const config = generateStartingDesign(site, { tenantId: ACME_TENANT_ID });

    const validation = validationEngine(config);
    expect(validation.ok).toBe(true);
    const estimate = pricingEngine(config, profileFor(config.dockType), { deliveryDistanceMiles: 30 });
    expect(estimate.total).toBeGreaterThan(0);

    const revision = buildRevision({
      designId: "dsn_test",
      previous: null,
      config,
      estimate,
      authorRole: "customer",
      authorId: "cust_test",
    });

    const pdf = await buildDesignPdf({ branding, revision, projectName: "Test Dock", customerEmail: "buyer@example.com" });

    expect(pdf.length).toBeGreaterThan(2000);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.subarray(-6).toString("latin1")).toContain("EOF");
  });

  it("generates a PDF for a fixed (pile) dock too", async () => {
    const fixedSite: SiteConditions = { ...site, depthAtEndLowWaterFt: 3, bottom: "clay", seasonalFluctuationFt: 1, waveExposure: "sheltered" };
    const config = generateStartingDesign(fixedSite, { tenantId: ACME_TENANT_ID });
    expect(config.dockType).toBe("pile");
    const estimate = pricingEngine(config, profileFor(config.dockType));
    const revision = buildRevision({ designId: "d2", previous: null, config, estimate, authorRole: "customer", authorId: "c2" });
    const pdf = await buildDesignPdf({ branding, revision, projectName: "Pile Dock", customerEmail: null });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

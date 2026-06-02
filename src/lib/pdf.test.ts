import { describe, expect, it } from "vitest";
import {
  generateStartingDesign,
  pricingEngine,
  recommendDockType,
  validationEngine,
  type SiteConditions,
} from "@/engine";
import { buildDesignPdf } from "./pdf.js";
import { buildRevision } from "./versioning.js";
import { devBranding, pricingProfileFor } from "./seed.js";

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
    // questionnaire → recommendation
    const rec = recommendDockType(site);
    expect(rec.dockType).toBe("floating");

    // recommendation → auto-starting design
    const config = generateStartingDesign(site, { tenantId: devBranding.tenantId });

    // engine validation + pricing (never re-derived in the UI/PDF)
    const validation = validationEngine(config);
    expect(validation.ok).toBe(true);
    const estimate = pricingEngine(config, pricingProfileFor(config.dockType), {
      deliveryDistanceMiles: 30,
    });
    expect(estimate.total).toBeGreaterThan(0);

    // immutable revision snapshot
    const revision = buildRevision({
      designId: "dsn_test",
      previous: null,
      config,
      estimate,
      authorRole: "customer",
      authorId: "cust_test",
    });

    // branded PDF
    const pdf = await buildDesignPdf({
      branding: devBranding,
      revision,
      projectName: "Test Dock",
      customerEmail: "buyer@example.com",
    });

    expect(pdf.length).toBeGreaterThan(2000);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.subarray(-6).toString("latin1")).toContain("EOF");
  });

  it("generates a PDF for a fixed (pile) dock too", async () => {
    const fixedSite: SiteConditions = { ...site, depthAtEndLowWaterFt: 3, bottom: "clay", seasonalFluctuationFt: 1, waveExposure: "sheltered" };
    const config = generateStartingDesign(fixedSite, { tenantId: devBranding.tenantId });
    expect(config.dockType).toBe("pile");
    const estimate = pricingEngine(config, pricingProfileFor(config.dockType));
    const revision = buildRevision({ designId: "d2", previous: null, config, estimate, authorRole: "customer", authorId: "c2" });
    const pdf = await buildDesignPdf({ branding: devBranding, revision, projectName: "Pile Dock", customerEmail: null });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

import { describe, expect, it } from "vitest";
import { generateStartingDesign, STARTER_FLOAT_SKU } from "./starter.js";
import { validationEngine } from "./validation.js";
import type { SiteConditions } from "./types.js";

const deepSoftSite: SiteConditions = {
  depthAtEndLowWaterFt: 6,
  seasonalFluctuationFt: 1.5,
  bottom: "sand",
  waveExposure: "inland_lake",
  seasonalIce: false,
  shoreHeightAboveWaterFt: 3,
};

const firmShallowSite: SiteConditions = {
  depthAtEndLowWaterFt: 3,
  seasonalFluctuationFt: 1,
  bottom: "clay",
  waveExposure: "sheltered",
  seasonalIce: false,
  shoreHeightAboveWaterFt: 2,
};

describe("generateStartingDesign (§5.3)", () => {
  it("seeds a floating dock with a sealed float catalog on deep/soft sites", () => {
    const c = generateStartingDesign(deepSoftSite, { tenantId: "dev" });
    expect(c.dockType).toBe("floating");
    expect(c.tenantId).toBe("dev");
    expect(c.floatCatalog?.[STARTER_FLOAT_SKU]?.sealedShell).toBe(true);
    expect(c.gangway?.present).toBe(true);
  });

  it("seeds a pile dock (no float catalog) on a firm, shallow site", () => {
    const c = generateStartingDesign(firmShallowSite, { tenantId: "dev" });
    expect(c.dockType).toBe("pile");
    expect(c.floatCatalog).toBeUndefined();
  });

  it("produces a design that passes validation with no blocking errors", () => {
    expect(validationEngine(generateStartingDesign(deepSoftSite, { tenantId: "dev" })).ok).toBe(true);
    expect(validationEngine(generateStartingDesign(firmShallowSite, { tenantId: "dev" })).ok).toBe(true);
  });

  it("honors a dock-type override and a commercial use", () => {
    const c = generateStartingDesign(deepSoftSite, {
      tenantId: "dev",
      dockType: "pile",
      use: "commercial",
    });
    expect(c.dockType).toBe("pile");
    expect(c.use).toBe("commercial");
    expect(c.overall.widthFt).toBe(8);
    expect(c.gangway?.handrails).toBe(true);
  });

  it("omits the gangway when the shore is at water level", () => {
    const c = generateStartingDesign({ ...deepSoftSite, shoreHeightAboveWaterFt: 0 }, { tenantId: "dev" });
    expect(c.gangway?.present).toBe(false);
  });
});

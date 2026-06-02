import { describe, expect, it } from "vitest";
import { recommendDockType } from "./recommendation.js";
import type { SiteConditions } from "./types.js";

const base: SiteConditions = {
  depthAtEndLowWaterFt: 6,
  seasonalFluctuationFt: 1.5,
  bottom: "sand",
  waveExposure: "inland_lake",
  seasonalIce: false,
  shoreHeightAboveWaterFt: 3,
};

describe("recommendDockType (§2.1)", () => {
  it("recommends floating for deep water / soft bottom", () => {
    expect(recommendDockType(base).dockType).toBe("floating");
  });

  it("recommends floating for large seasonal level swings", () => {
    const r = recommendDockType({ ...base, depthAtEndLowWaterFt: 3, bottom: "clay", seasonalFluctuationFt: 3 });
    expect(r.dockType).toBe("floating");
    expect(r.reasons.join(" ")).toMatch(/level swing/i);
  });

  it("recommends a pile dock for firm bottom + stable, shallow water", () => {
    const r = recommendDockType({
      ...base,
      depthAtEndLowWaterFt: 3,
      seasonalFluctuationFt: 1,
      bottom: "clay",
    });
    expect(r.dockType).toBe("pile");
  });

  it("recommends floating/cantilever-friendly choice on rock", () => {
    const r = recommendDockType({ ...base, bottom: "rock" });
    expect(r.dockType).toBe("floating");
    expect(r.reasons.join(" ")).toMatch(/rock/i);
  });

  it("flags open-water exposure as a caution", () => {
    const r = recommendDockType({ ...base, waveExposure: "open_water" });
    expect(r.cautions.join(" ")).toMatch(/open-water/i);
  });

  it("recommends a removable design under seasonal ice", () => {
    const r = recommendDockType({ ...base, seasonalIce: true });
    expect(r.recommendRemovable).toBe(true);
    expect(r.cautions.join(" ")).toMatch(/ice/i);
  });

  it("cautions that floats may ground in very shallow water", () => {
    const r = recommendDockType({ ...base, depthAtEndLowWaterFt: 1 });
    expect(r.cautions.join(" ")).toMatch(/ground/i);
  });
});

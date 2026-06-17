import { describe, expect, it } from "vitest";
import { recommendConstructions, type SiteFields } from "./recommend.js";

const site = (o: Partial<SiteFields>): SiteFields => ({
  waveExposure: "inland_lake",
  bottom: "sand",
  depthAtEndLowWaterFt: 6,
  seasonalIce: false,
  ...o,
});

describe("recommendConstructions — decision matrix", () => {
  it("deep open water → floating (with breakwater note)", () => {
    const r = recommendConstructions(site({ waveExposure: "open_water", depthAtEndLowWaterFt: 14 }));
    expect(r.constructions).toEqual(["floating"]);
    expect(r.reasons[0]).toMatch(/breakwater/i);
  });

  it("open water (not deep) → pile (the known floating-in-open-water bug)", () => {
    const r = recommendConstructions(site({ waveExposure: "open_water", bottom: "sand", depthAtEndLowWaterFt: 8 }));
    expect(r.constructions).toEqual(["pile"]);
    expect(r.reasons[0]).toMatch(/wave/i);
  });

  it("seasonal ice on non-open water → wheel", () => {
    expect(recommendConstructions(site({ seasonalIce: true })).constructions).toEqual(["wheel"]);
  });

  it("ice does NOT override open water (pile/floating win first)", () => {
    expect(recommendConstructions(site({ waveExposure: "open_water", seasonalIce: true, depthAtEndLowWaterFt: 8 })).constructions).toEqual(["pile"]);
  });

  it("rock bottom + shallow → pile", () => {
    expect(recommendConstructions(site({ bottom: "rock", depthAtEndLowWaterFt: 4 })).constructions).toEqual(["pile"]);
  });

  it("gravel bottom + shallow → pile", () => {
    expect(recommendConstructions(site({ bottom: "gravel", depthAtEndLowWaterFt: 5 })).constructions).toEqual(["pile"]);
  });

  it("sheltered + deep → floating", () => {
    expect(recommendConstructions(site({ waveExposure: "sheltered", depthAtEndLowWaterFt: 9 })).constructions).toEqual(["floating"]);
  });

  it("default fallback → floating", () => {
    const r = recommendConstructions(site({ waveExposure: "inland_lake", bottom: "sand", depthAtEndLowWaterFt: 5 }));
    expect(r.constructions).toEqual(["floating"]);
    expect(r.reasons[0]).toMatch(/default/i);
  });
});

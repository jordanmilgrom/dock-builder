import { describe, expect, it } from "vitest";
import { validationEngine } from "./validation.js";
import type { Bathymetry, DockConfig } from "./types.js";

const deepProfile: Bathymetry = {
  shoreHeightFt: 3, waterHeightFt: 0, landSlopePct: 15,
  depthProfile: [{ distanceFromShoreFt: 0, depthFt: 0 }, { distanceFromShoreFt: 10, depthFt: 14 }, { distanceFromShoreFt: 40, depthFt: 16 }],
};
const shallowProfile: Bathymetry = {
  shoreHeightFt: 3, waterHeightFt: 0, landSlopePct: 15,
  depthProfile: [{ distanceFromShoreFt: 0, depthFt: 0 }, { distanceFromShoreFt: 40, depthFt: 2 }],
};

function cfg(bathymetry: Bathymetry, constructions: ("floating" | "pile" | "wheel")[]): DockConfig {
  return {
    schemaVersion: 1, tenantId: "t", dockType: "pile", use: "residential",
    site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1, bottom: "clay", waveExposure: "sheltered", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
    overall: { lengthFt: 16, widthFt: 8, deckingMaterial: "pt_2x6", deckingOrientation: "straight", frameMaterial: "pt_pine", joistSize: "2x8", maxGapFt: 8 },
    bathymetry,
    pieces: [{ pieceKind: "rectangle", posX: 8, posY: 0, rotationDeg: 0, lengthFt: 12, widthFt: 8, constructions }],
  };
}

describe("bathymetry warnings", () => {
  it("pile over deep water (>12 ft) warns", () => {
    const codes = validationEngine(cfg(deepProfile, ["pile"])).warnings.map((w) => w.code);
    expect(codes).toContain("pile_over_deep_water");
  });

  it("floating over shallow water (<3 ft) warns", () => {
    const codes = validationEngine(cfg(shallowProfile, ["floating"])).warnings.map((w) => w.code);
    expect(codes).toContain("float_over_shallow_water");
  });

  it("a pile in shallow water does NOT warn about depth", () => {
    const codes = validationEngine(cfg(shallowProfile, ["pile"])).warnings.map((w) => w.code);
    expect(codes).not.toContain("pile_over_deep_water");
    expect(codes).not.toContain("float_over_shallow_water");
  });
});

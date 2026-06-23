import { describe, expect, it } from "vitest";
import { DEFAULT_BATHYMETRY, depthAtDistanceFt, depthAtPieceCenter, resolveBathymetry } from "./bathymetry.js";
import { resolvePieces } from "./pieces.js";
import type { Bathymetry, DockConfig } from "./types.js";

describe("bathymetry interpolation", () => {
  it("passes exactly through every handle", () => {
    for (const pt of DEFAULT_BATHYMETRY.depthProfile) {
      expect(depthAtDistanceFt(DEFAULT_BATHYMETRY, pt.distanceFromShoreFt)).toBeCloseTo(pt.depthFt, 6);
    }
  });

  it("clamps to the end handles outside the sampled range", () => {
    expect(depthAtDistanceFt(DEFAULT_BATHYMETRY, -5)).toBeCloseTo(0, 6);
    expect(depthAtDistanceFt(DEFAULT_BATHYMETRY, 200)).toBeCloseTo(8, 6);
  });

  it("is monotonic (non-decreasing) for a non-decreasing profile — no shallow dips", () => {
    let prev = -Infinity;
    for (let d = 0; d <= 40; d += 0.5) {
      const depth = depthAtDistanceFt(DEFAULT_BATHYMETRY, d);
      expect(depth).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = depth;
    }
  });

  it("interpolates between handles within the bracketing depths", () => {
    const mid = depthAtDistanceFt(DEFAULT_BATHYMETRY, 12); // between {5,2} and {20,6}
    expect(mid).toBeGreaterThan(2);
    expect(mid).toBeLessThan(6);
  });

  it("resolveBathymetry falls back to the default", () => {
    const cfg = { } as DockConfig;
    expect(resolveBathymetry(cfg)).toBe(DEFAULT_BATHYMETRY);
  });

  it("depthAtPieceCenter uses the piece center's distance from shore", () => {
    const b: Bathymetry = DEFAULT_BATHYMETRY;
    const config: DockConfig = {
      schemaVersion: 1, tenantId: "t", dockType: "floating", use: "residential",
      site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
      overall: { lengthFt: 20, widthFt: 8, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum" },
      pieces: [{ pieceKind: "rectangle", posX: 15, posY: 0, rotationDeg: 0, lengthFt: 10, widthFt: 8, constructions: ["floating"] }],
    };
    const piece = resolvePieces(config)[0]!;
    expect(depthAtPieceCenter(b, piece)).toBeCloseTo(depthAtDistanceFt(b, 20), 6); // center at x=20
  });
});

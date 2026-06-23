/**
 * Phase 11 e2e (logic-level) — editing the Site tab's underwater control points
 * reshapes the 3D lake bed. Driven through the pure Site-drag lib + the scene
 * builder (no browser harness).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_BATHYMETRY, type DockConfig } from "@/engine";
import { clampDepthHandle, isMonotonic } from "@/lib/siteModeDrag";
import { buildSceneSpec } from "@/lib/view3d";

const config = (): DockConfig => ({
  schemaVersion: 1, tenantId: "t", dockType: "floating", use: "residential",
  site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
  overall: { lengthFt: 24, widthFt: 8, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum" },
  bathymetry: structuredClone(DEFAULT_BATHYMETRY),
  pieces: [{ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 24, widthFt: 8, constructions: ["floating"] }],
});

describe("bathymetry flow", () => {
  it("dragging a depth handle deeper reshapes the lake bed (slopes down from shore)", () => {
    const c = config();
    // Drag the {20 ft, 6 ft} handle down to 9 ft.
    c.bathymetry!.depthProfile = clampDepthHandle(c.bathymetry!.depthProfile, 2, 9);
    expect(c.bathymetry!.depthProfile[2]!.depthFt).toBe(8); // clamped at the next handle (8 ft)
    expect(isMonotonic(c.bathymetry!.depthProfile)).toBe(true);

    const bed = buildSceneSpec(c).lakeBed;
    expect(bed.length).toBeGreaterThan(2);
    expect(bed[0]!.depthFt).toBeCloseTo(0, 1); // at shore
    expect(bed[bed.length - 1]!.depthFt).toBeGreaterThan(bed[0]!.depthFt); // deeper out
    // monotonic non-decreasing across the sampled bed
    for (let i = 1; i < bed.length; i++) expect(bed[i]!.depthFt).toBeGreaterThanOrEqual(bed[i - 1]!.depthFt - 1e-6);
  });

  it("a deeper profile is reflected in the scene's water + bed", () => {
    const c = config();
    c.bathymetry!.depthProfile = clampDepthHandle(c.bathymetry!.depthProfile, 1, 4);
    const spec = buildSceneSpec(c);
    expect(spec.water.opacity).toBeGreaterThan(0);
    expect(spec.lakeBed.some((p) => p.depthFt >= 3)).toBe(true);
  });
});

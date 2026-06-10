import { describe, expect, it } from "vitest";
import type { DockConfig } from "@/engine";
import { buildSceneSpec } from "@/lib/view3d";
import { frameCamera } from "@/lib/view3dCamera";

const at = (posX: number, posY: number): DockConfig => ({
  schemaVersion: 1,
  tenantId: "acme-docks",
  dockType: "floating",
  use: "residential",
  site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1.5, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
  overall: { lengthFt: 20, widthFt: 8, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum", maxGapFt: 8 },
  pieces: [{ pieceKind: "rectangle", posX, posY, rotationDeg: 0, lengthFt: 20, widthFt: 8, construction: "floating" }],
});

describe("frameCamera", () => {
  it("targets the bbox CENTER for an off-origin design — not the world origin", () => {
    const spec = buildSceneSpec(at(55, 55)); // piece spans x[55,75], z[55,63]
    expect(spec.box).toMatchObject({ minX: 55, maxX: 75, minZ: 55, maxZ: 63 });
    const cam = frameCamera(spec.box);
    expect(cam.target.x).toBeCloseTo(65, 6); // (55+75)/2
    expect(cam.target.z).toBeCloseTo(59, 6); // (55+63)/2
    expect(cam.target).not.toMatchObject({ x: 0, z: 0 });
    expect(cam.radius).toBeGreaterThan(0);
  });

  it("scales the orbit radius with the bbox diagonal", () => {
    const small = frameCamera({ minX: 0, minZ: 0, maxX: 10, maxZ: 4 });
    const big = frameCamera({ minX: 0, minZ: 0, maxX: 100, maxZ: 40 });
    expect(big.radius).toBeGreaterThan(small.radius);
  });
});

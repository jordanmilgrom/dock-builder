/**
 * Phase 8 advisory: a connector triangle inherits support from its adjacent
 * rectangle, so a construction mismatch fires `triangle_construction_mismatch`.
 */
import { describe, expect, it } from "vitest";
import { validationEngine, type DockConfig } from "@/engine";

const base: DockConfig = {
  schemaVersion: 1,
  tenantId: "acme-docks",
  dockType: "pile",
  use: "residential",
  site: { depthAtEndLowWaterFt: 5, seasonalFluctuationFt: 1, bottom: "clay", waveExposure: "sheltered", seasonalIce: false, shoreHeightAboveWaterFt: 2 },
  overall: { lengthFt: 24, widthFt: 8, deckingMaterial: "pt_2x6", deckingOrientation: "straight", frameMaterial: "pt_pine", joistSize: "2x8", maxGapFt: 8 },
  gangway: { present: false },
};

describe("triangle_construction_mismatch", () => {
  it("fires when a floating triangle is attached to a pile rectangle", () => {
    const c: DockConfig = {
      ...base,
      pieces: [
        { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 16, widthFt: 8, construction: "pile" },
        { pieceKind: "right_triangle", posX: 16, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 4, construction: "floating" },
      ],
    };
    const codes = validationEngine(c).warnings.map((w) => w.code);
    expect(codes).toContain("triangle_construction_mismatch");
    expect(codes).not.toContain("triangle_isolated"); // it IS attached
  });

  it("does not fire when the triangle matches its adjacent rectangle", () => {
    const c: DockConfig = {
      ...base,
      pieces: [
        { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 16, widthFt: 8, construction: "pile" },
        { pieceKind: "right_triangle", posX: 16, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 4, construction: "pile" },
      ],
    };
    const codes = validationEngine(c).warnings.map((w) => w.code);
    expect(codes).not.toContain("triangle_construction_mismatch");
  });
});

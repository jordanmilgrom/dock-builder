/**
 * Phase 8 advisory: two adjacent rectangles of different construction form a
 * valid transition zone but fire `mixed_construction_adjacency` so the builder
 * verifies the connector hardware.
 */
import { describe, expect, it } from "vitest";
import { validationEngine, type DockConfig } from "@/engine";

const base: DockConfig = {
  schemaVersion: 1,
  tenantId: "acme-docks",
  dockType: "floating",
  use: "residential",
  site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1.5, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
  overall: { lengthFt: 36, widthFt: 8, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum", maxGapFt: 8 },
  gangway: { present: false },
};

describe("mixed_construction_adjacency", () => {
  it("fires for an adjacent floating + pile pair", () => {
    const c: DockConfig = {
      ...base,
      pieces: [
        { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8, construction: "floating" },
        { pieceKind: "rectangle", posX: 20, posY: 0, rotationDeg: 0, lengthFt: 16, widthFt: 8, construction: "pile" },
      ],
    };
    const codes = validationEngine(c).warnings.map((w) => w.code);
    expect(codes).toContain("mixed_construction_adjacency");
  });

  it("does NOT fire when adjacent pieces share the same construction", () => {
    const c: DockConfig = {
      ...base,
      pieces: [
        { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8, construction: "pile" },
        { pieceKind: "rectangle", posX: 20, posY: 0, rotationDeg: 0, lengthFt: 16, widthFt: 8, construction: "pile" },
      ],
    };
    const codes = validationEngine(c).warnings.map((w) => w.code);
    expect(codes).not.toContain("mixed_construction_adjacency");
  });
});

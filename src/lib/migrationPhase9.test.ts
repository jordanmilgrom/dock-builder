/**
 * Phase 9 config migration: scalar `construction` → `constructions` array, and
 * the gangway normalizes to the `{ mode }` shape.
 */
import { describe, expect, it } from "vitest";
import { migrateConfigToPhase9, type DockConfig } from "@/engine";

function legacy(): DockConfig {
  return {
    schemaVersion: 1,
    tenantId: "acme-docks",
    dockType: "pile",
    use: "residential",
    site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1.5, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
    overall: { lengthFt: 24, widthFt: 8, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum" },
    gangway: { present: true, targetSlope: "1:12" },
    // Phase 8 scalar construction (pre-Phase-9).
    pieces: [{ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 16, widthFt: 8, construction: "pile" }],
  };
}

describe("migrateConfigToPhase9", () => {
  it("converts each scalar construction into a single-element array (drops the scalar)", () => {
    const m = migrateConfigToPhase9(legacy());
    expect(m.pieces![0]!.constructions).toEqual(["pile"]);
    expect(m.pieces![0]!.construction).toBeUndefined();
  });

  it("defaults a piece with no construction from the dockType (pile)", () => {
    const c = legacy();
    delete c.pieces![0]!.construction;
    expect(migrateConfigToPhase9(c).pieces![0]!.constructions).toEqual(["pile"]);
  });

  it("normalizes a legacy targetSlope gangway to slope mode", () => {
    const m = migrateConfigToPhase9(legacy());
    expect(m.gangway?.mode).toBe("slope");
    expect(m.gangway?.targetSlope).toBe("1:12");
  });

  it("does not mutate the input", () => {
    const input = legacy();
    migrateConfigToPhase9(input);
    expect(input.pieces![0]!.construction).toBe("pile");
    expect(input.pieces![0]!.constructions).toBeUndefined();
  });
});

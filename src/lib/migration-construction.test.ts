/**
 * Phase 8 config migration: existing Phase 6/7 designs gain a per-piece
 * `construction` stamped from the design dockType (pipe→pile), and `overall.bayFt`
 * is renamed to `overall.maxGapFt`.
 */
import { describe, expect, it } from "vitest";
import { migrateConfigToPhase8, type DockConfig } from "@/engine";

function legacy(dockType: DockConfig["dockType"], bayFt?: number): DockConfig {
  return {
    schemaVersion: 1,
    tenantId: "acme-docks",
    dockType,
    use: "residential",
    site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1.5, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
    overall: { lengthFt: 24, widthFt: 8, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum", ...(bayFt != null ? { bayFt } : {}) },
    // pieces carry NO construction (pre-Phase-8).
    pieces: [
      { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 16, widthFt: 8 },
      { pieceKind: "right_triangle", posX: 16, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 4 },
    ],
  };
}

describe("migrateConfigToPhase8", () => {
  it("stamps every piece with construction = dockType (floating)", () => {
    const m = migrateConfigToPhase8(legacy("floating"));
    expect(m.pieces!.every((p) => p.construction === "floating")).toBe(true);
  });

  it("maps pipe → pile and stamps fixed types as pile", () => {
    expect(migrateConfigToPhase8(legacy("pipe")).pieces!.every((p) => p.construction === "pile")).toBe(true);
    expect(migrateConfigToPhase8(legacy("pile")).pieces!.every((p) => p.construction === "pile")).toBe(true);
    expect(migrateConfigToPhase8(legacy("crib")).pieces!.every((p) => p.construction === "pile")).toBe(true);
  });

  it("renames bayFt → maxGapFt (and drops the legacy field)", () => {
    const m = migrateConfigToPhase8(legacy("pile", 10));
    expect(m.overall.maxGapFt).toBe(10);
    expect((m.overall as { bayFt?: number }).bayFt).toBeUndefined();
  });

  it("defaults maxGapFt to 8 when neither maxGapFt nor bayFt is present", () => {
    expect(migrateConfigToPhase8(legacy("floating")).overall.maxGapFt).toBe(8);
  });

  it("does not mutate the input config", () => {
    const input = legacy("pile", 9);
    migrateConfigToPhase8(input);
    expect(input.pieces![0]!.construction).toBeUndefined();
    expect((input.overall as { bayFt?: number }).bayFt).toBe(9);
  });
});

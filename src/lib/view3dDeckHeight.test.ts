import { describe, expect, it } from "vitest";
import { resolvePieces, type DockConfig, type PieceConstruction } from "@/engine";
import { deckBottomYFor } from "@/lib/view3d";

const cfg = (constructions: PieceConstruction[], shoreHeightFt = 3): DockConfig => ({
  schemaVersion: 1,
  tenantId: "acme-docks",
  dockType: "floating",
  use: "residential",
  site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1.5, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: shoreHeightFt },
  overall: { lengthFt: 20, widthFt: 8, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum", maxGapFt: 8 },
  pieces: [{ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8, constructions }],
});

const deckY = (constructions: PieceConstruction[], shore = 3) => {
  const c = cfg(constructions, shore);
  return deckBottomYFor(resolvePieces(c)[0]!, c);
};

describe("deckBottomYFor — heights respect the engineering per construction", () => {
  it("pile decks sit level with the shore (shoreHeight − 0.5)", () => {
    expect(deckY(["pile"], 3)).toBeCloseTo(2.5, 6);
    expect(deckY(["pile"], 5)).toBeCloseTo(4.5, 6);
  });

  it("wheel decks ride at the fixed 14 in clearance (~1.17 ft)", () => {
    expect(deckY(["wheel"], 3)).toBeCloseTo(14 / 12, 6);
  });

  it("floating decks ride low (near the waterline, well under the pile height)", () => {
    const f = deckY(["floating"], 3);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(deckY(["wheel"], 3));
    expect(f).toBeLessThan(deckY(["pile"], 3));
  });

  it("multi-construction piece averages the construction heights", () => {
    const floating = deckY(["floating"], 3);
    const pile = deckY(["pile"], 3);
    expect(deckY(["floating", "pile"], 3)).toBeCloseTo((floating + pile) / 2, 6);
  });
});

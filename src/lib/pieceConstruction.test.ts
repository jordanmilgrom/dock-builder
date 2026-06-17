/**
 * Per-piece construction (Phase 8): a hybrid design with one floating, one pile,
 * and one wheel rectangle lays out the right supports per piece, and the derived
 * totals only count each construction's own supports.
 */
import { describe, expect, it } from "vitest";
import {
  flotationMultiplier,
  floatCount,
  floatLayoutForPiece,
  floatingAreaFt2,
  pileLayoutForPiece,
  pilingCount,
  requiredBuoyancyLbs,
  resolvePieces,
  wheelCount,
  wheelLayoutForPiece,
  type DockConfig,
} from "@/engine";

const hybrid: DockConfig = {
  schemaVersion: 1,
  tenantId: "acme-docks",
  dockType: "floating",
  use: "residential",
  site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1.5, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
  overall: { lengthFt: 48, widthFt: 8, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum", maxGapFt: 8 },
  pieces: [
    { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8, construction: "floating" },
    { pieceKind: "rectangle", posX: 20, posY: 0, rotationDeg: 0, lengthFt: 16, widthFt: 8, construction: "pile" },
    { pieceKind: "rectangle", posX: 36, posY: 0, rotationDeg: 0, lengthFt: 12, widthFt: 6, construction: "wheel" },
  ],
};

describe("hybrid layouts per piece", () => {
  const [floatingP, pileP, wheelP] = resolvePieces(hybrid);

  it("each layout helper only fires for its own construction", () => {
    expect(floatLayoutForPiece(floatingP!, 8).length).toBeGreaterThan(0);
    expect(floatLayoutForPiece(pileP!, 8)).toHaveLength(0);
    expect(floatLayoutForPiece(wheelP!, 8)).toHaveLength(0);

    expect(pileLayoutForPiece(pileP!, 8).length).toBeGreaterThan(0);
    expect(pileLayoutForPiece(floatingP!, 8)).toHaveLength(0);
    expect(pileLayoutForPiece(wheelP!, 8)).toHaveLength(0);

    expect(wheelLayoutForPiece(wheelP!)).toHaveLength(2);
    expect(wheelLayoutForPiece(floatingP!)).toHaveLength(0);
    expect(wheelLayoutForPiece(pileP!)).toHaveLength(0);
  });

  it("floats: 20×8 floating piece → 4 along length × 2 rows = 8", () => {
    expect(floatCount(hybrid)).toBe(8);
  });

  it("piles: 16×8 pile piece → 3 along length × 2 across = 6 (others contribute none)", () => {
    expect(pilingCount(hybrid)).toBe(6);
  });

  it("wheels: 12×6 wheel piece → 2 (others contribute none)", () => {
    expect(wheelCount(hybrid)).toBe(2);
  });

  it("required buoyancy is summed over the FLOATING piece's area only", () => {
    expect(floatingAreaFt2(hybrid)).toBe(20 * 8); // not 20×8 + 16×8 + 12×6
    expect(requiredBuoyancyLbs(hybrid)).toBeCloseTo(floatingAreaFt2(hybrid) * flotationMultiplier(hybrid), 2);
  });
});

describe("Phase 9: a single piece with MULTIPLE constructions", () => {
  const multi: DockConfig = {
    schemaVersion: 1,
    tenantId: "acme-docks",
    dockType: "floating",
    use: "residential",
    site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1.5, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
    overall: { lengthFt: 20, widthFt: 8, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum", maxGapFt: 8 },
    // One deck that is BOTH floating and pile-anchored.
    pieces: [{ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8, constructions: ["floating", "pile"] }],
  };
  const piece = resolvePieces(multi)[0]!;

  it("gets BOTH a float layout AND a pile layout", () => {
    expect(floatLayoutForPiece(piece, 8).length).toBeGreaterThan(0);
    expect(pileLayoutForPiece(piece, 8).length).toBeGreaterThan(0);
    expect(wheelLayoutForPiece(piece)).toHaveLength(0);
  });

  it("counts both floats and piles for the one piece, and bills both", () => {
    expect(floatCount(multi)).toBeGreaterThan(0);
    expect(pilingCount(multi)).toBeGreaterThan(0);
    expect(requiredBuoyancyLbs(multi)).toBeGreaterThan(0); // still floating → needs buoyancy
  });
});

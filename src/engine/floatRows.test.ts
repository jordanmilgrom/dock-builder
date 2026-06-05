import { describe, expect, it } from "vitest";
import { floatLayoutForPiece, resolvePieces } from "./index.js";
import { floatRowCount, FLOAT_PLACEMENT } from "./constants.js";
import type { DockPiece } from "./types.js";

function rect(lengthFt: number, widthFt: number): DockPiece {
  return { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt, widthFt };
}

/** Distinct row y-positions in a piece's float layout (local == world at origin). */
function rowYs(lengthFt: number, widthFt: number): number[] {
  const piece = resolvePieces({
    schemaVersion: 1, tenantId: "t", dockType: "floating", use: "residential",
    site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 0 },
    overall: { lengthFt, widthFt, deckingMaterial: "composite_trex", deckingOrientation: "straight", frameMaterial: "aluminum" },
    pieces: [rect(lengthFt, widthFt)],
  })[0]!;
  return [...new Set(floatLayoutForPiece(piece).map((p) => p.yFt))].sort((a, b) => a - b);
}

describe("float row formula (Phase 6 — cited industry rule)", () => {
  it("matches the cited examples: 5→2, 6→2, 11→2, 12→3, 18→4 rows", () => {
    expect(floatRowCount(5)).toBe(2);
    expect(floatRowCount(6)).toBe(2);
    expect(floatRowCount(11)).toBe(2);
    expect(floatRowCount(12)).toBe(3);
    expect(floatRowCount(18)).toBe(4);
  });

  it("a piece's layout uses the formula's row count", () => {
    expect(rowYs(20, 5)).toHaveLength(2);
    expect(rowYs(20, 6)).toHaveLength(2);
    expect(rowYs(20, 12)).toHaveLength(3);
    expect(rowYs(20, 18)).toHaveLength(4);
  });

  it("places a float at every corner and ≤ 8 ft along each row", () => {
    const piece = resolvePieces({
      schemaVersion: 1, tenantId: "t", dockType: "floating", use: "residential",
      site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 0 },
      overall: { lengthFt: 20, widthFt: 8, deckingMaterial: "composite_trex", deckingOrientation: "straight", frameMaterial: "aluminum" },
      pieces: [rect(20, 8)],
    })[0]!;
    const floats = floatLayoutForPiece(piece);
    // 4 corners present.
    for (const corner of [{ xFt: 0, yFt: 0 }, { xFt: 20, yFt: 0 }, { xFt: 0, yFt: 8 }, { xFt: 20, yFt: 8 }]) {
      expect(floats.some((f) => Math.abs(f.xFt - corner.xFt) < 0.01 && Math.abs(f.yFt - corner.yFt) < 0.01)).toBe(true);
    }
    // Along-row spacing ≤ 8 ft.
    const xs = [...new Set(floats.map((f) => f.xFt))].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeLessThanOrEqual(FLOAT_PLACEMENT.maxSpacingFt + 1e-9);
    // 20 ft → 2 rows × 4 columns = 8 floats.
    expect(floats).toHaveLength(8);
  });
});

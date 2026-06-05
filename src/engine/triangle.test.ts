import { describe, expect, it } from "vitest";
import { deckAreaFt2, floatLayoutForPiece, pieceAreaFt2, pileLayoutForPiece, resolvePieces, validationEngine } from "./index.js";
import { canonicalFloatingConfig, compliantFixedConfig, clone } from "./__fixtures__.js";
import type { DockPiece } from "./types.js";

const tri = (legAFt: number, legBFt: number): DockPiece => ({
  pieceKind: "right_triangle", posX: 0, posY: 0, rotationDeg: 0, legAFt, legBFt,
});

describe("right-triangle pieces (Phase 6)", () => {
  it("area = legA × legB / 2", () => {
    const c = clone(canonicalFloatingConfig);
    c.pieces = [tri(4, 4)];
    expect(deckAreaFt2(c)).toBe(8);
    const c2 = clone(canonicalFloatingConfig);
    c2.pieces = [{ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 8, widthFt: 6 }, tri(6, 4)];
    expect(deckAreaFt2(c2)).toBe(8 * 6 + (6 * 4) / 2); // 60
  });

  it("a triangle gets a float at each of its 3 corners", () => {
    const piece = resolvePieces({ ...canonicalFloatingConfig, pieces: [tri(4, 4)] })[0]!;
    const floats = floatLayoutForPiece(piece);
    for (const corner of [{ xFt: 0, yFt: 0 }, { xFt: 4, yFt: 0 }, { xFt: 0, yFt: 4 }]) {
      expect(floats.some((f) => Math.abs(f.xFt - corner.xFt) < 0.01 && Math.abs(f.yFt - corner.yFt) < 0.01)).toBe(true);
    }
  });

  it("a small triangle gets a pile at each of its 3 corners", () => {
    const c = clone(compliantFixedConfig);
    c.overall.bayFt = 8;
    c.pieces = [tri(4, 4)];
    const piece = resolvePieces(c)[0]!;
    const piles = pileLayoutForPiece(piece, 8);
    expect(piles).toHaveLength(3); // 4×4 triangle on an 8 ft grid → corners only
    expect(validationEngine(c).ok).toBe(true); // triangles are cantilever-exempt
  });

  it("area helper is consistent for triangles and rectangles", () => {
    expect(pieceAreaFt2(resolvePieces({ ...canonicalFloatingConfig, pieces: [tri(6, 4)] })[0]!)).toBe(12);
  });
});

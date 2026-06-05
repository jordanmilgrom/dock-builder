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

  it("a triangle is a connector: it carries NO floats of its own", () => {
    const piece = resolvePieces({ ...canonicalFloatingConfig, pieces: [tri(4, 4)] })[0]!;
    expect(floatLayoutForPiece(piece)).toEqual([]);
  });

  it("a triangle is a connector: it carries NO piles of its own", () => {
    const c = clone(compliantFixedConfig);
    c.overall.bayFt = 8;
    c.pieces = [tri(4, 4)];
    const piece = resolvePieces(c)[0]!;
    expect(pileLayoutForPiece(piece, 8)).toEqual([]);
    // The triangle is still cantilever-exempt (no error from the bay grid).
    expect(validationEngine(c).errors.map((e) => e.code)).not.toContain("pile_cantilever");
  });

  it("area helper is consistent for triangles and rectangles", () => {
    expect(pieceAreaFt2(resolvePieces({ ...canonicalFloatingConfig, pieces: [tri(6, 4)] })[0]!)).toBe(12);
  });
});

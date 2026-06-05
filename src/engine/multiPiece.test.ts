import { describe, expect, it } from "vitest";
import { deckAreaFt2, floatCount, pilingCount, resolvePieces, validationEngine } from "./index.js";
import { canonicalFloatingConfig, clone } from "./__fixtures__.js";
import type { DockPiece } from "./types.js";

/** The canonical connector L-shape: a 24×6 rectangle + a Δ4×4 corner triangle. */
function rectPlusTriangle(): DockPiece[] {
  return [
    { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 24, widthFt: 6 },
    { pieceKind: "right_triangle", posX: 24, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 4 },
  ];
}

/** An L-shape: a 8×20 spine plus a 8×8 ell off its lakeward end. */
function lShape(): DockPiece[] {
  return [
    { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8 },
    { pieceKind: "rectangle", posX: 20, posY: 0, rotationDeg: 0, lengthFt: 8, widthFt: 8 },
  ];
}

describe("multi-piece geometry (Phase 6)", () => {
  it("an L-shape from two rectangles validates with no blocking errors", () => {
    const c = clone(canonicalFloatingConfig);
    c.pieces = lShape();
    const result = validationEngine(c);
    expect(result.ok).toBe(true);
    expect(result.derived.sectionCount).toBe(2);
  });

  it("total deck area is the sum of piece areas", () => {
    const c = clone(canonicalFloatingConfig);
    c.pieces = lShape();
    expect(deckAreaFt2(c)).toBe(20 * 8 + 8 * 8); // 224
  });

  it("touching edges do NOT double-count area (areas are additive, not unioned)", () => {
    const c = clone(canonicalFloatingConfig);
    // Two 10×8 pieces sharing the edge at x=10.
    c.pieces = [
      { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 10, widthFt: 8 },
      { pieceKind: "rectangle", posX: 10, posY: 0, rotationDeg: 0, lengthFt: 10, widthFt: 8 },
    ];
    expect(deckAreaFt2(c)).toBe(160); // 80 + 80, the shared edge has zero area
  });

  it("resolves explicit pieces verbatim (no auto-sectioning)", () => {
    const c = clone(canonicalFloatingConfig);
    c.pieces = lShape();
    const pieces = resolvePieces(c);
    expect(pieces).toHaveLength(2);
    expect(pieces[1]).toMatchObject({ posX: 20, lengthFt: 8, widthFt: 8 });
  });

  describe("connector triangle (24×6 + Δ4×4)", () => {
    it("counts the triangle's AREA but places no float/pile on it (8 floats, not 11)", () => {
      const c = clone(canonicalFloatingConfig);
      c.pieces = rectPlusTriangle();
      // Area still includes the triangle so the rectangle's flotation carries it.
      expect(deckAreaFt2(c)).toBe(24 * 6 + (4 * 4) / 2); // 152
      // 24×6 rectangle → 2 rows × 4 cols = 8 floats; triangle adds 0 (was 8+3=11).
      expect(floatCount(c)).toBe(8);
    });

    it("piles likewise come only from the rectangle (none on the triangle)", () => {
      const c = clone(canonicalFloatingConfig);
      c.dockType = "pile";
      c.overall.bayFt = 8;
      // Rectangle 24×8 (grid-aligned) + Δ4×4 connector.
      c.pieces = [
        { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 24, widthFt: 8 },
        { pieceKind: "right_triangle", posX: 24, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 4 },
      ];
      // 24×8 on an 8 ft grid → (4 × 2) = 8 piles; triangle adds 0.
      expect(pilingCount(c)).toBe(8);
    });
  });
});

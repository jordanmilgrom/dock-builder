import { describe, expect, it } from "vitest";
import { deckAreaFt2, resolvePieces, validationEngine } from "./index.js";
import { canonicalFloatingConfig, clone } from "./__fixtures__.js";
import type { DockPiece } from "./types.js";

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
});

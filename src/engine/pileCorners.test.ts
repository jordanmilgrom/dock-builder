import { describe, expect, it } from "vitest";
import { pileLayoutForPiece, resolvePieces, validationEngine } from "./index.js";
import { compliantFixedConfig, clone } from "./__fixtures__.js";
import type { DockPiece } from "./types.js";

function pileConfig(piece: DockPiece, bayFt = 8) {
  const c = clone(compliantFixedConfig);
  c.overall.bayFt = bayFt;
  c.pieces = [piece];
  return c;
}

describe("pile corners + bay grid (Phase 6)", () => {
  it("a 16×8 piece on 8 ft bays → 6 piles (4 corners + 2 mid-edge)", () => {
    const c = pileConfig({ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 16, widthFt: 8 });
    const piece = resolvePieces(c)[0]!;
    const piles = pileLayoutForPiece(piece, 8);
    expect(piles).toHaveLength(6);
    // 4 corners present.
    for (const corner of [{ xFt: 0, yFt: 0 }, { xFt: 16, yFt: 0 }, { xFt: 0, yFt: 8 }, { xFt: 16, yFt: 8 }]) {
      expect(piles.some((p) => p.xFt === corner.xFt && p.yFt === corner.yFt)).toBe(true);
    }
    // 2 mid-edge piles at the x=8 bay line.
    expect(piles.filter((p) => p.xFt === 8)).toHaveLength(2);
    expect(validationEngine(c).ok).toBe(true);
  });

  it("Phase 8: a 17×8 piece even-distributes (no cantilever) but advises on short bays", () => {
    // 17 ft / ceil(17/8)=3 → three equal ~5.67 ft bays: 4 pile lines along length.
    const c = pileConfig({ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 17, widthFt: 8 });
    const piece = resolvePieces(c)[0]!;
    expect(pileLayoutForPiece(piece, 8)).toHaveLength(4 * 2); // 4 along length × 2 across width
    const result = validationEngine(c);
    expect(result.ok).toBe(true); // advisory, not an error
    expect(result.errors.map((e) => e.code)).not.toContain("pile_cantilever");
    expect(result.warnings.map((e) => e.code)).toContain("pile_lastbay_short");
  });

  it("places a pile at every corner (rectangle = 4 minimum)", () => {
    const c = pileConfig({ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 8, widthFt: 8 });
    const piece = resolvePieces(c)[0]!;
    expect(pileLayoutForPiece(piece, 8)).toHaveLength(4); // exactly the 4 corners
  });
});

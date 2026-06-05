import { describe, expect, it } from "vitest";
import { deckAreaFt2, resolvePieces, suggestedFloatLayout } from "./index.js";
import { canonicalFloatingConfig, clone } from "./__fixtures__.js";

describe("back-compat shim — pre-Phase-6 configs read as pieces", () => {
  it("a bare `overall` floating dock auto-sections into chained rectangle pieces", () => {
    // 40×6 aluminum (max 32 ft section) → 2 chained pieces of 20×6 from (0,0).
    const pieces = resolvePieces(canonicalFloatingConfig);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toMatchObject({ kind: "rectangle", posX: 0, posY: 0, lengthFt: 20, widthFt: 6 });
    expect(pieces[1]).toMatchObject({ kind: "rectangle", posX: 20, posY: 0, lengthFt: 20, widthFt: 6 });
  });

  it("legacy `sections` become a chain of rectangle pieces laid end-to-end", () => {
    const c = clone(canonicalFloatingConfig);
    delete (c as { pieces?: unknown }).pieces;
    c.sections = [
      { lengthFt: 18, widthFt: 6 },
      { lengthFt: 12, widthFt: 6 },
    ];
    const pieces = resolvePieces(c);
    expect(pieces.map((p) => ({ posX: p.posX, lengthFt: p.lengthFt }))).toEqual([
      { posX: 0, lengthFt: 18 },
      { posX: 18, lengthFt: 12 },
    ]);
    expect(deckAreaFt2(c)).toBe(18 * 6 + 12 * 6); // 180
  });

  it("a single short fixed dock reads as one rectangle piece", () => {
    const c = clone(canonicalFloatingConfig);
    delete (c as { pieces?: unknown }).pieces;
    c.dockType = "pile";
    c.overall.lengthFt = 16;
    c.overall.widthFt = 6;
    const pieces = resolvePieces(c);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ lengthFt: 16, widthFt: 6 });
  });

  it("float layout works on a legacy config (no pieces field)", () => {
    const c = clone(canonicalFloatingConfig);
    delete (c as { pieces?: unknown }).pieces;
    expect(suggestedFloatLayout(c).length).toBeGreaterThan(0);
  });
});

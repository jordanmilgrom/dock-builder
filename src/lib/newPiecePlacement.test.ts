import { describe, expect, it } from "vitest";
import { placeToRight } from "@/lib/newPiecePlacement";

describe("placeToRight", () => {
  it("offsets a new piece 1 ft to the right of the existing bbox", () => {
    // An 8×20 rectangle at (0,0) → bbox maxX=8, minY=0 → new piece at (9, 0).
    expect(placeToRight({ minX: 0, minY: 0, maxX: 8, maxY: 20 })).toEqual({ posX: 9, posY: 0 });
  });

  it("respects the existing bbox's top edge for posY", () => {
    expect(placeToRight({ minX: 10, minY: 6, maxX: 30, maxY: 14 })).toEqual({ posX: 31, posY: 6 });
  });

  it("falls back to the origin for an empty/degenerate design", () => {
    expect(placeToRight(null)).toEqual({ posX: 0, posY: 0 });
    expect(placeToRight({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })).toEqual({ posX: 0, posY: 0 });
  });
});

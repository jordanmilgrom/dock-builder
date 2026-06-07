import { describe, expect, it } from "vitest";
import {
  CORNER_HANDLES,
  HANDLES,
  RESIZE_MIN_FT,
  resizeRect,
  resizeTriangle,
  snapRect,
  snapTriangle,
  handleUnitPos,
} from "@/lib/resizeHandles";

const rect = { posX: 10, posY: 5, lengthFt: 20, widthFt: 8 };

describe("resizeRect — edge handles scale one dimension", () => {
  it("east edge grows length, origin fixed", () => {
    const r = resizeRect(rect, "e", 6, 0);
    expect(r).toMatchObject({ posX: 10, posY: 5, lengthFt: 26, widthFt: 8 });
  });

  it("west edge grows length and moves the origin (right edge anchored)", () => {
    const r = resizeRect(rect, "w", -4, 0);
    expect(r.lengthFt).toBe(24);
    expect(r.posX).toBe(6); // right edge (30) stays: 30 - 24
    expect(r.posX + r.lengthFt).toBe(30);
  });

  it("south edge grows width only", () => {
    const r = resizeRect(rect, "s", 0, 5);
    expect(r).toMatchObject({ posY: 5, widthFt: 13, lengthFt: 20 });
  });

  it("north edge anchors the bottom edge", () => {
    const r = resizeRect(rect, "n", 0, -3);
    expect(r.widthFt).toBe(11);
    expect(r.posY + r.widthFt).toBe(13); // bottom (5+8) preserved
  });
});

describe("resizeRect — corner handles scale both", () => {
  it("SE corner grows both dims", () => {
    const r = resizeRect(rect, "se", 4, 4);
    expect(r).toMatchObject({ posX: 10, posY: 5, lengthFt: 24, widthFt: 12 });
  });

  it("Shift (aspect) keeps the L/W ratio on a corner", () => {
    const r = resizeRect(rect, "se", 10, 0, { aspect: true });
    expect(r.lengthFt / r.widthFt).toBeCloseTo(20 / 8, 6);
  });
});

describe("resizeRect — min dimension floor", () => {
  it("never shrinks below 4 ft", () => {
    const r = resizeRect(rect, "e", -100, 0);
    expect(r.lengthFt).toBe(RESIZE_MIN_FT);
  });
});

describe("snapRect — 6 in snap on release", () => {
  it("rounds dims to the nearest half foot, keeping the anchor", () => {
    const dragged = { posX: 6, posY: 5, lengthFt: 23.7, widthFt: 8 };
    const r = snapRect(dragged, "w");
    expect(r.lengthFt).toBe(23.5);
    expect(r.posX + r.lengthFt).toBe(6 + 23.7); // right edge preserved pre-snap origin math
  });
});

describe("resizeTriangle", () => {
  const tri = { posX: 0, posY: 0, legAFt: 8, legBFt: 8 };

  it("leg-A handle scales only leg A", () => {
    const t = resizeTriangle(tri, "e", 4, 0);
    expect(t).toMatchObject({ legAFt: 12, legBFt: 8 });
  });

  it("leg-B handle scales only leg B", () => {
    const t = resizeTriangle(tri, "s", 0, 4);
    expect(t).toMatchObject({ legAFt: 8, legBFt: 12 });
  });

  it("right-angle corner scales both proportionally", () => {
    const t = resizeTriangle({ posX: 4, posY: 4, legAFt: 8, legBFt: 8 }, "nw", -4, -4);
    expect(t.legAFt).toBeCloseTo(t.legBFt, 6); // ratio preserved (was 1:1)
    expect(t.legAFt).toBeGreaterThan(8);
  });

  it("legs never shrink below 4 ft", () => {
    expect(resizeTriangle(tri, "e", -100, 0).legAFt).toBe(RESIZE_MIN_FT);
  });

  it("snapTriangle rounds legs to 6 in", () => {
    const t = snapTriangle({ posX: 0, posY: 0, legAFt: 7.8, legBFt: 4.1 });
    expect(t).toMatchObject({ legAFt: 8, legBFt: 4 });
  });
});

describe("handle catalog", () => {
  it("exposes 8 handles, 4 of them corners", () => {
    expect(HANDLES).toHaveLength(8);
    expect(CORNER_HANDLES).toHaveLength(4);
  });

  it("unit positions place corners at the extremes", () => {
    expect(handleUnitPos("nw")).toEqual({ u: 0, v: 0 });
    expect(handleUnitPos("se")).toEqual({ u: 1, v: 1 });
    expect(handleUnitPos("n")).toEqual({ u: 0.5, v: 0 });
    expect(handleUnitPos("e")).toEqual({ u: 1, v: 0.5 });
  });
});

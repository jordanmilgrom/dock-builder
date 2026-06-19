import { describe, expect, it } from "vitest";
import { drawnPiece, isDrawableDrag } from "@/lib/clickDragDraw";

describe("clickDragDraw", () => {
  it("rectangle: dragged dimensions snapped to 0.5 ft, origin at the min corner", () => {
    const p = drawnPiece("rectangle", { x: 2, y: 3 }, { x: 14.2, y: 9.1 });
    expect(p.pieceKind).toBe("rectangle");
    expect(p).toMatchObject({ posX: 2, posY: 3, lengthFt: 12, widthFt: 6 });
  });

  it("rectangle: handles drags in any direction (min corner is the origin)", () => {
    const p = drawnPiece("rectangle", { x: 14, y: 9 }, { x: 2, y: 3 });
    expect(p).toMatchObject({ posX: 2, posY: 3, lengthFt: 12, widthFt: 6 });
  });

  it("square: aspect locked 1:1, longest dimension wins", () => {
    const p = drawnPiece("square", { x: 0, y: 0 }, { x: 10, y: 4 });
    expect(p).toMatchObject({ lengthFt: 10, widthFt: 10 });
  });

  it("right triangle: right-angle corner at the drag-start corner", () => {
    const p = drawnPiece("right_triangle", { x: 0, y: 0 }, { x: 6, y: 8 });
    expect(p.pieceKind).toBe("right_triangle");
    expect(p).toMatchObject({ legAFt: 6, legBFt: 8, posX: 0, posY: 0 });
  });

  it("enforces the 4 ft minimum on every side", () => {
    const p = drawnPiece("rectangle", { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(p).toMatchObject({ lengthFt: 4, widthFt: 4 });
  });

  it("isDrawableDrag rejects a stray click", () => {
    expect(isDrawableDrag({ x: 0, y: 0 }, { x: 0.1, y: 0.1 })).toBe(false);
    expect(isDrawableDrag({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(true);
  });
});

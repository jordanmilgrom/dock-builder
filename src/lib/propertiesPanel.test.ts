import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DockPiece } from "@/engine";
import {
  clampDim,
  clampPos,
  cycleRotation,
  debounce,
  dimFields,
  MIN_DIM_FT,
  normalizeRotation,
  pieceLabel,
  selectionPill,
  stepDim,
  stepPos,
} from "@/lib/propertiesPanel";

describe("selectionPill", () => {
  it("shows Design when nothing is selected, Selection otherwise", () => {
    expect(selectionPill(null)).toBe("Design");
    expect(selectionPill(0)).toBe("Selection");
    expect(selectionPill(3)).toBe("Selection");
  });
});

describe("dimension steppers", () => {
  it("steps by 6 in and snaps", () => {
    expect(stepDim(8, 1)).toBe(8.5);
    expect(stepDim(8.2, 1)).toBe(8.5);
    expect(stepDim(8, -1)).toBe(7.5);
  });

  it("clamps to the 4 ft floor", () => {
    expect(stepDim(4, -1)).toBe(MIN_DIM_FT);
    expect(clampDim(2)).toBe(MIN_DIM_FT);
    expect(clampDim(NaN)).toBe(MIN_DIM_FT);
    expect(clampDim(9.3)).toBe(9.5);
  });
});

describe("position steppers", () => {
  it("steps and snaps to the 1 ft grid", () => {
    expect(stepPos(5, 1)).toBe(6);
    expect(stepPos(5.4, -1)).toBe(4);
    expect(clampPos(3.6)).toBe(4);
    expect(clampPos(-2.2)).toBe(-2);
    expect(clampPos(NaN)).toBe(0);
  });
});

describe("rotation", () => {
  it("normalizes to a canonical rotation", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(47)).toBe(90);
  });

  it("cycles by 90°", () => {
    expect(cycleRotation(0)).toBe(90);
    expect(cycleRotation(270)).toBe(0);
  });
});

describe("dimFields + pieceLabel", () => {
  const rect: DockPiece = { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8 };
  const tri: DockPiece = { pieceKind: "right_triangle", posX: 0, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 6 };

  it("exposes L/W for rectangles", () => {
    const [a, b] = dimFields(rect);
    expect(a).toMatchObject({ key: "lengthFt", value: 20 });
    expect(b).toMatchObject({ key: "widthFt", value: 8 });
    expect(pieceLabel(rect)).toContain("Rectangle");
  });

  it("exposes Leg A/B for triangles", () => {
    const [a, b] = dimFields(tri);
    expect(a).toMatchObject({ key: "legAFt", value: 4 });
    expect(b).toMatchObject({ key: "legBFt", value: 6 });
    expect(pieceLabel(tri)).toContain("triangle");
  });
});

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires once, trailing, after the delay", () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d(1); d(2); d(3);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it("flush() commits immediately; cancel() drops the pending call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d("a");
    d.flush();
    expect(fn).toHaveBeenCalledWith("a");
    d("b");
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

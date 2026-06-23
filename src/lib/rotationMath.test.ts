import { describe, expect, it } from "vitest";
import { angleDeg, applyRotation, handleUpDir, rotationDelta, snapAngle } from "@/lib/rotationMath";

describe("rotationMath", () => {
  it("angleDeg is atan2 around the pivot", () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, 6);
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 6);
    expect(angleDeg({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180, 6);
  });

  it("rotationDelta is continuous (current − initial around the center)", () => {
    const pivot = { x: 0, y: 0 };
    expect(rotationDelta(pivot, { x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 6);
    expect(rotationDelta(pivot, { x: 0, y: 1 }, { x: 1, y: 0 })).toBeCloseTo(-90, 6);
  });

  it("applyRotation normalizes to [0,360)", () => {
    expect(applyRotation(350, 20)).toBeCloseTo(10, 6);
    expect(applyRotation(10, -20)).toBeCloseTo(350, 6);
  });

  it("snapAngle snaps to 90 within ±5°, free otherwise", () => {
    expect(snapAngle(88)).toBe(90);
    expect(snapAngle(93)).toBe(90);
    expect(snapAngle(360)).toBe(0);
    expect(snapAngle(45)).toBe(45); // outside tolerance → free (rounded)
    expect(snapAngle(84)).toBe(84); // 6° away → not snapped
  });

  it("handleUpDir rotates the handle WITH the piece (the alpha-bug fix)", () => {
    const up = handleUpDir(0);
    expect(up.x).toBeCloseTo(0, 6);
    expect(up.y).toBeCloseTo(-1, 6); // straight up at rotation 0
    const right = handleUpDir(90);
    expect(right.x).toBeCloseTo(1, 6); // to the RIGHT at 90° (was the bug)
    expect(right.y).toBeCloseTo(0, 6);
  });
});

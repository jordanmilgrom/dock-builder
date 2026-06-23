import { describe, expect, it } from "vitest";
import { clampDepthHandle, clampLandSlope, clampShoreHeight, isMonotonic, setHandleDepth } from "@/lib/siteModeDrag";
import { DEFAULT_BATHYMETRY } from "@/engine";

const profile = () => DEFAULT_BATHYMETRY.depthProfile.map((p) => ({ ...p }));

describe("siteModeDrag", () => {
  it("clamps a depth handle between its neighbors (stays monotonic)", () => {
    // handle index 2 is {20, 6}; neighbors are 2 (idx1) and 8 (idx3).
    expect(clampDepthHandle(profile(), 2, 99)[2]!.depthFt).toBe(8); // capped at next
    expect(clampDepthHandle(profile(), 2, 0)[2]!.depthFt).toBe(2); // floored at prev
    expect(clampDepthHandle(profile(), 2, 5)[2]!.depthFt).toBe(5); // free within range
  });

  it("never lets depth go negative", () => {
    expect(clampDepthHandle(profile(), 0, -3)[0]!.depthFt).toBe(0);
  });

  it("keeps the profile monotonic after any single-handle edit", () => {
    for (let i = 0; i < profile().length; i++) {
      for (const d of [-5, 0, 3, 7, 100]) {
        expect(isMonotonic(clampDepthHandle(profile(), i, d))).toBe(true);
      }
    }
  });

  it("clamps shore height and land slope to sane ranges", () => {
    expect(clampShoreHeight(-2)).toBe(0);
    expect(clampShoreHeight(99)).toBe(20);
    expect(clampLandSlope(-10)).toBe(0);
    expect(clampLandSlope(250)).toBe(100);
  });

  it("setHandleDepth returns a new bathymetry immutably", () => {
    const next = setHandleDepth(DEFAULT_BATHYMETRY, 1, 3);
    expect(next.depthProfile[1]!.depthFt).toBe(3);
    expect(DEFAULT_BATHYMETRY.depthProfile[1]!.depthFt).toBe(2); // unchanged
  });
});

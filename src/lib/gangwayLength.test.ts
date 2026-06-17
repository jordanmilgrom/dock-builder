import { describe, expect, it } from "vitest";
import { computeGangway } from "@/engine/gangway";
import type { GangwayConfig } from "@/engine";

const lengthMode = (lengthFt: number): GangwayConfig => ({ present: true, mode: "length", lengthFt });

describe("computeGangway — length mode + slope warning", () => {
  it("12 ft over a 3 ft shore = 1:4 and warns (too steep)", () => {
    const r = computeGangway(lengthMode(12), 3);
    expect(r.slopeLabel).toBe("1:4");
    expect(r.warning).toBeTruthy();
  });

  it("36 ft over a 3 ft shore = 1:12 and is clean", () => {
    const r = computeGangway(lengthMode(18), 3); // clamps to max 24 → still test 18 (1:6)
    expect(r.warning).toBeTruthy();
    const ok = computeGangway(lengthMode(24), 2); // 24/2 = 1:12
    expect(ok.slopeLabel).toBe("1:12");
    expect(ok.warning).toBeUndefined();
  });

  it("18 ft over a 2 ft shore = 1:9 and warns (steeper than 1:12)", () => {
    const r = computeGangway(lengthMode(18), 2);
    expect(r.slopeLabel).toBe("1:9");
    expect(r.warning).toBeTruthy();
  });

  it("clamps length to the 3–24 ft range", () => {
    expect(computeGangway(lengthMode(100), 3).lengthFt).toBe(24);
    expect(computeGangway(lengthMode(1), 3).lengthFt).toBe(3);
  });

  it("slope mode derives length from the target slope", () => {
    const r = computeGangway({ present: true, mode: "slope", targetSlope: "1:12" }, 3);
    expect(r.lengthFt).toBeCloseTo(36, 1);
    expect(r.warning).toBeUndefined();
  });

  it("absent gangway → not present", () => {
    expect(computeGangway({ present: false }, 3).present).toBe(false);
  });
});

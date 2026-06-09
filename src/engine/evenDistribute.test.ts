import { describe, expect, it } from "vitest";
import { evenBayLengthFt, evenDistribute } from "./evenDistribute.js";

const near = (got: number[], want: number[]) => {
  expect(got).toHaveLength(want.length);
  got.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 3));
};

describe("evenDistribute(runLengthFt, maxGapFt)", () => {
  it("exact multiple → equal bays at the max gap", () => {
    near(evenDistribute(24, 8), [0, 8, 16, 24]); // 4 supports, 3 bays of 8 ft
    near(evenDistribute(32, 8), [0, 8, 16, 24, 32]); // 5 supports, 4 bays of 8 ft
  });

  it("non-multiple → equal bays under the max gap (the bug this fixes)", () => {
    // 22 ft at 8 ft max → 3 equal bays of ~7.33 ft, NOT 8 + 8 + 6.
    near(evenDistribute(22, 8), [0, 22 / 3, (22 / 3) * 2, 22]);
    expect(evenBayLengthFt(22, 8)).toBeCloseTo(22 / 3, 3);
  });

  it("run shorter than the max gap → only end supports", () => {
    near(evenDistribute(7, 8), [0, 7]); // 1 bay of 7 ft
  });

  it("degenerate run → a single support at the origin", () => {
    expect(evenDistribute(0, 8)).toEqual([0]);
    expect(evenDistribute(-5, 8)).toEqual([0]);
  });

  it("never overhangs: the last position is exactly the run length", () => {
    for (const len of [10, 13.5, 19, 27, 40]) {
      const pos = evenDistribute(len, 8);
      expect(pos[pos.length - 1]).toBeCloseTo(len, 6);
      // all bays equal
      for (let i = 1; i < pos.length; i++) {
        expect(pos[i]! - pos[i - 1]!).toBeCloseTo(len / (pos.length - 1), 6);
      }
    }
  });
});

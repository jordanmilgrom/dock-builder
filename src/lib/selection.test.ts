import { describe, expect, it } from "vitest";
import { clear, isContained, marqueeBbox, marqueeSelect, selectAll, toggle } from "@/lib/selection";

describe("selection", () => {
  it("shift-click toggles membership", () => {
    let s = new Set<string>();
    s = toggle(s, "a");
    expect([...s]).toEqual(["a"]);
    s = toggle(s, "b");
    expect(s.has("a") && s.has("b")).toBe(true);
    s = toggle(s, "a");
    expect([...s]).toEqual(["b"]);
  });

  it("Cmd-A selects all, Esc clears", () => {
    expect([...selectAll(["a", "b", "c"])]).toEqual(["a", "b", "c"]);
    expect(clear().size).toBe(0);
  });

  it("marquee selects only FULLY-contained pieces", () => {
    const marquee = marqueeBbox({ x: 0, y: 0 }, { x: 10, y: 10 });
    const pieces = [
      { id: "in", bbox: { minX: 1, minY: 1, maxX: 5, maxY: 5 } }, // fully inside
      { id: "edge", bbox: { minX: 8, minY: 8, maxX: 12, maxY: 12 } }, // pokes out
      { id: "out", bbox: { minX: 20, minY: 20, maxX: 30, maxY: 30 } }, // outside
    ];
    expect([...marqueeSelect(pieces, marquee)]).toEqual(["in"]);
  });

  it("isContained respects full containment", () => {
    const outer = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(isContained({ minX: 1, minY: 1, maxX: 9, maxY: 9 }, outer)).toBe(true);
    expect(isContained({ minX: -1, minY: 1, maxX: 9, maxY: 9 }, outer)).toBe(false);
  });

  it("marqueeBbox normalizes any drag direction", () => {
    expect(marqueeBbox({ x: 10, y: 10 }, { x: 0, y: 0 })).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });
});

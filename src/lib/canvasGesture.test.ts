import { describe, expect, it, vi } from "vitest";
import { beginGesture, dragTransform, rotateTransform } from "@/lib/canvasGesture";

describe("canvasGesture", () => {
  it("stores the initial state and builds the live DOM transform", () => {
    const g = beginGesture({ posX: 4, posY: 2 });
    expect(g.initial).toEqual({ posX: 4, posY: 2 });
    expect(g.transform(10, -5)).toBe("translate(10px, -5px)");
  });

  it("commits exactly once on release", () => {
    const g = beginGesture({ posX: 0, posY: 0 });
    const apply = vi.fn();
    expect(g.committed).toBe(false);
    g.commit(apply);
    g.commit(apply); // ignored
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ posX: 0, posY: 0 });
    expect(g.committed).toBe(true);
  });

  it("transform string builders", () => {
    expect(dragTransform(3, 4)).toBe("translate(3px, 4px)");
    expect(rotateTransform(90)).toBe("rotate(90deg)");
  });
});

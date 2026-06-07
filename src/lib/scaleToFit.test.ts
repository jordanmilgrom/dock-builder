import { describe, expect, it } from "vitest";
import {
  clampScale,
  fitBbox,
  MAX_SCALE,
  MIN_SCALE,
  notchFactor,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAround,
} from "@/lib/scaleToFit";

describe("fitBbox", () => {
  const viewport = { width: 1000, height: 600 };

  it("centers the bbox in the viewport", () => {
    const t = fitBbox({ minX: 0, minY: 0, maxX: 20, maxY: 8 }, viewport);
    const center = worldToScreen(t, 10, 4);
    expect(center.x).toBeCloseTo(500, 6);
    expect(center.y).toBeCloseTo(300, 6);
  });

  it("leaves ~10% padding (the design never fills the full pane)", () => {
    const t = fitBbox({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, { width: 500, height: 500 });
    // 100 ft fit into 500 px with 10% padding each side → 400 usable px → 4 px/ft.
    expect(t.scale).toBeCloseTo(4, 6);
  });

  it("uses the tighter of the two axes (uniform scale)", () => {
    const t = fitBbox({ minX: 0, minY: 0, maxX: 200, maxY: 10 }, viewport);
    // width-bound: 200 ft → 1000*0.8 = 800 px → 4 px/ft.
    expect(t.scale).toBeCloseTo(4, 6);
  });

  it("never exceeds the zoom clamps for a tiny design", () => {
    const t = fitBbox({ minX: 0, minY: 0, maxX: 0.001, maxY: 0.001 }, viewport);
    expect(t.scale).toBeLessThanOrEqual(MAX_SCALE);
  });

  it("falls back to a neutral box for an empty design", () => {
    const t = fitBbox({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }, viewport);
    expect(Number.isFinite(t.scale)).toBe(true);
    expect(Number.isFinite(t.translate.x)).toBe(true);
    expect(Number.isFinite(t.translate.y)).toBe(true);
  });
});

describe("worldToScreen / screenToWorld round-trip", () => {
  it("is its own inverse", () => {
    const t = { translate: { x: 37, y: -12 }, scale: 6.5 };
    const s = worldToScreen(t, 14, 9);
    const w = screenToWorld(t, s.x, s.y);
    expect(w.x).toBeCloseTo(14, 9);
    expect(w.y).toBeCloseTo(9, 9);
  });
});

describe("zoomAround", () => {
  it("keeps the world point under the cursor fixed", () => {
    const t = { translate: { x: 0, y: 0 }, scale: 2 };
    const cursor = { x: 320, y: 240 };
    const before = screenToWorld(t, cursor.x, cursor.y);
    const z = zoomAround(t, 1.1, cursor);
    const after = screenToWorld(z, cursor.x, cursor.y);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(z.scale).toBeCloseTo(2.2, 9);
  });

  it("respects the min/max clamps", () => {
    const t = { translate: { x: 0, y: 0 }, scale: MAX_SCALE };
    expect(zoomAround(t, 2, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
    const t2 = { translate: { x: 0, y: 0 }, scale: MIN_SCALE };
    expect(zoomAround(t2, 0.5, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
  });
});

describe("panBy + helpers", () => {
  it("translates without changing scale", () => {
    const t = panBy({ translate: { x: 5, y: 5 }, scale: 3 }, 10, -4);
    expect(t).toEqual({ translate: { x: 15, y: 1 }, scale: 3 });
  });

  it("clampScale honors bounds", () => {
    expect(clampScale(1000)).toBe(MAX_SCALE);
    expect(clampScale(0)).toBe(MIN_SCALE);
    expect(clampScale(NaN)).toBe(MIN_SCALE);
  });

  it("notchFactor zooms in on scroll-up, out on scroll-down", () => {
    expect(notchFactor(-1)).toBeCloseTo(1.1, 9);
    expect(notchFactor(1)).toBeCloseTo(1 / 1.1, 9);
  });
});

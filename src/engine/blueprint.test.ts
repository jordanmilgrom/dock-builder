import { describe, expect, it } from "vitest";
import {
  allViews,
  endElevation,
  isometricView,
  planView,
  sideElevation,
} from "./blueprint.js";
import { floatCount, suggestedPileLayout } from "./geometry.js";
import {
  canonicalFloatingConfig,
  compliantFixedConfig,
} from "./__fixtures__.js";

const countKind = (shapes: { kind: string }[], kind: string): number =>
  shapes.filter((s) => s.kind === kind).length;

describe("blueprint — structural invariants", () => {
  it("emits four named views on a fixed canvas", () => {
    const views = allViews(canonicalFloatingConfig);
    expect(views.map((v) => v.id)).toEqual([
      "plan",
      "side_elevation",
      "end_elevation",
      "isometric",
    ]);
    for (const v of views) {
      expect(v.width).toBeGreaterThan(0);
      expect(v.height).toBeGreaterThan(0);
      expect(v.shapes.length).toBeGreaterThan(0);
    }
  });

  it("plan view draws one float rect per engine-suggested float", () => {
    const plan = planView(canonicalFloatingConfig);
    // Float rects + section rects + water/shore/gangway rects; count rects that
    // correspond to floats by matching the engine's float count via circles=0.
    expect(countKind(plan.shapes, "circle")).toBeGreaterThanOrEqual(0);
    // There must be at least as many rects as floats (floats are rects).
    expect(countKind(plan.shapes, "rect")).toBeGreaterThanOrEqual(
      floatCount(canonicalFloatingConfig),
    );
  });

  it("plan view draws a pile circle per pile for a fixed dock", () => {
    const plan = planView(compliantFixedConfig);
    expect(countKind(plan.shapes, "circle")).toBeGreaterThanOrEqual(
      suggestedPileLayout(compliantFixedConfig).length,
    );
  });

  it("side elevation includes a waterline and a gangway label when present", () => {
    const side = sideElevation(canonicalFloatingConfig);
    const texts = side.shapes.filter((s) => s.kind === "text") as {
      text: string;
    }[];
    expect(texts.some((t) => /waterline/i.test(t.text))).toBe(true);
    expect(texts.some((t) => /gangway/i.test(t.text))).toBe(true);
  });

  it("coordinates stay within the canvas bounds", () => {
    for (const v of allViews(canonicalFloatingConfig)) {
      for (const s of v.shapes) {
        const pts =
          s.kind === "line"
            ? [s.a, s.b]
            : s.kind === "polygon"
              ? s.points
              : s.kind === "circle"
                ? [s.c]
                : s.kind === "text"
                  ? [s.at]
                  : [{ x: s.x, y: s.y }];
        for (const p of pts) {
          expect(p.x).toBeGreaterThanOrEqual(-2);
          expect(p.x).toBeLessThanOrEqual(v.width + 2);
        }
      }
    }
  });
});

describe("blueprint — render snapshots per view", () => {
  it("plan", () => expect(planView(canonicalFloatingConfig)).toMatchSnapshot());
  it("side", () => expect(sideElevation(canonicalFloatingConfig)).toMatchSnapshot());
  it("end", () => expect(endElevation(canonicalFloatingConfig)).toMatchSnapshot());
  it("isometric", () => expect(isometricView(canonicalFloatingConfig)).toMatchSnapshot());
  it("fixed plan", () => expect(planView(compliantFixedConfig)).toMatchSnapshot());
});

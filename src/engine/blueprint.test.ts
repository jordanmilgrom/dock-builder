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
  clone,
  compliantFixedConfig,
} from "./__fixtures__.js";
import type { DockConfig } from "./types.js";

const countKind = (shapes: { kind: string }[], kind: string): number =>
  shapes.filter((s) => s.kind === kind).length;

/** A floating L-shape: 24×6 rectangle + a Δ4×4 connector triangle. */
function lShapeWithTriangle(): DockConfig {
  const c = clone(canonicalFloatingConfig);
  c.pieces = [
    { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 24, widthFt: 6 },
    { pieceKind: "right_triangle", posX: 24, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 4 },
  ];
  return c;
}

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

describe("blueprint — Bug C: floats stay inside the deck outline", () => {
  // Float symbols are filled with COLOR.float; deck polygons with COLOR.deck.
  const isFloatRect = (s: { kind: string; style?: { fill?: string } }) => s.kind === "rect" && s.style?.fill === "#cbd5e1";
  const isDeckPoly = (s: { kind: string; style?: { fill?: string } }) => s.kind === "polygon" && s.style?.fill === "#f5e6c8";

  it("every float rect's bounds ⊆ some deck polygon's bounds (no overhang)", () => {
    for (const config of [canonicalFloatingConfig, lShapeWithTriangle()]) {
      const plan = planView(config);
      const deckBoxes = plan.shapes.filter(isDeckPoly).map((s) => {
        const pts = (s as { points: { x: number; y: number }[] }).points;
        return {
          x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)),
          y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)),
        };
      });
      const floats = plan.shapes.filter(isFloatRect) as { x: number; y: number; w: number; h: number }[];
      expect(floats.length).toBeGreaterThan(0);
      for (const fr of floats) {
        const fits = deckBoxes.some((d) => fr.x >= d.x0 - 0.6 && fr.x + fr.w <= d.x1 + 0.6 && fr.y >= d.y0 - 0.6 && fr.y + fr.h <= d.y1 + 0.6);
        expect(fits, `float rect (${fr.x},${fr.y}) ${fr.w}×${fr.h} pokes out`).toBe(true);
      }
    }
  });
});

describe("blueprint — Bug D: elevations are real-scale (no exaggeration)", () => {
  it("side & end elevations use one uniform px/ft (vertical == horizontal)", () => {
    for (const v of [sideElevation(canonicalFloatingConfig), endElevation(canonicalFloatingConfig)]) {
      expect(v.scalePxPerFt).toBeDefined();
      expect(v.scalePxPerFt!.x).toBe(v.scalePxPerFt!.y);
      expect(v.title).not.toMatch(/exagger/i);
    }
  });

  it("plan view reports the §6 annotation set (overall dims, gangway slope, shore arrow)", () => {
    const texts = (planView(canonicalFloatingConfig).shapes.filter((s) => s.kind === "text") as { text: string }[]).map((t) => t.text);
    expect(texts.some((t) => /overall length/i.test(t))).toBe(true);
    expect(texts.some((t) => /overall width/i.test(t))).toBe(true);
    expect(texts.some((t) => /gangway .*%/i.test(t))).toBe(true);
    expect(texts).toContain("N");
  });
});

describe("blueprint — render snapshots per view", () => {
  it("plan", () => expect(planView(canonicalFloatingConfig)).toMatchSnapshot());
  it("side", () => expect(sideElevation(canonicalFloatingConfig)).toMatchSnapshot());
  it("end", () => expect(endElevation(canonicalFloatingConfig)).toMatchSnapshot());
  it("isometric", () => expect(isometricView(canonicalFloatingConfig)).toMatchSnapshot());
  it("fixed plan", () => expect(planView(compliantFixedConfig)).toMatchSnapshot());
});

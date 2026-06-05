/**
 * Blueprint / view-geometry generator (spec §6, §7.1).
 *
 * The third pure consumer of the DockConfig (alongside validation and pricing).
 * It emits framework-free **drawing primitives** (lines, rects, polygons,
 * circles, text in a fixed pixel canvas) for the four required views: 2D plan,
 * side elevation, end elevation, and one ~30° isometric.
 *
 * Renderers (browser SVG, server-side PDF) are dumb mappers over these
 * primitives — they never compute geometry. All dock geometry comes from the
 * shared `geometry` module so the drawings can never drift from the engine.
 */

import {
  deckAreaFt2,
  freeboard,
  gangwayLengthFt,
  gangwaySlopePct,
  suggestedFloatLayout,
  suggestedPileLayout,
} from "./geometry.js";
import { pieceWorldPolygon, resolvePieces, worldBounds } from "./pieces.js";
import { DEFAULT_FLOAT } from "./constants.js";
import type { DockConfig } from "./types.js";

/** World bounding dimensions (ft) across all resolved pieces. */
function boundsDims(config: DockConfig): { lengthFt: number; widthFt: number; minX: number; minY: number } {
  const b = worldBounds(resolvePieces(config));
  return { lengthFt: Math.max(b.maxX - b.minX, 1), widthFt: Math.max(b.maxY - b.minY, 1), minX: b.minX, minY: b.minY };
}

// ---------------------------------------------------------------------------
// Primitive model
// ---------------------------------------------------------------------------

export interface Pt {
  x: number;
  y: number;
}

export interface DrawStyle {
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  dashed?: boolean;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  align?: "start" | "middle" | "end";
  opacity?: number;
}

export type Shape =
  | { kind: "line"; a: Pt; b: Pt; style?: DrawStyle }
  | { kind: "rect"; x: number; y: number; w: number; h: number; style?: DrawStyle }
  | { kind: "polygon"; points: Pt[]; closed?: boolean; style?: DrawStyle }
  | { kind: "circle"; c: Pt; r: number; style?: DrawStyle }
  | { kind: "text"; at: Pt; text: string; style?: DrawStyle };

export type ViewId = "plan" | "side_elevation" | "end_elevation" | "isometric";

export interface Drawing {
  id: ViewId;
  title: string;
  width: number;
  height: number;
  shapes: Shape[];
}

// ---------------------------------------------------------------------------
// Palette & canvas
// ---------------------------------------------------------------------------

const COLOR = {
  ink: "#1f2937",
  dim: "#6b7280",
  water: "#e0f2fe",
  waterline: "#0284c7",
  deck: "#f5e6c8",
  float: "#cbd5e1",
  floatStroke: "#475569",
  pile: "#94a3b8",
  pileStroke: "#334155",
  gangway: "#fde9c8",
  bottom: "#a8a29e",
  accent: "#b45309",
} as const;

const CANVAS = { w: 800, h: 480, margin: 56 } as const;

const r1 = (n: number): number => Math.round(n * 10) / 10;
const ft = (n: number): string => `${r1(n)} ft`;

/** Map dock-local feet to a canvas region with uniform scale and optional y-flip. */
class Frame {
  readonly scale: number;
  private readonly ox: number;
  private readonly oy: number;
  constructor(
    modelW: number,
    modelH: number,
    private readonly opts: {
      canvasW?: number;
      canvasH?: number;
      margin?: number;
      flipY?: boolean;
      /** Independent vertical exaggeration for elevations (schematic). */
      vScale?: number;
    } = {},
  ) {
    const canvasW = opts.canvasW ?? CANVAS.w;
    const canvasH = opts.canvasH ?? CANVAS.h;
    const margin = opts.margin ?? CANVAS.margin;
    const usableW = canvasW - 2 * margin;
    const usableH = canvasH - 2 * margin;
    this.scale = Math.min(usableW / modelW, usableH / modelH);
    // Center the model in the usable area.
    this.ox = margin + (usableW - modelW * this.scale) / 2;
    this.oy = margin + (usableH - modelH * this.scale) / 2;
  }
  /** Horizontal model coordinate (feet) → canvas px. */
  x(xFt: number): number {
    return round1(this.ox + xFt * this.scale);
  }
  /** Vertical model coordinate (feet) → canvas px (flips when flipY set). */
  y(yFt: number): number {
    const s = (this.opts.vScale ?? 1) * this.scale;
    if (this.opts.flipY) {
      // 0 maps near the bottom of the usable area; positive grows upward.
      return round1(this.oy + (CANVAS.h - 2 * (this.opts.margin ?? CANVAS.margin)) - yFt * s);
    }
    return round1(this.oy + yFt * this.scale);
  }
  len(ft_: number): number {
    return round1(ft_ * this.scale);
  }
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Small primitive builders
// ---------------------------------------------------------------------------

function text(
  at: Pt,
  s: string,
  style: DrawStyle = {},
): Shape {
  return {
    kind: "text",
    at,
    text: s,
    style: { fontSize: 11, fill: COLOR.ink, align: "start", ...style },
  };
}

/** A horizontal dimension line with end ticks and a centered label. */
function hDim(x1: number, x2: number, y: number, label: string): Shape[] {
  const tick = 4;
  return [
    { kind: "line", a: { x: x1, y }, b: { x: x2, y }, style: { stroke: COLOR.dim } },
    { kind: "line", a: { x: x1, y: y - tick }, b: { x: x1, y: y + tick }, style: { stroke: COLOR.dim } },
    { kind: "line", a: { x: x2, y: y - tick }, b: { x: x2, y: y + tick }, style: { stroke: COLOR.dim } },
    text({ x: (x1 + x2) / 2, y: y - 5 }, label, { fill: COLOR.dim, align: "middle" }),
  ];
}

/** A vertical dimension line with end ticks and a label. */
function vDim(x: number, y1: number, y2: number, label: string): Shape[] {
  const tick = 4;
  return [
    { kind: "line", a: { x, y: y1 }, b: { x, y: y2 }, style: { stroke: COLOR.dim } },
    { kind: "line", a: { x: x - tick, y: y1 }, b: { x: x + tick, y: y1 }, style: { stroke: COLOR.dim } },
    { kind: "line", a: { x: x - tick, y: y2 }, b: { x: x + tick, y: y2 }, style: { stroke: COLOR.dim } },
    text({ x: x + 6, y: (y1 + y2) / 2 }, label, { fill: COLOR.dim, align: "start" }),
  ];
}

function resolveFloatHeightIn(config: DockConfig): number {
  const cat = config.floatCatalog;
  if (cat) {
    const first = Object.values(cat)[0];
    if (first) return first.heightIn;
  }
  return DEFAULT_FLOAT.heightIn;
}

// ---------------------------------------------------------------------------
// PLAN (top-down) — §6
// ---------------------------------------------------------------------------

export function planView(config: DockConfig): Drawing {
  const shapes: Shape[] = [];
  const pieces = resolvePieces(config);
  const { lengthFt, widthFt, minX, minY } = boundsDims(config);
  const gangL = gangwayLengthFt(config);
  const shoreBand = Math.max(2, lengthFt * 0.08);

  const modelW = shoreBand + gangL + lengthFt;
  const modelH = Math.max(widthFt, 6);
  const f = new Frame(modelW, modelH);

  // World→canvas mapping shared by pieces, floats and piles (single frame).
  const yOffset = (modelH - widthFt) / 2 - minY;
  const baseX = shoreBand + gangL - minX;
  const wx = (xFt: number): number => f.x(baseX + xFt);
  const wy = (yFt: number): number => f.y(yOffset + yFt);

  // Water background.
  shapes.push({ kind: "rect", x: 0, y: 0, w: CANVAS.w, h: CANVAS.h, style: { fill: COLOR.water, stroke: "none" } });

  const yTop = f.y((modelH - widthFt) / 2);
  const yBot = f.y((modelH - widthFt) / 2 + widthFt);
  const dockX0 = f.x(shoreBand + gangL);
  const dockX1 = f.x(shoreBand + gangL + lengthFt);

  // Shore band on the left.
  shapes.push({ kind: "rect", x: 0, y: 0, w: f.x(shoreBand), h: CANVAS.h, style: { fill: COLOR.bottom, stroke: "none", opacity: 0.5 } });
  shapes.push(text({ x: 8, y: 20 }, "SHORE", { fontWeight: "bold", fill: COLOR.ink }));

  // Gangway (plan projection).
  if (gangL > 0) {
    const gWidthFt = (config.gangway?.widthIn ?? 48) / 12;
    const gyTop = f.y((modelH - gWidthFt) / 2);
    const gyBot = f.y((modelH - gWidthFt) / 2 + gWidthFt);
    shapes.push({ kind: "rect", x: f.x(shoreBand), y: gyTop, w: f.len(gangL), h: gyBot - gyTop, style: { fill: COLOR.gangway, stroke: COLOR.ink } });
    shapes.push(text({ x: (f.x(shoreBand) + dockX0) / 2, y: gyTop - 6 }, "gangway", { fill: COLOR.accent, align: "middle" }));
  }

  // Each drawn piece, at its world placement (Phase 6 — one polygon per piece).
  for (let i = 0; i < pieces.length; i++) {
    const poly = pieceWorldPolygon(pieces[i]!).map((pt) => ({ x: wx(pt.xFt), y: wy(pt.yFt) }));
    shapes.push({ kind: "polygon", points: poly, closed: true, style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 } });
  }

  // Floats or pilings (engine-supplied world positions).
  for (const p of suggestedFloatLayout(config)) {
    const fw = f.len(DEFAULT_FLOAT.lengthIn / 12);
    const fh = f.len(DEFAULT_FLOAT.widthIn / 12);
    shapes.push({ kind: "rect", x: wx(p.xFt) - fw / 2, y: wy(p.yFt) - fh / 2, w: fw, h: fh, style: { fill: COLOR.float, stroke: COLOR.floatStroke, opacity: 0.85 } });
  }
  for (const p of suggestedPileLayout(config)) {
    shapes.push({ kind: "circle", c: { x: wx(p.xFt), y: wy(p.yFt) }, r: 4, style: { fill: COLOR.pile, stroke: COLOR.pileStroke } });
  }

  if (config.accessories?.some((a) => a.type === "ladder")) {
    shapes.push(text({ x: dockX1 - 4, y: yBot + 14 }, "ladder", { fill: COLOR.accent, align: "end" }));
  }

  // Overall dimensions + north arrow.
  shapes.push(...hDim(dockX0, dockX1, yBot + 28, ft(lengthFt)));
  shapes.push(...vDim(dockX1 + 22, yTop, yBot, ft(widthFt)));
  shapes.push(...northArrow(CANVAS.w - 40, 40));

  return { id: "plan", title: "Plan — top view", width: CANVAS.w, height: CANVAS.h, shapes };
}

function northArrow(cx: number, cy: number): Shape[] {
  return [
    { kind: "line", a: { x: cx, y: cy + 16 }, b: { x: cx, y: cy - 16 }, style: { stroke: COLOR.ink, strokeWidth: 1.5 } },
    {
      kind: "polygon",
      points: [
        { x: cx, y: cy - 20 },
        { x: cx - 5, y: cy - 8 },
        { x: cx + 5, y: cy - 8 },
      ],
      closed: true,
      style: { fill: COLOR.ink, stroke: COLOR.ink },
    },
    text({ x: cx, y: cy + 30 }, "N", { align: "middle", fontWeight: "bold" }),
  ];
}

// ---------------------------------------------------------------------------
// SIDE ELEVATION — §6
// ---------------------------------------------------------------------------

export function sideElevation(config: DockConfig): Drawing {
  const shapes: Shape[] = [];
  const { lengthFt } = boundsDims(config);
  const gangL = gangwayLengthFt(config);
  const rise = config.site.shoreHeightAboveWaterFt;
  const depth = config.site.depthAtEndLowWaterFt;

  const modelW = gangL + lengthFt + 4;
  // Vertical model range spans from the bottom (-depth) to the shore top (rise).
  const vRange = Math.max(rise, 1) + Math.max(depth, 1) + 2;
  // Elevations are schematic: exaggerate the vertical so thin docks read.
  const f = new Frame(modelW, vRange, { flipY: true });
  const vScale = (f.scale * 2.2);
  const waterY = CANVAS.h - CANVAS.margin - f.len(depth) * 2.2;
  const Y = (zf: number): number => round1(waterY - zf * vScale);
  const X = (xf: number): number => f.x(xf);

  // Water + waterline.
  shapes.push({ kind: "rect", x: 0, y: waterY, w: CANVAS.w, h: CANVAS.h - waterY, style: { fill: COLOR.water, stroke: "none" } });
  shapes.push({ kind: "line", a: { x: 0, y: waterY }, b: { x: CANVAS.w, y: waterY }, style: { stroke: COLOR.waterline, strokeWidth: 1.5 } });
  shapes.push(text({ x: 6, y: waterY - 4 }, "waterline (low)", { fill: COLOR.waterline }));

  // Bottom line.
  shapes.push({ kind: "line", a: { x: 0, y: Y(-depth) }, b: { x: CANVAS.w, y: Y(-depth) }, style: { stroke: COLOR.bottom, strokeWidth: 1.5, dashed: true } });
  shapes.push(text({ x: 6, y: Y(-depth) + 14 }, `bottom (−${ft(depth)})`, { fill: COLOR.bottom }));

  const deckX0 = X(gangL + 2);
  const deckX1 = X(gangL + 2 + lengthFt);

  if (config.dockType === "floating") {
    const fb = freeboard(config);
    const floatHIn = resolveFloatHeightIn(config);
    const floatHFt = floatHIn / 12;
    const sub = fb.submergenceFraction ?? 0.4;
    const fbFt = (fb.freeboardIn ?? floatHIn * (1 - sub)) / 12;
    const deckTopZ = fbFt + 0.3; // deck planks sit just above float top
    // Floats from below waterline to freeboard.
    for (const p of distinctX(suggestedFloatLayout(config))) {
      const px = X(gangL + 2 + p);
      const fw = f.len(DEFAULT_FLOAT.lengthIn / 12);
      shapes.push({
        kind: "rect",
        x: px - fw / 2,
        y: Y(fbFt),
        w: fw,
        h: Y(-(floatHFt - fbFt)) - Y(fbFt),
        style: { fill: COLOR.float, stroke: COLOR.floatStroke },
      });
    }
    // Deck slab.
    shapes.push({ kind: "rect", x: deckX0, y: Y(deckTopZ), w: deckX1 - deckX0, h: Y(fbFt) - Y(deckTopZ), style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 } });
    shapes.push(...vDim(deckX1 + 16, Y(fbFt), waterY, `freeboard ${r1(fbFt * 12)} in`));
  } else {
    // Fixed: deck on pilings driven into the bottom.
    const deckTopZ = rise; // deck roughly level with shore top
    for (const p of distinctX(suggestedPileLayout(config))) {
      const px = X(gangL + 2 + p);
      shapes.push({ kind: "line", a: { x: px, y: Y(-depth) }, b: { x: px, y: Y(deckTopZ) }, style: { stroke: COLOR.pileStroke, strokeWidth: 3 } });
    }
    shapes.push({ kind: "rect", x: deckX0, y: Y(deckTopZ + 0.4), w: deckX1 - deckX0, h: Y(deckTopZ) - Y(deckTopZ + 0.4), style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 } });
    shapes.push(...vDim(deckX1 + 16, Y(deckTopZ), waterY, `deck height ${ft(rise)}`));
    shapes.push(...vDim(deckX0 - 16, Y(0), Y(-depth), `embedment ${ft(depth)}`));
  }

  // Gangway from shore top down to deck.
  if (gangL > 0) {
    const slope = gangwaySlopePct(config);
    const shoreTop = { x: X(0), y: Y(rise) };
    const deckMeet = { x: deckX0, y: config.dockType === "floating" ? Y((freeboard(config).freeboardIn ?? 0) / 12 + 0.3) : Y(rise) };
    shapes.push({ kind: "line", a: shoreTop, b: deckMeet, style: { stroke: COLOR.accent, strokeWidth: 2 } });
    shapes.push(text({ x: (shoreTop.x + deckMeet.x) / 2, y: (shoreTop.y + deckMeet.y) / 2 - 6 }, `gangway ${ft(gangL)}${slope != null ? ` @ ${slope}%` : ""}`, { fill: COLOR.accent, align: "middle" }));
    // Shore mass.
    shapes.push({ kind: "polygon", points: [{ x: 0, y: waterY }, { x: X(0), y: waterY }, { x: X(0), y: Y(rise) }, { x: 0, y: Y(rise) }], closed: true, style: { fill: COLOR.bottom, stroke: "none", opacity: 0.5 } });
    shapes.push(...vDim(X(0) - 14, Y(0), Y(rise), `rise ${ft(rise)}`));
  }

  return { id: "side_elevation", title: "Elevation — side (schematic, V exaggerated)", width: CANVAS.w, height: CANVAS.h, shapes };
}

/** Unique x positions (feet) from a placement list, sorted. */
function distinctX(positions: { xFt: number }[]): number[] {
  return [...new Set(positions.map((p) => p.xFt))].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// END ELEVATION — §6
// ---------------------------------------------------------------------------

export function endElevation(config: DockConfig): Drawing {
  const shapes: Shape[] = [];
  const { widthFt } = boundsDims(config);
  const depth = config.site.depthAtEndLowWaterFt;
  const rise = config.site.shoreHeightAboveWaterFt;

  const modelW = widthFt + 4;
  const vRange = Math.max(rise, 1) + Math.max(depth, 1) + 2;
  const f = new Frame(modelW, vRange, { flipY: true });
  const vScale = f.scale * 2.2;
  const waterY = CANVAS.h - CANVAS.margin - f.len(depth) * 2.2;
  const Y = (zf: number): number => round1(waterY - zf * vScale);
  const X = (yf: number): number => f.x(yf + 2);

  shapes.push({ kind: "rect", x: 0, y: waterY, w: CANVAS.w, h: CANVAS.h - waterY, style: { fill: COLOR.water, stroke: "none" } });
  shapes.push({ kind: "line", a: { x: 0, y: waterY }, b: { x: CANVAS.w, y: waterY }, style: { stroke: COLOR.waterline, strokeWidth: 1.5 } });
  shapes.push(text({ x: 6, y: waterY - 4 }, "waterline", { fill: COLOR.waterline }));
  shapes.push({ kind: "line", a: { x: 0, y: Y(-depth) }, b: { x: CANVAS.w, y: Y(-depth) }, style: { stroke: COLOR.bottom, dashed: true } });

  const x0 = X(0);
  const x1 = X(widthFt);

  if (config.dockType === "floating") {
    const fb = freeboard(config);
    const floatHFt = resolveFloatHeightIn(config) / 12;
    const fbFt = (fb.freeboardIn ?? 6) / 12;
    // One or two floats across the width.
    const rows = widthFt > 6 ? [widthFt * 0.25, widthFt * 0.75] : [widthFt / 2];
    for (const yc of rows) {
      const fw = f.len(DEFAULT_FLOAT.widthIn / 12);
      shapes.push({ kind: "rect", x: X(yc) - fw / 2, y: Y(fbFt), w: fw, h: Y(-(floatHFt - fbFt)) - Y(fbFt), style: { fill: COLOR.float, stroke: COLOR.floatStroke } });
    }
    shapes.push({ kind: "rect", x: x0, y: Y(fbFt + 0.3), w: x1 - x0, h: Y(fbFt) - Y(fbFt + 0.3), style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 } });
    shapes.push(...vDim(x1 + 16, Y(fbFt), waterY, `freeboard ${r1(fbFt * 12)} in`));
  } else {
    const deckTopZ = rise;
    const piles = widthFt > 6 ? [0, widthFt / 2, widthFt] : [0, widthFt];
    for (const yc of piles) {
      shapes.push({ kind: "line", a: { x: X(yc), y: Y(-depth) }, b: { x: X(yc), y: Y(deckTopZ) }, style: { stroke: COLOR.pileStroke, strokeWidth: 3 } });
    }
    shapes.push({ kind: "rect", x: x0, y: Y(deckTopZ + 0.4), w: x1 - x0, h: Y(deckTopZ) - Y(deckTopZ + 0.4), style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 } });
    shapes.push(...vDim(x1 + 16, Y(deckTopZ), waterY, `deck height ${ft(rise)}`));
  }

  shapes.push(...hDim(x0, x1, Y(-depth) + 20, ft(widthFt)));
  return { id: "end_elevation", title: "Elevation — end (schematic, V exaggerated)", width: CANVAS.w, height: CANVAS.h, shapes };
}

// ---------------------------------------------------------------------------
// ISOMETRIC (~30°) — §6
// ---------------------------------------------------------------------------

export function isometricView(config: DockConfig): Drawing {
  const shapes: Shape[] = [];
  const { lengthFt, widthFt } = boundsDims(config);
  const thickFt = 1.2;
  const a = Math.PI / 6; // 30°
  const cos = Math.cos(a);
  const sin = Math.sin(a);

  // Project (X along length, Y across width, Z up) → 2D iso.
  const iso = (X: number, Yc: number, Z: number): Pt => ({
    x: (X - Yc) * cos,
    y: (X + Yc) * sin - Z,
  });

  // Compute model bounds to size the scale.
  const corners = [
    iso(0, 0, 0),
    iso(lengthFt, 0, 0),
    iso(lengthFt, widthFt, 0),
    iso(0, widthFt, 0),
    iso(0, 0, thickFt),
    iso(lengthFt, widthFt, thickFt),
  ];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  const f = new Frame(maxX - minX, maxY - minY);
  const P = (X: number, Yc: number, Z: number): Pt => {
    const p = iso(X, Yc, Z);
    return { x: f.x(p.x - minX), y: f.y(p.y - minY) };
  };

  shapes.push({ kind: "rect", x: 0, y: 0, w: CANVAS.w, h: CANVAS.h, style: { fill: COLOR.water, stroke: "none", opacity: 0.4 } });

  // Top face.
  shapes.push({
    kind: "polygon",
    points: [P(0, 0, thickFt), P(lengthFt, 0, thickFt), P(lengthFt, widthFt, thickFt), P(0, widthFt, thickFt)],
    closed: true,
    style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 },
  });
  // Front face (along length).
  shapes.push({
    kind: "polygon",
    points: [P(0, 0, 0), P(lengthFt, 0, 0), P(lengthFt, 0, thickFt), P(0, 0, thickFt)],
    closed: true,
    style: { fill: COLOR.float, stroke: COLOR.ink, opacity: 0.9 },
  });
  // Side face (across width).
  shapes.push({
    kind: "polygon",
    points: [P(lengthFt, 0, 0), P(lengthFt, widthFt, 0), P(lengthFt, widthFt, thickFt), P(lengthFt, 0, thickFt)],
    closed: true,
    style: { fill: COLOR.floatStroke, stroke: COLOR.ink, opacity: 0.8 },
  });

  shapes.push(text({ x: CANVAS.w / 2, y: CANVAS.h - 16 }, `${ft(lengthFt)} × ${ft(widthFt)} · ${deckAreaFt2(config)} ft²`, { align: "middle", fill: COLOR.ink }));
  return { id: "isometric", title: "Isometric (~30°)", width: CANVAS.w, height: CANVAS.h, shapes };
}

/** All four views for a config, in PDF/sheet order. */
export function allViews(config: DockConfig): Drawing[] {
  return [planView(config), sideElevation(config), endElevation(config), isometricView(config)];
}

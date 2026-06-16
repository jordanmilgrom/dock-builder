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
} from "./geometry.js";
import {
  floatFootprintFor,
  floatLayoutForPiece,
  insetFloatToFootprint,
  maxGapFtFor,
  pieceWorldPolygon,
  pileLayoutForPiece,
  resolvePieces,
  wheelLayoutForPiece,
  worldBounds,
  type NormalizedPiece,
} from "./pieces.js";
import { DEFAULT_FLOAT } from "./constants.js";
import { autoSplitConfig } from "./autoSplit.js";
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
  /** Scale used per axis (px per ft). Elevations are real-scale: x === y (§6). */
  scalePxPerFt?: { x: number; y: number };
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
  /** Vertical model coordinate (feet) → canvas px (flips when flipY set, same scale). */
  y(yFt: number): number {
    if (this.opts.flipY) {
      // 0 maps near the bottom of the usable area; positive grows upward.
      return round1(this.oy + (CANVAS.h - 2 * (this.opts.margin ?? CANVAS.margin)) - yFt * this.scale);
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
  // Phase 9: render the assembly auto-split preview (too-long sections split).
  config = autoSplitConfig(config);
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
    const slope = gangwaySlopePct(config);
    shapes.push(text({ x: (f.x(shoreBand) + dockX0) / 2, y: gyTop - 6 }, `gangway ${ft(gangL)}${slope != null ? ` @ ${slope}%` : ""}`, { fill: COLOR.accent, align: "middle" }));
  }

  // Each drawn piece, at its world placement (Phase 6 — one polygon per piece),
  // with a per-section dimension label.
  for (const piece of pieces) {
    const poly = pieceWorldPolygon(piece).map((pt) => ({ x: wx(pt.xFt), y: wy(pt.yFt) }));
    shapes.push({ kind: "polygon", points: poly, closed: true, style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 } });
    const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    shapes.push(text({ x: cx, y: cy }, sectionLabel(piece), { fill: COLOR.dim, align: "middle", fontSize: 10 }));
  }

  // Supports per piece by construction SET (Phase 9): a piece can be floating
  // AND pile, so every membership is drawn independently (not else-if). Pile
  // pieces used to render as bare rectangles — this is the fix.
  const bay = maxGapFtFor(config);
  for (const piece of pieces) {
    if (piece.constructions.includes("floating")) {
      const { extX, extZ } = floatFootprintFor(piece);
      const fw = f.len(extX);
      const fh = f.len(extZ);
      for (const pos of floatLayoutForPiece(piece, bay)) {
        const inset = insetFloatToFootprint(pos, piece);
        shapes.push({ kind: "rect", x: wx(inset.xFt) - fw / 2, y: wy(inset.yFt) - fh / 2, w: fw, h: fh, style: { fill: COLOR.float, stroke: COLOR.floatStroke, opacity: 0.85 } });
      }
    }
    if (piece.constructions.includes("pile")) {
      for (const pos of pileLayoutForPiece(piece, bay)) {
        shapes.push({ kind: "circle", c: { x: wx(pos.xFt), y: wy(pos.yFt) }, r: 4, style: { fill: COLOR.pile, stroke: COLOR.pileStroke } });
      }
    }
    if (piece.constructions.includes("wheel")) {
      const rFt = Math.max(0.3, piece.widthFt / 8);
      for (const pos of wheelLayoutForPiece(piece)) {
        shapes.push({ kind: "circle", c: { x: wx(pos.xFt), y: wy(pos.yFt) }, r: Math.max(3, f.len(rFt)), style: { fill: COLOR.pile, stroke: COLOR.ink } });
      }
    }
  }

  if (config.accessories?.some((a) => a.type === "ladder")) {
    shapes.push(text({ x: dockX1 - 4, y: yBot + 14 }, "ladder", { fill: COLOR.accent, align: "end" }));
  }

  // Overall dimensions + north arrow.
  shapes.push(...hDim(dockX0, dockX1, yBot + 28, `overall length ${ft(lengthFt)}`));
  shapes.push(...vDim(dockX1 + 22, yTop, yBot, `overall width ${ft(widthFt)}`));
  shapes.push(...northArrow(CANVAS.w - 40, 40));

  return { id: "plan", title: "Plan — top view", width: CANVAS.w, height: CANVAS.h, shapes, scalePxPerFt: { x: f.scale, y: f.scale } };
}

/** Per-section dimension label, e.g. "20 × 8 ft" or "△ 4 × 4 ft". */
function sectionLabel(p: NormalizedPiece): string {
  return p.kind === "right_triangle"
    ? `△ ${r1(p.legAFt)} × ${r1(p.legBFt)} ft`
    : `${r1(p.lengthFt)} × ${r1(p.widthFt)} ft`;
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
  // Phase 9: render the assembly auto-split preview (too-long sections split).
  config = autoSplitConfig(config);
  const shapes: Shape[] = [];
  const { lengthFt, minX } = boundsDims(config);
  const gangL = gangwayLengthFt(config);
  const rise = config.site.shoreHeightAboveWaterFt;
  const depth = config.site.depthAtEndLowWaterFt;

  const modelW = gangL + lengthFt + 4;
  // Vertical range from the bed (−depth) to the shore top (rise) + headroom.
  const vRange = Math.max(rise, 1) + Math.max(depth, 1) + 2;
  // REAL SCALE: one uniform px/ft for both axes — no vertical exaggeration (§6).
  const f = new Frame(modelW, vRange, { flipY: true });
  const scale = f.scale;
  const waterY = round1(CANVAS.margin + (Math.max(rise, 1) + 1) * scale);
  const Y = (zf: number): number => round1(waterY - zf * scale);
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
  const fw = f.len(DEFAULT_FLOAT.lengthIn / 12);

  // Phase 9: render every construction present (a piece can be floating AND pile,
  // and a hybrid dock mixes them) — not a single dockType branch. This is the fix
  // for pile pieces rendering as bare rectangles in the schematic.
  const elevPieces = resolvePieces(config);
  const hasFloating = elevPieces.some((p) => p.constructions.includes("floating"));
  const hasPile = elevPieces.some((p) => p.constructions.includes("pile"));
  const hasWheel = elevPieces.some((p) => p.constructions.includes("wheel"));

  if (hasFloating) {
    const floatHFt = resolveFloatHeightIn(config) / 12;
    const fbFt = freeboardZ(config, floatHFt); // float freeboard above water
    const deckBottomZ = fbFt; // deck rests on the float tops
    const deckTopZ = fbFt + DECK_THICK_FT;
    // Floats hang DOWN from the deck bottom into the water (top == deck bottom).
    for (const xrel of floatXs(config, minX)) {
      const px = X(gangL + 2 + xrel);
      shapes.push({ kind: "rect", x: px - fw / 2, y: Y(deckBottomZ), w: fw, h: Y(deckBottomZ - floatHFt) - Y(deckBottomZ), style: { fill: COLOR.float, stroke: COLOR.floatStroke } });
    }
    shapes.push({ kind: "rect", x: deckX0, y: Y(deckTopZ), w: deckX1 - deckX0, h: Y(deckBottomZ) - Y(deckTopZ), style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 } });
    shapes.push(...vDim(deckX1 + 16, Y(deckBottomZ), waterY, `freeboard ${r1(fbFt * 12)} in`));
    shapes.push(...vDim(deckX1 + 40, Y(deckTopZ), Y(deckBottomZ), `deck ${r1(DECK_THICK_FT * 12)} in`));
  }
  if (hasPile) {
    const deckTopZ = Math.max(rise, 1);
    // Vertical posts from the lake-bed up to the deck at every pile X.
    for (const xrel of pileXs(config, minX)) {
      const px = X(gangL + 2 + xrel);
      shapes.push({ kind: "line", a: { x: px, y: Y(-depth) }, b: { x: px, y: Y(deckTopZ) }, style: { stroke: COLOR.pileStroke, strokeWidth: 3 } });
    }
    if (!hasFloating) {
      shapes.push({ kind: "rect", x: deckX0, y: Y(deckTopZ + DECK_THICK_FT), w: deckX1 - deckX0, h: Y(deckTopZ) - Y(deckTopZ + DECK_THICK_FT), style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 } });
      shapes.push(...vDim(deckX1 + 16, Y(deckTopZ), waterY, `deck height ${ft(deckTopZ)}`));
    }
    shapes.push(...vDim(deckX0 - 16, Y(0), Y(-depth), `embedment ${ft(depth)}`));
  }
  if (hasWheel) {
    // Roll-in wheels as circles at the deck-bottom level + a bracket diagonal.
    const wheelZ = 14 / 12; // 14 in clearance
    const rPx = f.len(Math.max(0.4, boundsDims(config).widthFt / 8));
    const wxs = [...new Set(elevPieces.flatMap((p) => p.constructions.includes("wheel") ? wheelLayoutForPiece(p).map((wp) => round1(wp.xFt - minX)) : []))];
    for (const xrel of wxs) {
      const px = X(gangL + 2 + xrel);
      shapes.push({ kind: "circle", c: { x: px, y: Y(wheelZ * 0.5) }, r: rPx, style: { fill: COLOR.pile, stroke: COLOR.ink } });
      shapes.push({ kind: "line", a: { x: px, y: Y(wheelZ * 0.5) }, b: { x: px, y: Y(wheelZ) }, style: { stroke: COLOR.pileStroke, strokeWidth: 2 } });
    }
    if (!hasFloating && !hasPile) {
      shapes.push({ kind: "rect", x: deckX0, y: Y(wheelZ + DECK_THICK_FT), w: deckX1 - deckX0, h: Y(wheelZ) - Y(wheelZ + DECK_THICK_FT), style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 } });
    }
  }

  // Gangway from shore top down to the deck.
  if (gangL > 0) {
    const slope = gangwaySlopePct(config);
    const deckMeetZ = config.dockType === "floating" ? freeboardZ(config, resolveFloatHeightIn(config) / 12) + DECK_THICK_FT : Math.max(rise, 1);
    const shoreTop = { x: X(0), y: Y(rise) };
    const deckMeet = { x: deckX0, y: Y(deckMeetZ) };
    shapes.push({ kind: "line", a: shoreTop, b: deckMeet, style: { stroke: COLOR.accent, strokeWidth: 2 } });
    shapes.push(text({ x: (shoreTop.x + deckMeet.x) / 2, y: (shoreTop.y + deckMeet.y) / 2 - 6 }, `gangway ${ft(gangL)}${slope != null ? ` @ ${slope}%` : ""}`, { fill: COLOR.accent, align: "middle" }));
    shapes.push({ kind: "polygon", points: [{ x: 0, y: waterY }, { x: X(0), y: waterY }, { x: X(0), y: Y(rise) }, { x: 0, y: Y(rise) }], closed: true, style: { fill: COLOR.bottom, stroke: "none", opacity: 0.5 } });
    shapes.push(...vDim(X(0) - 14, Y(0), Y(rise), `rise ${ft(rise)}`));
  }

  // Overall length dimension + a note of the overall width (perpendicular).
  shapes.push(...hDim(deckX0, deckX1, Y(-depth) + 22, `overall length ${ft(lengthFt)}`));
  shapes.push(text({ x: deckX0, y: CANVAS.margin - 8 }, `overall width ${ft(boundsDims(config).widthFt)}`, { fill: COLOR.dim }));

  return { id: "side_elevation", title: "Elevation — side (real scale)", width: CANVAS.w, height: CANVAS.h, shapes, scalePxPerFt: { x: scale, y: scale } };
}

const DECK_THICK_FT = 0.5;

/** Float freeboard above water (ft), capped so the float reads as mostly-submerged. */
function freeboardZ(config: DockConfig, floatHFt: number): number {
  const raw = (freeboard(config).freeboardIn ?? floatHFt * 0.3 * 12) / 12;
  return Math.min(Math.max(raw, floatHFt * 0.15), floatHFt * 0.5);
}

/** Distinct float X positions (ft, normalized to 0) for the side elevation. */
function floatXs(config: DockConfig, minX: number): number[] {
  const xs = resolvePieces(config).flatMap((p) => floatLayoutForPiece(p).map((fp) => round1(insetFloatToFootprint(fp, p).xFt - minX)));
  return [...new Set(xs)].sort((a, b) => a - b);
}

/** Distinct pile X positions (ft, normalized to 0) for the side elevation. */
function pileXs(config: DockConfig, minX: number): number[] {
  const bay = maxGapFtFor(config);
  const xs = resolvePieces(config).flatMap((p) => pileLayoutForPiece(p, bay).map((pp) => round1(pp.xFt - minX)));
  return [...new Set(xs)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// END ELEVATION — §6
// ---------------------------------------------------------------------------

export function endElevation(config: DockConfig): Drawing {
  // Phase 9: render the assembly auto-split preview (too-long sections split).
  config = autoSplitConfig(config);
  const shapes: Shape[] = [];
  const { widthFt } = boundsDims(config);
  const depth = config.site.depthAtEndLowWaterFt;
  const rise = config.site.shoreHeightAboveWaterFt;

  const modelW = widthFt + 4;
  const vRange = Math.max(rise, 1) + Math.max(depth, 1) + 2;
  // REAL SCALE: uniform px/ft both axes (§6).
  const f = new Frame(modelW, vRange, { flipY: true });
  const scale = f.scale;
  const waterY = round1(CANVAS.margin + (Math.max(rise, 1) + 1) * scale);
  const Y = (zf: number): number => round1(waterY - zf * scale);
  const X = (yf: number): number => f.x(yf + 2);

  shapes.push({ kind: "rect", x: 0, y: waterY, w: CANVAS.w, h: CANVAS.h - waterY, style: { fill: COLOR.water, stroke: "none" } });
  shapes.push({ kind: "line", a: { x: 0, y: waterY }, b: { x: CANVAS.w, y: waterY }, style: { stroke: COLOR.waterline, strokeWidth: 1.5 } });
  shapes.push(text({ x: 6, y: waterY - 4 }, "waterline", { fill: COLOR.waterline }));
  shapes.push({ kind: "line", a: { x: 0, y: Y(-depth) }, b: { x: CANVAS.w, y: Y(-depth) }, style: { stroke: COLOR.bottom, dashed: true } });

  const x0 = X(0);
  const x1 = X(widthFt);

  // Phase 9: render per construction present (cross-section through the width).
  const endPieces = resolvePieces(config);
  const hasFloating = endPieces.some((p) => p.constructions.includes("floating"));
  const hasPile = endPieces.some((p) => p.constructions.includes("pile"));
  const hasWheel = endPieces.some((p) => p.constructions.includes("wheel"));

  if (hasFloating) {
    const floatHFt = resolveFloatHeightIn(config) / 12;
    const fbFt = freeboardZ(config, floatHFt);
    const deckBottomZ = fbFt;
    const fwAcross = f.len(DEFAULT_FLOAT.widthIn / 12);
    const rows = widthFt > 6 ? [Math.min(widthFt - 1, 1), Math.max(1, widthFt - 1)] : [widthFt / 2];
    for (const yc of rows) {
      shapes.push({ kind: "rect", x: X(yc) - fwAcross / 2, y: Y(deckBottomZ), w: fwAcross, h: Y(deckBottomZ - floatHFt) - Y(deckBottomZ), style: { fill: COLOR.float, stroke: COLOR.floatStroke } });
    }
    shapes.push({ kind: "rect", x: x0, y: Y(deckBottomZ + DECK_THICK_FT), w: x1 - x0, h: Y(deckBottomZ) - Y(deckBottomZ + DECK_THICK_FT), style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 } });
    shapes.push(...vDim(x1 + 16, Y(deckBottomZ), waterY, `freeboard ${r1(fbFt * 12)} in`));
  }
  if (hasPile) {
    const deckTopZ = Math.max(rise, 1);
    const piles = widthFt > 6 ? [0, widthFt / 2, widthFt] : [0, widthFt];
    for (const yc of piles) {
      shapes.push({ kind: "line", a: { x: X(yc), y: Y(-depth) }, b: { x: X(yc), y: Y(deckTopZ) }, style: { stroke: COLOR.pileStroke, strokeWidth: 3 } });
    }
    if (!hasFloating) {
      shapes.push({ kind: "rect", x: x0, y: Y(deckTopZ + DECK_THICK_FT), w: x1 - x0, h: Y(deckTopZ) - Y(deckTopZ + DECK_THICK_FT), style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 } });
      shapes.push(...vDim(x1 + 16, Y(deckTopZ), waterY, `deck height ${ft(deckTopZ)}`));
    }
  }
  if (hasWheel) {
    // Two wheels side-by-side across the width.
    const wheelZ = 14 / 12;
    const rPx = f.len(Math.max(0.4, widthFt / 8));
    for (const yc of [Math.max(0.5, widthFt * 0.2), widthFt * 0.8]) {
      shapes.push({ kind: "circle", c: { x: X(yc), y: Y(wheelZ * 0.5) }, r: rPx, style: { fill: COLOR.pile, stroke: COLOR.ink } });
    }
    if (!hasFloating && !hasPile) {
      shapes.push({ kind: "rect", x: x0, y: Y(wheelZ + DECK_THICK_FT), w: x1 - x0, h: Y(wheelZ) - Y(wheelZ + DECK_THICK_FT), style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 } });
    }
  }

  shapes.push(...hDim(x0, x1, Y(-depth) + 20, `overall width ${ft(widthFt)}`));
  return { id: "end_elevation", title: "Elevation — end (real scale)", width: CANVAS.w, height: CANVAS.h, shapes, scalePxPerFt: { x: scale, y: scale } };
}

// ---------------------------------------------------------------------------
// ISOMETRIC (~30°) — §6
// ---------------------------------------------------------------------------

export function isometricView(config: DockConfig): Drawing {
  // Phase 9: render the assembly auto-split preview (too-long sections split).
  config = autoSplitConfig(config);
  const shapes: Shape[] = [];
  const pieces = resolvePieces(config);
  const { lengthFt, widthFt } = boundsDims(config);
  const thickFt = 1.0;
  const a = Math.PI / 6; // 30°
  const cos = Math.cos(a);
  const sin = Math.sin(a);

  // Project (X along length, Y across width, Z up) → 2D iso.
  const iso = (X: number, Yc: number, Z: number): Pt => ({ x: (X - Yc) * cos, y: (X + Yc) * sin - Z });

  // Bounds over EVERY piece corner (so multi-piece L-shapes frame correctly).
  const projected: Pt[] = [];
  for (const piece of pieces) {
    for (const c of pieceWorldPolygon(piece)) {
      projected.push(iso(c.xFt, c.yFt, 0), iso(c.xFt, c.yFt, thickFt));
    }
  }
  const minX = Math.min(...projected.map((c) => c.x));
  const maxX = Math.max(...projected.map((c) => c.x));
  const minY = Math.min(...projected.map((c) => c.y));
  const maxY = Math.max(...projected.map((c) => c.y));
  const f = new Frame(Math.max(maxX - minX, 1), Math.max(maxY - minY, 1));
  const P = (X: number, Yc: number, Z: number): Pt => {
    const p = iso(X, Yc, Z);
    return { x: f.x(p.x - minX), y: f.y(p.y - minY) };
  };

  shapes.push({ kind: "rect", x: 0, y: 0, w: CANVAS.w, h: CANVAS.h, style: { fill: COLOR.water, stroke: "none", opacity: 0.4 } });

  // Extrude each piece (far pieces first for painter's-order occlusion).
  const ordered = [...pieces].sort((p, q) => isoDepth(p) - isoDepth(q));
  for (const piece of ordered) {
    const wp = pieceWorldPolygon(piece);
    // Side faces around the footprint.
    for (let i = 0; i < wp.length; i++) {
      const c0 = wp[i]!;
      const c1 = wp[(i + 1) % wp.length]!;
      shapes.push({
        kind: "polygon",
        points: [P(c0.xFt, c0.yFt, 0), P(c1.xFt, c1.yFt, 0), P(c1.xFt, c1.yFt, thickFt), P(c0.xFt, c0.yFt, thickFt)],
        closed: true,
        style: { fill: COLOR.float, stroke: COLOR.ink, opacity: 0.85 },
      });
    }
    // Top face.
    shapes.push({
      kind: "polygon",
      points: wp.map((c) => P(c.xFt, c.yFt, thickFt)),
      closed: true,
      style: { fill: COLOR.deck, stroke: COLOR.ink, strokeWidth: 1.5 },
    });
  }

  shapes.push(text({ x: CANVAS.w / 2, y: CANVAS.h - 16 }, `${ft(lengthFt)} × ${ft(widthFt)} · ${deckAreaFt2(config)} ft²`, { align: "middle", fill: COLOR.ink }));
  return { id: "isometric", title: "Isometric (~30°)", width: CANVAS.w, height: CANVAS.h, shapes, scalePxPerFt: { x: f.scale, y: f.scale } };
}

/** Painter's-order depth key for a piece (nearer = larger x+y of its centroid). */
function isoDepth(p: NormalizedPiece): number {
  const poly = pieceWorldPolygon(p);
  const cx = poly.reduce((s, c) => s + c.xFt, 0) / poly.length;
  const cy = poly.reduce((s, c) => s + c.yFt, 0) / poly.length;
  return cx + cy;
}

/** All four views for a config, in PDF/sheet order. */
export function allViews(config: DockConfig): Drawing[] {
  return [planView(config), sideElevation(config), endElevation(config), isometricView(config)];
}

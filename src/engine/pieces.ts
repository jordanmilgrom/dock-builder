/**
 * Multi-piece dock geometry (Phase 6).
 *
 * Real docks are composed of pieces — rectangles of varying size plus right-
 * triangle cut-corners/fills — each placed at (posX, posY) and rotated in 90°
 * steps. This pure module resolves a DockConfig into normalized world-placed
 * pieces and computes per-piece float/pile layouts. Engines and the blueprint
 * renderer share these — nothing re-derives geometry elsewhere.
 *
 * Back-compat: configs with no `pieces` are read as a chain of rectangle pieces
 * laid end-to-end from (0, 0) — from `sections` if present, else the `overall`
 * length × width (auto-sectioned for floating docks like the legacy engine).
 */

import { FLOAT_PLACEMENT, MAX_SECTION, PILE_BAY, floatRowCount } from "./constants.js";
import type { DockConfig, DockPiece, PieceKind, Rotation } from "./types.js";

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** A position in dock world feet: x along the length (from shore), y across. */
export interface PlacementFt {
  xFt: number;
  yFt: number;
}

/** A fully-specified piece with all dimensions resolved. */
export interface NormalizedPiece {
  kind: PieceKind;
  posX: number;
  posY: number;
  rotationDeg: Rotation;
  /** Rectangle: length × width. Triangle: legA × legB (legB stored as widthFt). */
  lengthFt: number;
  widthFt: number;
  legAFt: number;
  legBFt: number;
}

function normalize(p: DockPiece): NormalizedPiece {
  const isTri = p.pieceKind === "right_triangle";
  const legAFt = p.legAFt ?? p.lengthFt ?? 0;
  const legBFt = p.legBFt ?? p.widthFt ?? 0;
  return {
    kind: p.pieceKind,
    posX: p.posX ?? 0,
    posY: p.posY ?? 0,
    rotationDeg: (p.rotationDeg ?? 0) as Rotation,
    lengthFt: isTri ? legAFt : p.lengthFt ?? 0,
    widthFt: isTri ? legBFt : p.widthFt ?? 0,
    legAFt,
    legBFt,
  };
}

/** The max floating section length for the config's frame material (§3.3). */
function maxFloatingLen(config: DockConfig): number {
  return config.overall.frameMaterial === "aluminum"
    ? MAX_SECTION.floating.lengthAluminumFt
    : MAX_SECTION.floating.lengthWoodFt;
}

/** Resolve a config into normalized, world-placed pieces. */
export function resolvePieces(config: DockConfig): NormalizedPiece[] {
  if (config.pieces && config.pieces.length > 0) {
    return config.pieces.map(normalize);
  }

  // Back-compat: chain rectangles end-to-end from (0,0) along the length axis.
  if (config.sections && config.sections.length > 0) {
    let x = 0;
    return config.sections.map((s) => {
      const piece = normalize({ pieceKind: "rectangle", posX: x, posY: 0, rotationDeg: 0, lengthFt: s.lengthFt, widthFt: s.widthFt });
      x += s.lengthFt;
      return piece;
    });
  }

  const { lengthFt, widthFt } = config.overall;
  // Floating bare-overall docks auto-section like the legacy engine so the
  // §3.3 "split long runs" behavior (and its autofix) is preserved.
  if (config.dockType === "floating") {
    const maxLen = maxFloatingLen(config);
    if (lengthFt > maxLen) {
      const n = Math.ceil(lengthFt / maxLen);
      const per = round(lengthFt / n);
      let x = 0;
      const out: NormalizedPiece[] = [];
      for (let i = 0; i < n; i++) {
        out.push(normalize({ pieceKind: "rectangle", posX: x, posY: 0, rotationDeg: 0, lengthFt: per, widthFt }));
        x += per;
      }
      return out;
    }
  }
  return [normalize({ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt, widthFt })];
}

/** Area of one piece (triangle = legA·legB/2). */
export function pieceAreaFt2(p: NormalizedPiece): number {
  return p.kind === "right_triangle" ? round((p.legAFt * p.legBFt) / 2) : round(p.lengthFt * p.widthFt);
}

// ---- world transforms ------------------------------------------------------

function rotateLocal(x: number, y: number, rot: Rotation): [number, number] {
  switch (rot) {
    case 90:
      return [-y, x];
    case 180:
      return [-x, -y];
    case 270:
      return [y, -x];
    default:
      return [x, y];
  }
}

function toWorld(p: NormalizedPiece, x: number, y: number): PlacementFt {
  const [rx, ry] = rotateLocal(x, y, p.rotationDeg);
  return { xFt: round(p.posX + rx), yFt: round(p.posY + ry) };
}

/** Local corner points (pre-rotation): 4 for a rectangle, 3 for a triangle. */
export function pieceCornersLocal(p: NormalizedPiece): [number, number][] {
  if (p.kind === "right_triangle") {
    return [
      [0, 0],
      [p.legAFt, 0],
      [0, p.legBFt],
    ];
  }
  return [
    [0, 0],
    [p.lengthFt, 0],
    [p.lengthFt, p.widthFt],
    [0, p.widthFt],
  ];
}

/** World-space corner polygon for rendering. */
export function pieceWorldPolygon(p: NormalizedPiece): PlacementFt[] {
  return pieceCornersLocal(p).map(([x, y]) => toWorld(p, x, y));
}

/** World bounding box across all pieces (for view framing). */
export function worldBounds(pieces: NormalizedPiece[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pieces) {
    for (const pt of pieceWorldPolygon(p)) {
      minX = Math.min(minX, pt.xFt);
      minY = Math.min(minY, pt.yFt);
      maxX = Math.max(maxX, pt.xFt);
      maxY = Math.max(maxY, pt.yFt);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

// ---- float layout ----------------------------------------------------------

/** Evenly spaced ticks across [0, len] with at least `min` points (ends included). */
function spread(len: number, maxSpacing: number, min: number): number[] {
  const segments = Math.max(min - 1, Math.ceil(len / maxSpacing));
  const out: number[] = [];
  for (let i = 0; i <= segments; i++) out.push(round((len * i) / segments));
  return out;
}

/**
 * Float positions for one piece (Phase 6 industry rule): two rows minimum, +1
 * row per full 6 ft of width, a float at every corner, ≤ 8 ft along each row.
 */
export function floatLayoutForPiece(p: NormalizedPiece): PlacementFt[] {
  const max = FLOAT_PLACEMENT.maxSpacingFt;
  if (p.kind === "right_triangle") {
    const out: PlacementFt[] = [
      toWorld(p, 0, 0),
      toWorld(p, p.legAFt, 0),
      toWorld(p, 0, p.legBFt),
    ];
    // Intermediate floats along each leg at ≤ 8 ft (corners already placed).
    for (let x = max; x < p.legAFt - 0.01; x += max) out.push(toWorld(p, round(x), 0));
    for (let y = max; y < p.legBFt - 0.01; y += max) out.push(toWorld(p, 0, round(y)));
    return out;
  }
  const rows = floatRowCount(p.widthFt);
  const xs = spread(p.lengthFt, max, 2); // corners + ≤ 8 ft along length
  const out: PlacementFt[] = [];
  for (let r = 0; r < rows; r++) {
    const y = round((p.widthFt * r) / (rows - 1));
    for (const x of xs) out.push(toWorld(p, x, y));
  }
  return out;
}

/** Aggregate float positions for a floating dock across all pieces. */
export function allFloatPositions(config: DockConfig): PlacementFt[] {
  if (config.dockType !== "floating") return [];
  return resolvePieces(config).flatMap(floatLayoutForPiece);
}

// ---- pile layout -----------------------------------------------------------

/** Grid ticks on [0, len] at `bay` spacing, always including both ends. */
function gridTicks(len: number, bay: number): number[] {
  const out = [0];
  for (let t = bay; t < len - 0.01; t += bay) out.push(round(t));
  if (len > 0) out.push(round(len));
  return out;
}

export function bayFtFor(config: DockConfig): number {
  const b = config.overall.bayFt;
  if (b == null) return PILE_BAY.defaultFt;
  return Math.min(PILE_BAY.maxFt, Math.max(PILE_BAY.minFt, b));
}

/**
 * Pile positions for one piece (Phase 6): a pile at every corner (3 for a
 * triangle, 4 for a rectangle) plus internal piles on the bay grid. No deck
 * overhang — dimensions are expected to align to the grid (validated elsewhere).
 */
export function pileLayoutForPiece(p: NormalizedPiece, bay: number): PlacementFt[] {
  if (p.kind === "right_triangle") {
    const out: PlacementFt[] = [
      toWorld(p, 0, 0),
      toWorld(p, p.legAFt, 0),
      toWorld(p, 0, p.legBFt),
    ];
    // Internal grid piles strictly inside the triangle (x/a + y/b < 1).
    for (let x = bay; x < p.legAFt - 0.01; x += bay) {
      for (let y = bay; y < p.legBFt - 0.01; y += bay) {
        if (x / p.legAFt + y / p.legBFt < 1 - 1e-9) out.push(toWorld(p, round(x), round(y)));
      }
    }
    return out;
  }
  const xs = gridTicks(p.lengthFt, bay);
  const ys = gridTicks(p.widthFt, bay);
  const out: PlacementFt[] = [];
  for (const x of xs) for (const y of ys) out.push(toWorld(p, x, y));
  return out;
}

/** Aggregate pile positions for a fixed dock across all pieces. */
export function allPilePositions(config: DockConfig): PlacementFt[] {
  if (config.dockType === "floating" || config.dockType === "suspension") return [];
  const bay = bayFtFor(config);
  return resolvePieces(config).flatMap((p) => pileLayoutForPiece(p, bay));
}

/**
 * Whether a rectangle piece's RUN (length, the bay direction) aligns to the bay
 * grid. A non-aligned length means the deck would cantilever past the last pile
 * line — disallowed in residential pile construction. Width is supported by the
 * edge (corner) pile lines either way, and triangles are exempt (corner piles +
 * internal grid suffice). Returns the nearest valid length when misaligned.
 */
export function pieceCantilever(
  p: NormalizedPiece,
  bay: number,
): { ok: true } | { ok: false; dim: "length"; value: number; nearest: number } {
  if (p.kind !== "rectangle") return { ok: true };
  const value = p.lengthFt;
  const rem = value % bay;
  const off = Math.min(rem, bay - rem);
  if (off > PILE_BAY.toleranceFt) {
    const nearest = Math.max(bay, Math.round(value / bay) * bay);
    return { ok: false, dim: "length", value, nearest };
  }
  return { ok: true };
}

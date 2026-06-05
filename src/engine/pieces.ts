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

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** World bounding box of a single piece. */
export function pieceBBox(p: NormalizedPiece): BBox {
  const poly = pieceWorldPolygon(p);
  const xs = poly.map((q) => q.xFt);
  const ys = poly.map((q) => q.yFt);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/**
 * Do two piece bounding boxes share an EDGE SEGMENT (not just a corner point)?
 * True when they overlap interior, or abut on one axis while overlapping with
 * positive length on the other. Used to decide whether a connector triangle has
 * an adjacent rectangle to draw support/buoyancy from.
 */
export function bboxesShareEdge(a: BBox, b: BBox, tol = 0.01): boolean {
  const xOverlap = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const yOverlap = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  if (xOverlap > tol && yOverlap > tol) return true; // overlapping footprints
  if (Math.abs(xOverlap) <= tol && yOverlap > tol) return true; // abut vertically, share a vertical edge
  if (Math.abs(yOverlap) <= tol && xOverlap > tol) return true; // abut horizontally, share a horizontal edge
  return false;
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
/**
 * Float positions for one piece. Right triangles are CONNECTOR pieces (corner
 * cuts / bridges between rectangles) — they carry no flotation of their own; the
 * adjacent rectangle's floats (sized to the whole deck area) support them. So a
 * triangle returns no float positions.
 */
export function floatLayoutForPiece(p: NormalizedPiece): PlacementFt[] {
  if (p.kind === "right_triangle") return [];
  const max = FLOAT_PLACEMENT.maxSpacingFt;
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

/** A float symbol's footprint (ft): 48"×24", swapped for 90°/270° pieces. */
export const FLOAT_FOOTPRINT_FT = { lengthFt: 48 / 12, widthFt: 24 / 12 } as const;

export function floatFootprintFor(p: NormalizedPiece): { extX: number; extZ: number } {
  const rotated = p.rotationDeg === 90 || p.rotationDeg === 270;
  return {
    extX: rotated ? FLOAT_FOOTPRINT_FT.widthFt : FLOAT_FOOTPRINT_FT.lengthFt,
    extZ: rotated ? FLOAT_FOOTPRINT_FT.lengthFt : FLOAT_FOOTPRINT_FT.widthFt,
  };
}

function clampRange(v: number, min: number, max: number, ext: number): number {
  const lo = min + ext / 2;
  const hi = max - ext / 2;
  if (lo > hi) return (min + max) / 2;
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Inset a float center so its whole footprint lies within the piece's deck
 * outline (engine layout returns edge/corner points that would otherwise hang
 * half-out). The SINGLE helper both the 3D viewer and the 2D blueprint call.
 */
export function insetFloatToFootprint(pos: PlacementFt, p: NormalizedPiece): PlacementFt {
  const b = pieceBBox(p);
  const { extX, extZ } = floatFootprintFor(p);
  return { xFt: clampRange(pos.xFt, b.minX, b.maxX, extX), yFt: clampRange(pos.yFt, b.minY, b.maxY, extZ) };
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
  // Right triangles are connectors — the adjacent rectangle's piles support them;
  // no pile is placed on the triangle itself.
  if (p.kind === "right_triangle") return [];
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

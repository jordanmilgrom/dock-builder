/**
 * Accessory placement (Phase 11). Pure geometry + counts for accessories pinned
 * to a piece EDGE at an OFFSET (piece-local), so they survive rotation and moves.
 * Visual + pricing only — no validation rules (per §10 decision).
 */

import type { AccessoryKind, AccessoryPlacement, DockConfig, DockPiece, PieceEdge, Rotation } from "./index.js";

interface PieceLike {
  pieceKind: DockPiece["pieceKind"];
  posX: number;
  posY: number;
  rotationDeg: Rotation;
  lengthFt?: number;
  widthFt?: number;
  legAFt?: number;
  legBFt?: number;
}

function dims(p: PieceLike): { L: number; W: number } {
  if (p.pieceKind === "right_triangle") return { L: p.legAFt ?? 0, W: p.legBFt ?? 0 };
  return { L: p.lengthFt ?? 0, W: p.widthFt ?? 0 };
}

function rot(x: number, y: number, deg: Rotation): [number, number] {
  switch (deg) {
    case 90: return [-y, x];
    case 180: return [-x, -y];
    case 270: return [y, -x];
    default: return [x, y];
  }
}
function invRot(x: number, y: number, deg: Rotation): [number, number] {
  return rot(x, y, ((360 - deg) % 360) as Rotation);
}

/** Piece-local point (pre-rotation) of an accessory on a given edge + offset. */
export function edgeLocalPoint(edge: PieceEdge, offsetFt: number, L: number, W: number): [number, number] {
  switch (edge) {
    case "top": return [offsetFt, 0];
    case "bottom": return [offsetFt, W];
    case "left": return [0, offsetFt];
    case "right": return [L, offsetFt];
  }
}

/** World (x,y) of an accessory, honoring the piece's rotation + position. */
export function accessoryWorldPos(p: PieceLike, a: AccessoryPlacement): { xFt: number; yFt: number } {
  const { L, W } = dims(p);
  const [lx, ly] = edgeLocalPoint(a.edge, a.offsetFt, L, W);
  const [rx, ry] = rot(lx, ly, p.rotationDeg);
  return { xFt: p.posX + rx, yFt: p.posY + ry };
}

/** The edge + snapped (1 ft) offset for dropping an accessory at a world point. */
export function nearestEdgeForDrop(p: PieceLike, world: { xFt: number; yFt: number }): { edge: PieceEdge; offsetFt: number } {
  const { L, W } = dims(p);
  const [lx, ly] = invRot(world.xFt - p.posX, world.yFt - p.posY, p.rotationDeg);
  // Distance to each edge in local space.
  const cands: { edge: PieceEdge; dist: number; offset: number }[] = [
    { edge: "top", dist: Math.abs(ly), offset: lx },
    { edge: "bottom", dist: Math.abs(W - ly), offset: lx },
    { edge: "left", dist: Math.abs(lx), offset: ly },
    { edge: "right", dist: Math.abs(L - lx), offset: ly },
  ];
  const best = cands.reduce((a, b) => (b.dist < a.dist ? b : a));
  const span = best.edge === "top" || best.edge === "bottom" ? L : W;
  const offsetFt = Math.max(0, Math.min(span, Math.round(best.offset)));
  return { edge: best.edge, offsetFt };
}

/** Total accessory count per kind across every piece (pricing source of truth). */
export function accessoryCounts(config: DockConfig): Record<AccessoryKind, number> {
  const out = {} as Record<AccessoryKind, number>;
  for (const piece of config.pieces ?? []) {
    for (const a of piece.accessories ?? []) out[a.kind] = (out[a.kind] ?? 0) + 1;
  }
  return out;
}

/** Grand total of placed accessories. */
export function totalAccessoryCount(config: DockConfig): number {
  return (config.pieces ?? []).reduce((sum, p) => sum + (p.accessories?.length ?? 0), 0);
}

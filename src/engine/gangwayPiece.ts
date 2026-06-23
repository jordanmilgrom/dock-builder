/**
 * Gangway-as-a-piece (Phase 11). A gangway is now a drawable piece that snaps to
 * a dock-piece edge on release. Pure helpers for the snap + slope math.
 */

import type { DockPiece } from "./index.js";

export const GANGWAY_SNAP_FT = 2;
/** Warn when the run:rise ratio drops below this (steeper than 1:8). */
export const GANGWAY_PIECE_WARN_RATIO = 8;

export interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GangwaySnap {
  connectsToPieceId: string;
  posX: number;
  posY: number;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * Snap a freshly-drawn gangway (its bbox + dims) to the nearest dock-piece left
 * edge within {@link GANGWAY_SNAP_FT}. Shore is on the left, so the gangway's
 * right edge meets the dock piece's left edge; it centers across that edge.
 * Returns null when nothing is in range.
 */
export function snapGangwayToEdge(
  gangway: { posX: number; posY: number; lengthFt: number; widthFt: number },
  pieces: { id: string; bbox: Bbox }[],
  maxSnapFt = GANGWAY_SNAP_FT,
): GangwaySnap | null {
  const gRight = gangway.posX + gangway.lengthFt;
  let best: { id: string; bbox: Bbox; gap: number } | null = null;
  for (const p of pieces) {
    const gap = Math.abs(p.bbox.minX - gRight);
    const yOverlap = Math.min(gangway.posY + gangway.widthFt, p.bbox.maxY) - Math.max(gangway.posY, p.bbox.minY);
    if (gap <= maxSnapFt && yOverlap > -maxSnapFt && (best === null || gap < best.gap)) {
      best = { id: p.id, bbox: p.bbox, gap };
    }
  }
  if (!best) return null;
  return {
    connectsToPieceId: best.id,
    posX: round(best.bbox.minX - gangway.lengthFt),
    posY: round((best.bbox.minY + best.bbox.maxY) / 2 - gangway.widthFt / 2),
  };
}

export interface GangwaySlope {
  ratio: number;
  label: string;
  slopePct: number;
  warning?: string;
}

/** Slope of a gangway piece from its run length + the shore rise. */
export function gangwayPieceSlope(lengthFt: number, shoreHeightFt: number): GangwaySlope {
  if (shoreHeightFt <= 0 || lengthFt <= 0) {
    return { ratio: 0, label: "—", slopePct: 0 };
  }
  const ratio = round(lengthFt / shoreHeightFt, 1);
  const slopePct = round((shoreHeightFt / lengthFt) * 100, 1);
  const result: GangwaySlope = { ratio, label: `1:${ratio}`, slopePct };
  if (ratio < GANGWAY_PIECE_WARN_RATIO) {
    result.warning = `Gangway slope ${result.label} is steeper than 1:8 — consider a longer gangway.`;
  }
  return result;
}

/** Whether a piece is a gangway. */
export function isGangway(p: DockPiece): boolean {
  return p.pieceKind === "gangway";
}

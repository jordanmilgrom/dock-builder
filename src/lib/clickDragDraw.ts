/**
 * Illustrator-style click-and-drag drawing (Phase 10). Pure: turns a drag
 * (start → end in WORLD feet) into a DockPiece for the armed tool, snapped to
 * 0.5 ft with a 4 ft minimum on every side.
 */

import type { DockPiece } from "@/engine";

export type DrawTool = "rectangle" | "square" | "right_triangle" | "gangway";

export const DRAW_SNAP_FT = 0.5;
export const DRAW_MIN_FT = 4;

const snap = (v: number) => Math.round(v / DRAW_SNAP_FT) * DRAW_SNAP_FT;
const dim = (v: number) => Math.max(DRAW_MIN_FT, snap(Math.abs(v)));

export interface Pt {
  x: number;
  y: number;
}

/** Build the piece an armed tool would create for a drag from `start` to `end`. */
export function drawnPiece(tool: DrawTool, start: Pt, end: Pt): DockPiece {
  const posX = snap(Math.min(start.x, end.x));
  const posY = snap(Math.min(start.y, end.y));
  let w = dim(end.x - start.x);
  let h = dim(end.y - start.y);

  if (tool === "square") {
    const side = Math.max(w, h); // aspect 1:1, longest dimension wins
    w = side;
    h = side;
  }

  if (tool === "right_triangle") {
    return { pieceKind: "right_triangle", posX, posY, rotationDeg: 0, legAFt: w, legBFt: h, constructions: ["floating"], z: 0 };
  }
  if (tool === "gangway") {
    return { pieceKind: "gangway", posX, posY, rotationDeg: 0, lengthFt: w, widthFt: h, constructions: ["floating"], z: 0 };
  }
  return { pieceKind: "rectangle", posX, posY, rotationDeg: 0, lengthFt: w, widthFt: h, constructions: ["floating"], z: 0 };
}

/** Whether a drag is large enough to commit (vs. a stray click). */
export function isDrawableDrag(start: Pt, end: Pt): boolean {
  return Math.abs(end.x - start.x) >= DRAW_MIN_FT / 2 || Math.abs(end.y - start.y) >= DRAW_MIN_FT / 2;
}

/** Default-sized piece for a single click (no drag), centered at `at` (world ft). */
export function defaultPieceForTool(tool: DrawTool, at: Pt): DockPiece {
  const dims = tool === "rectangle" ? { l: 20, w: 8 } : tool === "square" ? { l: 8, w: 8 } : { l: 4, w: 4 };
  const posX = snap(at.x - dims.l / 2);
  const posY = snap(at.y - dims.w / 2);
  if (tool === "right_triangle") {
    return { pieceKind: "right_triangle", posX, posY, rotationDeg: 0, legAFt: dims.l, legBFt: dims.w, constructions: ["floating"], z: 0 };
  }
  return { pieceKind: "rectangle", posX, posY, rotationDeg: 0, lengthFt: dims.l, widthFt: dims.w, constructions: ["floating"], z: 0 };
}

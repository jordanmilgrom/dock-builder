/**
 * Resize-handle math (Phase 7). Pure + framework-free so the Canvas editor's
 * 8-handle resize is unit-testable without a browser. Operates in the piece's
 * UNROTATED local frame (the component un-rotates the pointer delta before
 * calling in, then re-rotates for display) — keeping the math axis-aligned.
 *
 * Conventions match the engine: a rectangle at rotation 0 occupies
 * [posX, posX+lengthFt] × [posY, posY+widthFt]; a right triangle has its right
 * angle at v0=(posX,posY), leg A along +x, leg B along +y.
 */

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const CORNER_HANDLES: Handle[] = ["nw", "ne", "se", "sw"];

/** Minimum piece dimension (ft) and on-release dimension snap (6 in). */
export const RESIZE_MIN_FT = 4;
export const DIM_SNAP_FT = 0.5;

export interface RectDims {
  posX: number;
  posY: number;
  lengthFt: number;
  widthFt: number;
}

export interface TriDims {
  posX: number;
  posY: number;
  legAFt: number;
  legBFt: number;
}

const movesWest = (h: Handle) => h === "nw" || h === "w" || h === "sw";
const movesEast = (h: Handle) => h === "ne" || h === "e" || h === "se";
const movesNorth = (h: Handle) => h === "nw" || h === "n" || h === "ne";
const movesSouth = (h: Handle) => h === "sw" || h === "s" || h === "se";

const snap = (v: number, step: number) => Math.round(v / step) * step;

/**
 * Resize a rectangle by dragging `handle` by (dx,dy) world feet (live, no snap).
 * The edge/corner opposite the handle stays anchored. Corner handles scale both
 * dims; edge handles scale one. With `aspect`, corner drags keep L/W ratio.
 */
export function resizeRect(
  rect: RectDims,
  handle: Handle,
  dx: number,
  dy: number,
  opts: { aspect?: boolean } = {},
): RectDims {
  let { posX, posY, lengthFt, widthFt } = rect;
  // Anchored edges (right/bottom for west/north handles; left/top otherwise).
  const right = posX + lengthFt;
  const bottom = posY + widthFt;

  let newL = lengthFt;
  let newW = widthFt;
  if (movesWest(handle)) newL = lengthFt - dx;
  else if (movesEast(handle)) newL = lengthFt + dx;
  if (movesNorth(handle)) newW = widthFt - dy;
  else if (movesSouth(handle)) newW = widthFt + dy;

  newL = Math.max(RESIZE_MIN_FT, newL);
  newW = Math.max(RESIZE_MIN_FT, newW);

  if (opts.aspect && CORNER_HANDLES.includes(handle)) {
    // Lock to the original aspect ratio, driven by the larger relative change.
    const ratio = lengthFt / widthFt;
    if (newL / lengthFt >= newW / widthFt) newW = newL / ratio;
    else newL = newW * ratio;
    newL = Math.max(RESIZE_MIN_FT, newL);
    newW = Math.max(RESIZE_MIN_FT, newW);
  }

  // Re-anchor: west/north handles move the origin so the opposite edge is fixed.
  posX = movesWest(handle) ? right - newL : posX;
  posY = movesNorth(handle) ? bottom - newW : posY;
  return { posX, posY, lengthFt: newL, widthFt: newW };
}

/** Snap a rectangle's dims to 6 in on release, keeping the anchored edge fixed. */
export function snapRect(rect: RectDims, handle: Handle): RectDims {
  const right = rect.posX + rect.lengthFt;
  const bottom = rect.posY + rect.widthFt;
  const lengthFt = Math.max(RESIZE_MIN_FT, snap(rect.lengthFt, DIM_SNAP_FT));
  const widthFt = Math.max(RESIZE_MIN_FT, snap(rect.widthFt, DIM_SNAP_FT));
  return {
    lengthFt,
    widthFt,
    posX: movesWest(handle) ? right - lengthFt : rect.posX,
    posY: movesNorth(handle) ? bottom - widthFt : rect.posY,
  };
}

/**
 * Resize a right triangle. The two leg corners scale one leg each; the
 * right-angle corner (opposite the hypotenuse) scales both legs proportionally.
 *   - "e"  → leg A end (v1): scales leg A only
 *   - "s"  → leg B end (v2): scales leg B only
 *   - "nw" → right-angle (v0): scales both, preserving the legA/legB ratio
 */
export function resizeTriangle(tri: TriDims, handle: Handle, dx: number, dy: number): TriDims {
  let { posX, posY, legAFt, legBFt } = tri;
  if (handle === "nw") {
    // Right-angle corner moves; both legs shrink/grow, anchored at the far ends.
    const aEnd = posX + legAFt;
    const bEnd = posY + legBFt;
    const ratio = legAFt / legBFt;
    let newA = Math.max(RESIZE_MIN_FT, legAFt - dx);
    let newB = Math.max(RESIZE_MIN_FT, legBFt - dy);
    // Proportional: drive both from the dominant change.
    if (newA / legAFt <= newB / legBFt) newB = newA / ratio;
    else newA = newB * ratio;
    newA = Math.max(RESIZE_MIN_FT, newA);
    newB = Math.max(RESIZE_MIN_FT, newB);
    return { posX: aEnd - newA, posY: bEnd - newB, legAFt: newA, legBFt: newB };
  }
  if (handle === "e" || handle === "ne" || handle === "se") legAFt = Math.max(RESIZE_MIN_FT, legAFt + dx);
  if (handle === "s" || handle === "sw") legBFt = Math.max(RESIZE_MIN_FT, legBFt + dy);
  return { posX, posY, legAFt, legBFt };
}

/** Snap a triangle's legs to 6 in on release (no re-anchor for leg-end handles). */
export function snapTriangle(tri: TriDims): TriDims {
  return {
    posX: tri.posX,
    posY: tri.posY,
    legAFt: Math.max(RESIZE_MIN_FT, snap(tri.legAFt, DIM_SNAP_FT)),
    legBFt: Math.max(RESIZE_MIN_FT, snap(tri.legBFt, DIM_SNAP_FT)),
  };
}

/** Local-frame screen offsets (0–1) of each handle, for rendering. */
export function handleUnitPos(h: Handle): { u: number; v: number } {
  const u = movesWest(h) ? 0 : movesEast(h) ? 1 : 0.5;
  const v = movesNorth(h) ? 0 : movesSouth(h) ? 1 : 0.5;
  return { u, v };
}

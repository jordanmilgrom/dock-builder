/**
 * New-piece placement (Phase 7 bug fix). Clicking "+ Rectangle" used to drop the
 * new piece at the viewport center, landing it on top of whatever was already
 * there. Instead place it just past the right edge of the existing design's
 * bounding box (with a 1 ft gap); the canvas auto-fits afterward so it scrolls
 * into view. Pure + framework-free for testability.
 */

export interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Origin (posX, posY) for a new piece: 1 ft to the right of the existing bbox. */
export function placeToRight(existing: Bbox | null | undefined, gap = 1): { posX: number; posY: number } {
  if (!existing || !Number.isFinite(existing.maxX) || !Number.isFinite(existing.minY)) {
    return { posX: 0, posY: 0 };
  }
  return { posX: Math.round(existing.maxX + gap), posY: Math.round(existing.minY) };
}

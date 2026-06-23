/**
 * Multi-select set operations (Phase 10). Pure — the component holds a
 * `Set<string>` of piece ids and routes every change through here.
 */

export interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Shift-click: add the id if absent, remove it if present. Returns a new set. */
export function toggle(selection: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selection);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** A single, exclusive selection (plain click). */
export function selectOne(id: string): Set<string> {
  return new Set([id]);
}

/** Select everything. */
export function selectAll(ids: readonly string[]): Set<string> {
  return new Set(ids);
}

/** Clear the selection. */
export function clear(): Set<string> {
  return new Set();
}

/** True when `inner` lies fully within `outer` (used for marquee containment). */
export function isContained(inner: Bbox, outer: Bbox, tol = 1e-6): boolean {
  return (
    inner.minX >= outer.minX - tol &&
    inner.minY >= outer.minY - tol &&
    inner.maxX <= outer.maxX + tol &&
    inner.maxY <= outer.maxY + tol
  );
}

/** Normalize a drag (start→end, any direction) into a bbox. */
export function marqueeBbox(start: { x: number; y: number }, end: { x: number; y: number }): Bbox {
  return {
    minX: Math.min(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxX: Math.max(start.x, end.x),
    maxY: Math.max(start.y, end.y),
  };
}

/** Pieces FULLY contained in the marquee become selected (not "touching"). */
export function marqueeSelect(pieces: readonly { id: string; bbox: Bbox }[], marquee: Bbox): Set<string> {
  return new Set(pieces.filter((p) => isContained(p.bbox, marquee)).map((p) => p.id));
}

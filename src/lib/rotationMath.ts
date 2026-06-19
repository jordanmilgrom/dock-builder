/**
 * Rotation-handle math (Phase 10). Pure + framework-free so the rotation gesture
 * and the handle's screen position are unit-testable.
 *
 * Fixes the confirmed alpha bug where the rotation handle stayed locked
 * straight-up in screen space instead of rotating WITH the piece: the handle is
 * offset from the top-edge midpoint along the piece's local "up" (the outward
 * normal of the top edge), rotated by the piece's rotation.
 */

export interface Pt {
  x: number;
  y: number;
}

const DEG = 180 / Math.PI;

/** Angle (degrees) of the vector from pivot to point, via atan2. */
export function angleDeg(pivot: Pt, point: Pt): number {
  return Math.atan2(point.y - pivot.y, point.x - pivot.x) * DEG;
}

/**
 * Free rotation delta (degrees) between the pointerdown cursor and the current
 * cursor, both measured around the piece center (pivot). Continuous.
 */
export function rotationDelta(pivot: Pt, initialCursor: Pt, currentCursor: Pt): number {
  return angleDeg(pivot, currentCursor) - angleDeg(pivot, initialCursor);
}

/** Apply a delta to the original rotation, normalized to [0, 360). */
export function applyRotation(originalDeg: number, deltaDeg: number): number {
  return ((originalDeg + deltaDeg) % 360 + 360) % 360;
}

/**
 * Snap to the nearest multiple of `step` (default 90°) when within `tol` (±5°).
 * Otherwise return the free angle rounded.
 */
export function snapAngle(deg: number, step = 90, tol = 5): number {
  const n = ((deg % 360) + 360) % 360;
  const nearest = Math.round(n / step) * step;
  const within = Math.min(Math.abs(n - nearest), step - Math.abs(n - nearest));
  return (within <= tol ? nearest % 360 : Math.round(n));
}

/**
 * Unit direction (world) of the piece's local "up" — the outward normal of the
 * top edge — for placing the rotation handle/stem so it rotates with the piece.
 * Local up is (0, −1); rotate by rotationDeg (clockwise-positive screen y-down).
 */
export function handleUpDir(rotationDeg: number): Pt {
  const r = (rotationDeg * Math.PI) / 180;
  // Rotate local up (0,−1) by r in screen coords (y down): (sin r, −cos r).
  return { x: Math.sin(r), y: -Math.cos(r) };
}

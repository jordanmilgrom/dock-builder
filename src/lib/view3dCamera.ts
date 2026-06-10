/**
 * 3D camera framing (Phase 7 bug fix). The viewer used to look at
 * `(lengthFt/2, 0, widthFt/2)` — derived from bbox *sizes*, so a design centered
 * at (55, 55) rendered off-screen and "Reset camera" didn't help. This pure
 * helper orbits to the bbox CENTER with a distance proportional to the bbox
 * diagonal, used on mount and on reset. Framework-free for testing.
 */

export interface WorldBox {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface CameraFraming {
  target: { x: number; y: number; z: number };
  /** Orbit radius (distance from target). */
  radius: number;
}

export function frameCamera(box: WorldBox): CameraFraming {
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const spanX = Math.max(1, box.maxX - box.minX);
  const spanZ = Math.max(1, box.maxZ - box.minZ);
  const diagonal = Math.hypot(spanX, spanZ);
  return {
    target: { x: cx, y: 0, z: cz },
    radius: Math.max(diagonal * 1.4, 8),
  };
}

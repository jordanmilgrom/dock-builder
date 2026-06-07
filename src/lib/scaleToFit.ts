/**
 * Canvas viewport math (Phase 7). Pure, framework-free, SSR-safe — the SINGLE
 * source of truth for the Canvas editor's pan/zoom/fit transform so the on-screen
 * behavior is unit-testable without a browser.
 *
 * A `Transform` maps WORLD feet → SCREEN pixels:
 *     screenX = worldX * scale + translate.x
 *     screenY = worldY * scale + translate.y
 * (No engine geometry is touched here — this is presentation only.)
 */

export interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Transform {
  translate: { x: number; y: number };
  scale: number;
}

/** Hard zoom limits shared by scroll/pinch/fit (kickoff: 0.1×–10×). */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 10;
/** Auto-fit leaves 10% breathing room around the design. */
export const FIT_PADDING_FRAC = 0.1;

export function clampScale(scale: number, min = MIN_SCALE, max = MAX_SCALE): number {
  if (!Number.isFinite(scale)) return min;
  return Math.min(max, Math.max(min, scale));
}

/**
 * Fit a world-space bbox into the viewport with uniform scale + centering,
 * leaving `padding` fraction of slack on every side. Degenerate (zero-area or
 * empty) bboxes fall back to a 1×1-ft box centered in the viewport.
 */
export function fitBbox(bbox: Bbox, viewport: Viewport, padding = FIT_PADDING_FRAC): Transform {
  const w = viewport.width || 1;
  const h = viewport.height || 1;
  let bw = bbox.maxX - bbox.minX;
  let bh = bbox.maxY - bbox.minY;
  let cx = (bbox.minX + bbox.maxX) / 2;
  let cy = (bbox.minY + bbox.maxY) / 2;
  if (!Number.isFinite(bw) || !Number.isFinite(bh) || bw <= 0 || bh <= 0) {
    // Empty/degenerate design — show a neutral 1-ft box at the origin.
    bw = bw > 0 ? bw : 1;
    bh = bh > 0 ? bh : 1;
    if (!Number.isFinite(cx)) cx = bw / 2;
    if (!Number.isFinite(cy)) cy = bh / 2;
  }
  const usableW = w * (1 - 2 * padding);
  const usableH = h * (1 - 2 * padding);
  const scale = clampScale(Math.min(usableW / bw, usableH / bh));
  // Center the bbox center on the viewport center.
  return {
    scale,
    translate: { x: w / 2 - cx * scale, y: h / 2 - cy * scale },
  };
}

/** WORLD feet → SCREEN px. */
export function worldToScreen(t: Transform, x: number, y: number): { x: number; y: number } {
  return { x: x * t.scale + t.translate.x, y: y * t.scale + t.translate.y };
}

/** SCREEN px → WORLD feet (inverse of {@link worldToScreen}). */
export function screenToWorld(t: Transform, x: number, y: number): { x: number; y: number } {
  return { x: (x - t.translate.x) / t.scale, y: (y - t.translate.y) / t.scale };
}

/**
 * Zoom by `factor` while keeping the world point currently under `cursor`
 * (screen px) pinned in place — the natural "zoom toward the pointer" feel.
 */
export function zoomAround(
  t: Transform,
  factor: number,
  cursor: { x: number; y: number },
  min = MIN_SCALE,
  max = MAX_SCALE,
): Transform {
  const next = clampScale(t.scale * factor, min, max);
  // Solve for translate so the world point under the cursor stays fixed.
  const world = screenToWorld(t, cursor.x, cursor.y);
  return {
    scale: next,
    translate: { x: cursor.x - world.x * next, y: cursor.y - world.y * next },
  };
}

/** Pan by a screen-pixel delta (middle-mouse / Space-drag). */
export function panBy(t: Transform, dx: number, dy: number): Transform {
  return { scale: t.scale, translate: { x: t.translate.x + dx, y: t.translate.y + dy } };
}

/** Scroll-notch zoom factor (kickoff: 1.1× per notch; deltaY<0 zooms in). */
export function notchFactor(deltaY: number, step = 1.1): number {
  return deltaY < 0 ? step : 1 / step;
}

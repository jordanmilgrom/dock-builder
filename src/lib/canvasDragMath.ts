/**
 * Canvas drag/resize math (Phase 7 bug fix). Mirrors exactly what the Canvas
 * editor does on a handle drag: convert the SCREEN-pixel delta to a WORLD-foot
 * delta (÷ scale, the inverse of `screenToWorld`), apply the resize, and snap on
 * release. Pure so the "50 px drag → expected feet" scenario is locked by a test
 * and a NaN can never slip back in.
 */

import { resizeRect, snapRect, type Handle, type RectDims } from "./resizeHandles";

export function worldDelta(screenDx: number, screenDy: number, scale: number): { dx: number; dy: number } {
  if (!Number.isFinite(scale) || scale === 0) return { dx: 0, dy: 0 };
  return { dx: screenDx / scale, dy: screenDy / scale };
}

/** Resize a rectangle by a screen-pixel handle drag, then snap (on release). */
export function resizeRectByScreen(
  rect: RectDims,
  handle: Handle,
  screenDx: number,
  screenDy: number,
  scale: number,
): RectDims {
  const { dx, dy } = worldDelta(screenDx, screenDy, scale);
  return snapRect(resizeRect(rect, handle, dx, dy), handle);
}

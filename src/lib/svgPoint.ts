/**
 * Pointer → SVG-local coordinate conversion (Phase 7 bug fix).
 *
 * The Canvas editor must NOT read `event.currentTarget.getBoundingClientRect()`:
 * React nulls `currentTarget` on a synthetic event once the original handler
 * returns, and on a pointer-DOWN the `currentTarget` is the clicked child (a
 * piece `<g>` or a handle `<rect>`), not the root `<svg>` — both give the wrong
 * origin and feed NaN into the drag/resize math. Instead the component passes the
 * rect from a stable `useRef` on the `<svg>`. This pure helper does the subtract
 * and is null-safe (a missing rect yields the raw client point, never NaN).
 */

export interface RectLike {
  left: number;
  top: number;
}

export function svgPoint(clientX: number, clientY: number, rect: RectLike | null | undefined): { x: number; y: number } {
  const left = rect?.left ?? 0;
  const top = rect?.top ?? 0;
  return { x: clientX - left, y: clientY - top };
}

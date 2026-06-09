/**
 * Properties-panel logic (Phase 7). Pure helpers shared by the right-rail
 * Properties panel (PieceProperties / DesignProperties) and its tests — steppers,
 * snapping, the Selection/Design pill, and the input debounce. No React, no I/O.
 */

import type { DockPiece, Rotation } from "@/engine";

/** Position grid (1 ft) and dimension snap (6 in) — match the Canvas snaps. */
export const POS_SNAP_FT = 1;
export const DIM_SNAP_FT = 0.5;
export const MIN_DIM_FT = 4;
export const ROTATIONS: Rotation[] = [0, 90, 180, 270];
/** All Properties inputs debounce before committing to the in-memory config. */
export const DEBOUNCE_MS = 200;

/** Top pill label: a piece is selected → "Selection"; otherwise "Design". */
export function selectionPill(selectedIndex: number | null): "Selection" | "Design" {
  return selectedIndex == null ? "Design" : "Selection";
}

const snap = (v: number, step: number) => Math.round(v / step) * step;

/** Step a dimension by ±n half-foot increments, snapped to 6 in, clamped to min. */
export function stepDim(value: number, deltaSteps: number): number {
  const next = snap(value, DIM_SNAP_FT) + deltaSteps * DIM_SNAP_FT;
  return Math.max(MIN_DIM_FT, snap(next, DIM_SNAP_FT));
}

/** Commit a typed dimension: snap to 6 in, clamp to the 4 ft floor. */
export function clampDim(value: number): number {
  if (!Number.isFinite(value)) return MIN_DIM_FT;
  return Math.max(MIN_DIM_FT, snap(value, DIM_SNAP_FT));
}

/** Step a position by ±n feet, snapped to the 1 ft grid. */
export function stepPos(value: number, deltaSteps: number): number {
  return snap(value, POS_SNAP_FT) + deltaSteps * POS_SNAP_FT;
}

/** Commit a typed position: snap to the 1 ft grid (negative allowed). */
export function clampPos(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return snap(value, POS_SNAP_FT);
}

/** Coerce any degree value into one of the 4 canonical rotations. */
export function normalizeRotation(deg: number): Rotation {
  const m = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  return m as Rotation;
}

/** Next 90° rotation (the rotation handle's click-to-cycle). */
export function cycleRotation(deg: number): Rotation {
  return normalizeRotation(deg + 90);
}

export interface DimField {
  key: "lengthFt" | "widthFt" | "legAFt" | "legBFt";
  label: string;
  value: number;
}

/** The two dimension fields a piece exposes (L/W for rects, Leg A/B for triangles). */
export function dimFields(piece: DockPiece): [DimField, DimField] {
  if (piece.pieceKind === "right_triangle") {
    return [
      { key: "legAFt", label: "Leg A (ft)", value: piece.legAFt ?? 0 },
      { key: "legBFt", label: "Leg B (ft)", value: piece.legBFt ?? 0 },
    ];
  }
  return [
    { key: "lengthFt", label: "Length (ft)", value: piece.lengthFt ?? 0 },
    { key: "widthFt", label: "Width (ft)", value: piece.widthFt ?? 0 },
  ];
}

/** Short human label for the selected piece. */
export function pieceLabel(piece: DockPiece): string {
  return piece.pieceKind === "right_triangle"
    ? `Right triangle ${piece.legAFt ?? 0}×${piece.legBFt ?? 0} ft`
    : `Rectangle ${piece.lengthFt ?? 0}×${piece.widthFt ?? 0} ft`;
}

/**
 * Trailing-edge debounce. Generic + framework-free so the panel can defer writes
 * 200 ms; tests drive it with fake timers. Returns the wrapped fn plus a
 * `.flush()`/`.cancel()` pair.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms = DEBOUNCE_MS,
): ((...args: A) => void) & { flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;
  const run = (...args: A) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (lastArgs) fn(...lastArgs);
      lastArgs = null;
    }, ms);
  };
  run.flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (lastArgs) fn(...lastArgs);
    lastArgs = null;
  };
  run.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };
  return run;
}

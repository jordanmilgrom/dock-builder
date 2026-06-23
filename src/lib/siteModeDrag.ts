/**
 * Site-tab (2D bathymetry editor) drag math (Phase 11). Pure: dragging a depth
 * handle clamps it so the profile stays monotonic by distance (depth never
 * decreases as you go out from shore) and never goes negative.
 */

import type { Bathymetry, DepthPoint } from "@/engine";

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Set the depth of handle `index` to `depthFt`, clamped between its neighbors so
 * the curve stays monotonic (and ≥ 0). Returns a new profile array.
 */
export function clampDepthHandle(profile: DepthPoint[], index: number, depthFt: number): DepthPoint[] {
  if (index < 0 || index >= profile.length) return profile;
  const prev = index > 0 ? profile[index - 1]!.depthFt : 0;
  const next = index < profile.length - 1 ? profile[index + 1]!.depthFt : Number.POSITIVE_INFINITY;
  const clamped = clampN(depthFt, Math.max(0, prev), next);
  return profile.map((p, i) => (i === index ? { ...p, depthFt: Math.round(clamped * 10) / 10 } : p));
}

/** Clamp a shore-height drag to a sane range (0–20 ft). */
export function clampShoreHeight(ft: number): number {
  return Math.round(clampN(ft, 0, 20) * 10) / 10;
}

/** Clamp a land-slope drag to 0–100%. */
export function clampLandSlope(pct: number): number {
  return Math.round(clampN(pct, 0, 100));
}

/** Whether a profile's depths are non-decreasing by distance (the invariant). */
export function isMonotonic(profile: DepthPoint[]): boolean {
  for (let i = 1; i < profile.length; i++) {
    if (profile[i]!.depthFt < profile[i - 1]!.depthFt - 1e-9) return false;
  }
  return true;
}

/** Apply a depth edit and return the whole bathymetry (immutably). */
export function setHandleDepth(b: Bathymetry, index: number, depthFt: number): Bathymetry {
  return { ...b, depthProfile: clampDepthHandle(b.depthProfile, index, depthFt) };
}

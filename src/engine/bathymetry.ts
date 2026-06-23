/**
 * Bathymetry (Phase 11). The site's side-view profile — shore height, water
 * surface, land slope, and an underwater depth curve. A pure module that pricing,
 * validation, and the 3D viewer CONSUME but never depend on (engines stay pure).
 *
 * Depth between handles uses monotone cubic Hermite interpolation (PCHIP): it
 * passes exactly through every handle and never overshoots, so a non-decreasing
 * set of depths yields a non-decreasing curve (no spurious shallow dips).
 */

import type { Bathymetry, DepthPoint, DockConfig, NormalizedPiece } from "./index.js";

export const DEFAULT_BATHYMETRY: Bathymetry = {
  shoreHeightFt: 3,
  waterHeightFt: 0,
  landSlopePct: 15,
  depthProfile: [
    { distanceFromShoreFt: 0, depthFt: 0 },
    { distanceFromShoreFt: 5, depthFt: 2 },
    { distanceFromShoreFt: 20, depthFt: 6 },
    { distanceFromShoreFt: 40, depthFt: 8 },
  ],
};

/** The config's bathymetry, or the default profile. */
export function resolveBathymetry(config: DockConfig): Bathymetry {
  return config.bathymetry ?? DEFAULT_BATHYMETRY;
}

function sortedProfile(profile: DepthPoint[]): DepthPoint[] {
  return [...profile].sort((a, b) => a.distanceFromShoreFt - b.distanceFromShoreFt);
}

/**
 * Water depth (ft) at a horizontal distance from shore, via monotone cubic
 * Hermite. Clamps to the first/last handle outside the sampled range.
 */
export function depthAtDistanceFt(bathymetry: Bathymetry, distanceFt: number): number {
  const pts = sortedProfile(bathymetry.depthProfile);
  if (pts.length === 0) return 0;
  if (pts.length === 1) return pts[0]!.depthFt;
  const xs = pts.map((p) => p.distanceFromShoreFt);
  const ys = pts.map((p) => p.depthFt);
  if (distanceFt <= xs[0]!) return ys[0]!;
  if (distanceFt >= xs[xs.length - 1]!) return ys[ys.length - 1]!;

  // Secant slopes between samples.
  const n = xs.length;
  const dx: number[] = [], slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1]! - xs[i]!;
    dx.push(h);
    slope.push(h === 0 ? 0 : (ys[i + 1]! - ys[i]!) / h);
  }
  // Fritsch–Carlson monotone tangents.
  const m: number[] = new Array(n).fill(0);
  m[0] = slope[0]!;
  m[n - 1] = slope[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1]! * slope[i]! <= 0) m[i] = 0;
    else m[i] = (slope[i - 1]! + slope[i]!) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i]! / slope[i]!;
    const b = m[i + 1]! / slope[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i]!;
      m[i + 1] = t * b * slope[i]!;
    }
  }
  // Find the segment and evaluate the Hermite basis.
  let i = 0;
  while (i < n - 1 && distanceFt > xs[i + 1]!) i++;
  const h = dx[i]!;
  const t = (distanceFt - xs[i]!) / h;
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * ys[i]! + h10 * h * m[i]! + h01 * ys[i + 1]! + h11 * h * m[i + 1]!;
}

/** Water depth (ft) at a piece's center (distance from shore = center x; shore at x=0). */
export function depthAtPieceCenter(bathymetry: Bathymetry, piece: NormalizedPiece): number {
  const isTri = piece.kind === "right_triangle";
  const w = isTri ? piece.legAFt : piece.lengthFt;
  const centerX = piece.posX + (w ?? 0) / 2;
  return depthAtDistanceFt(bathymetry, centerX);
}

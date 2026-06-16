/**
 * Gangway sizing (Phase 9).
 *
 * The customer either picks a LENGTH (3–24 ft) and the engine derives the slope
 * (warning if too steep), or picks a TARGET SLOPE and the engine derives the
 * length (legacy behavior). A gangway steeper than the ADA-recommended 1:12 fires
 * an advisory.
 *
 * NOTE: the Phase 9 kickoff's prose says "warn when steeper than 1:8", but its
 * own test cases (12 ft + 3 ft = 1:4 warns, 36 ft + 3 ft = 1:12 clean,
 * 18 ft + 2 ft = 1:9 warns) and its message ("ADA recommends 1:12 or shallower")
 * only line up with a 1:12 threshold. We warn when steeper than 1:12.
 */

import { parseSlopeRatio } from "./geometry.js";
import type { GangwayConfig } from "./types.js";

/** Warn when the run:rise ratio is below this (steeper than 1:12, the ADA rec). */
export const GANGWAY_WARN_RATIO = 12;
export const GANGWAY_MIN_FT = 3;
export const GANGWAY_MAX_FT = 24;

const round = (n: number, dp = 1): number => Math.round(n * 10 ** dp) / 10 ** dp;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface GangwayResult {
  present: boolean;
  mode: "length" | "slope";
  lengthFt: number;
  /** run:rise ratio (the N in "1:N"). */
  ratio: number;
  slopeLabel: string; // "1:N"
  slopePct: number;
  warning?: string;
}

/** Resolve a gangway's length/slope from its config + the shore rise. Pure. */
export function computeGangway(gangway: GangwayConfig | undefined, shoreHeightFt: number): GangwayResult {
  if (!gangway?.present) {
    return { present: false, mode: "length", lengthFt: 0, ratio: 0, slopeLabel: "—", slopePct: 0 };
  }
  const rise = Math.max(0, shoreHeightFt);
  const mode = gangway.mode ?? (gangway.targetSlope ? "slope" : "length");

  let lengthFt: number;
  if (mode === "slope") {
    const ratio = parseSlopeRatio(gangway.targetSlope) ?? GANGWAY_WARN_RATIO;
    lengthFt = round(rise * ratio);
  } else {
    lengthFt = clamp(gangway.lengthFt ?? 12, GANGWAY_MIN_FT, GANGWAY_MAX_FT);
  }

  if (rise <= 0 || lengthFt <= 0) {
    return { present: true, mode, lengthFt, ratio: 0, slopeLabel: "—", slopePct: 0 };
  }

  const ratio = round(lengthFt / rise, 1); // run:rise
  const slopePct = round((rise / lengthFt) * 100, 1);
  const result: GangwayResult = {
    present: true,
    mode,
    lengthFt,
    ratio,
    slopeLabel: `1:${ratio}`,
    slopePct,
  };
  if (ratio < GANGWAY_WARN_RATIO) {
    result.warning = `Gangway slope ${result.slopeLabel} is steeper than the ADA-recommended 1:12. Consider a longer gangway.`;
  }
  return result;
}

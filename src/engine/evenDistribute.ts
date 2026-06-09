/**
 * Even-distribute support spacing (Phase 8).
 *
 * The single source of truth for placing supports (floats and piles, both axes)
 * along a run. Industry practice distributes supports EVENLY along a run with a
 * *maximum* gap — not "a support at every X feet from the corner," which leaves a
 * short, uneven last bay (e.g. a 22 ft run at 8 ft → 8 + 8 + 6). Even-distribute
 * turns that into three equal ~7.33 ft bays, and guarantees no overhang past the
 * last support.
 *
 * Returns the support POSITIONS along [0, runLengthFt], both ends included.
 */
export function evenDistribute(runLengthFt: number, maxGapFt: number): number[] {
  if (runLengthFt <= 0) return [0];
  const bayCount = Math.max(1, Math.ceil(runLengthFt / maxGapFt));
  const bayLengthFt = runLengthFt / bayCount;
  const positions: number[] = [];
  for (let i = 0; i <= bayCount; i++) positions.push(i * bayLengthFt);
  return positions;
}

/** The (uniform) bay length produced by {@link evenDistribute}. */
export function evenBayLengthFt(runLengthFt: number, maxGapFt: number): number {
  if (runLengthFt <= 0) return 0;
  const bayCount = Math.max(1, Math.ceil(runLengthFt / maxGapFt));
  return runLengthFt / bayCount;
}

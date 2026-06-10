import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clampDim, debounce, MIN_DIM_FT } from "@/lib/propertiesPanel";

/**
 * The dimension inputs must commit a TYPED value (e.g. triple-click → "60" → Tab),
 * not only stepper clicks. The component wires a debounced commit + a blur flush;
 * here we drive that pipeline (clampDim on commit, snapped to 0.5 ft).
 */
describe("typed dimension commit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("snaps + clamps the committed value", () => {
    expect(clampDim(60)).toBe(60);
    expect(clampDim(9.3)).toBe(9.5);
    expect(clampDim(2)).toBe(MIN_DIM_FT); // 4 ft floor
  });

  it("commits the typed value on blur (flush), not just via steppers", () => {
    let committed: number | null = null;
    const onCommit = debounce((n: number) => { committed = clampDim(n); }, 200);

    onCommit(60); // user typed 60 then tabbed away…
    expect(committed).toBeNull(); // …not committed synchronously
    onCommit.flush(); // blur flush
    expect(committed).toBe(60);
  });

  it("also commits after the debounce window without an explicit blur", () => {
    let committed: number | null = null;
    const onCommit = debounce((n: number) => { committed = clampDim(n); }, 200);
    onCommit(12.4);
    vi.advanceTimersByTime(200);
    expect(committed).toBe(12.5);
  });
});

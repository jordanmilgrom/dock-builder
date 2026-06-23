/**
 * Phase 10 — the rotation handle must rotate WITH the piece (confirmed alpha bug:
 * it stayed locked straight-up in screen space). No browser harness here, so we
 * drive the pure handle-position math the canvas uses: at rotation 0 the handle
 * sits ABOVE the top edge; at 90° it sits to the RIGHT.
 */
import { describe, expect, it } from "vitest";
import { handleUpDir } from "@/lib/rotationMath";
import { worldToScreen } from "@/lib/scaleToFit";

const t = { translate: { x: 0, y: 0 }, scale: 10 };
const HANDLE_OFFSET_PX = 22;

/** Screen position of the rotation knob given the top-edge-mid (screen) + rotation. */
function knobScreen(topMidScreen: { x: number; y: number }, rotationDeg: number) {
  const up = handleUpDir(rotationDeg);
  return { x: topMidScreen.x + up.x * HANDLE_OFFSET_PX, y: topMidScreen.y + up.y * HANDLE_OFFSET_PX };
}

describe("rotation handle is grabbable after rotating", () => {
  it("rotation 0 → knob is ABOVE the top edge", () => {
    const topMid = worldToScreen(t, 5, 0); // some top-edge midpoint
    const knob = knobScreen(topMid, 0);
    expect(knob.y).toBeLessThan(topMid.y); // above (smaller screen-y)
    expect(knob.x).toBeCloseTo(topMid.x, 6);
  });

  it("rotation 90 → knob is to the RIGHT of the top edge (was the bug: still above)", () => {
    const topMid = worldToScreen(t, 5, 0);
    const knob = knobScreen(topMid, 90);
    expect(knob.x).toBeGreaterThan(topMid.x); // to the right
    expect(knob.y).toBeCloseTo(topMid.y, 6); // not above anymore
  });

  it("the handle direction tracks every quarter turn", () => {
    expect(handleUpDir(0)).toMatchObject({ x: expect.closeTo(0, 6), y: expect.closeTo(-1, 6) });
    expect(handleUpDir(90)).toMatchObject({ x: expect.closeTo(1, 6), y: expect.closeTo(0, 6) });
    expect(handleUpDir(180)).toMatchObject({ x: expect.closeTo(0, 6), y: expect.closeTo(1, 6) });
    expect(handleUpDir(270)).toMatchObject({ x: expect.closeTo(-1, 6), y: expect.closeTo(0, 6) });
  });
});

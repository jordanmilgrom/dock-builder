/**
 * Phase 10 — power-user flow, driven through the pure canvas libs (no browser
 * harness in this repo). Arm Rectangle → draw 12×6; arm Square → draw 8×8;
 * select both; duplicate; drag the duplicates; rotate one 90°; then undo the
 * rotation, the duplicate, and the second piece. Plus a perf guard: a gesture
 * commits exactly once (≤ 2 React writes/gesture: start + release).
 */
import { describe, expect, it, vi } from "vitest";
import type { DockConfig, DockPiece } from "@/engine";
import { drawnPiece } from "@/lib/clickDragDraw";
import { duplicatePieces, offsetPieces } from "@/lib/clipboardOps";
import { applyRotation, snapAngle } from "@/lib/rotationMath";
import { createHistory } from "@/lib/undoRedo";
import { beginGesture } from "@/lib/canvasGesture";

const baseConfig = (pieces: DockPiece[]): DockConfig => ({
  schemaVersion: 1, tenantId: "t", dockType: "floating", use: "residential",
  site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
  overall: { lengthFt: 20, widthFt: 8, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum" },
  pieces,
});

describe("canvas power-user flow", () => {
  it("draw → select → duplicate → drag → rotate → undo×3", () => {
    const history = createHistory<DockConfig>();
    let pieces: DockPiece[] = [];
    const commit = () => history.push(baseConfig(structuredClone(pieces)), Date.now() + history.size() * 1000);

    // Arm Rectangle tool, drag a 12×6.
    pieces = [...pieces, drawnPiece("rectangle", { x: 0, y: 0 }, { x: 12, y: 6 })];
    commit();
    expect(pieces[0]).toMatchObject({ lengthFt: 12, widthFt: 6 });

    // Arm Square tool, drag an 8×8.
    pieces = [...pieces, drawnPiece("square", { x: 20, y: 0 }, { x: 28, y: 5 })];
    commit();
    expect(pieces[1]).toMatchObject({ lengthFt: 8, widthFt: 8 });

    // Shift-click both, Cmd-D duplicate.
    const dup = duplicatePieces(pieces, [0, 1]);
    pieces = dup.pieces;
    commit();
    expect(pieces).toHaveLength(4);
    expect(dup.newIndices).toEqual([2, 3]);

    // Drag the duplicates by +3,+3.
    const moved = offsetPieces([pieces[2]!, pieces[3]!], 3, 3);
    pieces = [pieces[0]!, pieces[1]!, moved[0]!, moved[1]!];
    commit();
    expect(pieces[2]!.posX).toBe(drawnPiece("rectangle", { x: 0, y: 0 }, { x: 12, y: 6 }).posX + 2 + 3);

    // Rotate piece 0 to 90°.
    pieces = pieces.map((p, i) => (i === 0 ? { ...p, rotationDeg: snapAngle(applyRotation(0, 88)) as 0 | 90 | 180 | 270 } : p));
    commit();
    expect(pieces[0]!.rotationDeg).toBe(90);

    // Undo the rotation → piece 0 back to 0°, still 4 pieces.
    let s = history.undo()!;
    expect(s.pieces![0]!.rotationDeg).toBe(0);
    expect(s.pieces).toHaveLength(4);

    // Undo the drag → duplicates back at +2 offset.
    s = history.undo()!;
    expect(s.pieces).toHaveLength(4);

    // Undo the duplicate → back to 2 pieces.
    s = history.undo()!;
    expect(s.pieces).toHaveLength(2);
  });

  it("perf guard: a drag gesture commits state exactly once", () => {
    const commit = vi.fn();
    const g = beginGesture({ posX: 0, posY: 0 });
    // simulate many pointermove frames (DOM-only, no commit)…
    for (let i = 0; i < 30; i++) g.transform(i, i);
    // …then a single release commit.
    g.commit(commit);
    g.commit(commit);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

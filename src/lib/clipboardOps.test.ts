import { describe, expect, it } from "vitest";
import { bringToFront, copyPieces, duplicatePieces, pastePieces, sendToBack } from "@/lib/clipboardOps";
import type { DockPiece } from "@/engine";

const rect = (posX: number, posY: number, lengthFt = 8): DockPiece => ({ pieceKind: "rectangle", posX, posY, rotationDeg: 0, lengthFt, widthFt: 6 });

describe("clipboardOps", () => {
  it("copy + paste preserves pieces with a +2/+2 offset", () => {
    const pieces = [rect(0, 0), rect(20, 0)];
    const clip = copyPieces(pieces, [0]);
    expect(clip).toHaveLength(1);
    const { pieces: next, newIndices } = pastePieces(pieces, clip);
    expect(next).toHaveLength(3);
    expect(newIndices).toEqual([2]);
    expect(next[2]).toMatchObject({ posX: 2, posY: 2, lengthFt: 8 });
  });

  it("multi-piece clipboard round-trips both pieces", () => {
    const pieces = [rect(0, 0), rect(20, 0)];
    const clip = copyPieces(pieces, [0, 1]);
    const { pieces: next, newIndices } = pastePieces(pieces, clip);
    expect(newIndices).toEqual([2, 3]);
    expect(next[2]).toMatchObject({ posX: 2, posY: 2 });
    expect(next[3]).toMatchObject({ posX: 22, posY: 2 });
  });

  it("duplicate offsets in place and auto-selects the copies", () => {
    const pieces = [rect(5, 5)];
    const { pieces: next, newIndices } = duplicatePieces(pieces, [0]);
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ posX: 7, posY: 7 });
    expect(newIndices).toEqual([1]);
  });

  it("copy does not mutate the source pieces", () => {
    const pieces = [rect(0, 0)];
    const clip = copyPieces(pieces, [0]);
    clip[0]!.posX = 99;
    expect(pieces[0]!.posX).toBe(0);
  });

  it("bringToFront / sendToBack adjust z above/below the rest", () => {
    const pieces = [rect(0, 0), rect(20, 0)];
    expect(bringToFront(pieces, [0])[0]!.z).toBe(1);
    expect(sendToBack(pieces, [1])[1]!.z).toBe(-1);
  });
});

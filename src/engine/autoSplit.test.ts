import { describe, expect, it } from "vitest";
import { autoSplitPiece, maxSectionFtFor } from "./autoSplit.js";
import type { DockPiece } from "./types.js";

const rect = (lengthFt: number): DockPiece => ({ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt, widthFt: 6 });
const lens = (r: { sections: DockPiece[] }) => r.sections.map((s) => s.lengthFt);

describe("autoSplitPiece — equal sections under the max", () => {
  const max = maxSectionFtFor("aluminum"); // 32

  it("30 ft aluminum → [30] + 0 connectors (under the max)", () => {
    const r = autoSplitPiece(rect(30), max);
    expect(lens(r)).toEqual([30]);
    expect(r.connectors).toBe(0);
  });

  it("60 ft aluminum → two equal bays + 1 connector (documented algorithm)", () => {
    const r = autoSplitPiece(rect(60), max);
    expect(r.sections).toHaveLength(2);
    expect(r.connectors).toBe(1);
    expect(lens(r)).toEqual([30, 30]);
  });

  it("65 ft aluminum → 3 equal bays under the 32 ft max + 2 connectors", () => {
    // ceil(65/32)=3 (the documented formula); the kickoff's [32.5, 32.5] example
    // is inconsistent — 2 bays of 32.5 ft would exceed the 32 ft max it must respect.
    const r = autoSplitPiece(rect(65), max);
    expect(r.sections).toHaveLength(3);
    expect(r.connectors).toBe(2);
    r.sections.forEach((s) => expect(s.lengthFt!).toBeLessThanOrEqual(max + 1e-9));
    r.sections.forEach((s) => expect(s.lengthFt!).toBeCloseTo(65 / 3, 2));
  });

  it("96 ft aluminum → [32, 32, 32] + 2 connectors", () => {
    const r = autoSplitPiece(rect(96), max);
    expect(lens(r)).toEqual([32, 32, 32]);
    expect(r.connectors).toBe(2);
  });

  it("positions sections end-to-end from the original origin", () => {
    const r = autoSplitPiece(rect(96), max);
    expect(r.sections.map((s) => s.posX)).toEqual([0, 32, 64]);
  });

  it("triangles never split", () => {
    const tri: DockPiece = { pieceKind: "right_triangle", posX: 0, posY: 0, rotationDeg: 0, legAFt: 40, legBFt: 8 };
    expect(autoSplitPiece(tri, max).connectors).toBe(0);
  });
});

describe("maxSectionFtFor", () => {
  it("is 32 aluminum, 24 wood, 40 steel", () => {
    expect(maxSectionFtFor("aluminum")).toBe(32);
    expect(maxSectionFtFor("pt_pine")).toBe(24);
    expect(maxSectionFtFor("galvanized_steel")).toBe(40);
  });
});

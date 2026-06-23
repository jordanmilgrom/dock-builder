import { describe, expect, it } from "vitest";
import { gangwayPieceSlope, snapGangwayToEdge } from "./gangwayPiece.js";

describe("snapGangwayToEdge", () => {
  const pieces = [{ id: "p1", bbox: { minX: 10, minY: 0, maxX: 30, maxY: 8 } }];

  it("snaps when the gangway's right edge is within 2 ft of a dock edge", () => {
    // gangway right edge at 9 → 1 ft gap to the dock's left edge (10).
    const snap = snapGangwayToEdge({ posX: -3, posY: 2, lengthFt: 12, widthFt: 4 }, pieces);
    expect(snap).not.toBeNull();
    expect(snap!.connectsToPieceId).toBe("p1");
    expect(snap!.posX + 12).toBeCloseTo(10, 6); // right edge meets the dock left edge
    expect(snap!.posY).toBeCloseTo(2, 6); // centered on the dock (4-(0..8) center)
  });

  it("returns null when nothing is within 2 ft", () => {
    expect(snapGangwayToEdge({ posX: -30, posY: 2, lengthFt: 12, widthFt: 4 }, pieces)).toBeNull();
  });
});

describe("gangwayPieceSlope", () => {
  it("derives the run:rise ratio + label", () => {
    expect(gangwayPieceSlope(24, 3).label).toBe("1:8");
    expect(gangwayPieceSlope(36, 3).label).toBe("1:12");
  });

  it("warns when steeper than 1:8", () => {
    expect(gangwayPieceSlope(12, 3).warning).toBeTruthy(); // 1:4
    expect(gangwayPieceSlope(20, 3).warning).toBeTruthy(); // 1:6.7
    expect(gangwayPieceSlope(36, 3).warning).toBeUndefined(); // 1:12 clean
  });

  it("handles zero rise/length gracefully", () => {
    expect(gangwayPieceSlope(12, 0).label).toBe("—");
  });
});

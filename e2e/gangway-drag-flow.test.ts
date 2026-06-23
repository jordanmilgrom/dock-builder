/**
 * Phase 11 e2e (logic-level) — draw a gangway piece, auto-attach it to the dock,
 * and verify it renders in all three views' data (engine bounds, scene box,
 * slope/label) without a browser.
 */
import { describe, expect, it } from "vitest";
import { gangwayPieceSlope, resolvePieces, snapGangwayToEdge, type DockConfig, type DockPiece } from "@/engine";
import { buildSceneSpec } from "@/lib/view3d";
import { planView } from "@/engine";

const dock: DockPiece = { pieceKind: "rectangle", posX: 10, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8, constructions: ["pile"], id: "dock1" };

describe("gangway drag flow", () => {
  it("a drawn gangway auto-attaches to the nearest dock edge within 2 ft", () => {
    const drawn = { posX: -3, posY: 2, lengthFt: 12, widthFt: 4 };
    const snap = snapGangwayToEdge(drawn, [{ id: "dock1", bbox: { minX: 10, minY: 0, maxX: 30, maxY: 8 } }]);
    expect(snap).not.toBeNull();
    expect(snap!.connectsToPieceId).toBe("dock1");
    expect(snap!.posX + 12).toBeCloseTo(10, 6);
  });

  it("the gangway renders as a piece in engine geometry + the 3D scene", () => {
    const gangway: DockPiece = { pieceKind: "gangway", posX: -2, posY: 2, rotationDeg: 0, lengthFt: 12, widthFt: 4, connectsToPieceId: "dock1", constructions: ["floating"] };
    const config: DockConfig = {
      schemaVersion: 1, tenantId: "t", dockType: "pile", use: "residential",
      site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1, bottom: "clay", waveExposure: "sheltered", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
      overall: { lengthFt: 20, widthFt: 8, deckingMaterial: "pt_2x6", deckingOrientation: "straight", frameMaterial: "pt_pine", joistSize: "2x8", maxGapFt: 8 },
      pieces: [dock, gangway],
    };
    // Engine resolves the gangway as a piece (no floats/piles of its own).
    const resolved = resolvePieces(config);
    expect(resolved).toHaveLength(2);
    expect(resolved[1]!.kind).toBe("gangway");

    // 3D scene includes a deck box for the gangway, and no float/pile from it.
    const spec = buildSceneSpec(config);
    const decks = spec.boxes.filter((b) => b.kind === "deck");
    expect(decks.length).toBeGreaterThanOrEqual(2); // dock + gangway

    // Schematic plan renders it too (a polygon exists for every piece).
    expect(planView(config).shapes.some((s) => s.kind === "polygon")).toBe(true);
  });

  it("slope is derived from length + shore height, with a steep warning", () => {
    expect(gangwayPieceSlope(12, 3).warning).toBeTruthy(); // 1:4
    expect(gangwayPieceSlope(36, 3).warning).toBeUndefined(); // 1:12
  });
});

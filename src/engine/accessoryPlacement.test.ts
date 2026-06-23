import { describe, expect, it } from "vitest";
import { accessoryCounts, accessoryWorldPos, nearestEdgeForDrop, totalAccessoryCount } from "./accessoryPlacement.js";
import type { AccessoryPlacement, DockConfig, DockPiece } from "./types.js";

const cleat = (edge: AccessoryPlacement["edge"], offsetFt: number): AccessoryPlacement => ({ id: "a", kind: "cleat", edge, offsetFt });

describe("accessory placement geometry", () => {
  const piece = { pieceKind: "rectangle" as const, posX: 10, posY: 5, rotationDeg: 0 as const, lengthFt: 20, widthFt: 8 };

  it("places on the chosen edge at the offset (top edge)", () => {
    expect(accessoryWorldPos(piece, cleat("top", 4))).toEqual({ xFt: 14, yFt: 5 });
    expect(accessoryWorldPos(piece, cleat("right", 2))).toEqual({ xFt: 30, yFt: 7 });
  });

  it("survives rotation — the world position rotates with the piece", () => {
    const rotated = { ...piece, posX: 0, posY: 0, rotationDeg: 90 as const };
    // local top-edge point (4,0) → rot90 → (0,4)
    expect(accessoryWorldPos(rotated, cleat("top", 4))).toEqual({ xFt: 0, yFt: 4 });
  });

  it("nearestEdgeForDrop snaps to the closest edge + 1 ft offset", () => {
    const drop = nearestEdgeForDrop(piece, { xFt: 15, yFt: 5.2 }); // near the top edge
    expect(drop.edge).toBe("top");
    expect(drop.offsetFt).toBe(5);
  });

  it("pricing counts sum across pieces by kind", () => {
    const config: DockConfig = {
      schemaVersion: 1, tenantId: "t", dockType: "floating", use: "residential",
      site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
      overall: { lengthFt: 20, widthFt: 8, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum" },
      pieces: [
        { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8, accessories: [cleat("top", 2), cleat("top", 6), { id: "l", kind: "ladder", edge: "right", offsetFt: 4 }] },
        { pieceKind: "rectangle", posX: 20, posY: 0, rotationDeg: 0, lengthFt: 8, widthFt: 8, accessories: [cleat("bottom", 2)] },
      ],
    };
    expect(accessoryCounts(config)).toMatchObject({ cleat: 3, ladder: 1 });
    expect(totalAccessoryCount(config)).toBe(4);
  });
});

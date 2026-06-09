/**
 * Phase 8 wheel rendering: wheel positions match the piece-local convention
 * (0, w/2) and (length, w/2), and the 3D scene emits two cylinders + a bracket
 * arm per wheel piece.
 */
import { describe, expect, it } from "vitest";
import { resolvePieces, wheelLayoutForPiece, type DockConfig } from "@/engine";
import { buildSceneSpec } from "@/lib/view3d";

const wheelConfig: DockConfig = {
  schemaVersion: 1,
  tenantId: "acme-docks",
  dockType: "floating",
  use: "residential",
  site: { depthAtEndLowWaterFt: 3, seasonalFluctuationFt: 1, bottom: "sand", waveExposure: "sheltered", seasonalIce: true, shoreHeightAboveWaterFt: 2 },
  overall: { lengthFt: 12, widthFt: 6, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum", maxGapFt: 8 },
  pieces: [{ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 12, widthFt: 6, construction: "wheel" }],
};

describe("wheel positions", () => {
  it("are at piece-local (0, width/2) and (length, width/2)", () => {
    const p = resolvePieces(wheelConfig)[0]!;
    const pts = wheelLayoutForPiece(p);
    expect(pts).toHaveLength(2);
    expect(pts[0]).toMatchObject({ xFt: 0, yFt: 3 });
    expect(pts[1]).toMatchObject({ xFt: 12, yFt: 3 });
  });

  it("rotate with the piece (90°): wheels end up on the rotated long-axis ends", () => {
    const rotated: DockConfig = {
      ...wheelConfig,
      pieces: [{ pieceKind: "rectangle", posX: 10, posY: 0, rotationDeg: 90, lengthFt: 12, widthFt: 6, construction: "wheel" }],
    };
    const pts = wheelLayoutForPiece(resolvePieces(rotated)[0]!);
    // local (0,3) → rot90 (-3, 0) → world (7, 0); local (12,3) → (-3,12) → (7,12)
    expect(pts[0]).toMatchObject({ xFt: 7, yFt: 0 });
    expect(pts[1]).toMatchObject({ xFt: 7, yFt: 12 });
  });
});

describe("3D scene for a wheel piece", () => {
  const spec = buildSceneSpec(wheelConfig);

  it("emits two wheel cylinders", () => {
    const wheels = spec.boxes.filter((b) => b.kind === "wheel");
    expect(wheels).toHaveLength(2);
    for (const w of wheels) {
      expect(w.wheel?.radiusFt).toBeCloseTo(6 / 8, 6);
    }
  });

  it("emits a bracket arm per wheel", () => {
    const brackets = spec.boxes.filter((b) => b.kind === "bracket");
    expect(brackets.length).toBeGreaterThanOrEqual(2);
  });

  it("emits no floats or piles for a wheel piece", () => {
    expect(spec.boxes.some((b) => b.kind === "float")).toBe(false);
    expect(spec.boxes.some((b) => b.kind === "pile")).toBe(false);
  });
});

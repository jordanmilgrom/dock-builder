/**
 * Phase 11 e2e (logic-level) — drop 4 cleats + 1 ladder and verify they show up
 * in all three views' data sources (Canvas world positions, 3D accessory meshes,
 * Schematic/pricing counts) and in the estimate.
 */
import { describe, expect, it } from "vitest";
import { accessoryCounts, accessoryWorldPos, billableQuantities, pricingEngine, type DockConfig } from "@/engine";
import { buildSceneSpec } from "@/lib/view3d";
import { floatingPricingProfile } from "@/engine/__fixtures__.js";

const config = (): DockConfig => ({
  schemaVersion: 1, tenantId: "acme-docks", dockType: "floating", use: "residential",
  site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
  overall: { lengthFt: 20, widthFt: 8, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum" },
  pieces: [{
    pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8, constructions: ["floating"],
    accessories: [
      { id: "c1", kind: "cleat", edge: "top", offsetFt: 2 },
      { id: "c2", kind: "cleat", edge: "top", offsetFt: 10 },
      { id: "c3", kind: "cleat", edge: "bottom", offsetFt: 2 },
      { id: "c4", kind: "cleat", edge: "bottom", offsetFt: 10 },
      { id: "l1", kind: "ladder", edge: "right", offsetFt: 4 },
    ],
  }],
});

describe("accessory placement flow", () => {
  it("counts in Schematic/pricing", () => {
    const c = config();
    expect(accessoryCounts(c)).toMatchObject({ cleat: 4, ladder: 1 });
    expect(billableQuantities(c).accessory_cleat).toBe(4);
    expect(billableQuantities(c).accessory_ladder).toBe(1);
  });

  it("Canvas world positions are computed per accessory", () => {
    const piece = config().pieces![0]!;
    const pos = accessoryWorldPos(piece, piece.accessories![0]!);
    expect(pos).toEqual({ xFt: 2, yFt: 0 }); // top edge, offset 2
  });

  it("3D scene has a mesh per accessory", () => {
    const spec = buildSceneSpec(config());
    expect(spec.boxes.filter((b) => b.kind === "accessory")).toHaveLength(5);
    expect(spec.boxes.some((b) => b.kind === "accessory" && b.accessoryKind === "ladder")).toBe(true);
  });

  it("the estimate includes the cleats + ladder line items", () => {
    const est = pricingEngine(config(), floatingPricingProfile, {});
    const keys = est.lineItems.map((li) => li.key);
    expect(keys).toContain("accessory_cleat");
    expect(est.lineItems.find((li) => li.key === "accessory_cleat")!.qty).toBe(4);
  });
});

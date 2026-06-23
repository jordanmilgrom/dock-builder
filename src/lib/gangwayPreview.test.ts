import { describe, expect, it } from "vitest";
import { gangwayPreviewRect } from "@/lib/gangwayPreview";
import type { DockConfig } from "@/engine";

const base: DockConfig = {
  schemaVersion: 1,
  tenantId: "acme-docks",
  dockType: "floating",
  use: "residential",
  site: { depthAtEndLowWaterFt: 6, seasonalFluctuationFt: 1.5, bottom: "sand", waveExposure: "inland_lake", seasonalIce: false, shoreHeightAboveWaterFt: 3 },
  overall: { lengthFt: 20, widthFt: 8, deckingMaterial: "pt_5/4x6", deckingOrientation: "straight", frameMaterial: "aluminum", maxGapFt: 8 },
  pieces: [{ pieceKind: "rectangle", posX: 10, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8, constructions: ["floating"] }],
};

const bbox = { minX: 10, minY: 0, maxX: 30, maxY: 8 };

describe("gangwayPreviewRect", () => {
  it("returns null when there is no gangway", () => {
    expect(gangwayPreviewRect(base, bbox)).toBeNull();
  });

  it("sits just LEFT of the leftmost piece's left edge (shore on the left)", () => {
    const cfg: DockConfig = { ...base, gangway: { present: true, mode: "length", lengthFt: 12, widthIn: 48 } };
    const g = gangwayPreviewRect(cfg, bbox)!;
    expect(g).not.toBeNull();
    expect(g.posX + g.lengthFt).toBeCloseTo(bbox.minX, 6); // right edge meets the dock's left edge
    expect(g.posX).toBeCloseTo(bbox.minX - g.lengthFt, 6);
    expect(g.widthFt).toBeCloseTo(4, 6); // 48 in
  });

  it("centers across the design width and labels length + slope", () => {
    const cfg: DockConfig = { ...base, gangway: { present: true, mode: "length", lengthFt: 12, widthIn: 48 } };
    const g = gangwayPreviewRect(cfg, bbox)!;
    expect(g.posY + g.widthFt / 2).toBeCloseTo((bbox.minY + bbox.maxY) / 2, 6);
    expect(g.label).toMatch(/^Gangway · 12 ft @ 1:/);
  });
});

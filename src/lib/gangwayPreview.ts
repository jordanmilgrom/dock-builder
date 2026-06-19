/**
 * Gangway canvas placeholder (Phase 10). Pure: computes a read-only rectangle to
 * draw on the Canvas so the customer SEES the gangway the engine is already
 * pricing (the confirmed alpha bug: it was invisible until Schematic/3D).
 *
 * Shore is the left edge (Phase 11 will make this a real draggable piece), so the
 * gangway sits just left of the leftmost piece's left edge, centered on the
 * design, sized to the engine's computed length × the gangway width.
 */

import { computeGangway, type DockConfig } from "@/engine";

export interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GangwayPreview {
  posX: number;
  posY: number;
  lengthFt: number;
  widthFt: number;
  label: string;
}

/** The gangway placeholder rect, or null when there is no gangway. */
export function gangwayPreviewRect(config: DockConfig, designBbox: Bbox): GangwayPreview | null {
  if (!config.gangway?.present) return null;
  const g = computeGangway(config.gangway, config.site.shoreHeightAboveWaterFt);
  if (g.lengthFt <= 0) return null;
  const widthFt = (config.gangway.widthIn ?? 48) / 12;
  const centerY = (designBbox.minY + designBbox.maxY) / 2;
  return {
    posX: designBbox.minX - g.lengthFt, // left of the leftmost piece (toward shore)
    posY: centerY - widthFt / 2,
    lengthFt: g.lengthFt,
    widthFt,
    label: `Gangway · ${g.lengthFt} ft @ ${g.slopeLabel}`,
  };
}

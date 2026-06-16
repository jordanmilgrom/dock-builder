/**
 * Multi-factor construction recommendation (Phase 9).
 *
 * Pure decision matrix over the shoreline survey → a recommended construction SET
 * + plain-language reasons. Replaces the single-axis Phase-1 `recommendDockType`
 * for the wizard's final step (that helper stays for the legacy dock-type label).
 *
 * Rules are encoded as ordered discrete cases (first match wins), each citing the
 * industry guidance it encodes:
 *   - Open water + heavy wave action wears out floats/connectors fast → pile, or
 *     floating-with-breakwater only when too deep to pile (Dock Builders Supply;
 *     ABYC TH-23 wave-load guidance).
 *   - Seasonal ice destroys piles and floats → roll-in/wheel is the upper-Midwest
 *     residential standard (NyDock; BARR Plastics roll-in guidance).
 *   - Hard/shallow bottom drives clean piles (Dock Builders Supply).
 *   - Sheltered + deep enough → floating is most stable (BARR Plastics).
 */

import type { BottomType, PieceConstruction, WaveExposure } from "./types.js";

export interface SiteFields {
  waveExposure: WaveExposure;
  bottom: BottomType;
  depthAtEndLowWaterFt: number;
  seasonalIce: boolean;
}

export interface ConstructionRecommendation {
  constructions: PieceConstruction[];
  reasons: string[];
}

export function recommendConstructions(site: SiteFields): ConstructionRecommendation {
  const { waveExposure, bottom, depthAtEndLowWaterFt: depth, seasonalIce } = site;

  if (waveExposure === "open_water" && depth > 12) {
    return {
      constructions: ["floating"],
      reasons: ["Deep open water — floating is the only practical option; consider a breakwater to reduce wave fatigue on the floats and connectors."],
    };
  }
  if (waveExposure === "open_water") {
    return {
      constructions: ["pile"],
      reasons: ["Open water and significant wave exposure favor pile construction. Floating docks wear out quickly in heavy wave action."],
    };
  }
  // (open water already returned above, so ice never overrides it)
  if (seasonalIce) {
    return {
      constructions: ["wheel"],
      reasons: ["Seasonal ice destroys piles and floats. Roll-in (wheel) docks are pulled out each fall and are the standard residential choice in the upper Midwest."],
    };
  }
  if ((bottom === "rock" || bottom === "gravel") && depth < 6) {
    return {
      constructions: ["pile"],
      reasons: ["Hard bottom and shallow water — piles drive cleanly and last decades."],
    };
  }
  if (waveExposure === "sheltered" && depth > 6) {
    return {
      constructions: ["floating"],
      reasons: ["Sheltered water with depth deep enough for floats — floating is the most stable choice."],
    };
  }
  return { constructions: ["floating"], reasons: ["Default recommendation based on your shoreline."] };
}

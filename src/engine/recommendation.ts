/**
 * Dock-type recommendation (spec §2.1).
 *
 * Advisory only: given the shoreline questionnaire answers, suggest a dock type
 * and surface the reasoning + any cautions. This never blocks — it seeds the
 * "auto-generated starting design" in the customer journey (§5.3).
 */

import { FIRM_BOTTOMS, RECOMMEND, SOFT_BOTTOMS } from "./constants.js";
import type { DockType, SiteConditions } from "./types.js";

export interface Recommendation {
  dockType: DockType;
  /** Plain-language reasons supporting the choice. */
  reasons: string[];
  /** Cautions to display (do not block). */
  cautions: string[];
  /** Suggest a removable/sectional build (seasonal ice). */
  recommendRemovable: boolean;
}

export function recommendDockType(site: SiteConditions): Recommendation {
  const reasons: string[] = [];
  const cautions: string[] = [];
  let dockType: DockType = "floating";

  const deep = site.depthAtEndLowWaterFt > RECOMMEND.floatingDepthFt;
  const swings =
    site.seasonalFluctuationFt > RECOMMEND.floatingFluctuationFt;
  const soft = SOFT_BOTTOMS.has(site.bottom);
  const firm = FIRM_BOTTOMS.has(site.bottom);

  if (site.bottom === "rock") {
    dockType = "floating";
    reasons.push(
      "Rocky bottom: piles can't be driven — a floating dock (or cantilever) avoids bottom penetration.",
    );
  } else if (deep || swings || soft) {
    dockType = "floating";
    if (deep)
      reasons.push(
        `Water deeper than ${RECOMMEND.floatingDepthFt} ft favors a floating dock.`,
      );
    if (swings)
      reasons.push(
        `Seasonal level swing over ${RECOMMEND.floatingFluctuationFt} ft favors a floating dock (consistent freeboard).`,
      );
    if (soft)
      reasons.push(
        "Soft bottom (sand/silt/mud) favors a floating dock over driven piles.",
      );
  } else if (firm) {
    dockType = "pile";
    reasons.push(
      "Firm bottom with a stable level makes a pile/pole dock viable and rigid.",
    );
  }

  if (site.depthAtEndLowWaterFt > RECOMMEND.pileMaxPracticalDepthFt) {
    cautions.push(
      `Depth over ${RECOMMEND.pileMaxPracticalDepthFt} ft makes piles costly — floating is usually cheaper.`,
    );
  }

  // Exposure caution — proxied by open-water selection (§2.1, §3.1).
  if (site.waveExposure === "open_water") {
    cautions.push(
      "Open-water exposure: expect chop/wakes — consider wave attenuation, heavy anchoring, and mooring whips.",
    );
  }

  // Floats grounding out (§2.1): depth < float draft + clearance.
  const minSafeDepth =
    RECOMMEND.floatGroundClearanceFt + 1.0; // ~1 ft typical float draft
  if (dockType === "floating" && site.depthAtEndLowWaterFt < minSafeDepth) {
    cautions.push(
      "Shallow water: floats may ground out at low water — confirm draft clearance or consider a pipe/pile dock.",
    );
  }

  const recommendRemovable = site.seasonalIce;
  if (recommendRemovable) {
    cautions.push(
      "Seasonal ice: choose a removable/sectional design you can pull each winter.",
    );
  }

  return { dockType, reasons, cautions, recommendRemovable };
}

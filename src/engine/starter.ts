/**
 * Starting-design generator (spec §5.3).
 *
 * Turns the shoreline questionnaire answers into a sensible, ready-to-edit
 * DockConfig so the customer never starts from a blank canvas. Pure: it only
 * reads the site + the §2.1 recommendation and emits a config. All engineering
 * follow-through (validation, float count, pricing) is left to the engines.
 */

import { DEFAULT_FLOAT } from "./constants.js";
import { recommendDockType } from "./recommendation.js";
import { CURRENT_SCHEMA_VERSION } from "./types.js";
import type {
  DockConfig,
  DockType,
  FrameMaterial,
  SiteConditions,
  UseClass,
} from "./types.js";

export interface StarterOptions {
  tenantId: string;
  use?: UseClass;
  /** Override the recommended dock type (e.g. the customer picked another). */
  dockType?: DockType;
}

/** SKU for the seeded default float (a sealed poly-shell unit, §3.6). */
export const STARTER_FLOAT_SKU = "STD-FLOAT-48x24";

/** A sensible starting design seeded from the shoreline questionnaire. */
export function generateStartingDesign(
  site: SiteConditions,
  opts: StarterOptions,
): DockConfig {
  const rec = recommendDockType(site);
  const dockType = opts.dockType ?? rec.dockType;
  const use: UseClass = opts.use ?? "residential";

  const isFloating = dockType === "floating";
  const frameMaterial: FrameMaterial = isFloating ? "aluminum" : "pt_pine";

  // Commercial docks default a little wider for two-way traffic / berthing.
  const widthFt = use === "commercial" ? 8 : 6;
  const lengthFt = 24;

  const config: DockConfig = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tenantId: opts.tenantId,
    dockType,
    use,
    site: { ...site },
    overall: {
      lengthFt,
      widthFt,
      deckingMaterial: "composite_trex",
      deckingOrientation: "straight",
      frameMaterial,
      joistSize: "2x8",
    },
    gangway:
      site.shoreHeightAboveWaterFt > 0
        ? {
            present: true,
            material: frameMaterial,
            // 1:12 is comfortable and clears the residential slope checks.
            targetSlope: "1:12",
            widthIn: 48,
            handrails: use === "commercial",
          }
        : { present: false },
    accessories: [
      { type: "cleat", qty: 4, lineDiameterIn: 0.5 },
      { type: "ladder", qty: 1 },
    ],
    builtInSteps: { present: false },
  };

  if (isFloating) {
    config.floatCatalog = {
      [STARTER_FLOAT_SKU]: {
        sku: STARTER_FLOAT_SKU,
        ratedBuoyancyLbs: DEFAULT_FLOAT.ratedBuoyancyLbs,
        lengthIn: DEFAULT_FLOAT.lengthIn,
        widthIn: DEFAULT_FLOAT.widthIn,
        heightIn: DEFAULT_FLOAT.heightIn,
        sealedShell: true,
      },
    };
  }

  return config;
}

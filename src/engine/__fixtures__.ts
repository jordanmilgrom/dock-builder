/**
 * Shared test fixtures: the canonical §7.5 DockConfig, a clean fixed dock, and
 * a representative PricingProfile. Helpers clone so tests can tweak freely.
 */

import type { DockConfig, PricingProfile } from "./types.js";

/** The canonical floating dock from spec §7.5 (overall 40×6, no manual sections). */
export const canonicalFloatingConfig: DockConfig = {
  schemaVersion: 1,
  tenantId: "acme-docks",
  dockType: "floating",
  use: "residential",
  site: {
    depthAtEndLowWaterFt: 6,
    seasonalFluctuationFt: 1.5,
    bottom: "sand",
    waveExposure: "inland_lake",
    seasonalIce: true,
    shoreHeightAboveWaterFt: 3,
  },
  overall: {
    lengthFt: 40,
    widthFt: 6,
    deckingMaterial: "composite_trex",
    deckingOrientation: "straight",
    frameMaterial: "aluminum",
  },
  gangway: {
    present: true,
    material: "aluminum",
    targetSlope: "1:12",
    widthIn: 48,
    handrails: true,
  },
  accessories: [
    { type: "cleat", qty: 6, lineDiameterIn: 0.5 },
    { type: "ladder", qty: 1 },
    { type: "edging", linearFt: 92 },
  ],
  builtInSteps: { present: false },
};

/** A small, fully-compliant fixed (pile) dock on a firm bottom. */
export const compliantFixedConfig: DockConfig = {
  schemaVersion: 1,
  tenantId: "acme-docks",
  dockType: "pile",
  use: "residential",
  site: {
    depthAtEndLowWaterFt: 5,
    seasonalFluctuationFt: 1,
    bottom: "clay",
    waveExposure: "sheltered",
    seasonalIce: false,
    shoreHeightAboveWaterFt: 2,
  },
  overall: {
    lengthFt: 16,
    widthFt: 5,
    deckingMaterial: "pt_2x6",
    deckingOrientation: "straight",
    frameMaterial: "pt_pine",
    joistSize: "2x8",
  },
  gangway: { present: false },
  accessories: [{ type: "cleat", qty: 4, lineDiameterIn: 0.5 }],
  builtInSteps: { present: false },
};

/** A representative builder pricing profile for a floating dock (§4). */
export const floatingPricingProfile: PricingProfile = {
  tenantId: "acme-docks",
  dockType: "floating",
  priceVisibility: "full",
  currency: "USD",
  items: [
    { key: "frame_per_ft2", unit: "per_ft2", unitPrice: 18 },
    { key: "decking_upcharge", unit: "per_ft2", unitPrice: 6 },
    { key: "flotation_per_float", unit: "per_float", unitPrice: 120 },
    { key: "connector_each", unit: "each", unitPrice: 85 },
    { key: "gangway_per_linear_ft", unit: "per_linear_ft", unitPrice: 140 },
    { key: "accessory_cleat", unit: "each", unitPrice: 35 },
    { key: "accessory_ladder", unit: "each", unitPrice: 220 },
    { key: "accessory_edging_per_linear_ft", unit: "per_linear_ft", unitPrice: 9 },
  ],
  labor: { perFt2: 22 },
  deliveryBands: [
    { maxMiles: 25, price: 250 },
    { maxMiles: 75, price: 600 },
  ],
  minimumPrice: 3500,
  markupPct: 10,
};

export function clone<T>(value: T): T {
  return structuredClone(value);
}

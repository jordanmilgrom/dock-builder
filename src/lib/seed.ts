/**
 * Seeded data for the single dev tenant (spec §5.2 step 3/4, Phase 1).
 *
 * Multi-tenancy, onboarding, and the catalog/pricing editors are Phase 2 — for
 * now the one tenant's branding and pricing profile live here as fixtures.
 */

import type { PricingProfile } from "@/engine";
import type { Branding } from "./types.js";

export const DEV_TENANT_ID = "dev-docks";

export const DISCLAIMER =
  "Estimates and drawings are for planning only. Confirm final design with your builder and check your local laws, regulations, and environmental rules before building.";

export const devBranding: Branding = {
  tenantId: DEV_TENANT_ID,
  name: "Lakeside Dock Co.",
  logoText: "LAKESIDE DOCK CO.",
  primaryColor: "#0e7490",
  secondaryColor: "#0f172a",
  removeBadge: false,
};

/**
 * Pricing profiles per dock type. Price visibility is "full" for the dev tenant
 * so the configurator shows the itemized breakdown (§4).
 */
const baseItems = (dockType: PricingProfile["dockType"]): PricingProfile => ({
  tenantId: DEV_TENANT_ID,
  dockType,
  priceVisibility: "full",
  currency: "USD",
  items: [
    { key: "frame_per_ft2", unit: "per_ft2", unitPrice: 19 },
    { key: "decking_upcharge", unit: "per_ft2", unitPrice: 7 },
    { key: "flotation_per_float", unit: "per_float", unitPrice: 125 },
    { key: "connector_each", unit: "each", unitPrice: 90 },
    { key: "piling_per_pile", unit: "per_pile", unitPrice: 240 },
    { key: "gangway_per_linear_ft", unit: "per_linear_ft", unitPrice: 145 },
    { key: "builtin_step_each", unit: "each", unitPrice: 380 },
    { key: "accessory_cleat", unit: "each", unitPrice: 38 },
    { key: "accessory_ladder", unit: "each", unitPrice: 230 },
    { key: "accessory_bench", unit: "each", unitPrice: 410 },
    { key: "accessory_dock_box", unit: "each", unitPrice: 520 },
    { key: "accessory_lighting", unit: "each", unitPrice: 145 },
    { key: "accessory_power_pedestal", unit: "each", unitPrice: 1250 },
    { key: "accessory_mooring_whip", unit: "each", unitPrice: 320 },
    { key: "accessory_canopy", unit: "each", unitPrice: 2100 },
    { key: "accessory_handrail", unit: "each", unitPrice: 95 },
    { key: "accessory_edging_per_linear_ft", unit: "per_linear_ft", unitPrice: 9 },
  ],
  labor: { perFt2: 24 },
  deliveryBands: [
    { maxMiles: 25, price: 275 },
    { maxMiles: 75, price: 650 },
    { maxMiles: 150, price: 1150 },
  ],
  minimumPrice: 3800,
  markupPct: 12,
});

const PROFILES: Record<string, PricingProfile> = {
  floating: baseItems("floating"),
  pile: baseItems("pile"),
  pipe: baseItems("pipe"),
  crib: baseItems("crib"),
  suspension: baseItems("suspension"),
};

/** The dev tenant's pricing profile for a given dock type. */
export function pricingProfileFor(dockType: string): PricingProfile {
  return PROFILES[dockType] ?? PROFILES.floating!;
}

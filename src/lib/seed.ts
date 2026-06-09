/**
 * The default catalog — the single source of truth for what a brand-new tenant
 * starts with (§8 Phase 2 item 4; §10 decision #8). Onboarding (and the
 * acme-docks migration seed) CLONE this into per-tenant Postgres rows; from then
 * on the tenant edits its own copy via the catalog/pricing editors.
 *
 * Pure data — no I/O — so it is shared by onboarding, the Prisma seed script,
 * and tests. Tenant-agnostic: branding identity is passed in.
 */

import { DEFAULT_FLOAT } from "@/engine/constants";
import { STARTER_FLOAT_SKU } from "@/engine";
import type {
  AccessoryType,
  DeckingMaterial,
  DockType,
  PriceVisibility,
  PricingItem,
} from "@/engine";

export const DISCLAIMER =
  "Estimates and drawings are for planning only. Confirm final design with your builder and check your local laws, regulations, and environmental rules before building.";

/** The migrated Phase 1 dev tenant (§8 migration). */
export const ACME_TENANT_ID = "acme-docks";
export const ACME_SLUG = "acme-docks";

export const DOCK_TYPES: DockType[] = ["floating", "pile", "pipe", "crib", "suspension"];

export interface BrandIdentity {
  name: string;
  logoText: string;
  primaryColor: string;
  secondaryColor: string;
}

/** The Phase 1 dev fixture identity, preserved verbatim for the migration. */
export const ACME_BRAND: BrandIdentity = {
  name: "Lakeside Dock Co.",
  logoText: "LAKESIDE DOCK CO.",
  primaryColor: "#0e7490",
  secondaryColor: "#0f172a",
};

export interface PricingProfileSeed {
  dockType: DockType;
  priceVisibility: PriceVisibility;
  currency: string;
  items: PricingItem[];
  labor: { perFt2?: number; flat?: number };
  deliveryBands: { maxMiles: number; price: number }[];
  minimumPrice: number;
  markupPct: number;
}

export interface FloatProductSeed {
  sku: string;
  ratedBuoyancyLbs: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  sealedShell: boolean;
}

export interface DeckingProductSeed {
  material: DeckingMaterial;
  label: string;
  upchargePerFt2: number;
}

export interface AccessoryProductSeed {
  type: AccessoryType;
  label: string;
  unitPrice: number;
}

export interface CatalogDefaults {
  branding: BrandIdentity & { removeBadge: boolean };
  pricingProfiles: PricingProfileSeed[];
  floatProducts: FloatProductSeed[];
  deckingProducts: DeckingProductSeed[];
  accessoryProducts: AccessoryProductSeed[];
}

// The canonical price list (Phase 1 values, preserved so engine output is
// byte-identical after migration).
function defaultItems(): PricingItem[] {
  return [
    { key: "frame_per_ft2", unit: "per_ft2", unitPrice: 19 },
    { key: "decking_upcharge", unit: "per_ft2", unitPrice: 7 },
    { key: "flotation_per_float", unit: "per_float", unitPrice: 125 },
    { key: "connector_each", unit: "each", unitPrice: 90 },
    { key: "piling_per_pile", unit: "per_pile", unitPrice: 240 },
    // Phase 8: roll-in (wheel) hardware — off-the-shelf shallow-water kit pricing
    // (wheel + bracket arm per support; ~2 per piece).
    { key: "wheel_per_wheel", unit: "per_wheel", unitPrice: 310 },
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
  ];
}

function profileFor(dockType: DockType, priceVisibility: PriceVisibility): PricingProfileSeed {
  return {
    dockType,
    priceVisibility,
    currency: "USD",
    items: defaultItems(),
    labor: { perFt2: 24 },
    deliveryBands: [
      { maxMiles: 25, price: 275 },
      { maxMiles: 75, price: 650 },
      { maxMiles: 150, price: 1150 },
    ],
    minimumPrice: 3800,
    markupPct: 12,
  };
}

const DECKING: DeckingProductSeed[] = [
  { material: "pt_5/4x6", label: 'PT 5/4"×6"', upchargePerFt2: 0 },
  { material: "pt_2x6", label: 'PT 2"×6"', upchargePerFt2: 1 },
  { material: "cedar_hardwood", label: "Cedar / hardwood", upchargePerFt2: 5 },
  { material: "composite_5/4x6", label: 'Composite 5/4"×6"', upchargePerFt2: 7 },
  { material: "composite_2x6", label: 'Composite 2"×6"', upchargePerFt2: 8 },
  { material: "composite_trex", label: "Trex composite", upchargePerFt2: 9 },
  { material: "pvc", label: "PVC", upchargePerFt2: 8 },
  { material: "aluminum", label: "Aluminum", upchargePerFt2: 11 },
  { material: "grating", label: "Open grating", upchargePerFt2: 6 },
];

const ACCESSORIES: AccessoryProductSeed[] = [
  { type: "cleat", label: "Dock cleat", unitPrice: 38 },
  { type: "edging", label: "Edging / bumper (per ft)", unitPrice: 9 },
  { type: "ladder", label: "Ladder", unitPrice: 230 },
  { type: "bench", label: "Bench", unitPrice: 410 },
  { type: "dock_box", label: "Dock box", unitPrice: 520 },
  { type: "lighting", label: "Lighting", unitPrice: 145 },
  { type: "power_pedestal", label: "Power pedestal", unitPrice: 1250 },
  { type: "mooring_whip", label: "Mooring whip", unitPrice: 320 },
  { type: "canopy", label: "Canopy", unitPrice: 2100 },
  { type: "handrail", label: "Handrail", unitPrice: 95 },
];

/**
 * Build the default catalog for a tenant with the given brand identity.
 * `priceVisibility` defaults to "full" (Phase 1 behavior); the onboarding
 * pricing editor can change it per profile later (§4).
 */
export function defaultCatalog(
  brand: BrandIdentity,
  opts: { removeBadge?: boolean; priceVisibility?: PriceVisibility } = {},
): CatalogDefaults {
  const priceVisibility = opts.priceVisibility ?? "full";
  return {
    branding: { ...brand, removeBadge: opts.removeBadge ?? false },
    pricingProfiles: DOCK_TYPES.map((d) => profileFor(d, priceVisibility)),
    floatProducts: [
      {
        sku: STARTER_FLOAT_SKU,
        ratedBuoyancyLbs: DEFAULT_FLOAT.ratedBuoyancyLbs,
        lengthIn: DEFAULT_FLOAT.lengthIn,
        widthIn: DEFAULT_FLOAT.widthIn,
        heightIn: DEFAULT_FLOAT.heightIn,
        sealedShell: true,
      },
      {
        sku: "HD-FLOAT-48x36",
        ratedBuoyancyLbs: 1400,
        lengthIn: 48,
        widthIn: 36,
        heightIn: 16,
        sealedShell: true,
      },
    ],
    deckingProducts: DECKING,
    accessoryProducts: ACCESSORIES,
  };
}

/** The acme-docks default catalog (Phase 1 dev fixtures), used by the migration seed. */
export function acmeCatalog(): CatalogDefaults {
  return defaultCatalog(ACME_BRAND, { removeBadge: false, priceVisibility: "full" });
}

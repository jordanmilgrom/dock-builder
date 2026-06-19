/**
 * Core domain types for the Dock Configurator engines.
 *
 * The DockConfig JSON is the single source of truth (spec §7.1) consumed by
 * three pure functions: the validation engine, the pricing engine, and the
 * geometry/blueprint generator. These types are deliberately framework-free so
 * they can run identically client-side (live feedback) and server-side
 * (authoritative).
 */

export const CURRENT_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Enumerations (spec §2, §3.6, §7.5)
// ---------------------------------------------------------------------------

export type DockType =
  | "floating"
  | "pile" // a.k.a. pole / piling, fixed
  | "pipe"
  | "crib"
  | "suspension"; // cantilever

export type UseClass = "residential" | "commercial";

export type BottomType = "sand" | "silt" | "mud" | "clay" | "rock" | "gravel";

/** Wave/wake exposure — also maps to a flotation design factor (spec §3.1). */
export type WaveExposure = "sheltered" | "inland_lake" | "open_water";

export type FrameMaterial =
  | "pt_pine"
  | "aluminum"
  | "galvanized_steel"
  | "composite";

export type DeckingMaterial =
  | "pt_5/4x6"
  | "pt_2x6"
  | "cedar_hardwood"
  | "composite_5/4x6"
  | "composite_2x6"
  | "composite_trex"
  | "pvc"
  | "aluminum"
  | "grating";

export type DeckingOrientation = "straight" | "diagonal";

/** Nominal joist lumber size, used for span-table lookups (spec §3.2). */
export type JoistSize = "2x6" | "2x8" | "2x10" | "2x12";

export type AccessoryType =
  | "cleat"
  | "edging"
  | "ladder"
  | "bench"
  | "dock_box"
  | "lighting"
  | "power_pedestal"
  | "mooring_whip"
  | "swim_platform"
  | "kayak_launch"
  | "canopy"
  | "handrail";

// ---------------------------------------------------------------------------
// DockConfig (spec §7.5)
// ---------------------------------------------------------------------------

export interface SiteConditions {
  depthAtEndLowWaterFt: number;
  seasonalFluctuationFt: number;
  bottom: BottomType;
  waveExposure: WaveExposure;
  seasonalIce: boolean;
  /** Vertical rise from low-water level to the shore connection point. */
  shoreHeightAboveWaterFt: number;
}

/** A single flotation unit positioned under a section. */
export interface FloatPlacement {
  /** Position along the section length, in feet from the section's shore end. */
  xFt: number;
  /** Position across the section width, in feet from one edge. */
  yFt: number;
  /** Float catalog SKU; resolved against the tenant's FloatProduct catalog. */
  sku?: string;
}

export interface DockSection {
  lengthFt: number;
  widthFt: number;
  /** Only meaningful for floating docks. */
  floats?: FloatPlacement[];
}

// ---------------------------------------------------------------------------
// Phase 6: multi-piece geometry (§ real-world docks are composed of pieces)
// ---------------------------------------------------------------------------

export type PieceKind = "rectangle" | "right_triangle";
/** Only square rotations are supported (§ Phase 6 out-of-scope: arbitrary angles). */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * Phase 8: per-piece construction. Real hybrid docks combine floating, pile, and
 * roll-in (wheel) sections in one installation, so each piece carries its own
 * construction — the per-piece value is the source of truth for layout, pricing,
 * and validation. `DockConfig.dockType` is retained as the default for new pieces.
 * The enum is forward-compatible: `pipe` (shallow-water lightweight legs) is
 * deferred to a future phase and will slot in without a migration.
 */
export type PieceConstruction = "floating" | "pile" | "wheel";

/**
 * One drawn piece of a dock. Origin (posX, posY) in feet, rotated in 90° steps.
 * A rectangle uses lengthFt × widthFt; a right triangle uses legAFt (along the
 * rotation-aligned x axis) and legBFt (along y) with the hypotenuse implied.
 */
export interface DockPiece {
  pieceKind: PieceKind;
  posX: number;
  posY: number;
  rotationDeg: Rotation;
  /** Rectangle dimensions. */
  lengthFt?: number;
  widthFt?: number;
  /** Right-triangle legs. */
  legAFt?: number;
  legBFt?: number;
  /**
   * Phase 8: this piece's construction (single). Optional + deprecated in Phase 9
   * in favor of `constructions`; still read as a back-compat fallback.
   * @deprecated use {@link DockPiece.constructions}
   */
  construction?: PieceConstruction;
  /**
   * Phase 9: a piece can carry MORE THAN ONE construction at once — e.g. a deck
   * that is both floating and pile-anchored (a real technique). Treated as a set
   * (order irrelevant). Defaults to `['floating']` (or the legacy scalar
   * `construction`, or the design dockType) on read.
   */
  constructions?: PieceConstruction[];
  /** Phase 10: stacking order for Bring-to-front / Send-to-back. Default 0. Purely visual. */
  z?: number;
  /** Optional manually-placed floats (world-independent, piece-local feet). */
  floats?: FloatPlacement[];
}

export interface FloatSpec {
  sku: string;
  /** Manufacturer working buoyancy rating, pounds. */
  ratedBuoyancyLbs: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  /** True only for sealed poly-shell floats; bare EPS is forbidden (§3.6). */
  sealedShell: boolean;
}

export type GangwaySlope = "1:8" | "1:12" | "1:20" | string;

export interface GangwayConfig {
  present: boolean;
  material?: FrameMaterial;
  /**
   * Phase 9: how the gangway is specified.
   *  - "length": customer picks `lengthFt`; engine derives slope + warns if steep.
   *  - "slope" : customer picks `targetSlope`; engine derives length (legacy).
   * Defaults to "length" (lengthFt 12) when absent; a legacy `targetSlope`-only
   * config reads as "slope".
   */
  mode?: "length" | "slope";
  /** Phase 9: gangway run length (ft), 3–24, used in "length" mode. */
  lengthFt?: number;
  /** Target slope as ratio string, e.g. "1:12" (used in "slope" mode). */
  targetSlope?: GangwaySlope;
  widthIn?: number;
  handrails?: boolean;
}

export interface AccessoryConfig {
  type: AccessoryType;
  qty?: number;
  /** For linear accessories such as edging/bumpers. */
  linearFt?: number;
  /** For cleats: the mooring line diameter in inches (drives cleat length). */
  lineDiameterIn?: number;
}

export interface BuiltInSteps {
  present: boolean;
  riseIn?: number;
  runIn?: number;
}

export interface OverallConfig {
  lengthFt: number;
  widthFt: number;
  deckingMaterial: DeckingMaterial;
  deckingOrientation: DeckingOrientation;
  frameMaterial: FrameMaterial;
  joistSize?: JoistSize;
  /** Joist spacing on-center, inches. Defaults derived per material/orientation. */
  joistSpacingIn?: number;
  /**
   * Phase 8: maximum support gap (ft) for even-distribute layout of both floats
   * and piles. Default 8, range 4–10. Renamed from the Phase 6 `bayFt`, which is
   * still read as a fallback for un-migrated configs.
   */
  maxGapFt?: number;
  /** @deprecated Phase 6 name for {@link maxGapFt}; read only as a back-compat fallback. */
  bayFt?: number;
}

export interface DockConfig {
  schemaVersion: number;
  tenantId: string;
  dockType: DockType;
  use: UseClass;
  site: SiteConditions;
  overall: OverallConfig;
  /** Phase 6: the drawn pieces. When present, supersedes `sections`/`overall` geometry. */
  pieces?: DockPiece[];
  /** Pre-Phase-6 chained-rectangle sections (read via back-compat shim). */
  sections?: DockSection[];
  gangway?: GangwayConfig;
  accessories?: AccessoryConfig[];
  builtInSteps?: BuiltInSteps;
  /**
   * Optional resolved float specs keyed by SKU. When present, the engine uses
   * real buoyancy ratings; otherwise it falls back to configurable defaults.
   */
  floatCatalog?: Record<string, FloatSpec>;
}

// ---------------------------------------------------------------------------
// Validation output (spec §7.6)
// ---------------------------------------------------------------------------

export interface DerivedMetrics {
  deckAreaFt2: number;
  /** Resolved section geometry after any auto-sectioning. */
  sectionCount: number;
  requiredBuoyancyLbs: number;
  /** Suggested float count (floating docks only); 0 otherwise. */
  floatCount: number;
  /** Estimated freeboard in inches (floating docks); null if not applicable. */
  estFreeboardIn: number | null;
  /** Estimated submergence fraction at design load (0–1); null if N/A. */
  estSubmergenceFraction: number | null;
  /** Suggested piling count (fixed docks only); 0 otherwise. */
  pilingCount: number;
  /** Gangway run length in feet; 0 when no gangway. */
  gangwayLengthFt: number;
  /** Maximum unsupported joist span for the chosen joist/material/spacing. */
  maxJoistSpanFt: number;
  estWeightLbs: number;
}

export type Severity = "error" | "warning";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: Severity;
  /** Optional pointer into the config, e.g. "sections[0].widthFt". */
  path?: string;
}

export interface ValidationResult {
  /** Block estimate/lead when non-empty (§3). */
  errors: ValidationIssue[];
  /** Advisory; the customer must acknowledge (§3). */
  warnings: ValidationIssue[];
  /** Human-readable descriptions of fixes the engine would apply (§3.3). */
  autoFixes: string[];
  derived: DerivedMetrics;
  /** Convenience flag: true when there are no errors. */
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Pricing (spec §4, §7.4)
// ---------------------------------------------------------------------------

export type PriceVisibility =
  | "full" // full itemized breakdown
  | "total" // total only
  | "starting_from" // "starting from" anchor
  | "hidden_until_contact"; // gated behind contact capture (doubles as §5.3 gate)

export type PricingUnit =
  | "per_ft2"
  | "per_float"
  | "per_pile"
  | "per_wheel"
  | "per_linear_ft"
  | "each"
  | "flat";

export interface PricingItem {
  key: string;
  unit: PricingUnit;
  unitPrice: number;
  /** Optional label override for the breakdown line. */
  label?: string;
}

export interface DeliveryBand {
  /** Inclusive upper bound of the distance band, in miles. */
  maxMiles: number;
  price: number;
}

export interface PricingProfile {
  tenantId: string;
  dockType: DockType;
  priceVisibility: PriceVisibility;
  currency: string;
  items: PricingItem[];
  labor?: {
    perFt2?: number;
    flat?: number;
  };
  deliveryBands?: DeliveryBand[];
  minimumPrice?: number;
  /** Markup applied to the running subtotal, as a percentage (e.g. 12 = +12%). */
  markupPct?: number;
}

export interface PricingLineItem {
  key: string;
  label: string;
  qty: number;
  unit: PricingUnit;
  unitPrice: number;
  subtotal: number;
}

export interface PricingResult {
  currency: string;
  lineItems: PricingLineItem[];
  itemsSubtotal: number;
  labor: number;
  delivery: number;
  markup: number;
  /** Pre-minimum running total (items + labor + delivery + markup). */
  preMinimumTotal: number;
  minimumApplied: boolean;
  total: number;
  /** Echo of the profile's display setting so callers can gate the view (§4). */
  priceVisibility: PriceVisibility;
  /** Warnings about missing prices, etc. — never blocks. */
  notes: string[];
}

export interface PricingOptions {
  /** Distance to the customer for delivery banding, in miles. */
  deliveryDistanceMiles?: number;
}

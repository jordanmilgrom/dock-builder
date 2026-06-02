/**
 * Configurable engineering constants (spec §3).
 *
 * Every numeric threshold in the engines lives here so a builder/admin can tune
 * defaults without touching engine logic. All values are "configurable defaults
 * to be verified locally" (§11) — the engines treat them as inputs, not law.
 */

import type {
  BottomType,
  DeckingMaterial,
  FrameMaterial,
  JoistSize,
  WaveExposure,
} from "./types.js";

// ---------------------------------------------------------------------------
// §3.1 Flotation
// ---------------------------------------------------------------------------

/** Water density used for displacement/freeboard math (fresh water, lb/ft³). */
export const WATER_DENSITY_LB_PER_FT3 = 62.4;

/**
 * Quick-method buoyancy multipliers (lbs of required buoyancy per ft² of deck),
 * keyed by `${frame}|${decking}`. Mirrors the §3.1 table for the canonical
 * 2x8 PT frame; other frames fall back to a decking-driven default.
 */
export const FLOTATION_MULTIPLIER: Record<string, number> = {
  "pt_pine|pt_5/4x6": 28,
  "pt_pine|pt_2x6": 31,
  "pt_pine|composite_5/4x6": 31,
  "pt_pine|composite_2x6": 35,
};

/** Decking-driven fallback multiplier when the frame/decking pair is unlisted. */
export const FLOTATION_MULTIPLIER_BY_DECKING: Partial<
  Record<DeckingMaterial, number>
> = {
  "pt_5/4x6": 28,
  "pt_2x6": 31,
  cedar_hardwood: 31,
  "composite_5/4x6": 31,
  "composite_2x6": 35,
  composite_trex: 31,
  pvc: 31,
  aluminum: 28,
  grating: 28,
};

export const FLOTATION_MULTIPLIER_DEFAULT = 31;

/** Dead load range, lb/ft² (§3.1). Design value used for first-principles load. */
export const DEAD_LOAD_LB_PER_FT2 = { min: 10, max: 15, design: 13 } as const;

/** Live load design allowance, lb/ft² (residential pedestrian). */
export const LIVE_LOAD_DESIGN_LB_PER_FT2 = 40;

/** Submergence targets (fraction of float displacement) — §3.1. */
export const SUBMERGENCE = {
  /** Design target: ~40% submerged, leaving 60% live-load reserve. */
  designTarget: 0.4,
  /** Never exceed 50% in normal use. */
  hardMax: 0.5,
} as const;

/** Exposure design factors (§3.1) — usable fraction of rated buoyancy. */
export const EXPOSURE_DESIGN_FACTOR: Record<WaveExposure, number> = {
  sheltered: 0.24,
  inland_lake: 0.32,
  open_water: 0.4,
};

/** Float placement rules (§3.1). */
export const FLOAT_PLACEMENT = {
  maxSpacingFt: 8,
  twoRowsAboveWidthFt: 6,
} as const;

/** Default per-float rated buoyancy (lbs) when no SKU spec is resolved. */
export const DEFAULT_FLOAT = {
  ratedBuoyancyLbs: 930,
  lengthIn: 48,
  widthIn: 24,
  heightIn: 16,
} as const;

// ---------------------------------------------------------------------------
// §3.2 Decking & joist spacing
// ---------------------------------------------------------------------------

export const JOIST_SPACING_MAX_IN = {
  straight: 16,
  diagonal: 12,
  stairStringer: 12,
} as const;

/**
 * Representative unsupported joist spans in feet (SPF/PT pine), keyed by
 * `${joistSize}|${spacingIn}` (§3.2). "Verify locally." Aluminum/steel span
 * farther via SPAN_MATERIAL_FACTOR below.
 */
export const JOIST_SPAN_FT: Record<string, number> = {
  "2x6|16": 8,
  "2x6|12": 9,
  "2x8|16": 10,
  "2x8|12": 12,
  "2x10|16": 13,
  "2x10|12": 15,
  "2x12|16": 15,
  "2x12|12": 18,
};

export const DEFAULT_JOIST_SIZE: JoistSize = "2x8";

/** Multiplier applied to the pine span table by frame material (§3.2). */
export const SPAN_MATERIAL_FACTOR: Record<FrameMaterial, number> = {
  pt_pine: 1.0,
  composite: 1.0, // composite decks still ride pine/aluminum joists; conservative
  aluminum: 1.4,
  galvanized_steel: 1.6,
};

// ---------------------------------------------------------------------------
// §3.3 Sectioning
// ---------------------------------------------------------------------------

/** Maximum section dimensions before forced subdivision (§3.3). */
export const MAX_SECTION = {
  floating: {
    widthFt: 8,
    lengthWoodFt: 20,
    lengthAluminumFt: 32,
  },
} as const;

/** Minimum widths (§3.3). */
export const MIN_WIDTH_FT = {
  twoWayTraffic: 4,
  boatBerthing: 8,
} as const;

// ---------------------------------------------------------------------------
// §3.4 Shore connection & gangway geometry
// ---------------------------------------------------------------------------

export const GANGWAY = {
  /** Residential comfort ceiling, ~2.75:12 ≈ 22.9% (§3.4). */
  residentialMaxSlopePct: 22.9,
  /** Recommended residential maximum ≤ 1:8 (12.5%). */
  recommendedMaxSlopePct: 12.5,
  /** ADA preset run/rise ratios used for commercial/public presets (§3.4). */
  adaSlopeRatio: 12, // 1:12
  ada: {
    maxSlopePct: 8.33, // 1:12
    minWidthIn: 36,
    /** Slope exceptions allowed for long gangways (runs ≥ 80 ft). */
    longRunExceptionFt: 80,
  },
} as const;

// ---------------------------------------------------------------------------
// §3.5 Accessory sizing
// ---------------------------------------------------------------------------

export const CLEAT = {
  /** Cleat length ≈ 16 × line diameter (inches). */
  lengthPerLineDiameter: 16,
  minPerSlip: 2,
  /** Place along edges every 10–15 ft; use the midpoint for suggestions. */
  spacingFt: 12,
} as const;

export const STEP = {
  stringerSpacingIn: 12,
  /** Comfortable rise/run envelope for a 2R + T check (inches). */
  riseInRange: { min: 6, max: 8 },
  runInRange: { min: 10, max: 12 },
} as const;

// ---------------------------------------------------------------------------
// §2.1 Dock-type recommendation thresholds
// ---------------------------------------------------------------------------

export const RECOMMEND = {
  floatingDepthFt: 4,
  floatingFluctuationFt: 2,
  /** Warn about chop above this significant wave height (ft). */
  warnWaveHeightFt: 3,
  /** Warn floats may ground when depth < float draft + this clearance (ft). */
  floatGroundClearanceFt: 0.5, // ~6 in
  pileMaxPracticalDepthFt: 8,
} as const;

/** Soft bottoms favor floating; firm bottoms permit piles (§2.1). */
export const SOFT_BOTTOMS: ReadonlySet<BottomType> = new Set([
  "silt",
  "mud",
  "sand",
]);
export const FIRM_BOTTOMS: ReadonlySet<BottomType> = new Set([
  "clay",
  "gravel",
]);

// ---------------------------------------------------------------------------
// Weight estimation (for PDF title block / point-load checks, §6)
// ---------------------------------------------------------------------------

/** Rough self-weight of a built deck, lb/ft², by frame material. */
export const STRUCTURE_WEIGHT_LB_PER_FT2: Record<FrameMaterial, number> = {
  pt_pine: 12,
  composite: 14,
  aluminum: 8,
  galvanized_steel: 16,
};

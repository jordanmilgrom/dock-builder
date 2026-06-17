/**
 * Geometry & derived-metrics calculator (spec §3, §6, §7.1).
 *
 * Pure functions over a DockConfig that compute the quantities the validation
 * engine, pricing engine, and blueprint generator all share: deck area, section
 * layout, required buoyancy + float count, freeboard, piling count, gangway
 * length, and joist span. No I/O, no mutation of inputs.
 */

import {
  CLEAT,
  DEFAULT_FLOAT,
  DEFAULT_JOIST_SIZE,
  FLOTATION_MULTIPLIER,
  FLOTATION_MULTIPLIER_BY_DECKING,
  FLOTATION_MULTIPLIER_DEFAULT,
  JOIST_SPACING_MAX_IN,
  JOIST_SPAN_FT,
  MAX_SECTION,
  SPAN_MATERIAL_FACTOR,
  STRUCTURE_WEIGHT_LB_PER_FT2,
  SUBMERGENCE,
} from "./constants.js";
import {
  allFloatPositions,
  allPilePositions,
  allWheelPositions,
  pieceAreaFt2,
  resolvePieces,
  type PlacementFt,
} from "./pieces.js";
import type {
  DockConfig,
  DockSection,
  FloatSpec,
  JoistSize,
} from "./types.js";

export type { PlacementFt };

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Effective deck area in ft² — sum over all pieces (triangles = legA·legB/2). */
export function deckAreaFt2(config: DockConfig): number {
  return round(resolvePieces(config).reduce((sum, p) => sum + pieceAreaFt2(p), 0));
}

/** Default joist spacing for the config (orientation-driven), §3.2. */
export function joistSpacingIn(config: DockConfig): number {
  if (config.overall.joistSpacingIn != null) return config.overall.joistSpacingIn;
  return config.overall.deckingOrientation === "diagonal"
    ? JOIST_SPACING_MAX_IN.diagonal
    : JOIST_SPACING_MAX_IN.straight;
}

/** Maximum unsupported joist span (ft) for the chosen size/spacing/material. */
export function maxJoistSpanFt(config: DockConfig): number {
  const size: JoistSize = config.overall.joistSize ?? DEFAULT_JOIST_SIZE;
  const spacing = joistSpacingIn(config);
  // Snap to the nearest tabulated spacing at or below the requested spacing.
  const tabulatedSpacing = spacing >= 16 ? 16 : 12;
  const base = JOIST_SPAN_FT[`${size}|${tabulatedSpacing}`];
  const baseSpan = base ?? JOIST_SPAN_FT[`${DEFAULT_JOIST_SIZE}|16`]!;
  const factor = SPAN_MATERIAL_FACTOR[config.overall.frameMaterial];
  return round(baseSpan * factor);
}

/** The §3.1 quick-method buoyancy multiplier for this frame/decking pair. */
export function flotationMultiplier(config: DockConfig): number {
  const { frameMaterial, deckingMaterial } = config.overall;
  const exact = FLOTATION_MULTIPLIER[`${frameMaterial}|${deckingMaterial}`];
  if (exact != null) return exact;
  return (
    FLOTATION_MULTIPLIER_BY_DECKING[deckingMaterial] ??
    FLOTATION_MULTIPLIER_DEFAULT
  );
}

/** Deck area (ft²) of the FLOATING pieces only (Phase 8 per-piece construction). */
export function floatingAreaFt2(config: DockConfig): number {
  return round(
    resolvePieces(config)
      .filter((p) => p.constructions.includes("floating"))
      .reduce((sum, p) => sum + pieceAreaFt2(p), 0),
  );
}

/**
 * Required buoyancy (lbs) via the §3.1 quick method: area × multiplier — summed
 * over the FLOATING pieces only, so a hybrid dock's piles/wheels don't inflate
 * the buoyancy requirement.
 */
export function requiredBuoyancyLbs(config: DockConfig): number {
  const area = floatingAreaFt2(config);
  if (area <= 0) return 0;
  return round(area * flotationMultiplier(config));
}

/** Resolve the float spec for a config, falling back to defaults (§3.1). */
function resolveFloatSpec(config: DockConfig): Pick<
  FloatSpec,
  "ratedBuoyancyLbs" | "lengthIn" | "widthIn" | "heightIn"
> {
  const catalog = config.floatCatalog;
  // Prefer a SKU referenced on the first placed float, then any catalog entry.
  const firstPlaced = config.pieces?.[0]?.floats?.[0]?.sku ?? config.sections?.[0]?.floats?.[0]?.sku;
  if (firstPlaced && catalog?.[firstPlaced]) {
    return catalog[firstPlaced]!;
  }
  if (catalog) {
    const first = Object.values(catalog)[0];
    if (first) return first;
  }
  return DEFAULT_FLOAT;
}

/** Number of floats manually placed in the config (0 if none). */
function placedFloatCount(config: DockConfig): number {
  const fromPieces = (config.pieces ?? []).reduce((sum, p) => sum + (p.floats?.length ?? 0), 0);
  const fromSections = (config.sections ?? []).reduce((sum, s) => sum + (s.floats?.length ?? 0), 0);
  return fromPieces + fromSections;
}

/**
 * Suggested float count (Phase 6): placement-driven — the number of float
 * positions the industry layout requires (two rows minimum, corner floats,
 * ≤ 8 ft spacing) summed across pieces. Replaces the old buoyancy-only count;
 * buoyancy adequacy is still checked via freeboard/submergence.
 */
export function floatCount(config: DockConfig): number {
  return allFloatPositions(config).length;
}

/**
 * Estimated submergence fraction and freeboard at the design load (§3.1).
 *
 * The quick-method multiplier is calibrated so that, when installed buoyancy
 * equals the required buoyancy, the dock sits at the design submergence target
 * (~40%). Concretely: designLoad = designTarget × requiredBuoyancy, and
 * submergence = designLoad / installedBuoyancy. Adding floats beyond the
 * requirement lowers submergence and raises freeboard. Returns nulls for
 * non-floating docks.
 */
export function freeboard(config: DockConfig): {
  submergenceFraction: number | null;
  freeboardIn: number | null;
} {
  if (config.dockType !== "floating") {
    return { submergenceFraction: null, freeboardIn: null };
  }
  const required = requiredBuoyancyLbs(config);
  const float = resolveFloatSpec(config);

  // Installed buoyancy: honor manually placed floats, else the suggested count.
  const placed = placedFloatCount(config);
  const installedCount = placed > 0 ? placed : floatCount(config);
  const installedBuoyancy = installedCount * float.ratedBuoyancyLbs;
  if (installedBuoyancy <= 0 || required <= 0) {
    return { submergenceFraction: null, freeboardIn: null };
  }

  const designLoad = SUBMERGENCE.designTarget * required;
  const submergence = Math.min(1, designLoad / installedBuoyancy);
  const freeboardIn = round(float.heightIn * (1 - submergence), 1);
  return { submergenceFraction: round(submergence, 3), freeboardIn };
}

/**
 * Subdivide the dock into sections that respect the §3.3 max-section length.
 * If the config already declares sections, those are returned untouched.
 * Returns the resolved sections plus whether auto-sectioning occurred.
 */
export function resolveSections(config: DockConfig): {
  sections: DockSection[];
  autoSectioned: boolean;
} {
  if (config.sections && config.sections.length > 0) {
    return { sections: config.sections, autoSectioned: false };
  }
  const { lengthFt, widthFt, frameMaterial } = config.overall;
  if (config.dockType !== "floating") {
    return { sections: [{ lengthFt, widthFt }], autoSectioned: false };
  }
  const maxLen =
    frameMaterial === "aluminum"
      ? MAX_SECTION.floating.lengthAluminumFt
      : MAX_SECTION.floating.lengthWoodFt;
  if (lengthFt <= maxLen) {
    return { sections: [{ lengthFt, widthFt }], autoSectioned: false };
  }
  const n = Math.ceil(lengthFt / maxLen);
  const per = round(lengthFt / n);
  const sections: DockSection[] = Array.from({ length: n }, () => ({
    lengthFt: per,
    widthFt,
  }));
  return { sections, autoSectioned: true };
}

/** Number of connectors needed to join N sections in a line (§3.3). */
export function connectorCount(sectionCount: number): number {
  return Math.max(0, sectionCount - 1);
}

/**
 * Gangway run length (ft). Phase 9: in "length" mode the customer's chosen
 * lengthFt is authoritative; in "slope" mode it derives from rise/targetSlope.
 */
export function gangwayLengthFt(config: DockConfig): number {
  const g = config.gangway;
  if (!g?.present) return 0;
  const mode = g.mode ?? (g.targetSlope ? "slope" : "length");
  if (mode === "length") return round(g.lengthFt ?? 12);
  const rise = config.site.shoreHeightAboveWaterFt;
  const ratio = parseSlopeRatio(g.targetSlope);
  if (ratio == null || ratio <= 0) return 0;
  return round(rise * ratio);
}

/** Parse a slope like "1:12" → 12 (run per unit rise). Returns null if absent. */
export function parseSlopeRatio(slope: string | undefined): number | null {
  if (!slope) return null;
  const m = /^\s*1\s*:\s*([\d.]+)\s*$/.exec(slope);
  if (m) {
    const run = Number(m[1]);
    return Number.isFinite(run) ? run : null;
  }
  const asNum = Number(slope);
  return Number.isFinite(asNum) && asNum > 0 ? asNum : null;
}

/** Gangway slope as a percentage grade, or null when no gangway. */
export function gangwaySlopePct(config: DockConfig): number | null {
  const g = config.gangway;
  if (!g?.present) return null;
  // Phase 9: derive from the resolved length + shore rise so it works in both
  // length and slope modes.
  const len = gangwayLengthFt(config);
  const rise = config.site.shoreHeightAboveWaterFt;
  if (len > 0 && rise > 0) return round((rise / len) * 100, 1);
  const ratio = parseSlopeRatio(g.targetSlope);
  if (ratio == null || ratio <= 0) return null;
  return round((1 / ratio) * 100, 1);
}

/**
 * Suggested float positions for a floating dock — the aggregate of every piece's
 * Phase 6 layout (two rows minimum, corner floats, ≤ 8 ft spacing). World feet.
 * The single source of placement geometry the blueprint/3D renderers consume.
 */
export function suggestedFloatLayout(config: DockConfig): PlacementFt[] {
  return allFloatPositions(config);
}

/**
 * Suggested pile positions for a fixed dock — the aggregate of every piece's
 * corner + bay-grid piles (no cantilever). World feet.
 */
export function suggestedPileLayout(config: DockConfig): PlacementFt[] {
  return allPilePositions(config);
}

/** Suggested piling count across pile pieces (corner + even-distribute grid). */
export function pilingCount(config: DockConfig): number {
  return allPilePositions(config).length;
}

/** Suggested wheel positions across roll-in (wheel) pieces. World feet. */
export function suggestedWheelLayout(config: DockConfig): PlacementFt[] {
  return allWheelPositions(config);
}

/** Wheel count across roll-in (wheel) pieces (2 per rectangle). */
export function wheelCount(config: DockConfig): number {
  return allWheelPositions(config).length;
}

/** Suggested cleat count from edge perimeter spacing (§3.5). */
export function suggestedCleatCount(config: DockConfig): number {
  const perimeterFt = 2 * (config.overall.lengthFt + config.overall.widthFt);
  return Math.max(CLEAT.minPerSlip, Math.ceil(perimeterFt / CLEAT.spacingFt));
}

/** Rough estimated built weight (lbs) for the title block / point-load checks. */
export function estWeightLbs(config: DockConfig): number {
  const area = deckAreaFt2(config);
  const w = STRUCTURE_WEIGHT_LB_PER_FT2[config.overall.frameMaterial];
  return round(area * w);
}

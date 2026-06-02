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
  EXPOSURE_DESIGN_FACTOR,
  FLOAT_PLACEMENT,
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
import type {
  DockConfig,
  DockSection,
  FloatSpec,
  JoistSize,
} from "./types.js";

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Effective deck area in ft² (sum of section areas, or overall as fallback). */
export function deckAreaFt2(config: DockConfig): number {
  const sections = config.sections;
  if (sections && sections.length > 0) {
    return round(
      sections.reduce((sum, s) => sum + s.lengthFt * s.widthFt, 0),
    );
  }
  return round(config.overall.lengthFt * config.overall.widthFt);
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

/** Required buoyancy (lbs) via the §3.1 quick method: area × multiplier. */
export function requiredBuoyancyLbs(config: DockConfig): number {
  if (config.dockType !== "floating") return 0;
  return round(deckAreaFt2(config) * flotationMultiplier(config));
}

/** Resolve the float spec for a config, falling back to defaults (§3.1). */
function resolveFloatSpec(config: DockConfig): Pick<
  FloatSpec,
  "ratedBuoyancyLbs" | "lengthIn" | "widthIn" | "heightIn"
> {
  const catalog = config.floatCatalog;
  // Prefer a SKU referenced on the first placed float, then any catalog entry.
  const firstPlaced = config.sections?.[0]?.floats?.[0]?.sku;
  if (firstPlaced && catalog?.[firstPlaced]) {
    return catalog[firstPlaced]!;
  }
  if (catalog) {
    const first = Object.values(catalog)[0];
    if (first) return first;
  }
  return DEFAULT_FLOAT;
}

/** Per-float usable buoyancy after the exposure design factor (§3.1). */
function usablePerFloatLbs(config: DockConfig, ratedBuoyancyLbs: number): number {
  // Rougher water uses a smaller usable fraction of each float's rating, so it
  // needs more floats. inland_lake is the calibration baseline (factor 1.0) at
  // which the quick-method multiplier lands at the full rating.
  const factor =
    EXPOSURE_DESIGN_FACTOR.inland_lake /
    EXPOSURE_DESIGN_FACTOR[config.site.waveExposure];
  return ratedBuoyancyLbs * factor;
}

/** Number of floats actually placed in the config (0 if none). */
function placedFloatCount(config: DockConfig): number {
  const { sections } = resolveSections(config);
  return sections.reduce((sum, s) => sum + (s.floats?.length ?? 0), 0);
}

/**
 * Suggested float count = ceil(required buoyancy / per-float usable buoyancy),
 * exposure-adjusted (§3.1).
 */
export function floatCount(config: DockConfig): number {
  if (config.dockType !== "floating") return 0;
  const required = requiredBuoyancyLbs(config);
  const float = resolveFloatSpec(config);
  const perFloat = usablePerFloatLbs(config, float.ratedBuoyancyLbs);
  if (perFloat <= 0) return 0;
  return Math.max(0, Math.ceil(required / perFloat));
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

/** Gangway run length (ft) from rise/slope: L = rise / slope (§3.4). */
export function gangwayLengthFt(config: DockConfig): number {
  const g = config.gangway;
  if (!g?.present) return 0;
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
  const ratio = parseSlopeRatio(g.targetSlope);
  if (ratio == null || ratio <= 0) return null;
  return round((1 / ratio) * 100, 1);
}

/** A position in dock-local feet: x along the length (from shore), y across. */
export interface PlacementFt {
  xFt: number;
  yFt: number;
}

/**
 * Suggested float positions for a floating dock (§3.1). Distributes the
 * engine's float count across one or two rows (two when wider than ~6 ft),
 * spaced along the length. This is the single source of placement geometry —
 * the blueprint generator renders these rather than inventing its own.
 */
export function suggestedFloatLayout(config: DockConfig): PlacementFt[] {
  if (config.dockType !== "floating") return [];
  const n = floatCount(config);
  if (n <= 0) return [];
  const { lengthFt, widthFt } = config.overall;
  const rows = widthFt > FLOAT_PLACEMENT.twoRowsAboveWidthFt ? 2 : 1;
  const cols = Math.ceil(n / rows);
  const positions: PlacementFt[] = [];
  let placed = 0;
  for (let r = 0; r < rows && placed < n; r++) {
    const yFt = round((widthFt * (r + 1)) / (rows + 1));
    for (let c = 0; c < cols && placed < n; c++) {
      const xFt = round((lengthFt * (c + 0.5)) / cols);
      positions.push({ xFt, yFt });
      placed++;
    }
  }
  return positions;
}

/**
 * Suggested pile positions for a fixed dock: support lines spaced by the joist
 * span, with 2 piles per bent (3 when wider than ~6 ft). Single source of
 * placement geometry for both the count and the blueprint.
 */
export function suggestedPileLayout(config: DockConfig): PlacementFt[] {
  if (config.dockType === "floating" || config.dockType === "suspension") {
    return [];
  }
  const { lengthFt, widthFt } = config.overall;
  const span = maxJoistSpanFt(config);
  const supportLines = Math.max(2, Math.ceil(lengthFt / span) + 1);
  const pilesPerLine = widthFt > FLOAT_PLACEMENT.twoRowsAboveWidthFt ? 3 : 2;
  const positions: PlacementFt[] = [];
  for (let i = 0; i < supportLines; i++) {
    const xFt = round((lengthFt * i) / (supportLines - 1));
    for (let p = 0; p < pilesPerLine; p++) {
      const yFt = round((widthFt * p) / (pilesPerLine - 1));
      positions.push({ xFt, yFt });
    }
  }
  return positions;
}

/** Suggested piling count for fixed docks (§3.2/§3.3 bays from joist span). */
export function pilingCount(config: DockConfig): number {
  return suggestedPileLayout(config).length;
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

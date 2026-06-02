/**
 * Validation engine (spec §3, §7.6).
 *
 * A pure function over a DockConfig returning:
 *   - errors    : block estimate/lead
 *   - warnings  : advisory; customer must acknowledge
 *   - autoFixes : human-readable description of fixes the engine would apply
 *   - derived   : the shared derived-metrics bundle
 *
 * The engine never mutates the input config. Auto-fixes are described, not
 * applied in place; callers (the configurator) apply them to the working copy.
 */

import {
  GANGWAY,
  JOIST_SPACING_MAX_IN,
  MAX_SECTION,
  MIN_WIDTH_FT,
  RECOMMEND,
  SOFT_BOTTOMS,
  SUBMERGENCE,
} from "./constants.js";
import { CURRENT_SCHEMA_VERSION } from "./types.js";
import {
  connectorCount,
  deckAreaFt2,
  estWeightLbs,
  floatCount,
  freeboard,
  gangwayLengthFt,
  gangwaySlopePct,
  joistSpacingIn,
  maxJoistSpanFt,
  pilingCount,
  requiredBuoyancyLbs,
  resolveSections,
} from "./geometry.js";
import type {
  DockConfig,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

export function validationEngine(config: DockConfig): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const autoFixes: string[] = [];

  const err = (code: string, message: string, path?: string): void => {
    errors.push({ code, message, severity: "error", ...(path ? { path } : {}) });
  };
  const warn = (code: string, message: string, path?: string): void => {
    warnings.push({
      code,
      message,
      severity: "warning",
      ...(path ? { path } : {}),
    });
  };

  // --- Schema / structural sanity -----------------------------------------
  if (config.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    warn(
      "schema_version_mismatch",
      `Config schemaVersion ${config.schemaVersion} differs from engine version ${CURRENT_SCHEMA_VERSION}; values may need migration.`,
      "schemaVersion",
    );
  }
  if (config.overall.lengthFt <= 0 || config.overall.widthFt <= 0) {
    err(
      "invalid_dimensions",
      "Dock length and width must be positive.",
      "overall",
    );
  }

  const { sections, autoSectioned } = resolveSections(config);
  const span = maxJoistSpanFt(config);
  const spacing = joistSpacingIn(config);

  // --- §3.2 Joist spacing limits ------------------------------------------
  const maxSpacing =
    config.overall.deckingOrientation === "diagonal"
      ? JOIST_SPACING_MAX_IN.diagonal
      : JOIST_SPACING_MAX_IN.straight;
  if (spacing > maxSpacing) {
    err(
      "joist_spacing_exceeded",
      `Joist spacing ${spacing}" OC exceeds the ${maxSpacing}" max for ${config.overall.deckingOrientation} decking — reduce spacing.`,
      "overall.joistSpacingIn",
    );
  }

  // --- §3.2 / §3.3 Unsupported joist run vs. span -------------------------
  // Joists are supported by floats (floating, ≤8 ft) or pile bents (fixed).
  // The unsupported run is therefore the *support spacing*, not the section
  // length. For a fixed dock longer than the joist span the engine adds
  // intermediate beams + bents (an auto-fix). A *user-declared* bay that
  // exceeds the span is an error, because the customer pinned a run that
  // cannot be supported without redesign.
  const userDeclaredSections = !!(config.sections && config.sections.length > 0);
  const isFixed =
    config.dockType === "pile" ||
    config.dockType === "pipe" ||
    config.dockType === "crib";
  if (isFixed) {
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i]!;
      if (s.lengthFt > span) {
        if (userDeclaredSections) {
          err(
            "joist_span_exceeded",
            `Joist run ${s.lengthFt} ft exceeds max span for ${config.overall.joistSize ?? "2x8"} @ ${spacing}in OC (${span} ft) — add beams or split the bay.`,
            `sections[${i}].lengthFt`,
          );
        } else {
          autoFixes.push(
            `Add intermediate beam + pile bents every ${span} ft to support the ${s.lengthFt} ft run (${pilingCount(config)} piles total).`,
          );
        }
      }
    }
  }

  // --- §3.3 Sectioning (floating) -----------------------------------------
  if (config.dockType === "floating") {
    const maxLen =
      config.overall.frameMaterial === "aluminum"
        ? MAX_SECTION.floating.lengthAluminumFt
        : MAX_SECTION.floating.lengthWoodFt;
    if (autoSectioned) {
      autoFixes.push(
        `Split ${config.overall.lengthFt} ft length into ${sections.length} sections (max ${maxLen} ft each) with hinged connectors.`,
      );
    }
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i]!;
      if (s.lengthFt > maxLen) {
        err(
          "section_length_exceeded",
          `Section ${i + 1} length ${s.lengthFt} ft exceeds the ${maxLen} ft max for a ${config.overall.frameMaterial} floating section.`,
          `sections[${i}].lengthFt`,
        );
      }
      if (s.widthFt > MAX_SECTION.floating.widthFt) {
        warn(
          "section_width_large",
          `Section ${i + 1} width ${s.widthFt} ft exceeds the typical ${MAX_SECTION.floating.widthFt} ft floating-section width.`,
          `sections[${i}].widthFt`,
        );
      }
    }
  }

  // --- §3.3 Minimum width --------------------------------------------------
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    if (s.widthFt < MIN_WIDTH_FT.twoWayTraffic) {
      warn(
        "width_below_two_way",
        `Section ${i + 1} width ${s.widthFt} ft is below the ${MIN_WIDTH_FT.twoWayTraffic} ft two-way-traffic minimum.`,
        `sections[${i}].widthFt`,
      );
    }
  }

  // --- §3.1 Flotation ------------------------------------------------------
  const fb = freeboard(config);
  if (config.dockType === "floating") {
    if (fb.submergenceFraction != null) {
      if (fb.submergenceFraction > SUBMERGENCE.hardMax) {
        err(
          "submergence_exceeded",
          `Estimated submergence ${(fb.submergenceFraction * 100).toFixed(0)}% exceeds the ${SUBMERGENCE.hardMax * 100}% hard limit — add flotation.`,
        );
      } else if (fb.submergenceFraction > SUBMERGENCE.designTarget) {
        warn(
          "submergence_above_target",
          `Estimated submergence ${(fb.submergenceFraction * 100).toFixed(0)}% is above the ${SUBMERGENCE.designTarget * 100}% design target — consider more flotation for live-load reserve.`,
        );
      }
    }
    // §3.1 placement: two rows when wider than ~6 ft.
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i]!;
      const placed = s.floats?.length ?? 0;
      if (placed > 0) {
        validateFloatPlacement(s, i, warn);
      }
    }
    // §3.6 forbid bare EPS.
    if (config.floatCatalog) {
      for (const spec of Object.values(config.floatCatalog)) {
        if (!spec.sealedShell) {
          err(
            "bare_eps_float",
            `Float SKU ${spec.sku} is not a sealed-shell float — bare/exposed EPS is not allowed.`,
          );
        }
      }
    }
  }

  // --- §3.4 Gangway geometry ----------------------------------------------
  if (config.gangway?.present) {
    const slopePct = gangwaySlopePct(config);
    if (slopePct != null) {
      if (config.use === "commercial") {
        const len = gangwayLengthFt(config);
        const allowsException = len >= GANGWAY.ada.longRunExceptionFt;
        if (slopePct > GANGWAY.ada.maxSlopePct && !allowsException) {
          err(
            "gangway_slope_commercial",
            `Commercial gangway slope ${slopePct}% exceeds the ${GANGWAY.ada.maxSlopePct}% (1:12) accessible maximum.`,
            "gangway.targetSlope",
          );
        }
        if ((config.gangway.widthIn ?? 0) < GANGWAY.ada.minWidthIn) {
          warn(
            "gangway_width_commercial",
            `Commercial gangway should be ≥ ${GANGWAY.ada.minWidthIn}" wide for accessibility.`,
            "gangway.widthIn",
          );
        }
        if (!config.gangway.handrails) {
          warn(
            "gangway_handrails_commercial",
            "Commercial/accessible gangways should have handrails.",
            "gangway.handrails",
          );
        }
      } else {
        if (slopePct > GANGWAY.residentialMaxSlopePct) {
          err(
            "gangway_slope_residential",
            `Gangway slope ${slopePct}% exceeds the residential comfort ceiling of ${GANGWAY.residentialMaxSlopePct}% (≈2.75:12) — lengthen the gangway.`,
            "gangway.targetSlope",
          );
        } else if (slopePct > GANGWAY.recommendedMaxSlopePct) {
          warn(
            "gangway_slope_steep",
            `Gangway slope ${slopePct}% is steeper than the recommended ${GANGWAY.recommendedMaxSlopePct}% (1:8) — a longer ramp is easier to walk.`,
            "gangway.targetSlope",
          );
        }
      }
    }
    if (config.dockType === "floating") {
      warn(
        "gangway_point_load",
        "The gangway's shore end is a point load on the floating dock — confirm flotation/anchoring near the connection.",
      );
    }
  }

  // --- §2.1 Site/exposure advisories --------------------------------------
  if (
    config.dockType === "floating" &&
    config.site.waveExposure === "open_water"
  ) {
    warn(
      "open_water_floating",
      "Floating dock in open water — recommend wave attenuation / heavy anchoring.",
    );
  }
  if (config.site.waveExposure === "open_water") {
    warn(
      "wave_exposure_high",
      `Open-water exposure may exceed ${RECOMMEND.warnWaveHeightFt} ft chop — verify the dock type suits the wave climate.`,
    );
  }
  if (
    config.dockType === "floating" &&
    config.site.depthAtEndLowWaterFt <
      RECOMMEND.floatGroundClearanceFt + 1.0
  ) {
    warn(
      "floats_may_ground",
      "Water may be too shallow at low level — floats could ground out. Confirm draft clearance.",
    );
  }
  if (
    (config.dockType === "pile" || config.dockType === "pipe") &&
    config.site.seasonalFluctuationFt > RECOMMEND.floatingFluctuationFt
  ) {
    warn(
      "fixed_dock_level_swing",
      `Seasonal level swing of ${config.site.seasonalFluctuationFt} ft is large for a fixed dock — freeboard will vary; consider floating.`,
    );
  }

  // Declared dock type vs. §2.1 site rules (advisory — never blocks). Catches
  // e.g. a pile dock pinned onto a soft/rock bottom or into deep water.
  const fixedType =
    config.dockType === "pile" ||
    config.dockType === "pipe" ||
    config.dockType === "crib";
  if (fixedType && SOFT_BOTTOMS.has(config.site.bottom)) {
    warn(
      "type_contradicts_bottom",
      `A ${config.dockType} dock on a ${config.site.bottom} bottom is risky — soft/loose bottoms let piles settle or heave; §2.1 favors a floating dock here.`,
      "dockType",
    );
  }
  if (fixedType && config.site.bottom === "rock") {
    warn(
      "type_contradicts_bottom",
      "Piles can't be driven into rock — consider a floating or cantilever dock (§2.1).",
      "dockType",
    );
  }
  if (
    fixedType &&
    config.site.depthAtEndLowWaterFt > RECOMMEND.pileMaxPracticalDepthFt
  ) {
    warn(
      "type_contradicts_depth",
      `Water deeper than ${RECOMMEND.pileMaxPracticalDepthFt} ft makes a ${config.dockType} dock costly — §2.1 favors floating in deep water.`,
      "dockType",
    );
  }
  if (config.site.seasonalIce && config.dockType === "crib") {
    warn(
      "ice_permanent_structure",
      "Seasonal ice with a permanent crib dock — confirm it can withstand ice or choose a removable design.",
    );
  }

  // --- §3.5 Accessory advisories ------------------------------------------
  if (
    config.dockType !== "floating" &&
    config.site.waveExposure !== "sheltered"
  ) {
    warn(
      "suggest_mooring_whips",
      "Fixed dock in wave-prone water — add mooring whips so wakes don't slam a moored boat against the dock.",
    );
  }
  const powerAccessory = config.accessories?.find(
    (a) => a.type === "power_pedestal" || a.type === "lighting",
  );
  if (powerAccessory) {
    warn(
      "electrical_gfci",
      "110V power/lighting requires a licensed electrician and GFCI protection.",
    );
  }

  // --- Derived metrics bundle ---------------------------------------------
  const derived = {
    deckAreaFt2: deckAreaFt2(config),
    sectionCount: sections.length,
    requiredBuoyancyLbs: requiredBuoyancyLbs(config),
    floatCount: floatCount(config),
    estFreeboardIn: fb.freeboardIn,
    estSubmergenceFraction: fb.submergenceFraction,
    pilingCount: pilingCount(config),
    gangwayLengthFt: gangwayLengthFt(config),
    maxJoistSpanFt: span,
    estWeightLbs: estWeightLbs(config),
  };

  // Note connector line items when sections exist (informational autoFix).
  const connectors = connectorCount(sections.length);
  if (connectors > 0 && config.dockType === "floating") {
    autoFixes.push(
      `Add ${connectors} hinged/bolted connector${connectors > 1 ? "s" : ""} between sections (line items).`,
    );
  }

  return {
    errors,
    warnings,
    autoFixes,
    derived,
    ok: errors.length === 0,
  };
}

/** §3.1 float-placement checks for a single section. */
function validateFloatPlacement(
  section: { lengthFt: number; widthFt: number; floats?: { xFt: number; yFt: number }[] },
  index: number,
  warn: (code: string, message: string, path?: string) => void,
): void {
  const floats = section.floats ?? [];
  if (floats.length === 0) return;

  // Spacing ≤ 8 ft along the length (sort by x, check gaps including ends).
  const xs = floats.map((f) => f.xFt).sort((a, b) => a - b);
  const points = [0, ...xs, section.lengthFt];
  let maxGap = 0;
  for (let i = 1; i < points.length; i++) {
    maxGap = Math.max(maxGap, points[i]! - points[i - 1]!);
  }
  if (maxGap > 8) {
    warn(
      "float_spacing_exceeded",
      `Section ${index + 1}: float spacing reaches ${maxGap.toFixed(1)} ft — keep floats ≤ 8 ft center-to-center.`,
      `sections[${index}].floats`,
    );
  }

  // Two rows required when wider than ~6 ft.
  if (section.widthFt > 6) {
    const distinctRows = new Set(floats.map((f) => Math.round(f.yFt))).size;
    if (distinctRows < 2) {
      warn(
        "float_single_row_wide",
        `Section ${index + 1} is ${section.widthFt} ft wide — use two rows of floats.`,
        `sections[${index}].floats`,
      );
    }
  }
}

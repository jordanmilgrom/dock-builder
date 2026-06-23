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
} from "./geometry.js";
import { bboxesShareEdge, maxGapFtFor, pieceBBox, pileLastBayShort, resolvePieces } from "./pieces.js";
import { depthAtPieceCenter, resolveBathymetry } from "./bathymetry.js";
import type {
  DockConfig,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

/** Set equality for construction arrays (order-independent). */
function sameConstructions(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

/** Stable display string for a construction set, e.g. "floating+pile". */
function fmtSet(a: readonly string[]): string {
  return [...a].sort().join("+");
}

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

  // Phase 6: all structural checks run over the resolved PIECES (back-compat
  // shim turns legacy sections/overall into rectangle pieces).
  const pieces = resolvePieces(config);
  const bay = maxGapFtFor(config);
  // Phase 8/9: support presence is per-piece construction set, not the dockType.
  const hasPilePieces = pieces.some((p) => p.constructions.includes("pile"));
  const hasFloatingPieces = pieces.some((p) => p.constructions.includes("floating"));
  // Rectangle pieces carry length/width section semantics; triangles are fills.
  const rectPieces = pieces
    .map((p, idx) => ({ idx, lengthFt: p.lengthFt, widthFt: p.widthFt, isRect: p.kind === "rectangle" }))
    .filter((p) => p.isRect);
  const autoSectioned =
    config.dockType === "floating" &&
    !(config.pieces && config.pieces.length) &&
    !(config.sections && config.sections.length) &&
    pieces.length > 1;
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

  // --- §3.2 Unsupported joist run vs. span (Phase 6 pile model) ------------
  // Fixed docks carry piles on the bay grid, so the unsupported joist run is
  // the BAY, not the piece length. A bay larger than the span is an error; the
  // bay-bent support is always described as an auto-fix; and any rectangle whose
  // run doesn't land on the grid would cantilever past the last pile (error).
  if (hasPilePieces) {
    if (bay > span) {
      err(
        "joist_span_exceeded",
        `Pile bay ${bay} ft exceeds the joist span (${span} ft) for ${config.overall.joistSize ?? "2x8"} @ ${spacing}in OC — reduce the max gap or upsize the joists.`,
        "overall.maxGapFt",
      );
    }
    autoFixes.push(
      `Support pile pieces on bents every ≤ ${bay} ft (${pilingCount(config)} piles total).`,
    );
    // Phase 8: even-distribute guarantees no cantilever, so pile_cantilever is
    // gone. A pile run whose equal bays fall well under the max gap is only an
    // advisory (visual symmetry), not an error.
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      if (p.kind !== "rectangle" || !p.constructions.includes("pile")) continue;
      const last = pileLastBayShort(p, bay);
      if (last.short) {
        warn(
          "pile_lastbay_short",
          `Piece ${i + 1} pile bays are ${last.bayLengthFt} ft (max gap ${bay} ft). Consider adjusting piece length to multiples of the max gap for visual symmetry.`,
          `pieces[${i}].lengthFt`,
        );
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
        `Split ${config.overall.lengthFt} ft length into ${pieces.length} sections (max ${maxLen} ft each) with hinged connectors.`,
      );
    }
    for (const p of rectPieces) {
      // Phase 9: a too-long section is no longer a hard error — it auto-splits
      // for assembly (advisory + a split preview in the Schematic/3D views).
      if (p.lengthFt > maxLen) {
        warn(
          "section_auto_split",
          "Section auto-split for assembly — see schematic preview.",
          `pieces[${p.idx}].lengthFt`,
        );
      }
      if (p.widthFt > MAX_SECTION.floating.widthFt) {
        warn(
          "section_width_large",
          `Section ${p.idx + 1} width ${p.widthFt} ft exceeds the typical ${MAX_SECTION.floating.widthFt} ft floating-section width.`,
          `pieces[${p.idx}].widthFt`,
        );
      }
    }
  }

  // --- §3.3 Minimum width --------------------------------------------------
  for (const p of rectPieces) {
    if (p.widthFt < MIN_WIDTH_FT.twoWayTraffic) {
      warn(
        "width_below_two_way",
        `Section ${p.idx + 1} width ${p.widthFt} ft is below the ${MIN_WIDTH_FT.twoWayTraffic} ft two-way-traffic minimum.`,
        `pieces[${p.idx}].widthFt`,
      );
    }
  }

  // --- Phase 6: connector triangles need an adjacent rectangle ------------
  // Right triangles carry no float/pile of their own (they cut corners / bridge
  // sections). One that shares no edge with a rectangle has no buoyancy/support
  // source — advisory only.
  const bboxes = pieces.map((p) => ({ kind: p.kind, constructions: p.constructions, bbox: pieceBBox(p) }));
  for (let i = 0; i < bboxes.length; i++) {
    const me = bboxes[i]!;
    if (me.kind !== "right_triangle") continue;
    const adjacentRects = bboxes.filter((o, j) => j !== i && o.kind === "rectangle" && bboxesShareEdge(me.bbox, o.bbox));
    if (adjacentRects.length === 0) {
      warn(
        "triangle_isolated",
        `Triangle piece ${i + 1} doesn't share an edge with a rectangle — connector triangles draw buoyancy/support from an adjacent rectangle. Attach it to a rectangle piece.`,
        `pieces[${i}]`,
      );
      continue;
    }
    // Phase 9: a triangle inherits support from its adjacent rectangle; flag a
    // construction-SET mismatch so the user sets them the same.
    const mismatch = adjacentRects.find((o) => !sameConstructions(o.constructions, me.constructions));
    if (mismatch) {
      warn(
        "triangle_construction_mismatch",
        `Triangle piece ${i + 1} has construction=${fmtSet(me.constructions)} but its adjacent rectangle has construction=${fmtSet(mismatch.constructions)}. Triangle connectors inherit support from the adjacent rectangle — set them to the same construction.`,
        `pieces[${i}].constructions`,
      );
    }
  }

  // --- Phase 8/9: mixed-construction adjacency (transition zone) -----------
  // Two adjacent rectangles with different construction SETS form a valid
  // transition (e.g. floating → pile) but need the right connector — advisory.
  for (let i = 0; i < bboxes.length; i++) {
    const a = bboxes[i]!;
    if (a.kind !== "rectangle") continue;
    for (let j = i + 1; j < bboxes.length; j++) {
      const b = bboxes[j]!;
      if (b.kind !== "rectangle") continue;
      if (sameConstructions(a.constructions, b.constructions)) continue;
      if (!bboxesShareEdge(a.bbox, b.bbox)) continue;
      warn(
        "mixed_construction_adjacency",
        `Piece ${i + 1} (construction=${fmtSet(a.constructions)}) meets piece ${j + 1} (construction=${fmtSet(b.constructions)}) at a shared edge. This is a valid transition zone — verify the connector hardware (typically a hinged bracket sized for the expected float travel).`,
        `pieces[${i}]`,
      );
    }
  }

  // --- Phase 11: bathymetry-driven, per-piece depth advisories ------------
  const bathymetry = resolveBathymetry(config);
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    if (p.kind === "right_triangle") continue;
    const depth = depthAtPieceCenter(bathymetry, p);
    if (p.constructions.includes("pile") && depth > 12) {
      warn(
        "pile_over_deep_water",
        `Piles aren't practical past ~12 ft of water depth (≈${depth.toFixed(1)} ft here) — consider floating in this section.`,
        `pieces[${i}]`,
      );
    }
    if (p.constructions.includes("floating") && depth < 3) {
      warn(
        "float_over_shallow_water",
        `Floats need at least 3 ft of water to avoid bottoming out (≈${depth.toFixed(1)} ft here) — consider a pile or wheel construction.`,
        `pieces[${i}]`,
      );
    }
  }

  // --- §3.1 Flotation ------------------------------------------------------
  const fb = freeboard(config);
  if (hasFloatingPieces) {
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
    // §3.1 / Phase 6 placement check on any MANUALLY-placed floats.
    const placedGroups = config.pieces?.length
      ? config.pieces
          .filter((p) => p.pieceKind === "rectangle")
          .map((p) => ({ lengthFt: p.lengthFt ?? 0, widthFt: p.widthFt ?? 0, floats: p.floats }))
      : config.sections ?? [];
    for (let i = 0; i < placedGroups.length; i++) {
      const s = placedGroups[i]!;
      if ((s.floats?.length ?? 0) > 0) validateFloatPlacement(s, i, warn);
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
    sectionCount: pieces.length,
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
  const connectors = connectorCount(pieces.length);
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

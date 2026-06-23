/**
 * Config migration to Phase 8 (per-piece construction + maxGap).
 *
 * Configs live as immutable JSON snapshots in revisions, and the engine reads
 * older shapes through back-compat defaults (see `resolvePieces` / `maxGapFtFor`).
 * This pure helper performs the explicit one-time stamp the persistence layer can
 * apply on read/backfill:
 *   - every DockPiece gains `construction` = the design's dockType (pipe→pile),
 *     unless it already carries one;
 *   - `overall.bayFt` is renamed to `overall.maxGapFt` (default 8).
 *
 * It never mutates the input.
 */

import { PILE_BAY } from "./constants.js";
import { DEFAULT_BATHYMETRY } from "./bathymetry.js";
import { defaultConstructionFor, resolveConstructions } from "./pieces.js";
import type { DockConfig, GangwayConfig } from "./types.js";

export function migrateConfigToPhase8(config: DockConfig): DockConfig {
  const dc = defaultConstructionFor(config.dockType);
  const next: DockConfig = structuredClone(config);

  if (next.pieces) {
    next.pieces = next.pieces.map((p) => ({ ...p, construction: p.construction ?? dc }));
  }

  // Rename bayFt → maxGapFt (keep an explicit value; drop the legacy field).
  const overall = next.overall as DockConfig["overall"] & { bayFt?: number };
  const gap = overall.maxGapFt ?? overall.bayFt ?? PILE_BAY.defaultFt;
  overall.maxGapFt = gap;
  delete overall.bayFt;

  return next;
}

/**
 * Config migration to Phase 9. Builds on Phase 8 and additionally:
 *   - converts each piece's scalar `construction` into a `constructions` array
 *     (single-element); drops the scalar;
 *   - normalizes the gangway to the `{ mode }` shape — a legacy `targetSlope`-only
 *     gangway becomes `{ mode: 'slope', targetSlope }`, otherwise `{ mode: 'length' }`.
 * Never mutates the input.
 */
export function migrateConfigToPhase9(config: DockConfig): DockConfig {
  const dc = defaultConstructionFor(config.dockType);
  const next = migrateConfigToPhase8(config);

  if (next.pieces) {
    next.pieces = next.pieces.map((p) => {
      const constructions = resolveConstructions(p, dc);
      const { construction: _drop, ...rest } = p;
      void _drop;
      return { ...rest, constructions };
    });
  }

  if (next.gangway?.present && next.gangway.mode == null) {
    const g: GangwayConfig = next.gangway.targetSlope
      ? { ...next.gangway, mode: "slope" }
      : { ...next.gangway, mode: "length", lengthFt: next.gangway.lengthFt ?? 12 };
    next.gangway = g;
  }

  return next;
}

/**
 * Config migration to Phase 11. Builds on Phase 9 and additionally:
 *   - applies the default {@link DEFAULT_BATHYMETRY} when absent;
 *   - ensures every piece has an `accessories: []` array.
 * Per-piece accessories are additive to the legacy design-level accessory counts
 * (no overlap in existing data), so pricing stays stable. Never mutates input.
 */
export function migrateConfigToPhase11(config: DockConfig): DockConfig {
  const next = migrateConfigToPhase9(config);
  if (!next.bathymetry) next.bathymetry = structuredClone(DEFAULT_BATHYMETRY);
  if (next.pieces) {
    next.pieces = next.pieces.map((p) => ({ ...p, accessories: p.accessories ?? [] }));
  }
  return next;
}

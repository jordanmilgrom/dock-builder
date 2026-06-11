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
import { defaultConstructionFor } from "./pieces.js";
import type { DockConfig } from "./types.js";

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

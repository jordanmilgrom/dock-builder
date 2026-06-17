/**
 * Auto-split for too-long sections (Phase 9).
 *
 * A floating run longer than the frame's max shippable/assemblable section is
 * split into N EQUAL sections joined by connectors — replacing the old hard
 * `section_too_long` error. The customer keeps their drawn piece in
 * `DockConfig.pieces` (their intent); the engine produces a split *preview* that
 * the Schematic + 3D views render, plus an advisory and connector line items.
 *
 * Pure + framework-free.
 *
 * NOTE: the kickoff's "60 ft aluminum → [32, 28]" example conflicts with its own
 * stated algorithm ("N sections of roughly EQUAL length") and its other examples
 * (65→[32.5, 32.5], 96→[32, 32, 32]). We implement the documented equal-split
 * algorithm, so 60 ft aluminum → [30, 30] (2 equal bays under the 32 ft max).
 */

import { MAX_SECTION_FT } from "./constants.js";
import type { DockConfig, DockPiece, Rotation } from "./types.js";

const round = (n: number, dp = 2): number => Math.round(n * 10 ** dp) / 10 ** dp;

/** Max single-section length (ft) for a frame material; defaults to wood (24). */
export function maxSectionFtFor(frameMaterial: string): number {
  return (MAX_SECTION_FT as Record<string, number>)[frameMaterial] ?? MAX_SECTION_FT.pt_pine;
}

/** Unit length-axis direction for a piece's rotation (local +x in world). */
function lengthDir(rot: Rotation): [number, number] {
  switch (rot) {
    case 90: return [0, 1];
    case 180: return [-1, 0];
    case 270: return [0, -1];
    default: return [1, 0];
  }
}

export interface AutoSplitResult {
  sections: DockPiece[];
  connectors: number;
}

/**
 * Split a rectangle piece into equal end-to-end sections if it exceeds
 * `maxSectionFt`. Triangles and short pieces pass through unchanged.
 */
export function autoSplitPiece(piece: DockPiece, maxSectionFt: number, _frameMaterial?: string): AutoSplitResult {
  void _frameMaterial;
  const len = piece.lengthFt ?? 0;
  if (piece.pieceKind !== "rectangle" || len <= maxSectionFt || maxSectionFt <= 0) {
    return { sections: [piece], connectors: 0 };
  }
  const n = Math.ceil(len / maxSectionFt);
  const per = len / n;
  const [dx, dy] = lengthDir(piece.rotationDeg);
  const sections: DockPiece[] = [];
  for (let i = 0; i < n; i++) {
    sections.push({
      ...piece,
      posX: round(piece.posX + dx * per * i),
      posY: round(piece.posY + dy * per * i),
      lengthFt: round(per),
    });
  }
  return { sections, connectors: n - 1 };
}

/** Auto-split every piece in a config for RENDER/preview. Originals untouched. */
export function autoSplitConfig(config: DockConfig): DockConfig {
  if (!config.pieces || config.pieces.length === 0) return config;
  const maxSectionFt = maxSectionFtFor(config.overall.frameMaterial);
  const pieces = config.pieces.flatMap((p) => autoSplitPiece(p, maxSectionFt).sections);
  return { ...config, pieces };
}

/** Total connectors introduced by auto-splitting every piece in a config. */
export function autoSplitConnectorCount(config: DockConfig): number {
  if (!config.pieces || config.pieces.length === 0) return 0;
  const maxSectionFt = maxSectionFtFor(config.overall.frameMaterial);
  return config.pieces.reduce((sum, p) => sum + autoSplitPiece(p, maxSectionFt).connectors, 0);
}

/** Whether any piece in the config would be auto-split (drives the advisory). */
export function hasAutoSplit(config: DockConfig): boolean {
  return autoSplitConnectorCount(config) > 0;
}

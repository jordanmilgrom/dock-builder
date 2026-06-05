/**
 * 3D scene spec (Phase 5 §8 item 3). Pure helper that turns a DockConfig + the
 * engine's derived metrics into simple extruded boxes for the Three.js viewer —
 * NO geometry re-derivation (counts come from validationEngine). Framework-free
 * and SSR-safe so it's unit-testable and importable anywhere.
 *
 * The interactive viewer (components/DockView3D) consumes this; the PDF still
 * uses the parametric blueprint views.
 */

import {
  bayFtFor,
  floatLayoutForPiece,
  pieceWorldPolygon,
  pileLayoutForPiece,
  resolvePieces,
  worldBounds,
  type DockConfig,
} from "@/engine";

export interface SceneBox {
  kind: "deck" | "float" | "pile" | "gangway";
  /** Center position in feet (x along length, y vertical, z across width). */
  x: number;
  y: number;
  z: number;
  /** Size in feet. */
  w: number;
  h: number;
  d: number;
  color: string;
}

export interface SceneSpec {
  boxes: SceneBox[];
  bounds: { lengthFt: number; widthFt: number };
}

export interface SceneColors {
  deck: string;
  float: string;
  pile: string;
  gangway: string;
}

const DEFAULT_COLORS: SceneColors = { deck: "#b08968", float: "#0e7490", pile: "#475569", gangway: "#94a3b8" };

/**
 * Build the box list for a design — one deck box per piece plus engine-supplied
 * float/pile boxes at their world positions (Phase 6). No geometry re-derivation;
 * floats/piles come straight from the per-piece layout functions. Triangles are
 * approximated by their bounding box (honest static 3D; precise prisms later).
 */
export function buildSceneSpec(config: DockConfig, colorsIn?: Partial<SceneColors>): SceneSpec {
  const colors = { ...DEFAULT_COLORS, ...colorsIn };
  const pieces = resolvePieces(config);
  const bay = bayFtFor(config);
  const boxes: SceneBox[] = [];
  const deckY = 1;

  for (const piece of pieces) {
    const poly = pieceWorldPolygon(piece);
    const xs = poly.map((p) => p.xFt);
    const zs = poly.map((p) => p.yFt);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    boxes.push({
      kind: "deck",
      x: (minX + maxX) / 2,
      y: deckY,
      z: (minZ + maxZ) / 2,
      w: Math.max(0.5, maxX - minX),
      h: 0.5,
      d: Math.max(0.5, maxZ - minZ),
      color: colors.deck,
    });

    if (config.dockType === "floating") {
      for (const f of floatLayoutForPiece(piece)) {
        boxes.push({ kind: "float", x: f.xFt, y: deckY - 0.75, z: f.yFt, w: 3.5, h: 1.2, d: 1.8, color: colors.float });
      }
    } else if (config.dockType !== "suspension") {
      for (const p of pileLayoutForPiece(piece, bay)) {
        boxes.push({ kind: "pile", x: p.xFt, y: deckY - 2, z: p.yFt, w: 0.5, h: 4, d: 0.5, color: colors.pile });
      }
    }
  }

  const b = worldBounds(pieces);
  return { boxes, bounds: { lengthFt: Math.max(1, b.maxX - b.minX), widthFt: Math.max(1, b.maxY - b.minY) } };
}

/** Whether Three.js (r128 from CDN) has attached to the global. SSR-safe. */
export function isThreeAvailable(g: typeof globalThis = globalThis): boolean {
  return typeof (g as { THREE?: unknown }).THREE !== "undefined";
}

export const THREE_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

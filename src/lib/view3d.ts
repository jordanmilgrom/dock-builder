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
  floatFootprintFor,
  floatLayoutForPiece,
  freeboard,
  insetFloatToFootprint,
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
  /** Size in feet (bounding box; for triangle decks this is the bbox). */
  w: number;
  h: number;
  d: number;
  color: string;
  /** Deck footprint: rectangles render as a box, triangles as an extruded prism. */
  footprint?: "rectangle" | "triangle";
  /** For triangle decks — the 3 WORLD corner points (feet, top-down) to extrude.
   *  Identical to the 2D canvas via the shared `triangleVertices` convention. */
  tri?: { vertices: [number, number][]; legAFt: number; legBFt: number; posX: number; posY: number; rotationDeg: number };
}

/**
 * The 3 world corner points (feet, top-down) of a right-triangle piece — the
 * SINGLE convention shared by the 2D canvas and the 3D scene so they always
 * match. Convention: v0=(posX,posY), v1=(posX+legA,posY), v2=(posX,posY+legB)
 * BEFORE rotation; the whole triangle then rotates by rotationDeg around v0.
 * (Identical to the engine's pieceWorldPolygon for triangles.)
 */
export function triangleVertices(
  legAFt: number,
  legBFt: number,
  posX: number,
  posY: number,
  rotationDeg: number,
): [number, number][] {
  const rot = (x: number, y: number): [number, number] =>
    rotationDeg === 90 ? [-y, x] : rotationDeg === 180 ? [-x, -y] : rotationDeg === 270 ? [y, -x] : [x, y];
  const local: [number, number][] = [[0, 0], [legAFt, 0], [0, legBFt]];
  return local.map(([x, y]) => {
    const [rx, ry] = rot(x, y);
    return [posX + rx, posY + ry];
  });
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

const DECK_THICK_FT = 0.5;
const FLOAT_H_FT = 16 / 12; // a 16-inch-tall poly float

/**
 * Build the box list for a design (Phase 6 + 3D polish). Water sits at y = 0.
 *
 * Floats are bolted UNDERNEATH the deck: every float's TOP sits at the deck's
 * BOTTOM, with most of the float hanging below the waterline — only the
 * engine-derived freeboard shows above water. Right-triangle pieces emit a
 * triangular-footprint deck entry (extruded to a prism by the viewer), not a box.
 * Floats/piles are placed at the engine-supplied per-piece layout positions.
 */
export function buildSceneSpec(config: DockConfig, colorsIn?: Partial<SceneColors>): SceneSpec {
  const colors = { ...DEFAULT_COLORS, ...colorsIn };
  const pieces = resolvePieces(config);
  const bay = bayFtFor(config);
  const boxes: SceneBox[] = [];
  const floating = config.dockType === "floating";

  // Deck bottom (= top of floats). For a floating dock the deck rides at the
  // float's freeboard above water; for a fixed dock it sits at the shore height.
  let deckBottomY: number;
  if (floating) {
    const fbFt = (freeboard(config).freeboardIn ?? FLOAT_H_FT * 0.3 * 12) / 12;
    // Keep the float visibly mostly-submerged regardless of over-flotation.
    deckBottomY = Math.min(Math.max(fbFt, FLOAT_H_FT * 0.15), FLOAT_H_FT * 0.5);
  } else {
    deckBottomY = Math.max(1, config.site.shoreHeightAboveWaterFt);
  }
  const deckCenterY = deckBottomY + DECK_THICK_FT / 2;

  for (const piece of pieces) {
    const poly = pieceWorldPolygon(piece);
    const xs = poly.map((p) => p.xFt);
    const zs = poly.map((p) => p.yFt);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const deckBox: SceneBox = {
      kind: "deck",
      x: (minX + maxX) / 2,
      y: deckCenterY,
      z: (minZ + maxZ) / 2,
      w: Math.max(0.5, maxX - minX),
      h: DECK_THICK_FT,
      d: Math.max(0.5, maxZ - minZ),
      color: colors.deck,
      footprint: piece.kind === "right_triangle" ? "triangle" : "rectangle",
    };
    if (piece.kind === "right_triangle") {
      deckBox.tri = {
        vertices: triangleVertices(piece.legAFt, piece.legBFt, piece.posX, piece.posY, piece.rotationDeg),
        legAFt: piece.legAFt, legBFt: piece.legBFt, posX: piece.posX, posY: piece.posY, rotationDeg: piece.rotationDeg,
      };
    }
    boxes.push(deckBox);

    if (floating) {
      const { extX: floatW, extZ: floatD } = floatFootprintFor(piece);
      for (const f of floatLayoutForPiece(piece)) {
        // Float top == deck bottom (hangs DOWN into the water); the shared engine
        // helper insets edge/corner floats so the box stays under the footprint.
        const inset = insetFloatToFootprint(f, piece);
        boxes.push({
          kind: "float",
          x: inset.xFt,
          y: deckBottomY - FLOAT_H_FT / 2,
          z: inset.yFt,
          w: floatW,
          h: FLOAT_H_FT,
          d: floatD,
          color: colors.float,
        });
      }
    } else if (config.dockType !== "suspension") {
      for (const p of pileLayoutForPiece(piece, bay)) {
        const pileH = deckBottomY + 3; // from ~3 ft below water up to the deck
        boxes.push({ kind: "pile", x: p.xFt, y: deckBottomY - pileH / 2, z: p.yFt, w: 0.5, h: pileH, d: 0.5, color: colors.pile });
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

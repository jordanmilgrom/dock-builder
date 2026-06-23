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
  floatFootprintFor,
  floatLayoutForPiece,
  freeboard,
  insetFloatToFootprint,
  maxGapFtFor,
  pieceWorldPolygon,
  pileLayoutForPiece,
  resolvePieces,
  wheelLayoutForPiece,
  worldBounds,
  type DockConfig,
} from "@/engine";
import {
  autoSplitConfig,
  accessoryWorldPos,
  defaultConstructionFor,
  depthAtDistanceFt,
  resolveBathymetry,
  resolveConstructions,
} from "@/engine";
import type { AccessoryKind, NormalizedPiece, PieceConstruction } from "@/engine";
import { deckMaterial, pileColor, FLOAT_COLOR, WHEEL_COLOR, WATER_COLOR, WATER_OPACITY } from "@/lib/view3dMaterials";

export interface SceneBox {
  /** Phase 8: `wheel` is a cylinder (roll-in tire); `bracket` is its arm slab.
   *  Phase 11: `accessory` is a small deck-top fixture. */
  kind: "deck" | "float" | "pile" | "gangway" | "wheel" | "bracket" | "accessory";
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
  /** Phase 8 wheel cylinder: radius (ft); axis runs along z (rolls down-length). */
  wheel?: { radiusFt: number };
  /** Phase 11: which accessory this fixture is (for the mesh shape). */
  accessoryKind?: AccessoryKind;
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
  /** Absolute world bounding box (feet, top-down x/z) for camera framing. */
  box: { minX: number; minZ: number; maxX: number; maxZ: number };
  /** Phase 11: lake-bed depth samples (distance from shore → depth) for the bed mesh. */
  lakeBed: { distanceFromShoreFt: number; depthFt: number }[];
  /** Phase 11: water plane appearance. */
  water: { color: string; opacity: number };
}

export interface SceneColors {
  deck: string;
  float: string;
  pile: string;
  gangway: string;
  wheel: string;
}

const DEFAULT_COLORS: SceneColors = { deck: "#b08968", float: "#0e7490", pile: "#475569", gangway: "#94a3b8", wheel: "#3f3f46" };

const DECK_THICK_FT = 0.5;
const FLOAT_H_FT = 16 / 12; // a 16-inch-tall poly float
/** Phase 8: roll-in decks ride at a fixed 14" freeboard (wheel radius + clearance). */
const WHEEL_FREEBOARD_FT = 14 / 12;
const WHEEL_THICK_FT = 0.4; // tire width

/** Deck-bottom height (ft above the y=0 waterline) for ONE construction kind. */
function deckYForConstruction(c: PieceConstruction, config: DockConfig): number {
  if (c === "floating") {
    // Engine-derived freeboard, clamped so floats stay mostly submerged.
    const fbFt = (freeboard(config).freeboardIn ?? FLOAT_H_FT * 0.3 * 12) / 12;
    return Math.min(Math.max(fbFt, FLOAT_H_FT * 0.15), FLOAT_H_FT * 0.5);
  }
  if (c === "wheel") return WHEEL_FREEBOARD_FT; // 14 in (radius + bracket clearance)
  return Math.max(0.5, config.site.shoreHeightAboveWaterFt - 0.5); // pile: level with shore
}

/**
 * Deck-bottom height (ft) for a piece (Phase 9). Respects the engineering math
 * per construction — floating rides at freeboard, pile sits level with the shore,
 * wheel at its fixed clearance — and AVERAGES across a multi-construction set.
 */
export function deckBottomYFor(piece: NormalizedPiece, config: DockConfig): number {
  const ys = piece.constructions.map((c) => deckYForConstruction(c, config));
  return ys.reduce((s, y) => s + y, 0) / ys.length;
}

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
  // Phase 9: render the assembly auto-split preview (too-long sections split).
  config = autoSplitConfig(config);
  // Phase 11: colors come from the chosen materials (decking / frame / pile),
  // still overridable via colorsIn (tenant branding).
  const colors: SceneColors = {
    deck: deckMaterial(config.overall.deckingMaterial).color,
    float: FLOAT_COLOR,
    pile: pileColor(config.overall.pileMaterial),
    gangway: "#c9a36a",
    wheel: WHEEL_COLOR,
    ...colorsIn,
  };
  const pieces = resolvePieces(config);
  const bay = maxGapFtFor(config);
  const boxes: SceneBox[] = [];

  for (const piece of pieces) {
    // Phase 8: deck height + support hardware are per-piece construction.
    const deckBottomY = deckBottomYFor(piece, config);
    const deckCenterY = deckBottomY + DECK_THICK_FT / 2;
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
      color: piece.kind === "gangway" ? colors.gangway : colors.deck,
      footprint: piece.kind === "right_triangle" ? "triangle" : "rectangle",
    };
    if (piece.kind === "right_triangle") {
      deckBox.tri = {
        vertices: triangleVertices(piece.legAFt, piece.legBFt, piece.posX, piece.posY, piece.rotationDeg),
        legAFt: piece.legAFt, legBFt: piece.legBFt, posX: piece.posX, posY: piece.posY, rotationDeg: piece.rotationDeg,
      };
    }
    boxes.push(deckBox);

    if (piece.constructions.includes("floating")) {
      const { extX: floatW, extZ: floatD } = floatFootprintFor(piece);
      for (const f of floatLayoutForPiece(piece, bay)) {
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
    }
    if (piece.constructions.includes("wheel")) {
      // Two wheels (cylinders rolling down-length) + a bracket arm each, up to deck.
      const radius = Math.max(0.3, piece.widthFt / 8);
      for (const w of wheelLayoutForPiece(piece)) {
        boxes.push({
          kind: "wheel", x: w.xFt, y: radius, z: w.yFt,
          w: 2 * radius, h: 2 * radius, d: WHEEL_THICK_FT, color: colors.wheel,
          wheel: { radiusFt: radius },
        });
        const armBottom = radius;
        const armTop = deckBottomY;
        if (armTop > armBottom) {
          boxes.push({
            kind: "bracket", x: w.xFt, y: (armBottom + armTop) / 2, z: w.yFt,
            w: 0.25, h: armTop - armBottom, d: 0.25, color: colors.wheel,
          });
        }
      }
    }
    if (piece.constructions.includes("pile")) {
      for (const p of pileLayoutForPiece(piece, bay)) {
        const pileH = deckBottomY + 3; // from ~3 ft below water up to the deck
        boxes.push({ kind: "pile", x: p.xFt, y: deckBottomY - pileH / 2, z: p.yFt, w: 0.5, h: pileH, d: 0.5, color: colors.pile });
      }
    }
  }

  // Phase 11: accessory meshes sit on each piece's deck top at its edge position
  // (sourced from the original pieces — normalization drops accessories).
  for (const dp of config.pieces ?? []) {
    if (!dp.accessories?.length) continue;
    const cons = resolveConstructions(dp, defaultConstructionFor(config.dockType));
    const deckTop = cons.reduce((s, c) => s + deckYForConstruction(c, config), 0) / cons.length + DECK_THICK_FT;
    for (const a of dp.accessories) {
      const w = accessoryWorldPos(dp, a);
      boxes.push({ kind: "accessory", x: w.xFt, y: deckTop, z: w.yFt, w: 0.6, h: 1, d: 0.6, color: "#1f2937", accessoryKind: a.kind });
    }
  }

  const b = worldBounds(pieces);
  // Phase 11: lake-bed profile (sampled across the design) for the viewer to mesh.
  const bathy = resolveBathymetry(config);
  const farX = Math.max(40, b.maxX + 5);
  const lakeBed: { distanceFromShoreFt: number; depthFt: number }[] = [];
  for (let d = 0; d <= farX; d += Math.max(1, farX / 24)) {
    lakeBed.push({ distanceFromShoreFt: round1(d), depthFt: round1(depthAtDistanceFt(bathy, d)) });
  }
  return {
    boxes,
    bounds: { lengthFt: Math.max(1, b.maxX - b.minX), widthFt: Math.max(1, b.maxY - b.minY) },
    box: { minX: b.minX, minZ: b.minY, maxX: b.maxX, maxZ: b.maxY },
    lakeBed,
    water: { color: WATER_COLOR, opacity: WATER_OPACITY },
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Whether Three.js (r128 from CDN) has attached to the global. SSR-safe. */
export function isThreeAvailable(g: typeof globalThis = globalThis): boolean {
  return typeof (g as { THREE?: unknown }).THREE !== "undefined";
}

export const THREE_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

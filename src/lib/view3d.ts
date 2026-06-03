/**
 * 3D scene spec (Phase 5 §8 item 3). Pure helper that turns a DockConfig + the
 * engine's derived metrics into simple extruded boxes for the Three.js viewer —
 * NO geometry re-derivation (counts come from validationEngine). Framework-free
 * and SSR-safe so it's unit-testable and importable anywhere.
 *
 * The interactive viewer (components/DockView3D) consumes this; the PDF still
 * uses the parametric blueprint views.
 */

import { validationEngine, type DockConfig } from "@/engine";

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

/** Build the box list for a design. Reads the same DockConfig + engine metrics. */
export function buildSceneSpec(config: DockConfig, colorsIn?: Partial<SceneColors>): SceneSpec {
  const colors = { ...DEFAULT_COLORS, ...colorsIn };
  const L = Math.max(1, config.overall.lengthFt);
  const W = Math.max(1, config.overall.widthFt);
  const derived = validationEngine(config).derived;
  const boxes: SceneBox[] = [];

  // Deck slab (0.5 ft thick) sitting at deck height.
  const deckY = 1;
  boxes.push({ kind: "deck", x: L / 2, y: deckY, z: W / 2, w: L, h: 0.5, d: W, color: colors.deck });

  // Floating docks: flotation boxes under the deck, laid out in a grid.
  if (derived.floatCount > 0) {
    const n = derived.floatCount;
    const cols = Math.max(1, Math.round(Math.sqrt(n * (L / W))));
    const rows = Math.max(1, Math.ceil(n / cols));
    let placed = 0;
    for (let r = 0; r < rows && placed < n; r++) {
      for (let c = 0; c < cols && placed < n; c++) {
        boxes.push({
          kind: "float",
          x: ((c + 0.5) / cols) * L,
          y: deckY - 0.75,
          z: ((r + 0.5) / rows) * W,
          w: Math.min(4, L / cols - 0.5),
          h: 1.2,
          d: Math.min(2, W / rows - 0.3),
          color: colors.float,
        });
        placed++;
      }
    }
  }

  // Fixed docks: pilings from below the deck to the bed.
  if (derived.pilingCount > 0) {
    const n = derived.pilingCount;
    const pairs = Math.max(1, Math.ceil(n / 2));
    for (let i = 0; i < pairs; i++) {
      const x = ((i + 0.5) / pairs) * L;
      for (const z of [0.5, W - 0.5]) {
        boxes.push({ kind: "pile", x, y: deckY - 2, z, w: 0.5, h: 4, d: 0.5, color: colors.pile });
      }
    }
  }

  // Gangway to shore, if present.
  if (config.gangway?.present && derived.gangwayLengthFt > 0) {
    boxes.push({
      kind: "gangway",
      x: -derived.gangwayLengthFt / 2,
      y: deckY,
      z: W / 2,
      w: derived.gangwayLengthFt,
      h: 0.4,
      d: Math.min(4, (config.gangway.widthIn ?? 48) / 12),
      color: colors.gangway,
    });
  }

  return { boxes, bounds: { lengthFt: L, widthFt: W } };
}

/** Whether Three.js (r128 from CDN) has attached to the global. SSR-safe. */
export function isThreeAvailable(g: typeof globalThis = globalThis): boolean {
  return typeof (g as { THREE?: unknown }).THREE !== "undefined";
}

export const THREE_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

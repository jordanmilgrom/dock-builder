/**
 * 3D material selection (Phase 11). Pure mapping from config materials to colors
 * + surface patterns the viewer applies. Keeping it pure makes the "right look
 * for the right material" rules testable without a WebGL context.
 */

import type { DeckingMaterial, FrameMaterial } from "@/engine";

export type DeckPattern = "plank" | "diamond" | "smooth";

export interface DeckMaterial {
  color: string;
  pattern: DeckPattern;
}

/** Deck surface look by decking material. */
export function deckMaterial(decking: DeckingMaterial): DeckMaterial {
  switch (decking) {
    case "composite_trex":
      return { color: "#5b4f47", pattern: "plank" }; // dark gray-brown
    case "composite_5/4x6":
    case "composite_2x6":
      return { color: "#6b5d52", pattern: "plank" };
    case "cedar_hardwood":
    case "pt_5/4x6":
    case "pt_2x6":
      return { color: "#c9a36a", pattern: "plank" }; // light tan wood
    case "aluminum":
      return { color: "#c0c4c8", pattern: "diamond" }; // matte silver, diamond non-skid
    case "grating":
      return { color: "#8b9097", pattern: "diamond" };
    case "pvc":
      return { color: "#e6e3dc", pattern: "plank" };
    default:
      return { color: "#b08968", pattern: "plank" };
  }
}

/** Under-deck frame band color by frame material. */
export function frameColor(frame: FrameMaterial): string {
  switch (frame) {
    case "aluminum": return "#b8bcc0";
    case "galvanized_steel": return "#8a8f96";
    case "composite": return "#4a4a4a";
    case "pt_pine": return "#8a6d4b";
    default: return "#9a9a9a";
  }
}

/** Pile material color (new pileMaterial config field). */
export function pileColor(pileMaterial: "pressure_treated" | "concrete" | "steel" | undefined): string {
  switch (pileMaterial) {
    case "concrete": return "#9aa0a3";
    case "steel": return "#7d8388";
    case "pressure_treated":
    default:
      return "#6b5840"; // weathered PT wood
  }
}

/** Fixed material colors that don't vary by config. */
export const FLOAT_COLOR = "#1a1a1a"; // black HDPE pontoon
export const WHEEL_COLOR = "#2a2a2a"; // dark gray rubber
export const WATER_COLOR = "#4a8fc2";
export const WATER_OPACITY = 0.7;
export const LAKEBED_COLOR = "#6b5436"; // brown bed

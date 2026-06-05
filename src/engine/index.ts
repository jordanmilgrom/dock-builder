/**
 * Public surface of the Dock Configurator engines (Phase 0).
 *
 * These modules are framework-free and run identically client-side (live
 * configurator feedback) and server-side (authoritative re-validation/pricing).
 */

export * from "./types.js";
export * as constants from "./constants.js";
export {
  deckAreaFt2,
  joistSpacingIn,
  maxJoistSpanFt,
  flotationMultiplier,
  requiredBuoyancyLbs,
  floatCount,
  freeboard,
  resolveSections,
  connectorCount,
  gangwayLengthFt,
  gangwaySlopePct,
  parseSlopeRatio,
  pilingCount,
  suggestedCleatCount,
  suggestedFloatLayout,
  suggestedPileLayout,
  estWeightLbs,
} from "./geometry.js";
export type { PlacementFt } from "./geometry.js";
export {
  resolvePieces,
  pieceAreaFt2,
  pieceCornersLocal,
  pieceWorldPolygon,
  worldBounds,
  floatLayoutForPiece,
  pileLayoutForPiece,
  allFloatPositions,
  allPilePositions,
  pieceCantilever,
  pieceBBox,
  bboxesShareEdge,
  floatFootprintFor,
  insetFloatToFootprint,
  FLOAT_FOOTPRINT_FT,
  bayFtFor,
} from "./pieces.js";
export type { BBox } from "./pieces.js";
export type { NormalizedPiece } from "./pieces.js";
export { recommendDockType } from "./recommendation.js";
export type { Recommendation } from "./recommendation.js";
export { validationEngine } from "./validation.js";
export { pricingEngine, billableQuantities } from "./pricing.js";
export type { BillableQuantities } from "./pricing.js";
export { generateStartingDesign, STARTER_FLOAT_SKU } from "./starter.js";
export type { StarterOptions } from "./starter.js";
export {
  planView,
  sideElevation,
  endElevation,
  isometricView,
  allViews,
} from "./blueprint.js";
export type { Drawing, Shape, Pt, DrawStyle, ViewId } from "./blueprint.js";

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
  wheelLayoutForPiece,
  allFloatPositions,
  allPilePositions,
  allWheelPositions,
  pileLastBayShort,
  defaultConstructionFor,
  pieceBBox,
  bboxesShareEdge,
  floatFootprintFor,
  insetFloatToFootprint,
  FLOAT_FOOTPRINT_FT,
  MAX_ROW_GAP_FT,
  bayFtFor,
  maxGapFtFor,
} from "./pieces.js";
export { evenDistribute, evenBayLengthFt } from "./evenDistribute.js";
export {
  autoSplitPiece,
  autoSplitConfig,
  autoSplitConnectorCount,
  hasAutoSplit,
  maxSectionFtFor,
} from "./autoSplit.js";
export type { AutoSplitResult } from "./autoSplit.js";
export { recommendConstructions } from "./recommend.js";
export type { SiteFields, ConstructionRecommendation } from "./recommend.js";
export { computeGangway, GANGWAY_MIN_FT, GANGWAY_MAX_FT, GANGWAY_WARN_RATIO } from "./gangway.js";
export type { GangwayResult } from "./gangway.js";
export {
  DEFAULT_BATHYMETRY,
  resolveBathymetry,
  depthAtDistanceFt,
  depthAtPieceCenter,
} from "./bathymetry.js";
export {
  edgeLocalPoint,
  accessoryWorldPos,
  nearestEdgeForDrop,
  accessoryCounts,
  totalAccessoryCount,
} from "./accessoryPlacement.js";
export {
  snapGangwayToEdge,
  gangwayPieceSlope,
  isGangway,
  GANGWAY_SNAP_FT,
  GANGWAY_PIECE_WARN_RATIO,
} from "./gangwayPiece.js";
export { migrateConfigToPhase8, migrateConfigToPhase9, migrateConfigToPhase11 } from "./migrate.js";
export { resolveConstructions } from "./pieces.js";
export {
  floatingAreaFt2,
  suggestedWheelLayout,
  wheelCount,
} from "./geometry.js";
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

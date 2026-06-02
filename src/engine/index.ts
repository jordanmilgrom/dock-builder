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
  estWeightLbs,
} from "./geometry.js";
export { recommendDockType } from "./recommendation.js";
export type { Recommendation } from "./recommendation.js";
export { validationEngine } from "./validation.js";
export { pricingEngine, billableQuantities } from "./pricing.js";
export type { BillableQuantities } from "./pricing.js";

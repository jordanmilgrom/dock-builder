/**
 * Pricing engine (spec §4).
 *
 * Pure function: estimate = Σ(config quantities × unit prices) + labor +
 * delivery + modifiers, producing an itemized breakdown. The full breakdown is
 * always computed and stored internally; `priceVisibility` only governs how the
 * result is *displayed* (§4) and is echoed back for the caller to gate on.
 *
 * Quantities are derived from the shared geometry module so the pricing engine
 * and validation engine never disagree about how big the dock is.
 */

import {
  deckAreaFt2,
  floatCount,
  gangwayLengthFt,
  pilingCount,
  resolveSections,
  connectorCount,
} from "./geometry.js";
import type {
  AccessoryConfig,
  DockConfig,
  PricingItem,
  PricingLineItem,
  PricingOptions,
  PricingProfile,
  PricingResult,
} from "./types.js";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Derived billable quantities for a config, keyed by pricing-item key. */
export interface BillableQuantities {
  [key: string]: number;
}

/**
 * Map a DockConfig to billable quantities. Keys here are the canonical pricing
 * keys a PricingProfile is expected to price. Accessory keys are namespaced as
 * `accessory_<type>`; decking upcharge as `decking_upcharge`.
 */
export function billableQuantities(config: DockConfig): BillableQuantities {
  const area = deckAreaFt2(config);
  const { sections } = resolveSections(config);

  const q: BillableQuantities = {
    frame_per_ft2: area,
    decking_upcharge: area,
  };

  if (config.dockType === "floating") {
    q.flotation_per_float = floatCount(config);
    q.flotation_per_ft2 = area;
    const connectors = connectorCount(sections.length);
    if (connectors > 0) q.connector_each = connectors;
  }

  if (config.dockType !== "floating" && config.dockType !== "suspension") {
    q.piling_per_pile = pilingCount(config);
  }

  if (config.gangway?.present) {
    q.gangway_per_linear_ft = gangwayLengthFt(config);
  }

  if (config.builtInSteps?.present) {
    q.builtin_step_each = 1;
  }

  for (const acc of config.accessories ?? []) {
    accumulateAccessory(q, acc);
  }

  return q;
}

function accumulateAccessory(
  q: BillableQuantities,
  acc: AccessoryConfig,
): void {
  const key = `accessory_${acc.type}`;
  const linearKey = `${key}_per_linear_ft`;
  if (acc.linearFt != null) {
    q[linearKey] = (q[linearKey] ?? 0) + acc.linearFt;
  } else {
    q[key] = (q[key] ?? 0) + (acc.qty ?? 1);
  }
}

function defaultLabel(key: string): string {
  return key
    .replace(/_per_ft2$/, " (per ft²)")
    .replace(/_per_float$/, " (per float)")
    .replace(/_per_pile$/, " (per pile)")
    .replace(/_per_linear_ft$/, " (per linear ft)")
    .replace(/_each$/, " (each)")
    .replace(/^accessory_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function pricingEngine(
  config: DockConfig,
  profile: PricingProfile,
  options: PricingOptions = {},
): PricingResult {
  const notes: string[] = [];
  const quantities = billableQuantities(config);

  if (profile.dockType !== config.dockType) {
    notes.push(
      `Pricing profile is for "${profile.dockType}" but the design is "${config.dockType}" — prices may not apply.`,
    );
  }

  const itemByKey = new Map<string, PricingItem>();
  for (const item of profile.items) itemByKey.set(item.key, item);

  const lineItems: PricingLineItem[] = [];
  for (const [key, qty] of Object.entries(quantities)) {
    if (qty <= 0) continue;
    const item = itemByKey.get(key);
    if (!item) {
      // Don't bill what the builder hasn't priced; surface it as a note so the
      // estimate is never silently understated for a *priced* component.
      if (isCorePricingKey(key)) {
        notes.push(`No price configured for "${key}" — excluded from estimate.`);
      }
      continue;
    }
    const subtotal = round2(qty * item.unitPrice);
    lineItems.push({
      key,
      label: item.label ?? defaultLabel(key),
      qty: round2(qty),
      unit: item.unit,
      unitPrice: item.unitPrice,
      subtotal,
    });
  }

  const itemsSubtotal = round2(
    lineItems.reduce((sum, li) => sum + li.subtotal, 0),
  );

  // Labor: prefer per-ft², else flat (§4).
  let labor = 0;
  if (profile.labor?.perFt2 != null) {
    labor = round2((quantities.frame_per_ft2 ?? 0) * profile.labor.perFt2);
  } else if (profile.labor?.flat != null) {
    labor = round2(profile.labor.flat);
  }

  // Delivery by distance band (§4).
  let delivery = 0;
  if (
    options.deliveryDistanceMiles != null &&
    profile.deliveryBands &&
    profile.deliveryBands.length > 0
  ) {
    const band = [...profile.deliveryBands]
      .sort((a, b) => a.maxMiles - b.maxMiles)
      .find((b) => options.deliveryDistanceMiles! <= b.maxMiles);
    if (band) {
      delivery = round2(band.price);
    } else {
      notes.push(
        `Delivery distance ${options.deliveryDistanceMiles} mi exceeds all configured bands — delivery not included.`,
      );
    }
  }

  const baseBeforeMarkup = round2(itemsSubtotal + labor + delivery);
  const markup =
    profile.markupPct != null
      ? round2(baseBeforeMarkup * (profile.markupPct / 100))
      : 0;

  const preMinimumTotal = round2(baseBeforeMarkup + markup);

  let total = preMinimumTotal;
  let minimumApplied = false;
  if (profile.minimumPrice != null && total < profile.minimumPrice) {
    total = round2(profile.minimumPrice);
    minimumApplied = true;
  }

  return {
    currency: profile.currency,
    lineItems,
    itemsSubtotal,
    labor,
    delivery,
    markup,
    preMinimumTotal,
    minimumApplied,
    total,
    priceVisibility: profile.priceVisibility,
    notes,
  };
}

/** Core structural keys we warn about when unpriced (vs. optional accessories). */
function isCorePricingKey(key: string): boolean {
  return (
    key === "frame_per_ft2" ||
    key === "flotation_per_float" ||
    key === "piling_per_pile" ||
    key === "gangway_per_linear_ft"
  );
}

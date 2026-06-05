import { describe, expect, it } from "vitest";
import {
  canonicalFloatingConfig,
  clone,
  floatingPricingProfile,
} from "./__fixtures__.js";
import { billableQuantities, pricingEngine } from "./pricing.js";

describe("billableQuantities", () => {
  const q = billableQuantities(canonicalFloatingConfig);

  it("derives structural quantities from geometry", () => {
    expect(q.frame_per_ft2).toBe(240);
    expect(q.flotation_per_float).toBe(16);
    expect(q.gangway_per_linear_ft).toBe(36);
    expect(q.connector_each).toBe(1); // 2 auto-sections → 1 connector
  });

  it("namespaces accessories, splitting unit vs. linear pricing", () => {
    expect(q.accessory_cleat).toBe(6);
    expect(q.accessory_ladder).toBe(1);
    expect(q.accessory_edging_per_linear_ft).toBe(92);
  });
});

describe("pricingEngine — full itemized estimate", () => {
  const result = pricingEngine(canonicalFloatingConfig, floatingPricingProfile, {
    deliveryDistanceMiles: 40,
  });

  it("prices each configured line item", () => {
    const byKey = Object.fromEntries(result.lineItems.map((li) => [li.key, li]));
    expect(byKey.frame_per_ft2!.subtotal).toBe(240 * 18);
    expect(byKey.flotation_per_float!.subtotal).toBe(16 * 120);
    expect(byKey.gangway_per_linear_ft!.subtotal).toBe(36 * 140);
    expect(byKey.accessory_edging_per_linear_ft!.subtotal).toBe(92 * 9);
  });

  it("adds labor (per ft²), banded delivery, and markup, in order", () => {
    expect(result.labor).toBe(240 * 22);
    expect(result.delivery).toBe(600); // 40 mi → second band (≤75)
    const expectedItems =
      240 * 18 + 240 * 6 + 16 * 120 + 1 * 85 + 36 * 140 + 6 * 35 + 1 * 220 + 92 * 9;
    expect(result.itemsSubtotal).toBe(expectedItems);
    const base = result.itemsSubtotal + result.labor + result.delivery;
    expect(result.markup).toBeCloseTo(base * 0.1, 2);
    expect(result.preMinimumTotal).toBeCloseTo(base * 1.1, 2);
  });

  it("does not apply the minimum when the total is above it", () => {
    expect(result.minimumApplied).toBe(false);
    expect(result.total).toBe(result.preMinimumTotal);
  });

  it("echoes the price-visibility setting for caller-side gating", () => {
    expect(result.priceVisibility).toBe("full");
  });
});

describe("pricingEngine — minimum, delivery bands, and notes", () => {
  it("applies the floor price for a tiny dock", () => {
    const tiny = clone(canonicalFloatingConfig);
    tiny.overall.lengthFt = 6;
    tiny.overall.widthFt = 4;
    tiny.gangway = { present: false };
    tiny.accessories = [];
    const profile = clone(floatingPricingProfile);
    profile.markupPct = 0;
    profile.labor = {};
    const result = pricingEngine(tiny, profile);
    expect(result.preMinimumTotal).toBeLessThan(3500);
    expect(result.minimumApplied).toBe(true);
    expect(result.total).toBe(3500);
  });

  it("notes when delivery distance exceeds all bands", () => {
    const result = pricingEngine(canonicalFloatingConfig, floatingPricingProfile, {
      deliveryDistanceMiles: 500,
    });
    expect(result.delivery).toBe(0);
    expect(result.notes.join(" ")).toMatch(/exceeds all configured bands/);
  });

  it("notes (and excludes) an unpriced core component", () => {
    const profile = clone(floatingPricingProfile);
    profile.items = profile.items.filter((i) => i.key !== "frame_per_ft2");
    const result = pricingEngine(canonicalFloatingConfig, profile);
    expect(result.notes.join(" ")).toMatch(/frame_per_ft2/);
    expect(result.lineItems.find((li) => li.key === "frame_per_ft2")).toBeUndefined();
  });

  it("warns when the profile's dock type does not match the design", () => {
    const profile = clone(floatingPricingProfile);
    profile.dockType = "pile";
    const result = pricingEngine(canonicalFloatingConfig, profile);
    expect(result.notes.join(" ")).toMatch(/may not apply/);
  });
});

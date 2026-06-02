import { describe, expect, it } from "vitest";
import {
  canonicalFloatingConfig,
  clone,
  compliantFixedConfig,
} from "./__fixtures__.js";
import {
  connectorCount,
  deckAreaFt2,
  estWeightLbs,
  flotationMultiplier,
  floatCount,
  freeboard,
  gangwayLengthFt,
  gangwaySlopePct,
  maxJoistSpanFt,
  parseSlopeRatio,
  pilingCount,
  requiredBuoyancyLbs,
  resolveSections,
  suggestedCleatCount,
} from "./geometry.js";

describe("deckAreaFt2", () => {
  it("uses overall dimensions when no sections declared", () => {
    expect(deckAreaFt2(canonicalFloatingConfig)).toBe(240);
  });

  it("sums declared section areas", () => {
    const c = clone(canonicalFloatingConfig);
    c.sections = [
      { lengthFt: 20, widthFt: 6 },
      { lengthFt: 10, widthFt: 6 },
    ];
    expect(deckAreaFt2(c)).toBe(180);
  });
});

describe("flotationMultiplier", () => {
  it("matches the §3.1 table for the canonical 2x8 PT pairs", () => {
    const c = clone(canonicalFloatingConfig);
    c.overall.frameMaterial = "pt_pine";
    c.overall.deckingMaterial = "pt_5/4x6";
    expect(flotationMultiplier(c)).toBe(28);
    c.overall.deckingMaterial = "composite_2x6";
    expect(flotationMultiplier(c)).toBe(35);
  });

  it("falls back to a decking-driven multiplier for other frames", () => {
    // aluminum frame + composite_trex decking → 31 (decking fallback)
    expect(flotationMultiplier(canonicalFloatingConfig)).toBe(31);
  });
});

describe("canonical §7.5 → §7.6 derived metrics", () => {
  it("required buoyancy = area × multiplier = 7440", () => {
    expect(requiredBuoyancyLbs(canonicalFloatingConfig)).toBe(7440);
  });

  it("float count = 8 on an inland lake", () => {
    expect(floatCount(canonicalFloatingConfig)).toBe(8);
  });

  it("freeboard sits near 9–10 in at the 40% design submergence", () => {
    const fb = freeboard(canonicalFloatingConfig);
    expect(fb.submergenceFraction).toBeCloseTo(0.4, 2);
    expect(fb.freeboardIn).toBeGreaterThanOrEqual(9);
    expect(fb.freeboardIn).toBeLessThanOrEqual(10);
  });

  it("gangway length = rise × slope ratio = 36 ft", () => {
    expect(gangwayLengthFt(canonicalFloatingConfig)).toBe(36);
  });

  it("gangway slope = 8.3% for 1:12", () => {
    expect(gangwaySlopePct(canonicalFloatingConfig)).toBeCloseTo(8.3, 1);
  });
});

describe("float count responds to exposure", () => {
  it("needs more floats in open water than sheltered water", () => {
    const sheltered = clone(canonicalFloatingConfig);
    sheltered.site.waveExposure = "sheltered";
    const open = clone(canonicalFloatingConfig);
    open.site.waveExposure = "open_water";
    expect(floatCount(open)).toBeGreaterThan(floatCount(sheltered));
  });

  it("returns 0 floats for non-floating docks", () => {
    expect(floatCount(compliantFixedConfig)).toBe(0);
    expect(requiredBuoyancyLbs(compliantFixedConfig)).toBe(0);
    expect(freeboard(compliantFixedConfig).freeboardIn).toBeNull();
  });
});

describe("maxJoistSpanFt", () => {
  it("reads the pine span table and scales by material", () => {
    const pine = clone(canonicalFloatingConfig);
    pine.overall.frameMaterial = "pt_pine";
    pine.overall.joistSize = "2x8";
    expect(maxJoistSpanFt(pine)).toBe(10); // 2x8 @16 OC pine
    const alu = clone(pine);
    alu.overall.frameMaterial = "aluminum";
    expect(maxJoistSpanFt(alu)).toBe(14); // 10 × 1.4
  });

  it("uses the tighter table row for diagonal decking (12in OC)", () => {
    const c = clone(canonicalFloatingConfig);
    c.overall.frameMaterial = "pt_pine";
    c.overall.joistSize = "2x6";
    c.overall.deckingOrientation = "diagonal";
    expect(maxJoistSpanFt(c)).toBe(9); // 2x6 @12 OC
  });
});

describe("resolveSections", () => {
  it("auto-splits a 40 ft aluminum floating dock into 2×20 with a connector", () => {
    const { sections, autoSectioned } = resolveSections(canonicalFloatingConfig);
    expect(autoSectioned).toBe(true);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toEqual({ lengthFt: 20, widthFt: 6 });
    expect(connectorCount(sections.length)).toBe(1);
  });

  it("leaves declared sections untouched", () => {
    const c = clone(canonicalFloatingConfig);
    c.sections = [{ lengthFt: 18, widthFt: 6 }];
    const { sections, autoSectioned } = resolveSections(c);
    expect(autoSectioned).toBe(false);
    expect(sections).toHaveLength(1);
  });
});

describe("pilingCount", () => {
  it("is zero for floating and positive for fixed docks", () => {
    expect(pilingCount(canonicalFloatingConfig)).toBe(0);
    expect(pilingCount(compliantFixedConfig)).toBeGreaterThan(0);
  });
});

describe("parseSlopeRatio", () => {
  it("parses ratio strings and bare numbers", () => {
    expect(parseSlopeRatio("1:12")).toBe(12);
    expect(parseSlopeRatio("1 : 8")).toBe(8);
    expect(parseSlopeRatio("20")).toBe(20);
    expect(parseSlopeRatio(undefined)).toBeNull();
    expect(parseSlopeRatio("flat")).toBeNull();
  });
});

describe("suggestedCleatCount & estWeightLbs", () => {
  it("suggests at least the per-slip minimum", () => {
    expect(suggestedCleatCount(canonicalFloatingConfig)).toBeGreaterThanOrEqual(2);
  });
  it("estimates weight from frame material", () => {
    expect(estWeightLbs(canonicalFloatingConfig)).toBe(240 * 8); // aluminum 8 lb/ft²
  });
});

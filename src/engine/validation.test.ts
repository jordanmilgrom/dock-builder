import { describe, expect, it } from "vitest";
import {
  canonicalFloatingConfig,
  clone,
  compliantFixedConfig,
} from "./__fixtures__.js";
import { validationEngine } from "./validation.js";
import type { FloatSpec } from "./types.js";

const codes = (issues: { code: string }[]): string[] =>
  issues.map((i) => i.code);

describe("validationEngine — canonical floating dock", () => {
  const result = validationEngine(canonicalFloatingConfig);

  it("produces no blocking errors", () => {
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("auto-sections the 40 ft dock and notes the connector", () => {
    const joined = result.autoFixes.join(" ");
    expect(joined).toMatch(/Split 40 ft length into 2 sections/);
    expect(joined).toMatch(/connector/i);
  });

  it("reports the full derived-metrics bundle", () => {
    expect(result.derived.deckAreaFt2).toBe(240);
    expect(result.derived.requiredBuoyancyLbs).toBe(7440);
    expect(result.derived.floatCount).toBe(16);
    expect(result.derived.sectionCount).toBe(2);
    expect(result.derived.gangwayLengthFt).toBe(36);
    expect(result.derived.estFreeboardIn).not.toBeNull();
  });
});

describe("validationEngine — flotation rules (§3.1)", () => {
  it("errors when submergence would exceed 50% (under-floated)", () => {
    const c = clone(canonicalFloatingConfig);
    // Pin too few floats manually so installed buoyancy is far below required.
    c.sections = [
      { lengthFt: 20, widthFt: 6, floats: [{ xFt: 10, yFt: 3, sku: "F" }] },
      { lengthFt: 20, widthFt: 6, floats: [{ xFt: 10, yFt: 3, sku: "F" }] },
    ];
    c.floatCatalog = {
      F: {
        sku: "F",
        ratedBuoyancyLbs: 930,
        lengthIn: 48,
        widthIn: 24,
        heightIn: 16,
        sealedShell: true,
      },
    };
    const result = validationEngine(c);
    expect(codes(result.errors)).toContain("submergence_exceeded");
  });

  it("forbids bare (non-sealed) EPS floats (§3.6)", () => {
    const c = clone(canonicalFloatingConfig);
    const bare: FloatSpec = {
      sku: "EPS",
      ratedBuoyancyLbs: 930,
      lengthIn: 48,
      widthIn: 24,
      heightIn: 16,
      sealedShell: false,
    };
    c.floatCatalog = { EPS: bare };
    const result = validationEngine(c);
    expect(codes(result.errors)).toContain("bare_eps_float");
  });

  it("warns when a wide section uses a single row of floats", () => {
    const c = clone(canonicalFloatingConfig);
    c.sections = [
      {
        lengthFt: 16,
        widthFt: 8,
        floats: [
          { xFt: 4, yFt: 4, sku: "F" },
          { xFt: 12, yFt: 4, sku: "F" },
        ],
      },
    ];
    const result = validationEngine(c);
    expect(codes(result.warnings)).toContain("float_single_row_wide");
  });
});

describe("validationEngine — joist rules (§3.2)", () => {
  it("errors on joist spacing beyond the orientation maximum", () => {
    const c = clone(compliantFixedConfig);
    c.overall.joistSpacingIn = 24; // > 16 straight
    const result = validationEngine(c);
    expect(codes(result.errors)).toContain("joist_spacing_exceeded");
  });

  it("auto-fixes (not errors) an unsectioned fixed run longer than span", () => {
    const c = clone(compliantFixedConfig);
    c.overall.lengthFt = 40; // » 10 ft span, no declared sections
    const result = validationEngine(c);
    expect(codes(result.errors)).not.toContain("joist_span_exceeded");
    expect(result.autoFixes.join(" ")).toMatch(/bents/i);
  });

  it("errors when the pile bay exceeds the joist span (Phase 6 bay model)", () => {
    const c = clone(compliantFixedConfig);
    c.overall.joistSize = "2x6"; // 2x6 @ 16in OC → 8 ft span
    c.overall.bayFt = 10; // 10 ft bay can't be joisted by a 2x6
    const result = validationEngine(c);
    expect(codes(result.errors)).toContain("joist_span_exceeded");
  });

  it("Phase 8: even-distribute removes cantilever — no error, just a short-bay advisory", () => {
    // 17 ft at an 8 ft max gap → 3 equal bays of ~5.67 ft (< 75% of 8 = 6 ft):
    // no cantilever error, an advisory about visual symmetry instead.
    const c = clone(compliantFixedConfig);
    c.pieces = [{ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 17, widthFt: 8 }];
    const result = validationEngine(c);
    expect(codes(result.errors)).not.toContain("pile_cantilever");
    expect(codes(result.warnings)).toContain("pile_lastbay_short");
  });
});

describe("validationEngine — sectioning (§3.3)", () => {
  it("Phase 9: a too-long floating section auto-splits (advisory, not an error)", () => {
    const c = clone(canonicalFloatingConfig);
    c.overall.frameMaterial = "pt_pine"; // wood max 20 ft
    c.sections = [{ lengthFt: 28, widthFt: 6 }];
    const result = validationEngine(c);
    expect(codes(result.errors)).not.toContain("section_length_exceeded");
    expect(codes(result.warnings)).toContain("section_auto_split");
  });

  it("warns when a section is below the two-way-traffic minimum", () => {
    const c = clone(canonicalFloatingConfig);
    c.sections = [{ lengthFt: 16, widthFt: 3 }];
    const result = validationEngine(c);
    expect(codes(result.warnings)).toContain("width_below_two_way");
  });
});

describe("validationEngine — connector triangles (Phase 6)", () => {
  it("warns (advisory) when a triangle shares no edge with a rectangle", () => {
    const c = clone(canonicalFloatingConfig);
    c.pieces = [{ pieceKind: "right_triangle", posX: 0, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 4 }];
    const result = validationEngine(c);
    expect(codes(result.warnings)).toContain("triangle_isolated");
    expect(result.ok).toBe(true); // advisory, never an error
  });

  it("does NOT warn when the triangle abuts a rectangle edge", () => {
    const c = clone(canonicalFloatingConfig);
    c.pieces = [
      { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 24, widthFt: 6 },
      { pieceKind: "right_triangle", posX: 24, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 4 },
    ];
    expect(codes(validationEngine(c).warnings)).not.toContain("triangle_isolated");
  });
});

describe("validationEngine — gangway geometry (§3.4)", () => {
  it("errors on a residential slope past the comfort ceiling", () => {
    const c = clone(canonicalFloatingConfig);
    c.site.shoreHeightAboveWaterFt = 5;
    c.gangway = { present: true, targetSlope: "1:4", widthIn: 48 }; // 25% > 22.9%
    const result = validationEngine(c);
    expect(codes(result.errors)).toContain("gangway_slope_residential");
  });

  it("warns (does not error) on a steep-but-legal residential slope", () => {
    const c = clone(canonicalFloatingConfig);
    c.gangway = { present: true, targetSlope: "1:6", widthIn: 48 }; // ~16.7%
    const result = validationEngine(c);
    expect(codes(result.errors)).not.toContain("gangway_slope_residential");
    expect(codes(result.warnings)).toContain("gangway_slope_steep");
  });

  it("applies the ADA limit for commercial use, with a long-run exception", () => {
    const steep = clone(canonicalFloatingConfig);
    steep.use = "commercial";
    steep.site.shoreHeightAboveWaterFt = 3;
    steep.gangway = { present: true, targetSlope: "1:10", widthIn: 48, handrails: true };
    expect(codes(validationEngine(steep).errors)).toContain(
      "gangway_slope_commercial",
    );

    // A long run (≥80 ft) is allowed a slope exception.
    const longRun = clone(steep);
    longRun.site.shoreHeightAboveWaterFt = 9; // 1:10 → 90 ft run ≥ 80 ft
    expect(codes(validationEngine(longRun).errors)).not.toContain(
      "gangway_slope_commercial",
    );
  });
});

describe("validationEngine — site & accessory advisories", () => {
  it("warns about open-water flotation and high wave exposure", () => {
    const c = clone(canonicalFloatingConfig);
    c.site.waveExposure = "open_water";
    const w = codes(validationEngine(c).warnings);
    expect(w).toContain("open_water_floating");
    expect(w).toContain("wave_exposure_high");
  });

  it("suggests mooring whips for an exposed fixed dock", () => {
    const c = clone(compliantFixedConfig);
    c.site.waveExposure = "inland_lake";
    expect(codes(validationEngine(c).warnings)).toContain(
      "suggest_mooring_whips",
    );
  });

  it("flags electrical work for power/lighting accessories", () => {
    const c = clone(canonicalFloatingConfig);
    c.accessories = [{ type: "power_pedestal", qty: 1 }];
    expect(codes(validationEngine(c).warnings)).toContain("electrical_gfci");
  });
});

describe("validationEngine — declared type vs. §2.1 site rules (advisory)", () => {
  it("warns about a pile dock on a soft bottom (does not error)", () => {
    const c = clone(compliantFixedConfig);
    c.site.bottom = "mud";
    const result = validationEngine(c);
    expect(codes(result.warnings)).toContain("type_contradicts_bottom");
    expect(result.ok).toBe(true);
  });

  it("warns that piles can't be driven into rock", () => {
    const c = clone(compliantFixedConfig);
    c.site.bottom = "rock";
    expect(codes(validationEngine(c).warnings)).toContain("type_contradicts_bottom");
  });

  it("warns about a fixed dock in deep water", () => {
    const c = clone(compliantFixedConfig);
    c.site.depthAtEndLowWaterFt = 12;
    expect(codes(validationEngine(c).warnings)).toContain("type_contradicts_depth");
  });

  it("stays silent for a pile dock on a firm bottom at sensible depth", () => {
    const result = validationEngine(compliantFixedConfig);
    expect(codes(result.warnings)).not.toContain("type_contradicts_bottom");
    expect(codes(result.warnings)).not.toContain("type_contradicts_depth");
  });
});

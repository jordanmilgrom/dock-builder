import { describe, expect, it } from "vitest";
import { generateStartingDesign, type DockConfig } from "@/engine";
import { buildSceneSpec, isThreeAvailable, triangleVertices } from "@/lib/view3d";

const SITE = {
  depthAtEndLowWaterFt: 6,
  seasonalFluctuationFt: 2,
  bottom: "silt" as const,
  waveExposure: "inland_lake" as const,
  seasonalIce: false,
  shoreHeightAboveWaterFt: 3,
};

describe("buildSceneSpec (3D, reads the same DockConfig)", () => {
  it("always includes a deck box sized to the design", () => {
    const config = generateStartingDesign(SITE, { tenantId: "t", dockType: "floating" });
    const spec = buildSceneSpec(config);
    const deck = spec.boxes.find((b) => b.kind === "deck")!;
    expect(deck).toBeDefined();
    expect(deck.w).toBe(config.overall.lengthFt);
    expect(deck.d).toBe(config.overall.widthFt);
    expect(spec.bounds).toEqual({ lengthFt: config.overall.lengthFt, widthFt: config.overall.widthFt });
  });

  it("emits flotation boxes for floating docks", () => {
    const config = generateStartingDesign(SITE, { tenantId: "t", dockType: "floating" });
    expect(buildSceneSpec(config).boxes.some((b) => b.kind === "float")).toBe(true);
  });

  it("emits pilings for fixed docks (no floats)", () => {
    const config = generateStartingDesign(
      { ...SITE, depthAtEndLowWaterFt: 3, bottom: "clay", waveExposure: "sheltered" },
      { tenantId: "t", dockType: "pile" },
    );
    const spec = buildSceneSpec(config);
    expect(spec.boxes.some((b) => b.kind === "pile")).toBe(true);
    expect(spec.boxes.some((b) => b.kind === "float")).toBe(false);
  });

  it("respects a branding color override for floats", () => {
    const config = generateStartingDesign(SITE, { tenantId: "t", dockType: "floating" });
    const spec = buildSceneSpec(config, { float: "#123456" });
    expect(spec.boxes.find((b) => b.kind === "float")?.color).toBe("#123456");
  });
});

describe("3D polish — floats under the deck + triangle prisms", () => {
  const floatingBase = (): DockConfig => generateStartingDesign(SITE, { tenantId: "t", dockType: "floating" });

  it("every float's TOP sits at or below the deck bottom (floats hang underneath)", () => {
    const spec = buildSceneSpec(floatingBase());
    const deckBottom = Math.min(...spec.boxes.filter((b) => b.kind === "deck").map((d) => d.y - d.h / 2));
    const floats = spec.boxes.filter((b) => b.kind === "float");
    expect(floats.length).toBeGreaterThan(0);
    for (const f of floats) {
      const floatTop = f.y + f.h / 2;
      expect(floatTop).toBeLessThanOrEqual(deckBottom + 1e-9);
    }
  });

  it("most of each float is submerged below the waterline (y = 0)", () => {
    const spec = buildSceneSpec(floatingBase());
    for (const f of spec.boxes.filter((b) => b.kind === "float")) {
      const top = f.y + f.h / 2;
      const bottom = f.y - f.h / 2;
      const submerged = Math.min(0, top) - bottom; // depth below the waterline
      expect(bottom).toBeLessThan(0); // hangs into the water
      expect(submerged).toBeGreaterThanOrEqual(f.h / 2); // ≥ half under water
    }
  });

  it("canonical 24×6 floating dock → 8 floats, all under the deck plane", () => {
    const config = generateStartingDesign(SITE, { tenantId: "t", dockType: "floating" });
    expect(config.overall.lengthFt).toBe(24);
    expect(config.overall.widthFt).toBe(6);
    const spec = buildSceneSpec(config);
    const floats = spec.boxes.filter((b) => b.kind === "float");
    expect(floats).toHaveLength(8); // 2 rows × 4 columns
    const deckBottom = spec.boxes.find((b) => b.kind === "deck")!.y - DECK_HALF;
    expect(floats.every((f) => f.y + f.h / 2 <= deckBottom + 1e-9)).toBe(true);
  });

  it("a right-triangle piece emits a triangular-footprint deck entry (not a box)", () => {
    const lShape: DockConfig = {
      ...floatingBase(),
      pieces: [
        { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 24, widthFt: 6 },
        { pieceKind: "right_triangle", posX: 24, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 4 },
      ],
    };
    const spec = buildSceneSpec(lShape);
    const decks = spec.boxes.filter((b) => b.kind === "deck");
    const rectDeck = decks.find((d) => d.footprint === "rectangle");
    const triDeck = decks.find((d) => d.footprint === "triangle");
    expect(rectDeck).toBeDefined();
    expect(triDeck).toBeDefined();
    expect(triDeck!.tri).toMatchObject({ legAFt: 4, legBFt: 4, posX: 24, posY: 0, rotationDeg: 0 });

    // Floats follow the engine layout: 8 on the rectangle; the connector triangle
    // carries none of its own (it still renders as a deck prism).
    expect(spec.boxes.filter((b) => b.kind === "float")).toHaveLength(8);
    expect(triDeck!.footprint).toBe("triangle");
  });

  it("BUG A — no float box pokes out past its deck footprint (top-down)", () => {
    const spec = buildSceneSpec(floatingBase());
    const decks = spec.boxes.filter((b) => b.kind === "deck");
    const within = (lo: number, hi: number, min: number, max: number) => lo >= min - 1e-9 && hi <= max + 1e-9;
    for (const f of spec.boxes.filter((b) => b.kind === "float")) {
      const fits = decks.some((d) =>
        within(f.x - f.w / 2, f.x + f.w / 2, d.x - d.w / 2, d.x + d.w / 2) &&
        within(f.z - f.d / 2, f.z + f.d / 2, d.z - d.d / 2, d.z + d.d / 2),
      );
      expect(fits, `float at (${f.x},${f.z}) ${f.w}×${f.d} pokes out`).toBe(true);
    }
  });

  it("BUG A — canonical 24×6: all 8 floats fully inside the 24×6 footprint", () => {
    const spec = buildSceneSpec(floatingBase());
    const floats = spec.boxes.filter((b) => b.kind === "float");
    expect(floats).toHaveLength(8);
    for (const f of floats) {
      expect(f.x - f.w / 2).toBeGreaterThanOrEqual(0 - 1e-9);
      expect(f.x + f.w / 2).toBeLessThanOrEqual(24 + 1e-9);
      expect(f.z - f.d / 2).toBeGreaterThanOrEqual(0 - 1e-9);
      expect(f.z + f.d / 2).toBeLessThanOrEqual(6 + 1e-9);
    }
  });

  it("BUG B — 3D triangle vertices match the 2D canvas (shared convention)", () => {
    // The piece under test: a rotated right triangle.
    const config: DockConfig = {
      ...floatingBase(),
      pieces: [
        { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 24, widthFt: 6 },
        { pieceKind: "right_triangle", posX: 10, posY: 5, rotationDeg: 90, legAFt: 4, legBFt: 4 },
      ],
    };
    const spec = buildSceneSpec(config);
    const tri = spec.boxes.find((b) => b.kind === "deck" && b.footprint === "triangle")!.tri!;
    // The same helper the 2D canvas (CanvasMode.worldCorners) uses.
    const canvas = triangleVertices(4, 4, 10, 5, 90);
    expect(tri.vertices).toEqual(canvas);
    // Sanity: the documented convention (rotate around v0 = (posX,posY)).
    expect(canvas).toEqual([[10, 5], [10, 9], [6, 5]]);
  });
});

const DECK_HALF = 0.25; // half of the 0.5 ft deck thickness

describe("Three.js availability + SSR safety", () => {
  it("reports Three.js unavailable in a non-browser (Node) context", () => {
    expect(isThreeAvailable(globalThis)).toBe(false);
  });

  it("the 3D toggle + viewer import without SSR/window access", async () => {
    // Importing must not touch window/THREE at module-eval (SSR-safe).
    const toggle = await import("@/components/Design3DToggle");
    expect(typeof toggle.default).toBe("function");
    const viewer = await import("@/components/DockView3D");
    expect(typeof viewer.default).toBe("function");
  });
});

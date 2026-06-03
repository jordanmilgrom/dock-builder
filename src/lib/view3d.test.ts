import { describe, expect, it } from "vitest";
import { generateStartingDesign } from "@/engine";
import { buildSceneSpec, isThreeAvailable } from "@/lib/view3d";

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

import { describe, expect, it } from "vitest";
import { deckMaterial, frameColor, pileColor, FLOAT_COLOR, WHEEL_COLOR } from "@/lib/view3dMaterials";

describe("view3dMaterials", () => {
  it("deck look respects the decking material", () => {
    expect(deckMaterial("cedar_hardwood").pattern).toBe("plank");
    expect(deckMaterial("cedar_hardwood").color).toBe("#c9a36a"); // light tan wood
    expect(deckMaterial("composite_trex").color).toBe("#5b4f47"); // dark gray-brown
    expect(deckMaterial("aluminum").pattern).toBe("diamond"); // non-skid
  });

  it("frame color respects the frame material", () => {
    expect(frameColor("aluminum")).toBe("#b8bcc0");
    expect(frameColor("pt_pine")).toBe("#8a6d4b");
    expect(frameColor("galvanized_steel")).toBe("#8a8f96");
  });

  it("pile color respects pile_material (default pressure-treated)", () => {
    expect(pileColor("concrete")).toBe("#9aa0a3");
    expect(pileColor("steel")).toBe("#7d8388");
    expect(pileColor(undefined)).toBe("#6b5840");
  });

  it("floats are black HDPE, wheels dark rubber", () => {
    expect(FLOAT_COLOR).toBe("#1a1a1a");
    expect(WHEEL_COLOR).toBe("#2a2a2a");
  });
});

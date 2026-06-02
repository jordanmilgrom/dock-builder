import { describe, expect, it } from "vitest";
import { allViews, generateStartingDesign } from "@/engine";
import { drawingToSvg } from "./svg.js";

const site = {
  depthAtEndLowWaterFt: 6,
  seasonalFluctuationFt: 1.5,
  bottom: "sand" as const,
  waveExposure: "inland_lake" as const,
  seasonalIce: false,
  shoreHeightAboveWaterFt: 3,
};

const views = allViews(generateStartingDesign(site, { tenantId: "dev" }));

describe("drawingToSvg — render snapshot per view", () => {
  for (const v of views) {
    it(`${v.id} is valid, sized SVG`, () => {
      const svg = drawingToSvg(v);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain(`viewBox="0 0 ${v.width} ${v.height}"`);
      expect(svg).toContain("</svg>");
      expect(svg).toMatchSnapshot();
    });
  }

  it("escapes text content", () => {
    const svg = drawingToSvg({
      id: "plan",
      title: "A & B <test>",
      width: 10,
      height: 10,
      shapes: [{ kind: "text", at: { x: 1, y: 1 }, text: "x < y & z" }],
    });
    expect(svg).toContain("x &lt; y &amp; z");
    expect(svg).toContain('aria-label="A &amp; B &lt;test&gt;"');
  });
});

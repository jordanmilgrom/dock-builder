import { describe, expect, it } from "vitest";
import { svgPoint } from "@/lib/svgPoint";

describe("svgPoint", () => {
  it("subtracts the SVG rect origin from the client point", () => {
    expect(svgPoint(150, 120, { left: 50, top: 20 })).toEqual({ x: 100, y: 100 });
  });

  it("resolves via svgRef.current.getBoundingClientRect() even when the event's currentTarget is null", () => {
    // The exact failure mode: a stashed pointer event whose currentTarget React
    // has nulled out. The component reads the rect from the stable svg ref instead.
    const fakeEvent = { clientX: 200, clientY: 175, currentTarget: null } as unknown as { clientX: number; clientY: number; currentTarget: null };
    const svgRef = { current: { getBoundingClientRect: () => ({ left: 40, top: 25 }) } };
    const rect = svgRef.current?.getBoundingClientRect() ?? null;
    const p = svgPoint(fakeEvent.clientX, fakeEvent.clientY, rect);
    expect(p).toEqual({ x: 160, y: 150 });
    expect(Number.isNaN(p.x)).toBe(false);
    expect(Number.isNaN(p.y)).toBe(false);
  });

  it("never returns NaN when the rect is missing (null ref)", () => {
    const p = svgPoint(200, 175, null);
    expect(Number.isNaN(p.x)).toBe(false);
    expect(Number.isNaN(p.y)).toBe(false);
    expect(p).toEqual({ x: 200, y: 175 });
  });
});

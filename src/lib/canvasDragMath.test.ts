import { describe, expect, it } from "vitest";
import { resizeRectByScreen, worldDelta } from "@/lib/canvasDragMath";

describe("canvas drag math (would have caught the NaN bug)", () => {
  it("drags the BR corner of an 8×20 rectangle by (20px, 30px) at 10 px/ft → 10×23", () => {
    const rect = { posX: 0, posY: 0, lengthFt: 8, widthFt: 20 };
    const out = resizeRectByScreen(rect, "se", 20, 30, 10); // 20px→2ft, 30px→3ft
    expect(out.lengthFt).toBe(10);
    expect(out.widthFt).toBe(23);
    expect(Number.isNaN(out.lengthFt)).toBe(false);
    expect(Number.isNaN(out.widthFt)).toBe(false);
  });

  it("a 50 px corner drag on an 8×20 at 10 px/ft stays sane (≈ +5 ft), never NaN", () => {
    const out = resizeRectByScreen({ posX: 0, posY: 0, lengthFt: 8, widthFt: 20 }, "se", 50, 50, 10);
    expect(out.lengthFt).toBeCloseTo(13, 6);
    expect(out.widthFt).toBeCloseTo(25, 6);
  });

  it("worldDelta guards against a zero/NaN scale (no Infinity/NaN explosion)", () => {
    expect(worldDelta(20, 30, 0)).toEqual({ dx: 0, dy: 0 });
    expect(worldDelta(20, 30, NaN)).toEqual({ dx: 0, dy: 0 });
    expect(worldDelta(20, 30, 10)).toEqual({ dx: 2, dy: 3 });
  });
});

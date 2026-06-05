import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CUSTOM_DIM_MAX, CUSTOM_DIM_MIN, buildCustomPiece, isValidCustomDim } from "@/components/DockPiecesCanvas";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../components/DockPiecesCanvas.tsx");

describe("custom-piece modal (replaces window.prompt)", () => {
  it("validates integer dimensions in [1, 32]", () => {
    expect(isValidCustomDim(CUSTOM_DIM_MIN)).toBe(true);
    expect(isValidCustomDim(CUSTOM_DIM_MAX)).toBe(true);
    expect(isValidCustomDim(16)).toBe(true);
    expect(isValidCustomDim(0)).toBe(false);
    expect(isValidCustomDim(33)).toBe(false);
    expect(isValidCustomDim(8.5)).toBe(false);
    expect(isValidCustomDim(Number.NaN)).toBe(false);
  });

  it("builds a rectangle / right-triangle piece at the origin from valid inputs", () => {
    expect(buildCustomPiece("rectangle", 16, 8)).toEqual({
      pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 16, widthFt: 8,
    });
    expect(buildCustomPiece("right_triangle", 6, 4)).toEqual({
      pieceKind: "right_triangle", posX: 0, posY: 0, rotationDeg: 0, legAFt: 6, legBFt: 4,
    });
  });

  it("returns null for out-of-range / non-integer inputs (Add stays disabled)", () => {
    expect(buildCustomPiece("rectangle", 0, 8)).toBeNull();
    expect(buildCustomPiece("rectangle", 40, 8)).toBeNull();
    expect(buildCustomPiece("right_triangle", 6, 1.5)).toBeNull();
  });

  describe("never invokes window.prompt", () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it("the build path does not call prompt", () => {
      const promptSpy = vi.fn();
      Object.defineProperty(globalThis, "prompt", { value: promptSpy, configurable: true, writable: true });
      buildCustomPiece("rectangle", 16, 8);
      buildCustomPiece("right_triangle", 6, 4);
      isValidCustomDim(8);
      expect(promptSpy).not.toHaveBeenCalled();
    });

    it("the component source contains no prompt() and renders an inline modal", () => {
      const src = readFileSync(SRC, "utf8");
      expect(src).not.toMatch(/\bprompt\s*\(/); // no native prompt() anywhere
      expect(src).toContain("CustomPieceModal");
      expect(src).toContain('role="dialog"');
    });
  });
});

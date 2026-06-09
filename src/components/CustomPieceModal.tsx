"use client";

import { useState } from "react";
import type { DockPiece } from "@/engine";

/**
 * Custom-piece dimension entry (Phase 6, relocated in Phase 7). Inline modal +
 * the pure validation/build helpers it shares with the Canvas editor and the
 * unit tests — NO window.prompt anywhere.
 */

/** Custom-piece dimension bounds (ft): integer-only, 1–32. */
export const CUSTOM_DIM_MIN = 1;
export const CUSTOM_DIM_MAX = 32;

export function isValidCustomDim(n: number): boolean {
  return Number.isInteger(n) && n >= CUSTOM_DIM_MIN && n <= CUSTOM_DIM_MAX;
}

/** Build a piece from the modal inputs, or null when invalid. Pure. */
export function buildCustomPiece(
  kind: DockPiece["pieceKind"],
  a: number,
  b: number,
): DockPiece | null {
  if (!isValidCustomDim(a) || !isValidCustomDim(b)) return null;
  return kind === "right_triangle"
    ? { pieceKind: "right_triangle", posX: 0, posY: 0, rotationDeg: 0, legAFt: a, legBFt: b }
    : { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: a, widthFt: b };
}

/** Inline modal for custom rectangle/triangle dimensions (replaces window.prompt). */
export default function CustomPieceModal({
  kind,
  onCancel,
  onAdd,
}: {
  kind: DockPiece["pieceKind"];
  onCancel: () => void;
  onAdd: (piece: DockPiece) => void;
}) {
  const isTri = kind === "right_triangle";
  const [a, setA] = useState(isTri ? 6 : 16);
  const [b, setB] = useState(isTri ? 4 : 8);
  const piece = buildCustomPiece(kind, a, b);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/30 p-4" role="dialog" aria-label="Custom piece">
      <div className="w-full max-w-xs rounded-lg bg-white p-4 shadow-xl">
        <h3 className="text-sm font-semibold text-slate-800">
          {isTri ? "Custom right triangle" : "Custom rectangle"}
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <DimField label={isTri ? "Leg A (ft)" : "Length (ft)"} value={a} onChange={setA} />
          <DimField label={isTri ? "Leg B (ft)" : "Width (ft)"} value={b} onChange={setB} />
        </div>
        <p className="mt-1 text-xs text-slate-400">Whole feet, {CUSTOM_DIM_MIN}–{CUSTOM_DIM_MAX}.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={() => piece && onAdd(piece)}
            disabled={!piece}
            className="rounded bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function DimField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        type="number"
        step={1}
        min={CUSTOM_DIM_MIN}
        max={CUSTOM_DIM_MAX}
        value={value}
        onChange={(e) => onChange(Math.round(Number(e.target.value)))}
        className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
    </label>
  );
}

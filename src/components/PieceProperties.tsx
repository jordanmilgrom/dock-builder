"use client";

import type { DockPiece, PieceConstruction, Rotation } from "@/engine";
import {
  clampDim,
  clampPos,
  cycleRotation,
  dimFields,
  MIN_DIM_FT,
  normalizeRotation,
  ROTATIONS,
  stepDim,
  stepPos,
} from "@/lib/propertiesPanel";
import { DebouncedNum, Panel, Row, Stepper } from "./PanelControls";

/**
 * Selected-piece editor (Phase 7 + 8). Dimensions (6 in snap), position (1 ft
 * snap), rotation, per-piece construction (floating / pile / wheel), and Delete.
 * All edits flow through `onUpdate` / `onDelete` — no engine logic here.
 */

const CONSTRUCTIONS: { value: PieceConstruction; label: string; tip: string }[] = [
  { value: "floating", label: "Floating", tip: "Floating: pontoons under deck, rises with water level — best for fluctuating water." },
  { value: "pile", label: "Pile", tip: "Pile: posts driven into the lake bed, rigid platform — best for stable water and ice." },
  { value: "wheel", label: "Wheel (roll-in)", tip: "Wheel (roll-in): seasonal removal, lightweight frame on wheels — best for shallow water and Midwest winters." },
];

/** Toggle a construction in the set, never letting it become empty. */
function toggleConstruction(current: PieceConstruction[], value: PieceConstruction, on: boolean): PieceConstruction[] {
  const next = on ? [...new Set([...current, value])] : current.filter((c) => c !== value);
  return next.length > 0 ? next : ["floating"];
}

export default function PieceProperties({
  piece,
  onUpdate,
  onDelete,
}: {
  piece: DockPiece;
  onUpdate: (patch: Partial<DockPiece>) => void;
  onDelete: () => void;
}) {
  const [a, b] = dimFields(piece);
  const current: PieceConstruction[] = piece.constructions ?? (piece.construction ? [piece.construction] : ["floating"]);

  return (
    <>
      <Panel title="Dimensions">
        <Row>
          <Stepper
            label={a.label}
            value={a.value}
            display={`${a.value} ft`}
            onStep={(d) => onUpdate({ [a.key]: stepDim(a.value, d) } as Partial<DockPiece>)}
          />
          <Stepper
            label={b.label}
            value={b.value}
            display={`${b.value} ft`}
            onStep={(d) => onUpdate({ [b.key]: stepDim(b.value, d) } as Partial<DockPiece>)}
          />
        </Row>
        {/* Typed entry commits on blur (Tab), snapped to 0.5 ft — steppers aren't the only way. */}
        <Row>
          <DebouncedNum label={`${a.label} exact`} value={a.value} step={0.5} min={MIN_DIM_FT} onCommit={(n) => onUpdate({ [a.key]: clampDim(n) } as Partial<DockPiece>)} />
          <DebouncedNum label={`${b.label} exact`} value={b.value} step={0.5} min={MIN_DIM_FT} onCommit={(n) => onUpdate({ [b.key]: clampDim(n) } as Partial<DockPiece>)} />
        </Row>
      </Panel>

      <Panel title="Position">
        <Row>
          <Stepper label="X (ft)" value={piece.posX} display={`${piece.posX} ft`} onStep={(d) => onUpdate({ posX: stepPos(piece.posX, d) })} />
          <Stepper label="Y (ft)" value={piece.posY} display={`${piece.posY} ft`} onStep={(d) => onUpdate({ posY: stepPos(piece.posY, d) })} />
        </Row>
        <Row>
          <DebouncedNum label="X exact (ft)" value={piece.posX} step={1} min={-1000} onCommit={(n) => onUpdate({ posX: clampPos(n) })} />
          <DebouncedNum label="Y exact (ft)" value={piece.posY} step={1} min={-1000} onCommit={(n) => onUpdate({ posY: clampPos(n) })} />
        </Row>
      </Panel>

      <Panel title="Rotation">
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded border border-slate-300 text-xs">
            {ROTATIONS.map((r) => (
              <button
                key={r}
                onClick={() => onUpdate({ rotationDeg: r })}
                className={`px-2 py-1 ${piece.rotationDeg === r ? "bg-brand text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
              >
                {r}°
              </button>
            ))}
          </div>
          <button
            onClick={() => onUpdate({ rotationDeg: cycleRotation(piece.rotationDeg) })}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            +90°
          </button>
        </div>
        <DebouncedNum
          label="Exact rotation (°)"
          value={piece.rotationDeg}
          step={90}
          min={0}
          onCommit={(n) => onUpdate({ rotationDeg: normalizeRotation(n) as Rotation })}
        />
      </Panel>

      <Panel title="Construction">
        <span className="text-sm text-slate-600">How this piece is supported (one or more)</span>
        <div className="mt-1 flex flex-col gap-1">
          {CONSTRUCTIONS.map((c) => {
            const checked = current.includes(c.value);
            return (
              <label key={c.value} className="flex items-center gap-2 text-sm text-slate-700" title={c.tip}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onUpdate({ constructions: toggleConstruction(current, c.value, e.target.checked) })}
                />
                {c.label}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-slate-400">{CONSTRUCTIONS.find((c) => c.value === current[0])?.tip}</p>
      </Panel>

      <div className="px-4 py-3">
        <button
          onClick={onDelete}
          className="w-full rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          Delete piece
        </button>
      </div>
    </>
  );
}

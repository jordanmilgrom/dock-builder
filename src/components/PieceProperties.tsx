"use client";

import type { DockPiece, PieceConstruction, Rotation } from "@/engine";
import {
  clampPos,
  cycleRotation,
  dimFields,
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
        <label className="block text-sm">
          <span className="text-slate-600">How this piece is supported</span>
          <select
            value={piece.construction ?? "floating"}
            onChange={(e) => onUpdate({ construction: e.target.value as PieceConstruction })}
            className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {CONSTRUCTIONS.map((c) => (
              <option key={c.value} value={c.value} title={c.tip}>{c.label}</option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-400">
          {CONSTRUCTIONS.find((c) => c.value === (piece.construction ?? "floating"))?.tip}
        </p>
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

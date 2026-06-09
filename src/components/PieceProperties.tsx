"use client";

import type { DockPiece, Rotation } from "@/engine";
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
 * Selected-piece editor (Phase 7). Dimensions (6 in snap), position (1 ft snap),
 * rotation, a read-only per-piece construction note (Phase 8), and Delete. All
 * edits flow through `onUpdate` / `onDelete` — no engine logic here.
 */
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
        <p className="text-xs text-slate-400">
          Inherits dock type from design (Phase 8: per-piece floating / pile / wheel).
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

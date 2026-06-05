"use client";

import { useMemo, useRef, useState } from "react";
import type { DockPiece, Rotation } from "@/engine";

/** Custom-piece dimension bounds (ft): integer-only, 1–32. */
export const CUSTOM_DIM_MIN = 1;
export const CUSTOM_DIM_MAX = 32;

export function isValidCustomDim(n: number): boolean {
  return Number.isInteger(n) && n >= CUSTOM_DIM_MIN && n <= CUSTOM_DIM_MAX;
}

/**
 * Build a piece from the custom-piece modal inputs, or null when invalid.
 * Pure — shared by the modal and unit tests (no window.prompt anywhere).
 */
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

/**
 * Drawing canvas (Phase 6). Replaces the single Length×Width form: the customer
 * composes a dock from rectangle + right-triangle pieces, dragging each on a 1 ft
 * snap grid, rotating in 90° steps, with edges snapping to neighbors within 6 in.
 * Pure SVG; emits the updated piece list on every change so the engine, estimate,
 * and warnings live-update.
 */

const PX_PER_FT = 14;
const POS_SNAP_FT = 1; // drag grid
const EDGE_SNAP_FT = 0.5; // 6 in edge-to-edge

function rot(x: number, y: number, deg: Rotation): [number, number] {
  switch (deg) {
    case 90: return [-y, x];
    case 180: return [-x, -y];
    case 270: return [y, -x];
    default: return [x, y];
  }
}

function cornersLocal(p: DockPiece): [number, number][] {
  if (p.pieceKind === "right_triangle") {
    return [[0, 0], [p.legAFt ?? 0, 0], [0, p.legBFt ?? 0]];
  }
  return [[0, 0], [p.lengthFt ?? 0, 0], [p.lengthFt ?? 0, p.widthFt ?? 0], [0, p.widthFt ?? 0]];
}

function worldCorners(p: DockPiece): [number, number][] {
  return cornersLocal(p).map(([x, y]) => {
    const [rx, ry] = rot(x, y, p.rotationDeg);
    return [p.posX + rx, p.posY + ry];
  });
}

function pieceBounds(p: DockPiece): { minX: number; minY: number; maxX: number; maxY: number } {
  const c = worldCorners(p);
  const xs = c.map((q) => q[0]);
  const ys = c.map((q) => q[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function dims(p: DockPiece): string {
  return p.pieceKind === "right_triangle"
    ? `△ ${p.legAFt ?? 0}×${p.legBFt ?? 0} ft`
    : `▭ ${p.lengthFt ?? 0}×${p.widthFt ?? 0} ft`;
}

const snap = (v: number, step: number) => Math.round(v / step) * step;

export default function DockPiecesCanvas({
  pieces,
  onChange,
}: {
  pieces: DockPiece[];
  onChange: (pieces: DockPiece[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<number | null>(pieces.length ? 0 : null);
  const [modal, setModal] = useState<null | DockPiece["pieceKind"]>(null);
  const drag = useRef<{ idx: number; startX: number; startY: number; origX: number; origY: number } | null>(null);

  // World extent across all pieces (+ padding) for the viewBox.
  const view = useMemo(() => {
    let minX = 0, minY = 0, maxX = 24, maxY = 12;
    for (const p of pieces) {
      const b = pieceBounds(p);
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
    const pad = 4;
    return { minX: minX - pad, minY: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
  }, [pieces]);

  function emit(next: DockPiece[]) {
    onChange(next);
  }

  function addPiece(p: DockPiece) {
    // Place new pieces just below the current content so they don't overlap.
    let maxY = 0;
    for (const ex of pieces) maxY = Math.max(maxY, pieceBounds(ex).maxY);
    const placed = { ...p, posX: 0, posY: pieces.length ? maxY + 2 : 0 };
    emit([...pieces, placed]);
    setSelected(pieces.length);
  }

  function update(idx: number, patch: Partial<DockPiece>) {
    emit(pieces.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function removeSelected() {
    if (selected == null) return;
    emit(pieces.filter((_, i) => i !== selected));
    setSelected(null);
  }

  function rotateSelected() {
    if (selected == null) return;
    const p = pieces[selected]!;
    update(selected, { rotationDeg: (((p.rotationDeg + 90) % 360) as Rotation) });
  }

  // --- pointer drag on the 1 ft grid, with edge snap on release ----
  function ptToFt(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const fx = view.minX + ((e.clientX - rect.left) / rect.width) * view.w;
    const fy = view.minY + ((e.clientY - rect.top) / rect.height) * view.h;
    return { x: fx, y: fy };
  }

  function onPointerDown(e: React.PointerEvent, idx: number) {
    e.preventDefault();
    setSelected(idx);
    const { x, y } = ptToFt(e);
    const p = pieces[idx]!;
    drag.current = { idx, startX: x, startY: y, origX: p.posX, origY: p.posY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const { x, y } = ptToFt(e);
    update(d.idx, {
      posX: snap(d.origX + (x - d.startX), POS_SNAP_FT),
      posY: snap(d.origY + (y - d.startY), POS_SNAP_FT),
    });
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (d == null) return;
    // Edge snap: align this piece's bbox edges to any neighbor's within 6 in.
    const me = pieces[d.idx]!;
    const mb = pieceBounds(me);
    let dx = 0, dy = 0;
    const nearest = (pairs: { a: number; b: number }[]): number => {
      let best = 0;
      for (const { a, b } of pairs) if (Math.abs(a - b) <= EDGE_SNAP_FT) best = b - a;
      return best;
    };
    for (let i = 0; i < pieces.length; i++) {
      if (i === d.idx) continue;
      const nb = pieceBounds(pieces[i]!);
      dx = dx || nearest([
        { a: mb.minX, b: nb.maxX }, { a: mb.maxX, b: nb.minX }, { a: mb.minX, b: nb.minX }, { a: mb.maxX, b: nb.maxX },
      ]);
      dy = dy || nearest([
        { a: mb.minY, b: nb.maxY }, { a: mb.maxY, b: nb.minY }, { a: mb.minY, b: nb.minY }, { a: mb.maxY, b: nb.maxY },
      ]);
    }
    if (dx || dy) update(d.idx, { posX: me.posX + dx, posY: me.posY + dy });
  }

  const sel = selected != null ? pieces[selected] : undefined;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 text-xs">
        <Btn onClick={() => addPiece({ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8 })}>+ Rectangle 8×20</Btn>
        <Btn onClick={() => addPiece({ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 8, widthFt: 8 })}>+ Rectangle 8×8</Btn>
        <Btn onClick={() => addPiece({ pieceKind: "right_triangle", posX: 0, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 4 })}>+ Triangle 4×4</Btn>
        <Btn onClick={() => setModal("rectangle")}>+ Custom rectangle…</Btn>
        <Btn onClick={() => setModal("right_triangle")}>+ Custom triangle…</Btn>
      </div>

      {modal && (
        <CustomPieceModal
          kind={modal}
          onCancel={() => setModal(null)}
          onAdd={(piece) => { addPiece(piece); setModal(null); }}
        />
      )}

      <svg
        ref={svgRef}
        viewBox={`${view.minX} ${view.minY} ${view.w} ${view.h}`}
        className="w-full touch-none rounded border border-slate-300 bg-sky-50"
        style={{ height: 280 }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* 1 ft grid */}
        <defs>
          <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#cbd5e1" strokeWidth="0.05" />
          </pattern>
        </defs>
        <rect x={view.minX} y={view.minY} width={view.w} height={view.h} fill="url(#grid)" />

        {pieces.map((p, i) => {
          const pts = worldCorners(p).map(([x, y]) => `${x},${y}`).join(" ");
          const b = pieceBounds(p);
          return (
            <g key={i} onPointerDown={(e) => onPointerDown(e, i)} style={{ cursor: "move" }}>
              <polygon
                points={pts}
                fill={i === selected ? "#fcd34d" : "#f5e6c8"}
                stroke={i === selected ? "#b45309" : "#1f2937"}
                strokeWidth={0.18}
              />
              <text x={(b.minX + b.maxX) / 2} y={(b.minY + b.maxY) / 2} fontSize={1.1} textAnchor="middle" fill="#475569">
                {p.pieceKind === "right_triangle" ? `${p.legAFt ?? 0}×${p.legBFt ?? 0}` : `${p.lengthFt ?? 0}×${p.widthFt ?? 0}`}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {sel ? (
          <>
            <span className="font-medium text-slate-700">Selected: {dims(sel)} · rot {sel.rotationDeg}°</span>
            <button onClick={rotateSelected} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">Rotate 90°</button>
            <button onClick={removeSelected} className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>
          </>
        ) : (
          <span className="text-xs text-slate-400">Add a piece, then drag to position. Edges snap to neighbors.</span>
        )}
      </div>
    </div>
  );
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded border border-slate-300 bg-white px-2 py-1 font-medium text-slate-600 hover:border-brand hover:bg-cyan-50">
      {children}
    </button>
  );
}

/** Inline modal for custom rectangle/triangle dimensions (replaces window.prompt). */
function CustomPieceModal({
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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4" role="dialog" aria-label="Custom piece">
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

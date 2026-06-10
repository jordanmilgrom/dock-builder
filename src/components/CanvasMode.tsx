"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DockPiece, Rotation } from "@/engine";
import { triangleVertices } from "@/lib/view3d";
import {
  fitBbox,
  notchFactor,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAround,
  type Bbox,
  type Transform,
} from "@/lib/scaleToFit";
import {
  resizeRect,
  resizeTriangle,
  snapRect,
  snapTriangle,
  type Handle,
} from "@/lib/resizeHandles";
import { svgPoint } from "@/lib/svgPoint";

const POS_SNAP_FT = 1; // drag reposition grid

function rot(x: number, y: number, deg: Rotation): [number, number] {
  switch (deg) {
    case 90: return [-y, x];
    case 180: return [-x, -y];
    case 270: return [y, -x];
    default: return [x, y];
  }
}
/** Inverse rotation — world delta → the piece's local axes. */
function invRot(x: number, y: number, deg: Rotation): [number, number] {
  return rot(x, y, ((360 - deg) % 360) as Rotation);
}

function worldCorners(p: DockPiece): [number, number][] {
  if (p.pieceKind === "right_triangle") {
    return triangleVertices(p.legAFt ?? 0, p.legBFt ?? 0, p.posX, p.posY, p.rotationDeg);
  }
  const L = p.lengthFt ?? 0, W = p.widthFt ?? 0;
  return ([[0, 0], [L, 0], [L, W], [0, W]] as [number, number][]).map(([x, y]) => {
    const [rx, ry] = rot(x, y, p.rotationDeg);
    return [p.posX + rx, p.posY + ry];
  });
}

function pieceBbox(p: DockPiece): Bbox {
  const c = worldCorners(p);
  const xs = c.map((q) => q[0]), ys = c.map((q) => q[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function unionBbox(pieces: DockPiece[]): Bbox {
  if (pieces.length === 0) return { minX: 0, minY: 0, maxX: 24, maxY: 12 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pieces) {
    const b = pieceBbox(p);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  return { minX, minY, maxX, maxY };
}

const snap = (v: number, step: number) => Math.round(v / step) * step;

/** Local-frame anchor corner (the point held fixed during a resize). */
function rectAnchorLocal(handle: Handle, L: number, W: number): [number, number] {
  const west = handle === "nw" || handle === "w" || handle === "sw";
  const north = handle === "nw" || handle === "n" || handle === "ne";
  return [west ? L : 0, north ? W : 0];
}

type Action =
  | { kind: "pan"; lastX: number; lastY: number }
  | { kind: "move"; idx: number; startWorld: { x: number; y: number }; origX: number; origY: number }
  | { kind: "resize"; idx: number; handle: Handle; startWorld: { x: number; y: number }; orig: DockPiece }
  | { kind: "rotate"; idx: number; moved: boolean }
  | null;

/**
 * Canvas editor (Phase 7) — the full-pane SVG that replaces DockPiecesCanvas.
 * Controlled: pieces + selection come from the parent so the Properties panel
 * stays in sync. Pan/zoom/select/drag/resize/rotate live here; all the math is
 * the pure libs (scaleToFit / resizeHandles).
 */
export default function CanvasMode({
  pieces,
  selectedIndex,
  onChange,
  onSelect,
  primaryColor = "#0e7490",
}: {
  pieces: DockPiece[];
  selectedIndex: number | null;
  onChange: (pieces: DockPiece[]) => void;
  onSelect: (idx: number | null) => void;
  primaryColor?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });
  const [transform, setTransform] = useState<Transform>({ translate: { x: 0, y: 0 }, scale: 12 });
  const action = useRef<Action>(null);
  const spaceHeld = useRef(false);
  const prevCount = useRef(-1);

  const fit = useCallback(() => {
    setTransform(fitBbox(unionBbox(pieces), size));
  }, [pieces, size]);

  // Measure the pane.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth || 800, height: el.clientHeight || 500 });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth || 800, height: el.clientHeight || 500 });
    return () => ro.disconnect();
  }, []);

  // Auto-fit on mount and whenever a piece is added/removed.
  useEffect(() => {
    if (pieces.length !== prevCount.current) {
      prevCount.current = pieces.length;
      setTransform(fitBbox(unionBbox(pieces), size));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces.length, size.width, size.height]);

  // Space toggles pan-drag; ESC deselects.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = true;
      if (e.key === "Escape") onSelect(null);
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") spaceHeld.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [onSelect]);

  // Always measure against the stable <svg> ref — NEVER e.currentTarget, which is
  // the clicked child on pointerdown and null on a stashed move/up event (the
  // root cause of pieces flying to NaN on drag/resize).
  function svgPt(e: React.PointerEvent | React.WheelEvent): { x: number; y: number } {
    return svgPoint(e.clientX, e.clientY, svgRef.current?.getBoundingClientRect() ?? null);
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setTransform((t) => zoomAround(t, notchFactor(e.deltaY), svgPt(e)));
  }

  function startPan(e: React.PointerEvent) {
    action.current = { kind: "pan", lastX: e.clientX, lastY: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onBgPointerDown(e: React.PointerEvent) {
    if (e.button === 1 || spaceHeld.current) { startPan(e); return; }
    onSelect(null);
  }

  function onPiecePointerDown(e: React.PointerEvent, idx: number) {
    e.stopPropagation();
    if (e.button === 1 || spaceHeld.current) { startPan(e); return; }
    onSelect(idx);
    const p = pieces[idx]!;
    const sp = svgPt(e);
    action.current = {
      kind: "move", idx, startWorld: screenToWorld(transform, sp.x, sp.y), origX: p.posX, origY: p.posY,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onHandlePointerDown(e: React.PointerEvent, idx: number, handle: Handle) {
    e.stopPropagation();
    const sp = svgPt(e);
    action.current = {
      kind: "resize", idx, handle, startWorld: screenToWorld(transform, sp.x, sp.y), orig: pieces[idx]!,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onRotatePointerDown(e: React.PointerEvent, idx: number) {
    e.stopPropagation();
    action.current = { kind: "rotate", idx, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const a = action.current;
    if (!a) return;
    if (a.kind === "pan") {
      setTransform((t) => panBy(t, e.clientX - a.lastX, e.clientY - a.lastY));
      a.lastX = e.clientX; a.lastY = e.clientY;
      return;
    }
    const sp = svgPt(e);
    const w = screenToWorld(transform, sp.x, sp.y);
    if (a.kind === "move") {
      update(a.idx, {
        posX: snap(a.origX + (w.x - a.startWorld.x), POS_SNAP_FT),
        posY: snap(a.origY + (w.y - a.startWorld.y), POS_SNAP_FT),
      });
    } else if (a.kind === "resize") {
      applyResize(a, w);
    } else if (a.kind === "rotate") {
      a.moved = true;
      const p = pieces[a.idx]!;
      const b = pieceBbox(p);
      const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
      const deg = (Math.atan2(w.y - cy, w.x - cx) * 180) / Math.PI + 90;
      update(a.idx, { rotationDeg: (((Math.round(deg) % 360) + 360) % 360) as number as Rotation });
    }
  }

  function onPointerUp() {
    const a = action.current;
    action.current = null;
    if (!a) return;
    if (a.kind === "resize") {
      const p = pieces[a.idx];
      if (p) {
        if (p.pieceKind === "right_triangle") {
          const s = snapTriangle({ posX: p.posX, posY: p.posY, legAFt: p.legAFt ?? 0, legBFt: p.legBFt ?? 0 });
          update(a.idx, { legAFt: s.legAFt, legBFt: s.legBFt });
        } else {
          const s = snapRect({ posX: p.posX, posY: p.posY, lengthFt: p.lengthFt ?? 0, widthFt: p.widthFt ?? 0 }, a.handle);
          update(a.idx, { posX: s.posX, posY: s.posY, lengthFt: s.lengthFt, widthFt: s.widthFt });
        }
      }
    } else if (a.kind === "rotate") {
      const p = pieces[a.idx];
      if (p) update(a.idx, { rotationDeg: (a.moved ? (snap(p.rotationDeg, 90) % 360) : ((p.rotationDeg + 90) % 360)) as Rotation });
    }
    // If a drag/resize/rotate left the piece off-screen, re-frame so it never vanishes.
    if (a.kind !== "pan" && pieces[a.idx] && isOffscreen(pieceBbox(pieces[a.idx]!))) fit();
  }

  /** True when a world bbox falls entirely outside the current viewport. */
  function isOffscreen(b: Bbox): boolean {
    const tl = worldToScreen(transform, b.minX, b.minY);
    const br = worldToScreen(transform, b.maxX, b.maxY);
    return br.x < 0 || tl.x > size.width || br.y < 0 || tl.y > size.height;
  }

  function update(idx: number, patch: Partial<DockPiece>) {
    onChange(pieces.map((p, i) => (i === idx ? ({ ...p, ...patch } as DockPiece) : p)));
  }

  function applyResize(a: Extract<Action, { kind: "resize" }>, world: { x: number; y: number }) {
    const orig = a.orig;
    const [ldx, ldy] = invRot(world.x - a.startWorld.x, world.y - a.startWorld.y, orig.rotationDeg);
    if (orig.pieceKind === "right_triangle") {
      const t = resizeTriangle(
        { posX: 0, posY: 0, legAFt: orig.legAFt ?? 0, legBFt: orig.legBFt ?? 0 },
        a.handle, ldx, ldy,
      );
      update(a.idx, { legAFt: t.legAFt, legBFt: t.legBFt });
      return;
    }
    const L = orig.lengthFt ?? 0, W = orig.widthFt ?? 0;
    const r = resizeRect({ posX: 0, posY: 0, lengthFt: L, widthFt: W }, a.handle, ldx, ldy);
    // Keep the anchor corner fixed in world space → recompute the pivot.
    const [abx, aby] = rectAnchorLocal(a.handle, L, W);
    const [aax, aay] = rectAnchorLocal(a.handle, r.lengthFt, r.widthFt);
    const [rbx, rby] = rot(abx, aby, orig.rotationDeg);
    const [rax, ray] = rot(aax, aay, orig.rotationDeg);
    update(a.idx, {
      lengthFt: r.lengthFt, widthFt: r.widthFt,
      posX: orig.posX + rbx - rax, posY: orig.posY + rby - ray,
    });
  }

  const wts = (x: number, y: number) => worldToScreen(transform, x, y);
  const grid = buildGrid(transform, size);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-sky-50">
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        className="block touch-none select-none"
        style={{ cursor: spaceHeld.current ? "grab" : "default" }}
        onPointerDown={onBgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        {/* world-aligned grid */}
        <g stroke="#cbd5e1" strokeWidth={1}>
          {grid.v.map((x, i) => (<line key={`v${i}`} x1={x} y1={0} x2={x} y2={size.height} opacity={0.5} />))}
          {grid.h.map((y, i) => (<line key={`h${i}`} x1={0} y1={y} x2={size.width} y2={y} opacity={0.5} />))}
        </g>

        {pieces.map((p, i) => {
          const pts = worldCorners(p).map(([x, y]) => { const s = wts(x, y); return `${s.x},${s.y}`; }).join(" ");
          const b = pieceBbox(p);
          const c = wts((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
          const isSel = i === selectedIndex;
          const isWheel = p.construction === "wheel" && p.pieceKind === "rectangle";
          return (
            <g key={i} onPointerDown={(e) => onPiecePointerDown(e, i)} style={{ cursor: "move" }}>
              <polygon
                points={pts}
                fill={isWheel ? primaryColor : isSel ? "#fde68a" : "#f5e6c8"}
                fillOpacity={isWheel ? 0.5 : 1}
                stroke={isSel ? primaryColor : "#1f2937"}
                strokeWidth={isSel ? 2.5 : 1.5}
              />
              {isWheel && <WheelGlyphs piece={p} wts={wts} scale={transform.scale} color={primaryColor} />}
              <text x={c.x} y={c.y} fontSize={12} textAnchor="middle" dominantBaseline="middle" fill="#1f2937">
                {p.pieceKind === "right_triangle" ? `${p.legAFt ?? 0}×${p.legBFt ?? 0}` : `${p.lengthFt ?? 0}×${p.widthFt ?? 0}`}
              </text>
            </g>
          );
        })}

        {selectedIndex != null && pieces[selectedIndex] && (
          <Handles
            piece={pieces[selectedIndex]!}
            wts={wts}
            color={primaryColor}
            onHandleDown={(e, h) => onHandlePointerDown(e, selectedIndex, h)}
            onRotateDown={(e) => onRotatePointerDown(e, selectedIndex)}
          />
        )}
      </svg>

      {/* zoom indicator + fit-to-view */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 text-xs">
        <span className="rounded bg-white/90 px-2 py-1 font-medium text-slate-600 shadow">
          {transform.scale.toFixed(1)} px/ft
        </span>
        <button
          onClick={fit}
          className="rounded bg-white/90 px-2 py-1 font-medium text-slate-700 shadow hover:bg-white"
        >
          Fit to view
        </button>
      </div>
    </div>
  );
}

/**
 * Wheel-piece glyphs (Phase 8): two circles at the roll-in wheel positions
 * (piece-local (0, w/2) and (length, w/2), radius ∝ width/8) plus thin bracket
 * arms toward the deck centerline. Drawn at full tenant-primary over the 50%
 * frame fill.
 */
function WheelGlyphs({
  piece,
  wts,
  scale,
  color,
}: {
  piece: DockPiece;
  wts: (x: number, y: number) => { x: number; y: number };
  scale: number;
  color: string;
}) {
  const L = piece.lengthFt ?? 0, W = piece.widthFt ?? 0;
  const rFt = Math.max(0.3, W / 8);
  const deg = piece.rotationDeg;
  const local: [number, number][] = [[0, W / 2], [L, W / 2]];
  const center: [number, number] = [L / 2, W / 2];
  const cs = (() => { const [rx, ry] = rot(center[0], center[1], deg); return wts(piece.posX + rx, piece.posY + ry); })();
  return (
    <g pointerEvents="none">
      {local.map(([lx, ly], k) => {
        const [rx, ry] = rot(lx, ly, deg);
        const s = wts(piece.posX + rx, piece.posY + ry);
        return (
          <g key={k}>
            <line x1={s.x} y1={s.y} x2={cs.x} y2={cs.y} stroke={color} strokeWidth={1.5} />
            <circle cx={s.x} cy={s.y} r={Math.max(3, rFt * scale)} fill={color} stroke="#1f2937" strokeWidth={1} />
          </g>
        );
      })}
    </g>
  );
}

/** Selection chrome: 8 resize handles (rect) / 3 corner handles (triangle) + a rotation handle. */
function Handles({
  piece,
  wts,
  color,
  onHandleDown,
  onRotateDown,
}: {
  piece: DockPiece;
  wts: (x: number, y: number) => { x: number; y: number };
  color: string;
  onHandleDown: (e: React.PointerEvent, h: Handle) => void;
  onRotateDown: (e: React.PointerEvent) => void;
}) {
  const corners = worldCorners(piece);
  // World handle points keyed by Handle id.
  let points: [Handle, number, number][];
  if (piece.pieceKind === "right_triangle") {
    points = [
      ["nw", corners[0]![0], corners[0]![1]],
      ["e", corners[1]![0], corners[1]![1]],
      ["s", corners[2]![0], corners[2]![1]],
    ];
  } else {
    const [v0, v1, v2, v3] = corners as [number, number][];
    const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    points = [
      ["nw", v0![0], v0![1]], ["ne", v1![0], v1![1]], ["se", v2![0], v2![1]], ["sw", v3![0], v3![1]],
      ["n", ...mid(v0!, v1!)], ["e", ...mid(v1!, v2!)], ["s", ...mid(v2!, v3!)], ["w", ...mid(v3!, v0!)],
    ];
  }
  // Rotation handle: 16 px above the top edge midpoint.
  const top = piece.pieceKind === "right_triangle"
    ? ([(corners[0]![0] + corners[1]![0]) / 2, (corners[0]![1] + corners[1]![1]) / 2] as [number, number])
    : ([(corners[0]![0] + corners[1]![0]) / 2, (corners[0]![1] + corners[1]![1]) / 2] as [number, number]);
  const topS = wts(top[0], top[1]);

  return (
    <g>
      <line x1={topS.x} y1={topS.y} x2={topS.x} y2={topS.y - 16} stroke={color} strokeWidth={1.5} />
      <circle
        cx={topS.x} cy={topS.y - 20} r={6} fill="white" stroke={color} strokeWidth={2}
        style={{ cursor: "grab" }} onPointerDown={onRotateDown}
      />
      {points.map(([h, x, y]) => {
        const s = wts(x, y);
        return (
          <rect
            key={h} x={s.x - 5} y={s.y - 5} width={10} height={10}
            fill="white" stroke={color} strokeWidth={2}
            style={{ cursor: "pointer" }}
            onPointerDown={(e) => onHandleDown(e, h)}
          />
        );
      })}
    </g>
  );
}

/** Build viewport-spanning grid lines at an adaptive (≥8 px) world step. */
function buildGrid(t: Transform, size: { width: number; height: number }): { v: number[]; h: number[] } {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200];
  const stepFt = steps.find((s) => s * t.scale >= 8) ?? 200;
  const tl = screenToWorld(t, 0, 0);
  const br = screenToWorld(t, size.width, size.height);
  const v: number[] = [];
  const h: number[] = [];
  for (let x = Math.ceil(tl.x / stepFt) * stepFt; x <= br.x; x += stepFt) v.push(worldToScreen(t, x, 0).x);
  for (let y = Math.ceil(tl.y / stepFt) * stepFt; y <= br.y; y += stepFt) h.push(worldToScreen(t, 0, y).y);
  return { v, h };
}

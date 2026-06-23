"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DockConfig, DockPiece, Rotation } from "@/engine";
import { triangleVertices } from "@/lib/view3d";
import {
  fitBbox,
  notchFactor,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAround,
  clampScale,
  type Bbox,
  type Transform,
} from "@/lib/scaleToFit";
import { resizeRect, resizeTriangle, snapRect, snapTriangle, type Handle } from "@/lib/resizeHandles";
import { svgPoint } from "@/lib/svgPoint";
import { handleUpDir, angleDeg, applyRotation, snapAngle } from "@/lib/rotationMath";
import { marqueeBbox, marqueeSelect } from "@/lib/selection";
import { defaultPieceForTool, drawnPiece, isDrawableDrag, type DrawTool } from "@/lib/clickDragDraw";
import { gangwayPreviewRect } from "@/lib/gangwayPreview";

const POS_SNAP_FT = 1;

function rot(x: number, y: number, deg: Rotation): [number, number] {
  switch (deg) {
    case 90: return [-y, x];
    case 180: return [-x, -y];
    case 270: return [y, -x];
    default: return [x, y];
  }
}
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

function rectAnchorLocal(handle: Handle, L: number, W: number): [number, number] {
  const west = handle === "nw" || handle === "w" || handle === "sw";
  const north = handle === "nw" || handle === "n" || handle === "ne";
  return [west ? L : 0, north ? W : 0];
}

type Action =
  | { kind: "pan"; lastX: number; lastY: number }
  | { kind: "move"; idx: number; startWorld: { x: number; y: number }; orig: { i: number; x: number; y: number }[] }
  | { kind: "resize"; idx: number; handle: Handle; startWorld: { x: number; y: number }; orig: DockPiece }
  | { kind: "rotate"; idx: number; pivot: { x: number; y: number }; startCursor: { x: number; y: number }; orig: number; moved: boolean }
  | { kind: "marquee"; start: { x: number; y: number }; cur: { x: number; y: number } }
  | { kind: "draw"; tool: DrawTool; start: { x: number; y: number }; cur: { x: number; y: number } }
  | null;

/**
 * Canvas editor (Phase 7 + 10). Multi-select, marquee, armed click-drag drawing,
 * rotation handle that rotates WITH the piece, zoom buttons, and a read-only
 * gangway placeholder. Controlled by the parent (pieces + selection set).
 */
export default function CanvasMode({
  pieces,
  config,
  selectedIndices,
  onChange,
  onSelectionChange,
  primaryColor = "#0e7490",
  armedTool = null,
  onDrawn,
  onDisarm,
  onContextMenu,
}: {
  pieces: DockPiece[];
  config: DockConfig;
  selectedIndices: number[];
  onChange: (pieces: DockPiece[]) => void;
  onSelectionChange: (indices: number[]) => void;
  primaryColor?: string;
  armedTool?: DrawTool | null;
  onDrawn?: (piece: DockPiece) => void;
  onDisarm?: () => void;
  onContextMenu?: (info: { clientX: number; clientY: number; onPiece: boolean; index: number | null }) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });
  const [transform, setTransform] = useState<Transform>({ translate: { x: 0, y: 0 }, scale: 12 });
  const [, forceTick] = useState(0);
  const action = useRef<Action>(null);
  const spaceHeld = useRef(false);
  const prevCount = useRef(-1);
  const selected = new Set(selectedIndices);
  const primary = selectedIndices.length ? selectedIndices[selectedIndices.length - 1]! : null;

  const fit = useCallback(() => setTransform(fitBbox(unionBbox(pieces), size)), [pieces, size]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth || 800, height: el.clientHeight || 500 }));
    ro.observe(el);
    setSize({ width: el.clientWidth || 800, height: el.clientHeight || 500 });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (pieces.length !== prevCount.current) {
      prevCount.current = pieces.length;
      setTransform(fitBbox(unionBbox(pieces), size));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces.length, size.width, size.height]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = true;
      if (e.key === "f" || e.key === "F") { if (!(e.metaKey || e.ctrlKey)) fit(); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") spaceHeld.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [fit]);

  function svgPt(e: React.PointerEvent | React.WheelEvent): { x: number; y: number } {
    return svgPoint(e.clientX, e.clientY, svgRef.current?.getBoundingClientRect() ?? null);
  }
  function worldPt(e: React.PointerEvent): { x: number; y: number } {
    const sp = svgPt(e);
    return screenToWorld(transform, sp.x, sp.y);
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
    if (e.button === 2) return; // right-click handled by onContextMenu
    if (e.button === 1 || spaceHeld.current) { startPan(e); return; }
    const w = worldPt(e);
    if (armedTool) {
      action.current = { kind: "draw", tool: armedTool, start: w, cur: w };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    // Empty-canvas drag → marquee select.
    action.current = { kind: "marquee", start: w, cur: w };
    if (!e.shiftKey) onSelectionChange([]);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    forceTick((n) => n + 1);
  }

  function onPiecePointerDown(e: React.PointerEvent, idx: number) {
    if (e.button === 2) { onContextMenu?.({ clientX: e.clientX, clientY: e.clientY, onPiece: true, index: idx }); return; }
    e.stopPropagation();
    if (e.button === 1 || spaceHeld.current) { startPan(e); return; }
    if (armedTool) { onBgPointerDown(e); return; }
    const nextSel = e.shiftKey ? toggleIndices(selectedIndices, idx) : selected.has(idx) ? selectedIndices : [idx];
    onSelectionChange(nextSel);
    const moveSet = new Set(nextSel);
    const orig = pieces.map((p, i) => ({ i, x: p.posX, y: p.posY })).filter((o) => moveSet.has(o.i));
    action.current = { kind: "move", idx, startWorld: worldPt(e), orig };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onHandlePointerDown(e: React.PointerEvent, idx: number, handle: Handle) {
    e.stopPropagation();
    action.current = { kind: "resize", idx, handle, startWorld: worldPt(e), orig: pieces[idx]! };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onRotatePointerDown(e: React.PointerEvent, idx: number) {
    e.stopPropagation();
    const p = pieces[idx]!;
    const b = pieceBbox(p);
    action.current = {
      kind: "rotate", idx,
      pivot: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
      startCursor: worldPt(e), orig: p.rotationDeg, moved: false,
    };
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
    const w = worldPt(e);
    if (a.kind === "move") {
      const dx = snap(w.x - a.startWorld.x, POS_SNAP_FT);
      const dy = snap(w.y - a.startWorld.y, POS_SNAP_FT);
      const byIdx = new Map(a.orig.map((o) => [o.i, o]));
      onChange(pieces.map((p, i) => byIdx.has(i) ? { ...p, posX: byIdx.get(i)!.x + dx, posY: byIdx.get(i)!.y + dy } : p));
    } else if (a.kind === "resize") {
      applyResize(a, w);
    } else if (a.kind === "rotate") {
      a.moved = true;
      const delta = angleDeg(a.pivot, w) - angleDeg(a.pivot, a.startCursor);
      update(a.idx, { rotationDeg: Math.round(applyRotation(a.orig, delta)) as number as Rotation });
    } else if (a.kind === "marquee" || a.kind === "draw") {
      a.cur = w;
      forceTick((n) => n + 1);
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
      if (p) update(a.idx, { rotationDeg: (snapAngle(p.rotationDeg) % 360) as Rotation });
    } else if (a.kind === "marquee") {
      const mb = marqueeBbox(a.start, a.cur);
      const hits = marqueeSelect(pieces.map((p, i) => ({ id: String(i), bbox: pieceBbox(p) })), mb);
      const idxs = [...hits].map((s) => Number(s));
      if (idxs.length) onSelectionChange(idxs);
      forceTick((n) => n + 1);
    } else if (a.kind === "draw") {
      // Drag → custom dimensions; bare click → default-size piece at that point.
      onDrawn?.(isDrawableDrag(a.start, a.cur) ? drawnPiece(a.tool, a.start, a.cur) : defaultPieceForTool(a.tool, a.start));
      onDisarm?.();
      forceTick((n) => n + 1);
    }
    if (a.kind !== "pan" && a.kind !== "marquee" && a.kind !== "draw" && pieces[a.idx] && isOffscreen(pieceBbox(pieces[a.idx]!))) fit();
  }

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
      const t = resizeTriangle({ posX: 0, posY: 0, legAFt: orig.legAFt ?? 0, legBFt: orig.legBFt ?? 0 }, a.handle, ldx, ldy);
      update(a.idx, { legAFt: t.legAFt, legBFt: t.legBFt });
      return;
    }
    const L = orig.lengthFt ?? 0, W = orig.widthFt ?? 0;
    const r = resizeRect({ posX: 0, posY: 0, lengthFt: L, widthFt: W }, a.handle, ldx, ldy);
    const [abx, aby] = rectAnchorLocal(a.handle, L, W);
    const [aax, aay] = rectAnchorLocal(a.handle, r.lengthFt, r.widthFt);
    const [rbx, rby] = rot(abx, aby, orig.rotationDeg);
    const [rax, ray] = rot(aax, aay, orig.rotationDeg);
    update(a.idx, { lengthFt: r.lengthFt, widthFt: r.widthFt, posX: orig.posX + rbx - rax, posY: orig.posY + rby - ray });
  }

  const wts = (x: number, y: number) => worldToScreen(transform, x, y);
  const grid = buildGrid(transform, size);
  const live = action.current;
  const gangway = gangwayPreviewRect(config, unionBbox(pieces));

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-sky-50">
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        className="block touch-none select-none"
        style={{ cursor: armedTool ? "crosshair" : spaceHeld.current ? "grab" : "default" }}
        onPointerDown={onBgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu?.({ clientX: e.clientX, clientY: e.clientY, onPiece: false, index: null }); }}
      >
        <g stroke="#cbd5e1" strokeWidth={1}>
          {grid.v.map((x, i) => (<line key={`v${i}`} x1={x} y1={0} x2={x} y2={size.height} opacity={0.5} />))}
          {grid.h.map((y, i) => (<line key={`h${i}`} x1={0} y1={y} x2={size.width} y2={y} opacity={0.5} />))}
        </g>

        {/* Gangway placeholder — read-only Phase-11 preview. */}
        {gangway && (() => {
          const a = wts(gangway.posX, gangway.posY);
          const c = wts(gangway.posX + gangway.lengthFt, gangway.posY + gangway.widthFt);
          return (
            <g pointerEvents="none">
              <rect x={Math.min(a.x, c.x)} y={Math.min(a.y, c.y)} width={Math.abs(c.x - a.x)} height={Math.abs(c.y - a.y)}
                fill="#94a3b8" fillOpacity={0.25} stroke="#64748b" strokeWidth={1.5} strokeDasharray="6 4" />
              <text x={(a.x + c.x) / 2} y={(a.y + c.y) / 2} fontSize={11} textAnchor="middle" dominantBaseline="middle" fill="#475569">{gangway.label}</text>
            </g>
          );
        })()}

        {pieces.map((p, i) => {
          const pts = worldCorners(p).map(([x, y]) => { const s = wts(x, y); return `${s.x},${s.y}`; }).join(" ");
          const b = pieceBbox(p);
          const c = wts((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
          const isSel = selected.has(i);
          const cons = p.constructions ?? (p.construction ? [p.construction] : []);
          const isWheel = cons.includes("wheel") && p.pieceKind === "rectangle";
          return (
            <g key={i} onPointerDown={(e) => onPiecePointerDown(e, i)} style={{ cursor: "move" }}>
              <polygon points={pts}
                fill={isWheel ? primaryColor : isSel ? "#fde68a" : "#f5e6c8"}
                fillOpacity={isWheel ? 0.5 : 1}
                stroke={isSel ? primaryColor : "#1f2937"} strokeWidth={isSel ? 2.5 : 1.5} />
              {isWheel && <WheelGlyphs piece={p} wts={wts} scale={transform.scale} color={primaryColor} />}
              <text x={c.x} y={c.y} fontSize={12} textAnchor="middle" dominantBaseline="middle" fill="#1f2937">
                {p.pieceKind === "right_triangle" ? `${p.legAFt ?? 0}×${p.legBFt ?? 0}` : `${p.lengthFt ?? 0}×${p.widthFt ?? 0}`}
              </text>
            </g>
          );
        })}

        {primary != null && pieces[primary] && (
          <Handles piece={pieces[primary]!} wts={wts} color={primaryColor}
            onHandleDown={(e, h) => onHandlePointerDown(e, primary, h)}
            onRotateDown={(e) => onRotatePointerDown(e, primary)} />
        )}

        {/* Marquee / draw preview. */}
        {(live?.kind === "marquee" || live?.kind === "draw") && (() => {
          const a = wts(live.start.x, live.start.y);
          const c = wts(live.cur.x, live.cur.y);
          const isDraw = live.kind === "draw";
          return (
            <rect x={Math.min(a.x, c.x)} y={Math.min(a.y, c.y)} width={Math.abs(c.x - a.x)} height={Math.abs(c.y - a.y)}
              fill={isDraw ? "#fde68a" : primaryColor} fillOpacity={isDraw ? 0.4 : 0.12}
              stroke={isDraw ? "#1f2937" : primaryColor} strokeWidth={1} strokeDasharray={isDraw ? undefined : "4 3"} pointerEvents="none" />
          );
        })()}
      </svg>

      {armedTool && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded bg-slate-900/80 px-3 py-1 text-xs text-white shadow">
          Drag to draw a {armedTool.replace("_", " ")} · Esc to cancel
        </div>
      )}

      {/* Zoom controls. */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 text-xs">
        <span className="rounded bg-white/90 px-2 py-1 font-medium text-slate-600 shadow">{transform.scale.toFixed(1)} px/ft</span>
        <div className="flex overflow-hidden rounded shadow">
          <ZoomBtn title="Zoom out" onClick={() => setTransform((t) => zoomAround(t, 1 / 1.1, { x: size.width / 2, y: size.height / 2 }))}>−</ZoomBtn>
          <ZoomBtn title="Reset to 10 px/ft" onClick={() => setTransform((t) => ({ ...t, scale: clampScale(10) }))}>100%</ZoomBtn>
          <ZoomBtn title="Zoom in" onClick={() => setTransform((t) => zoomAround(t, 1.1, { x: size.width / 2, y: size.height / 2 }))}>+</ZoomBtn>
          <ZoomBtn title="Fit to view" onClick={fit}>Fit</ZoomBtn>
        </div>
      </div>
    </div>
  );
}

function toggleIndices(current: number[], idx: number): number[] {
  return current.includes(idx) ? current.filter((i) => i !== idx) : [...current, idx];
}

function ZoomBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} className="h-8 min-w-8 bg-white/90 px-2 font-medium text-slate-700 hover:bg-white">{children}</button>
  );
}

function WheelGlyphs({ piece, wts, scale, color }: { piece: DockPiece; wts: (x: number, y: number) => { x: number; y: number }; scale: number; color: string }) {
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

/** Selection chrome — handles + a rotation handle that rotates WITH the piece. */
function Handles({ piece, wts, color, onHandleDown, onRotateDown }: {
  piece: DockPiece;
  wts: (x: number, y: number) => { x: number; y: number };
  color: string;
  onHandleDown: (e: React.PointerEvent, h: Handle) => void;
  onRotateDown: (e: React.PointerEvent) => void;
}) {
  const corners = worldCorners(piece);
  let points: [Handle, number, number][];
  if (piece.pieceKind === "right_triangle") {
    points = [["nw", corners[0]![0], corners[0]![1]], ["e", corners[1]![0], corners[1]![1]], ["s", corners[2]![0], corners[2]![1]]];
  } else {
    const [v0, v1, v2, v3] = corners as [number, number][];
    const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    points = [
      ["nw", v0![0], v0![1]], ["ne", v1![0], v1![1]], ["se", v2![0], v2![1]], ["sw", v3![0], v3![1]],
      ["n", ...mid(v0!, v1!)], ["e", ...mid(v1!, v2!)], ["s", ...mid(v2!, v3!)], ["w", ...mid(v3!, v0!)],
    ];
  }
  // Top-edge midpoint (world) + the piece's local "up" → handle rotates WITH piece.
  const topMid: [number, number] = [(corners[0]![0] + corners[1]![0]) / 2, (corners[0]![1] + corners[1]![1]) / 2];
  const topS = wts(topMid[0], topMid[1]);
  const up = handleUpDir(piece.rotationDeg); // screen-space unit "up" for this rotation
  const stemEnd = { x: topS.x + up.x * 16, y: topS.y + up.y * 16 };
  const knob = { x: topS.x + up.x * 22, y: topS.y + up.y * 22 };

  return (
    <g>
      <line x1={topS.x} y1={topS.y} x2={stemEnd.x} y2={stemEnd.y} stroke={color} strokeWidth={1.5} />
      <circle cx={knob.x} cy={knob.y} r={6} fill="white" stroke={color} strokeWidth={2} style={{ cursor: "grab" }} onPointerDown={onRotateDown} />
      {points.map(([h, x, y]) => {
        const s = wts(x, y);
        return (<rect key={h} x={s.x - 5} y={s.y - 5} width={10} height={10} fill="white" stroke={color} strokeWidth={2} style={{ cursor: "pointer" }} onPointerDown={(e) => onHandleDown(e, h)} />);
      })}
    </g>
  );
}

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

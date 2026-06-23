"use client";

import { useRef, useState } from "react";
import { DEFAULT_BATHYMETRY, depthAtDistanceFt, type Bathymetry } from "@/engine";
import { clampDepthHandle, clampShoreHeight } from "@/lib/siteModeDrag";
import { svgPoint } from "@/lib/svgPoint";

/**
 * Site tab (Phase 11) — a 2D side-view bathymetry editor. Shore on the left as a
 * sloped tan land block; water surface at y=0 with a translucent band below;
 * draggable depth handles along the lake bed (vertical drag, monotonic-clamped).
 */
export default function SiteMode({
  bathymetry,
  onChange,
}: {
  bathymetry: Bathymetry;
  onChange: (b: Bathymetry) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const W = 820, H = 460, padL = 90, padR = 40, padT = 40, padB = 60;

  const maxDist = Math.max(40, ...bathymetry.depthProfile.map((p) => p.distanceFromShoreFt));
  const maxDepth = Math.max(8, ...bathymetry.depthProfile.map((p) => p.depthFt)) + 2;
  const shoreH = bathymetry.shoreHeightFt;

  // World (distance, elevation) → screen. Elevation 0 = water line.
  const sx = (distFt: number) => padL + (distFt / maxDist) * (W - padL - padR);
  const topElev = shoreH + 1;
  const sy = (elevFt: number) => padT + ((topElev - elevFt) / (topElev + maxDepth)) * (H - padT - padB);

  const waterY = sy(0);
  const profile = bathymetry.depthProfile;

  function onMove(e: React.PointerEvent) {
    if (drag == null) return;
    const sp = svgPoint(e.clientX, e.clientY, svgRef.current?.getBoundingClientRect() ?? null);
    // Invert sy: elevFt = topElev - (sp.y - padT)/(H-padT-padB) * (topElev+maxDepth)
    const elevFt = topElev - ((sp.y - padT) / (H - padT - padB)) * (topElev + maxDepth);
    const depthFt = Math.max(0, -elevFt); // below water → positive depth
    onChange({ ...bathymetry, depthProfile: clampDepthHandle(profile, drag, depthFt) });
  }

  // Lake-bed polyline (interpolated curve).
  const bedPts: string[] = [];
  for (let d = 0; d <= maxDist; d += maxDist / 60) bedPts.push(`${sx(d)},${sy(-depthAtDistanceFt(bathymetry, d))}`);

  return (
    <div className="flex h-full w-full flex-col bg-sky-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Site profile — side view (← shore)</h3>
        <button onClick={() => onChange(structuredClone(DEFAULT_BATHYMETRY))} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
          Reset profile
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full flex-1 touch-none select-none rounded border border-slate-200 bg-white"
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
      >
        {/* sky */}
        <rect x={0} y={0} width={W} height={waterY} fill="#eaf4fb" />
        {/* water band */}
        <rect x={0} y={waterY} width={W} height={H - waterY} fill="#bfe0f5" opacity={0.6} />
        <line x1={0} y1={waterY} x2={W} y2={waterY} stroke="#0284c7" strokeWidth={1.5} />
        <text x={6} y={waterY - 4} fontSize={11} fill="#0284c7">water surface (0 ft)</text>

        {/* shore land block (left), sloped by landSlopePct */}
        <polygon
          points={`0,${sy(shoreH)} ${sx(0)},${sy(0)} ${sx(0)},${H} 0,${H}`}
          fill="#c5a572"
        />
        <text x={8} y={sy(shoreH) - 6} fontSize={11} fill="#7c5e34">Shore {shoreH.toFixed(1)} ft</text>

        {/* lake bed curve + fill */}
        <polyline points={bedPts.join(" ")} fill="none" stroke="#6b5436" strokeWidth={2} />
        <polygon points={`${sx(0)},${H} ${bedPts.join(" ")} ${sx(maxDist)},${H}`} fill="#6b5436" opacity={0.18} />

        {/* depth handles */}
        {profile.map((p, i) => {
          const cx = sx(p.distanceFromShoreFt), cy = sy(-p.depthFt);
          return (
            <g key={i}>
              <line x1={cx} y1={waterY} x2={cx} y2={cy} stroke="#64748b" strokeDasharray="3 3" />
              <circle cx={cx} cy={cy} r={7} fill="#fff" stroke="#0e7490" strokeWidth={2.5}
                style={{ cursor: "ns-resize" }} onPointerDown={(e) => { e.stopPropagation(); setDrag(i); (e.target as Element).setPointerCapture?.(e.pointerId); }} />
              <text x={cx} y={cy + 22} fontSize={10} textAnchor="middle" fill="#334155">
                {p.distanceFromShoreFt} ft → {p.depthFt.toFixed(1)} ft
              </text>
            </g>
          );
        })}

        <text x={W / 2} y={H - 12} fontSize={11} textAnchor="middle" fill="#64748b">distance from shore (ft) →</text>
      </svg>
      <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-slate-600 sm:grid-cols-4">
        <label className="flex items-center gap-1">
          Shore height
          <input type="number" step="0.5" value={shoreH} className="w-16 rounded border border-slate-300 px-1 py-0.5"
            onChange={(e) => onChange({ ...bathymetry, shoreHeightFt: clampShoreHeight(Number(e.target.value)) })} />
          ft
        </label>
        <span>Land slope: {bathymetry.landSlopePct}%</span>
        <span>Handles: drag vertically to set depth</span>
      </div>
    </div>
  );
}

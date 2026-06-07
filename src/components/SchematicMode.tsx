"use client";

import { useEffect, useMemo, useState } from "react";
import {
  endElevation,
  isometricView,
  planView,
  sideElevation,
  type DockConfig,
} from "@/engine";
import { drawingToSvg } from "@/lib/svg";

/**
 * Schematic view (Phase 7) — read-only. Defaults to a 2×2 grid of the four
 * engine blueprint views; clicking a tile expands it (the rest collapse into a
 * bottom thumbnail strip). X / Esc returns to the grid. Geometry is the engine's
 * (blueprint.ts) — nothing is computed here.
 */
export default function SchematicMode({ config }: { config: DockConfig }) {
  const views = useMemo(
    () => [planView(config), sideElevation(config), endElevation(config), isometricView(config)],
    [config],
  );
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (expanded != null && views[expanded]) {
    const v = views[expanded];
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <figure className="relative flex-1 overflow-hidden rounded border border-slate-200 bg-white p-3">
          <figcaption className="mb-1 text-xs font-medium text-slate-500">{v.title}</figcaption>
          <button
            onClick={() => setExpanded(null)}
            aria-label="Back to grid"
            className="absolute right-2 top-2 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
          >
            ✕
          </button>
          <div className="flex h-[calc(100%-1.5rem)] items-center justify-center overflow-auto" dangerouslySetInnerHTML={{ __html: drawingToSvg(v) }} />
        </figure>
        <div className="flex gap-2">
          {views.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setExpanded(i)}
              className={`h-16 w-24 overflow-hidden rounded border bg-white p-1 ${i === expanded ? "border-brand" : "border-slate-200 hover:border-slate-400"}`}
              title={t.title}
            >
              <div className="pointer-events-none h-full w-full overflow-hidden" dangerouslySetInnerHTML={{ __html: drawingToSvg(t) }} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-2 grid-rows-2 gap-3 overflow-auto p-4">
      {views.map((v, i) => (
        <button
          key={v.id}
          onClick={() => setExpanded(i)}
          className="flex flex-col overflow-hidden rounded border border-slate-200 bg-white p-2 text-left hover:border-brand"
        >
          <span className="mb-1 text-xs font-medium text-slate-500">{v.title}</span>
          <div className="flex-1 overflow-hidden" dangerouslySetInnerHTML={{ __html: drawingToSvg(v) }} />
        </button>
      ))}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import {
  endElevation,
  isometricView,
  planView,
  sideElevation,
  type DockConfig,
} from "@/engine";
import { drawingToSvg } from "@/lib/svg";

/** Renders the four engine-generated views as SVG. No geometry is computed here. */
export default function ViewsPanel({ config }: { config: DockConfig }) {
  const views = useMemo(
    () => [planView(config), sideElevation(config), endElevation(config), isometricView(config)],
    [config],
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {views.map((v) => (
        <figure key={v.id} className="rounded border border-slate-200 bg-white p-2">
          <figcaption className="mb-1 text-xs font-medium text-slate-500">{v.title}</figcaption>
          <div className="overflow-hidden rounded" dangerouslySetInnerHTML={{ __html: drawingToSvg(v) }} />
        </figure>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { DockConfig } from "@/engine";
import ViewsPanel from "./ViewsPanel";

// 3D viewer is client-only (Three.js touches window/WebGL) — never SSR it.
const DockView3D = dynamic(() => import("./DockView3D"), {
  ssr: false,
  loading: () => <div className="h-[360px] rounded border border-slate-200 bg-slate-50" />,
});

/**
 * Schematic / 3D toggle (§8 item 3). Starter tenants (enabled=false) only ever
 * see the flat schematic; Pro+ get the interactive 3D viewer.
 */
export default function Design3DToggle({
  config,
  enabled,
  primaryColor,
}: {
  config: DockConfig;
  enabled: boolean;
  primaryColor?: string;
}) {
  const [mode, setMode] = useState<"schematic" | "3d">("schematic");

  if (!enabled) return <ViewsPanel config={config} />;

  return (
    <div className="space-y-2">
      <div className="inline-flex overflow-hidden rounded border border-slate-300 text-xs">
        <button
          onClick={() => setMode("schematic")}
          className={`px-3 py-1 ${mode === "schematic" ? "bg-brand text-white" : "bg-white text-slate-600"}`}
        >
          Schematic
        </button>
        <button
          onClick={() => setMode("3d")}
          className={`px-3 py-1 ${mode === "3d" ? "bg-brand text-white" : "bg-white text-slate-600"}`}
        >
          3D
        </button>
      </div>
      {mode === "3d" ? <DockView3D config={config} {...(primaryColor ? { primaryColor } : {})} /> : <ViewsPanel config={config} />}
    </div>
  );
}

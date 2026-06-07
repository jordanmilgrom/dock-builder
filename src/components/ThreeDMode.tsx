"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { DockConfig } from "@/engine";

// 3D viewer is client-only (Three.js touches window/WebGL) — never SSR it.
const DockView3D = dynamic(() => import("./DockView3D"), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded border border-slate-200 bg-slate-50" />,
});

/**
 * 3D view (Phase 7) — read-only. The existing interactive DockView3D fills the
 * pane (orbit / zoom / pan preserved). "Reset camera" remounts the viewer, which
 * re-derives the default framing. Gated upstream by entitlements.fullThreeD.
 */
export default function ThreeDMode({ config, primaryColor }: { config: DockConfig; primaryColor?: string }) {
  const [resetKey, setResetKey] = useState(0);
  return (
    <div className="relative h-full w-full p-4">
      <div className="h-full w-full">
        <DockView3D key={resetKey} config={config} fill {...(primaryColor ? { primaryColor } : {})} />
      </div>
      <button
        onClick={() => setResetKey((k) => k + 1)}
        className="absolute bottom-6 right-6 rounded bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow hover:bg-white"
      >
        Reset camera
      </button>
    </div>
  );
}

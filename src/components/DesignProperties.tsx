"use client";

import {
  computeGangway,
  recommendDockType,
  type AccessoryType,
  type BottomType,
  type DeckingMaterial,
  type DockConfig,
  type FrameMaterial,
  type WaveExposure,
} from "@/engine";
import { DebouncedNum, Panel, Row, Sel } from "./PanelControls";

const BOTTOMS: BottomType[] = ["sand", "silt", "mud", "clay", "gravel", "rock"];
const EXPOSURES: WaveExposure[] = ["sheltered", "inland_lake", "open_water"];
const FRAMES: FrameMaterial[] = ["pt_pine", "aluminum", "galvanized_steel", "composite"];
const DECKINGS: DeckingMaterial[] = [
  "pt_5/4x6", "pt_2x6", "cedar_hardwood", "composite_5/4x6", "composite_2x6",
  "composite_trex", "pvc", "aluminum", "grating",
];
const SLOPES = ["1:8", "1:12", "1:20"];
const UNIT_ACCESSORIES: AccessoryType[] = [
  "ladder", "bench", "dock_box", "lighting", "power_pedestal", "mooring_whip", "canopy", "handrail",
];

export interface DesignActions {
  mode: "customer" | "builder";
  busy: boolean;
  dirty: boolean;
  version: number;
  submitted: boolean;
  hasErrors: boolean;
  captured: boolean;
  quotable: boolean;
  historyHref: string;
  status: string | null;
  onSave: () => void;
  onPdf: () => void;
  onSubmit: () => void;
  onSendQuote: () => void;
}

/**
 * Design-level editor (Phase 7). Site conditions, gangway, accessories,
 * materials, and the save/PDF/submit actions — the non-piece half of the old
 * Configurator form, reorganized into the right rail. No engine logic here.
 */
export default function DesignProperties({
  config,
  update,
  actions,
}: {
  config: DockConfig;
  update: (mut: (c: DockConfig) => DockConfig) => void;
  actions: DesignActions;
}) {
  const rec = recommendDockType(config.site);
  const setSite = (patch: Partial<DockConfig["site"]>) => update((c) => ({ ...c, site: { ...c.site, ...patch } }));
  const setOverall = (patch: Partial<DockConfig["overall"]>) => update((c) => ({ ...c, overall: { ...c.overall, ...patch } }));
  const setGangway = (patch: Partial<NonNullable<DockConfig["gangway"]>>) =>
    update((c) => ({ ...c, gangway: { present: c.gangway?.present ?? false, ...c.gangway, ...patch } }));

  const accQty = (type: AccessoryType) => config.accessories?.find((a) => a.type === type)?.qty ?? 0;
  const edgingFt = () => config.accessories?.find((a) => a.type === "edging")?.linearFt ?? 0;
  function setAcc(type: AccessoryType, patch: { qty?: number; linearFt?: number }) {
    update((c) => {
      const list = [...(c.accessories ?? [])];
      const i = list.findIndex((a) => a.type === type);
      const merged = { ...(i >= 0 ? list[i] : { type }), ...patch, type } as NonNullable<DockConfig["accessories"]>[number];
      const empty = (merged.qty ?? 0) <= 0 && (merged.linearFt ?? 0) <= 0;
      if (empty) { if (i >= 0) list.splice(i, 1); }
      else if (i >= 0) list[i] = merged;
      else list.push(merged);
      return { ...c, accessories: list };
    });
  }

  return (
    <>
      <div className="border-b border-slate-200 bg-cyan-50 px-4 py-2 text-xs text-cyan-900">
        Recommended for your shoreline: <span className="font-semibold">{rec.dockType}</span> dock
      </div>

      <Panel title="Site conditions">
        <fieldset>
          <legend className="text-sm text-slate-600">Water / wake exposure</legend>
          <div className="mt-1 flex flex-col gap-1">
            {EXPOSURES.map((x) => (
              <label key={x} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="exposure" checked={config.site.waveExposure === x} onChange={() => setSite({ waveExposure: x })} />
                {x.replace("_", " ")}
              </label>
            ))}
          </div>
        </fieldset>
        <Row>
          <DebouncedNum label="Water depth (ft)" value={config.site.depthAtEndLowWaterFt} onCommit={(n) => setSite({ depthAtEndLowWaterFt: n })} />
          <DebouncedNum label="Fluctuation (ft)" value={config.site.seasonalFluctuationFt} onCommit={(n) => setSite({ seasonalFluctuationFt: n })} />
        </Row>
        <Row>
          <DebouncedNum label="Shore height (ft)" value={config.site.shoreHeightAboveWaterFt} onCommit={(n) => setSite({ shoreHeightAboveWaterFt: n })} />
          <Sel label="Bottom (anchoring)" value={config.site.bottom} options={BOTTOMS} onChange={(v) => setSite({ bottom: v as BottomType })} />
        </Row>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={config.site.seasonalIce} onChange={(e) => setSite({ seasonalIce: e.target.checked })} />
          Seasonal ice
        </label>
      </Panel>

      <Panel title="Gangway">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={config.gangway?.present ?? false} onChange={(e) => setGangway({ present: e.target.checked })} />
          Include gangway
        </label>
        {config.gangway?.present && (() => {
          const mode = config.gangway.mode ?? (config.gangway.targetSlope ? "slope" : "length");
          const g = computeGangway(config.gangway, config.site.shoreHeightAboveWaterFt);
          return (
            <>
              <div className="inline-flex overflow-hidden rounded border border-slate-300 text-xs">
                <button onClick={() => setGangway({ mode: "length", lengthFt: config.gangway?.lengthFt ?? 12 })} className={`px-2 py-1 ${mode === "length" ? "bg-brand text-white" : "bg-white text-slate-600"}`}>Length</button>
                <button onClick={() => setGangway({ mode: "slope", targetSlope: config.gangway?.targetSlope ?? "1:12" })} className={`px-2 py-1 ${mode === "slope" ? "bg-brand text-white" : "bg-white text-slate-600"}`}>Target slope</button>
              </div>
              <Row>
                {mode === "length" ? (
                  <DebouncedNum label="Length (ft, 3–24)" value={config.gangway.lengthFt ?? 12} step={1} min={3} onCommit={(n) => setGangway({ lengthFt: n })} />
                ) : (
                  <Sel label="Target slope" value={config.gangway.targetSlope ?? "1:12"} options={SLOPES} onChange={(v) => setGangway({ targetSlope: v })} />
                )}
                <DebouncedNum label="Width (in)" value={config.gangway.widthIn ?? 48} step={1} onCommit={(n) => setGangway({ widthIn: n })} />
              </Row>
              <p className="text-xs text-slate-500">Slope {g.slopeLabel} ({g.slopePct}%)</p>
              {g.warning && <p className="text-xs text-amber-700">{g.warning}</p>}
            </>
          );
        })()}
      </Panel>

      <Panel title="Materials">
        <Row>
          <Sel label="Frame" value={config.overall.frameMaterial} options={FRAMES} onChange={(v) => setOverall({ frameMaterial: v as FrameMaterial })} />
          <Sel label="Decking" value={config.overall.deckingMaterial} options={DECKINGS} onChange={(v) => setOverall({ deckingMaterial: v as DeckingMaterial })} />
        </Row>
      </Panel>

      <Panel title="Accessories">
        <Row>
          <DebouncedNum label="Cleats" value={accQty("cleat")} step={1} onCommit={(n) => setAcc("cleat", { qty: n })} />
          <DebouncedNum label="Edging (lin ft)" value={edgingFt()} step={1} onCommit={(n) => setAcc("edging", { linearFt: n })} />
        </Row>
        <div className="grid grid-cols-2 gap-1">
          {UNIT_ACCESSORIES.map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={accQty(t) > 0} onChange={(e) => setAcc(t, { qty: e.target.checked ? 1 : 0 })} />
              {t.replace(/_/g, " ")}
            </label>
          ))}
        </div>
      </Panel>

      <DesignActionsBar actions={actions} />
    </>
  );
}

function DesignActionsBar({ actions }: { actions: DesignActions }) {
  const a = actions;
  return (
    <div className="px-4 py-3">
      {a.mode === "builder" ? (
        <button
          onClick={a.onSendQuote}
          disabled={a.busy || a.hasErrors || !a.quotable}
          title={!a.quotable ? "Customer hasn't submitted this design yet — you can revise after submission." : undefined}
          className="w-full rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
        >
          {a.busy ? "Sending…" : "Send quote"}
        </button>
      ) : (
        <div className="space-y-2">
          <button onClick={a.onSave} disabled={a.busy || a.hasErrors} className="w-full rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">
            {a.busy ? "Saving…" : a.dirty ? "Save changes" : `Saved v${a.version}`}
          </button>
          <div className="flex gap-2">
            <button onClick={a.onPdf} disabled={a.busy} className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
              Download PDF
            </button>
            {a.submitted ? (
              <span className="flex-1 rounded bg-emerald-100 px-3 py-2 text-center text-sm font-semibold text-emerald-700">Submitted ✓</span>
            ) : (
              <button onClick={a.onSubmit} disabled={a.busy || a.hasErrors || !a.captured} title={!a.captured ? "Save your design first" : undefined} className="flex-1 rounded border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-cyan-50 disabled:opacity-50">
                Submit to builder
              </button>
            )}
          </div>
          <a href={a.historyHref} className="block text-center text-xs text-brand hover:underline">version history</a>
        </div>
      )}
      {a.hasErrors && <p className="mt-2 text-xs text-red-600">Resolve errors to continue.</p>}
      {a.status && <p className="mt-2 text-xs text-emerald-700">{a.status}</p>}
    </div>
  );
}

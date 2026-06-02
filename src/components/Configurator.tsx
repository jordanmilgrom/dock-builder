"use client";

import { useMemo, useState } from "react";
import {
  pricingEngine,
  validationEngine,
  type AccessoryType,
  type DeckingMaterial,
  type DockConfig,
  type DockType,
  type FrameMaterial,
  type JoistSize,
} from "@/engine";
import { pricingProfileFor } from "@/lib/seed";
import ViewsPanel from "./ViewsPanel";
import SaveGate, { type CaptureResult } from "./SaveGate";

const DOCK_TYPES: DockType[] = ["floating", "pile", "pipe", "crib", "suspension"];
const FRAMES: FrameMaterial[] = ["pt_pine", "aluminum", "galvanized_steel", "composite"];
const DECKINGS: DeckingMaterial[] = [
  "pt_5/4x6", "pt_2x6", "cedar_hardwood", "composite_5/4x6", "composite_2x6",
  "composite_trex", "pvc", "aluminum", "grating",
];
const JOISTS: JoistSize[] = ["2x6", "2x8", "2x10", "2x12"];
const SLOPES = ["1:8", "1:12", "1:20"];
const UNIT_ACCESSORIES: AccessoryType[] = [
  "cleat", "ladder", "bench", "dock_box", "lighting", "power_pedestal",
  "mooring_whip", "canopy", "handrail",
];

export default function Configurator({
  designId,
  initialConfig,
  initialVersion,
  emailCaptured,
}: {
  designId: string;
  initialConfig: DockConfig;
  initialVersion: number;
  emailCaptured: boolean;
}) {
  const [config, setConfig] = useState<DockConfig>(initialConfig);
  const [version, setVersion] = useState(initialVersion);
  const [captured, setCaptured] = useState(emailCaptured);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<null | "save">(null);
  const [pending, setPending] = useState<null | "save" | "pdf">(null);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const profile = useMemo(() => pricingProfileFor(config.dockType), [config.dockType]);
  const validation = useMemo(() => validationEngine(config), [config]);
  const estimate = useMemo(
    () => pricingEngine(config, profile, { deliveryDistanceMiles: 30 }),
    [config, profile],
  );

  const hasErrors = validation.errors.length > 0;
  const priceHidden = estimate.priceVisibility === "hidden_until_contact" && !captured;

  // ---- config updaters ----
  function update(mut: (c: DockConfig) => DockConfig) {
    setConfig((c) => mut(structuredClone(c)));
    setDirty(true);
    setStatus(null);
  }
  const setOverall = (patch: Partial<DockConfig["overall"]>) =>
    update((c) => ({ ...c, overall: { ...c.overall, ...patch } }));
  const setSite = (patch: Partial<DockConfig["site"]>) =>
    update((c) => ({ ...c, site: { ...c.site, ...patch } }));
  const setGangway = (patch: Partial<NonNullable<DockConfig["gangway"]>>) =>
    update((c) => ({ ...c, gangway: { present: c.gangway?.present ?? false, ...c.gangway, ...patch } }));

  function accQty(type: AccessoryType): number {
    return config.accessories?.find((a) => a.type === type)?.qty ?? 0;
  }
  function edgingFt(): number {
    return config.accessories?.find((a) => a.type === "edging")?.linearFt ?? 0;
  }
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

  // ---- persistence ----
  async function persist(): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(`/api/designs/${designId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = (await res.json()) as { revision?: { version: number }; error?: string };
      if (!res.ok || !data.revision) { setStatus("Save failed."); return false; }
      setVersion(data.revision.version);
      setDirty(false);
      setStatus(`Saved v${data.revision.version}`);
      return true;
    } catch {
      setStatus("Network error.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (hasErrors) return;
    if (!captured) { setPending("save"); setGate("save"); return; }
    await persist();
  }

  async function handlePdf() {
    if (!captured) { setPending("pdf"); setGate("save"); return; }
    if (dirty) { const ok = await persist(); if (!ok) return; }
    window.open(`/api/designs/${designId}/pdf`, "_blank");
  }

  async function onCaptured(r: CaptureResult) {
    setCaptured(true);
    setGate(null);
    setMagicLink(r.magicLink || null);
    if (pending === "save" || pending === "pdf") {
      const ok = await persist();
      if (ok && pending === "pdf") window.open(`/api/designs/${designId}/pdf`, "_blank");
    }
    setPending(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Controls */}
      <div className="space-y-4">
        <Panel title="Structure">
          <Row>
            <Sel label="Dock type" value={config.dockType} options={DOCK_TYPES} onChange={(v) => update((c) => ({ ...c, dockType: v as DockType }))} />
            <Sel label="Use" value={config.use} options={["residential", "commercial"]} onChange={(v) => update((c) => ({ ...c, use: v as DockConfig["use"] }))} />
          </Row>
          <Row>
            <Num label="Length (ft)" value={config.overall.lengthFt} onChange={(n) => setOverall({ lengthFt: n })} />
            <Num label="Width (ft)" value={config.overall.widthFt} onChange={(n) => setOverall({ widthFt: n })} />
          </Row>
          <Row>
            <Sel label="Frame" value={config.overall.frameMaterial} options={FRAMES} onChange={(v) => setOverall({ frameMaterial: v as FrameMaterial })} />
            <Sel label="Decking" value={config.overall.deckingMaterial} options={DECKINGS} onChange={(v) => setOverall({ deckingMaterial: v as DeckingMaterial })} />
          </Row>
          <Row>
            <Sel label="Orientation" value={config.overall.deckingOrientation} options={["straight", "diagonal"]} onChange={(v) => setOverall({ deckingOrientation: v as DockConfig["overall"]["deckingOrientation"] })} />
            <Sel label="Joist size" value={config.overall.joistSize ?? "2x8"} options={JOISTS} onChange={(v) => setOverall({ joistSize: v as JoistSize })} />
          </Row>
        </Panel>

        <Panel title="Gangway">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={config.gangway?.present ?? false} onChange={(e) => setGangway({ present: e.target.checked })} />
            Include gangway
          </label>
          {config.gangway?.present && (
            <Row>
              <Sel label="Target slope" value={config.gangway.targetSlope ?? "1:12"} options={SLOPES} onChange={(v) => setGangway({ targetSlope: v })} />
              <Num label="Width (in)" value={config.gangway.widthIn ?? 48} onChange={(n) => setGangway({ widthIn: n })} />
            </Row>
          )}
        </Panel>

        <Panel title="Accessories">
          <Row>
            <Num label="Cleats" value={accQty("cleat")} onChange={(n) => setAcc("cleat", { qty: n })} />
            <Num label="Edging (lin ft)" value={edgingFt()} onChange={(n) => setAcc("edging", { linearFt: n })} />
          </Row>
          <div className="grid grid-cols-2 gap-2">
            {UNIT_ACCESSORIES.filter((t) => t !== "cleat").map((t) => (
              <Num key={t} label={t.replace(/_/g, " ")} value={accQty(t)} onChange={(n) => setAcc(t, { qty: n })} />
            ))}
          </div>
        </Panel>

        <Panel title="Site">
          <Row>
            <Num label="Depth low water (ft)" value={config.site.depthAtEndLowWaterFt} onChange={(n) => setSite({ depthAtEndLowWaterFt: n })} />
            <Num label="Fluctuation (ft)" value={config.site.seasonalFluctuationFt} onChange={(n) => setSite({ seasonalFluctuationFt: n })} />
          </Row>
          <Row>
            <Num label="Shore height (ft)" value={config.site.shoreHeightAboveWaterFt} onChange={(n) => setSite({ shoreHeightAboveWaterFt: n })} />
            <div />
          </Row>
        </Panel>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={handleSave} disabled={busy || hasErrors} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">
            {busy ? "Saving…" : dirty ? "Save changes" : `Saved v${version}`}
          </button>
          <button onClick={handlePdf} disabled={busy} className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
            Download PDF
          </button>
          {hasErrors && <span className="text-xs text-red-600">Resolve errors to save the estimate.</span>}
          {status && <span className="text-xs text-emerald-700">{status}</span>}
        </div>
        {magicLink && (
          <p className="rounded border border-cyan-200 bg-cyan-50 p-2 text-xs text-cyan-900">
            Dev magic link (normally emailed):{" "}
            <a className="break-all underline" href={magicLink}>{magicLink}</a>
          </p>
        )}
      </div>

      {/* Views + feedback */}
      <div className="space-y-4">
        <ViewsPanel config={config} />

        <Panel title="Engineering checks">
          <Metrics validation={validation} />
          <Issues label="Errors" items={validation.errors.map((e) => e.message)} tone="error" />
          <Issues label="Warnings" items={validation.warnings.map((w) => w.message)} tone="warn" />
          <Issues label="Auto-fixes applied" items={validation.autoFixes} tone="info" />
        </Panel>

        <Panel title="Estimate">
          {priceHidden ? (
            <p className="text-sm text-slate-600">Enter your contact info to see this builder&apos;s estimate.</p>
          ) : (
            <EstimateTable estimate={estimate} />
          )}
        </Panel>
      </div>

      {gate && (
        <SaveGate designId={designId} source="save_gate" onCancel={() => { setGate(null); setPending(null); }} onCaptured={onCaptured} />
      )}
    </div>
  );
}

// ---- presentational bits ----

function Metrics({ validation }: { validation: ReturnType<typeof validationEngine> }) {
  const d = validation.derived;
  const items: [string, string][] = [
    ["Deck area", `${d.deckAreaFt2} ft²`],
    ["Sections", `${d.sectionCount}`],
    ["Max joist span", `${d.maxJoistSpanFt} ft`],
    ["Est. weight", `${d.estWeightLbs.toLocaleString()} lbs`],
  ];
  if (d.floatCount > 0) {
    items.push(["Required buoyancy", `${d.requiredBuoyancyLbs.toLocaleString()} lbs`]);
    items.push(["Floats", `${d.floatCount}`]);
    if (d.estFreeboardIn != null) items.push(["Est. freeboard", `${d.estFreeboardIn} in`]);
  }
  if (d.pilingCount > 0) items.push(["Pilings", `${d.pilingCount}`]);
  if (d.gangwayLengthFt > 0) items.push(["Gangway", `${d.gangwayLengthFt} ft`]);
  return (
    <dl className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 border-b border-slate-100 py-0.5">
          <dt className="text-slate-500">{k}</dt>
          <dd className="font-medium text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Issues({ label, items, tone }: { label: string; items: string[]; tone: "error" | "warn" | "info" }) {
  if (items.length === 0) return null;
  const cls = tone === "error" ? "border-red-200 bg-red-50 text-red-800" : tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <div className={`mt-2 rounded border p-2 text-xs ${cls}`}>
      <p className="font-semibold">{label}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.map((m) => (<li key={m}>{m}</li>))}
      </ul>
    </div>
  );
}

function EstimateTable({ estimate }: { estimate: ReturnType<typeof pricingEngine> }) {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: estimate.currency, maximumFractionDigits: 0 }).format(n);
  const showItems = estimate.priceVisibility === "full";
  return (
    <div className="text-sm">
      {showItems && (
        <table className="mb-2 w-full">
          <tbody>
            {estimate.lineItems.map((li) => (
              <tr key={li.key} className="border-b border-slate-100">
                <td className="py-0.5 text-slate-600">{li.label} <span className="text-slate-400">×{li.qty}</span></td>
                <td className="py-0.5 text-right font-medium">{fmt(li.subtotal)}</td>
              </tr>
            ))}
            <tr><td className="py-0.5 text-slate-600">Labor / install</td><td className="py-0.5 text-right">{fmt(estimate.labor)}</td></tr>
            {estimate.delivery > 0 && <tr><td className="py-0.5 text-slate-600">Delivery</td><td className="py-0.5 text-right">{fmt(estimate.delivery)}</td></tr>}
            {estimate.markup > 0 && <tr><td className="py-0.5 text-slate-600">Markup</td><td className="py-0.5 text-right">{fmt(estimate.markup)}</td></tr>}
          </tbody>
        </table>
      )}
      <div className="flex items-center justify-between border-t border-slate-300 pt-2 text-base font-bold">
        <span>{estimate.priceVisibility === "starting_from" ? "Starting from" : "Total"}</span>
        <span>{fmt(estimate.total)}</span>
      </div>
      {estimate.minimumApplied && <p className="mt-1 text-xs text-slate-500">Minimum project price applied.</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        type="number"
        step="0.5"
        min="0"
        value={value}
        onChange={(e) => { const n = Number(e.target.value); onChange(Number.isFinite(n) && n >= 0 ? n : 0); }}
        className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
    </label>
  );
}

function Sel({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-sm">
        {options.map((o) => (<option key={o} value={o}>{o.replace(/_/g, " ")}</option>))}
      </select>
    </label>
  );
}

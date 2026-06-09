"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  recommendDockType,
  type BottomType,
  type DockType,
  type SiteConditions,
  type UseClass,
  type WaveExposure,
} from "@/engine";

const DEFAULT_SITE: SiteConditions = {
  depthAtEndLowWaterFt: 6,
  seasonalFluctuationFt: 1.5,
  bottom: "sand",
  waveExposure: "inland_lake",
  seasonalIce: false,
  shoreHeightAboveWaterFt: 3,
};

const BOTTOMS: BottomType[] = ["sand", "silt", "mud", "clay", "gravel", "rock"];
const EXPOSURES: WaveExposure[] = ["sheltered", "inland_lake", "open_water"];
const DOCK_TYPES: DockType[] = ["floating", "pile", "pipe", "crib", "suspension"];

export interface TemplateCard {
  id: string;
  name: string;
  dockType: string;
}

/**
 * Canvas-first landing (Phase 7). The questionnaire is now opt-in: customers
 * land on a canvas backdrop with a card offering the wizard or drawing straight
 * away. Returning customers and skip-by-default (Premium) tenants get no card.
 * Both paths create a design and navigate into the canvas editor.
 */
export default function CanvasLanding({
  defaultSite,
  templates = [],
  basePath = "/design",
  skipWizardByDefault = false,
  isReturning = false,
}: {
  defaultSite: SiteConditions | null;
  templates?: TemplateCard[];
  basePath?: string;
  skipWizardByDefault?: boolean;
  isReturning?: boolean;
}) {
  const router = useRouter();
  const [wizard, setWizard] = useState(false);
  const [dismissed, setDismissed] = useState(skipWizardByDefault || isReturning);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createDesign(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { designId?: string; error?: string };
      if (!res.ok || !data.designId) {
        setError(data.error === "draft_cap" ? "You already have 3 saved drafts — delete one to start another." : "Could not start a design.");
        return;
      }
      router.push(`${basePath}/${data.designId}`);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const drawItMyself = () => createDesign({ site: defaultSite ?? DEFAULT_SITE });
  const startFromTemplate = (templateId: string) => createDesign({ templateId });

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-sky-50">
      {/* canvas-evoking grid backdrop */}
      <div
        aria-hidden
        className="h-[60vh] min-h-[24rem] w-full"
        style={{
          backgroundImage:
            "linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.5,
        }}
      />

      {!dismissed && !wizard && (
        <Overlay>
          <h2 className="text-lg font-semibold text-slate-900">New to dock design?</h2>
          <p className="mt-1 text-sm text-slate-600">
            Answer a few quick questions and we&apos;ll recommend a dock type and seed a
            starting layout — or jump straight onto the canvas and draw it yourself.
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => setWizard(true)}
              className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800"
            >
              Start the wizard →
            </button>
            <button
              onClick={drawItMyself}
              disabled={busy}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {busy ? "Starting…" : "Skip — I'll draw it myself"}
            </button>
          </div>
          {templates.length > 0 && (
            <div className="mt-5 border-t border-slate-200 pt-4">
              <p className="text-xs font-semibold text-slate-500">Or start from a template</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => startFromTemplate(t.id)}
                    disabled={busy}
                    className="rounded border border-slate-200 p-3 text-left text-sm hover:border-brand hover:bg-cyan-50 disabled:opacity-50"
                  >
                    <span className="font-medium text-slate-800">{t.name}</span>
                    <span className="block text-xs text-slate-500">{t.dockType} dock</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Overlay>
      )}

      {dismissed && !wizard && (
        <Overlay>
          <h2 className="text-lg font-semibold text-slate-900">Start a new design</h2>
          <p className="mt-1 text-sm text-slate-600">Jump onto the canvas and start drawing.</p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={drawItMyself} disabled={busy} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">
              {busy ? "Starting…" : "Open the canvas →"}
            </button>
            <button onClick={() => { setDismissed(false); setWizard(true); }} className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Use the wizard instead
            </button>
          </div>
        </Overlay>
      )}

      {wizard && (
        <WizardModal
          defaultSite={defaultSite ?? DEFAULT_SITE}
          busy={busy}
          error={error}
          onCancel={() => setWizard(false)}
          onFinish={(site, use, dockType) => createDesign({ site, use, dockType })}
        />
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white/95 p-6 shadow-xl backdrop-blur">
        {children}
      </div>
    </div>
  );
}

/** Four-step questionnaire restyled as a modal stepper. */
function WizardModal({
  defaultSite,
  busy,
  error,
  onCancel,
  onFinish,
}: {
  defaultSite: SiteConditions;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onFinish: (site: SiteConditions, use: UseClass, dockType: DockType | undefined) => void;
}) {
  const [step, setStep] = useState(0);
  const [site, setSite] = useState<SiteConditions>(defaultSite);
  const [use, setUse] = useState<UseClass>("residential");
  const [override, setOverride] = useState<DockType | "">("");
  const rec = useMemo(() => recommendDockType(site), [site]);
  const num = (v: string, fb: number) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };

  const steps = ["Water", "Bottom & exposure", "Shore & use", "Recommendation"];

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4" role="dialog" aria-label="Dock design wizard">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-slate-200"}`} title={s} />
          ))}
        </div>
        <h2 className="text-base font-semibold text-slate-900">{steps[step]}</h2>

        <div className="mt-3 space-y-3">
          {step === 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Water depth at dock end, low water (ft)">
                <input type="number" step="0.5" min="0" className="winp" value={site.depthAtEndLowWaterFt}
                  onChange={(e) => setSite({ ...site, depthAtEndLowWaterFt: num(e.target.value, 0) })} />
              </Field>
              <Field label="Seasonal level fluctuation (ft)">
                <input type="number" step="0.5" min="0" className="winp" value={site.seasonalFluctuationFt}
                  onChange={(e) => setSite({ ...site, seasonalFluctuationFt: num(e.target.value, 0) })} />
              </Field>
            </div>
          )}
          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bottom type">
                <select className="winp" value={site.bottom} onChange={(e) => setSite({ ...site, bottom: e.target.value as BottomType })}>
                  {BOTTOMS.map((b) => (<option key={b} value={b}>{b}</option>))}
                </select>
              </Field>
              <Field label="Wave / wake exposure">
                <select className="winp" value={site.waveExposure} onChange={(e) => setSite({ ...site, waveExposure: e.target.value as WaveExposure })}>
                  {EXPOSURES.map((x) => (<option key={x} value={x}>{x.replace("_", " ")}</option>))}
                </select>
              </Field>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Shore height above water (ft)">
                <input type="number" step="0.5" min="0" className="winp" value={site.shoreHeightAboveWaterFt}
                  onChange={(e) => setSite({ ...site, shoreHeightAboveWaterFt: num(e.target.value, 0) })} />
              </Field>
              <Field label="Use">
                <select className="winp" value={use} onChange={(e) => setUse(e.target.value as UseClass)}>
                  <option value="residential">residential</option>
                  <option value="commercial">commercial</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input type="checkbox" checked={site.seasonalIce} onChange={(e) => setSite({ ...site, seasonalIce: e.target.checked })} />
                Seasonal ice
              </label>
            </div>
          )}
          {step === 3 && (
            <div className="text-sm text-slate-700">
              <p>
                Based on your shoreline, we suggest a{" "}
                <span className="font-semibold text-brand">{rec.dockType}</span> dock.
              </p>
              {rec.reasons.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                  {rec.reasons.map((r) => (<li key={r}>{r}</li>))}
                </ul>
              )}
              <label className="mt-3 block">
                <span className="font-medium text-slate-700">Start with a different type?</span>
                <select className="winp mt-1" value={override} onChange={(e) => setOverride(e.target.value as DockType | "")}>
                  <option value="">Use recommended ({rec.dockType})</option>
                  {DOCK_TYPES.filter((t) => t !== rec.dockType).map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </label>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={() => (step === 0 ? onCancel() : setStep((s) => s - 1))}
            className="rounded px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            {step === 0 ? "Cancel" : "← Back"}
          </button>
          {step < 3 ? (
            <button onClick={() => setStep((s) => s + 1)} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
              Next →
            </button>
          ) : (
            <button
              onClick={() => onFinish(site, use, override || undefined)}
              disabled={busy}
              className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
            >
              {busy ? "Starting…" : "Start designing →"}
            </button>
          )}
        </div>
        <style>{`.winp{margin-top:.25rem;display:block;width:100%;border-radius:.375rem;border:1px solid #cbd5e1;padding:.4rem .5rem;font-size:.875rem}`}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

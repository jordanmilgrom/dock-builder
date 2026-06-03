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

export default function QuestionnaireForm({
  defaultSite,
  basePath = "/design",
  templates = [],
}: {
  defaultSite: SiteConditions | null;
  /** Where to navigate after a design is created ("/design" or "/embed/design"). */
  basePath?: string;
  /** Optional "start from a template" cards (§5.6). */
  templates?: TemplateCard[];
}) {
  const router = useRouter();
  const [site, setSite] = useState<SiteConditions>(defaultSite ?? DEFAULT_SITE);
  const [use, setUse] = useState<UseClass>("residential");
  const [stage, setStage] = useState<"form" | "recommendation">("form");
  const [override, setOverride] = useState<DockType | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rec = useMemo(() => recommendDockType(site), [site]);

  function num(v: string, fallback: number): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

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

  const startDesigning = () => createDesign({ site, use, dockType: override || undefined });
  const startFromTemplate = (templateId: string) => createDesign({ templateId });

  if (stage === "recommendation") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Our recommendation</h2>
        <p className="mt-1 text-sm text-slate-600">
          Based on your shoreline, we suggest a{" "}
          <span className="font-semibold text-brand">{rec.dockType}</span> dock.
        </p>
        {rec.reasons.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {rec.reasons.map((r) => (<li key={r}>{r}</li>))}
          </ul>
        )}
        {rec.cautions.length > 0 && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Things to keep in mind</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {rec.cautions.map((c) => (<li key={c}>{c}</li>))}
            </ul>
          </div>
        )}
        {rec.recommendRemovable && (
          <p className="mt-3 text-sm text-slate-700">
            ❄️ Seasonal ice — we&apos;ll start you with a removable, sectional design.
          </p>
        )}

        <label className="mt-4 block text-sm">
          <span className="font-medium text-slate-700">Start with a different type?</span>
          <select
            className="mt-1 block w-full rounded border-slate-300 text-sm"
            value={override}
            onChange={(e) => setOverride(e.target.value as DockType | "")}
          >
            <option value="">Use recommended ({rec.dockType})</option>
            {DOCK_TYPES.filter((t) => t !== rec.dockType).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
            onClick={startDesigning}
            disabled={busy}
          >
            {busy ? "Starting…" : "Start designing →"}
          </button>
          <button className="rounded px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setStage("form")}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {templates.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Start from a template</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
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
          <p className="mt-3 text-xs text-slate-400">…or answer a few questions to start from scratch.</p>
        </div>
      )}
      <form
        className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2"
        onSubmit={(e) => { e.preventDefault(); setStage("recommendation"); }}
      >
      <Field label="Water depth at dock end, low water (ft)">
        <input type="number" step="0.5" min="0" className="input" value={site.depthAtEndLowWaterFt}
          onChange={(e) => setSite({ ...site, depthAtEndLowWaterFt: num(e.target.value, 0) })} />
      </Field>
      <Field label="Seasonal level fluctuation (ft)">
        <input type="number" step="0.5" min="0" className="input" value={site.seasonalFluctuationFt}
          onChange={(e) => setSite({ ...site, seasonalFluctuationFt: num(e.target.value, 0) })} />
      </Field>
      <Field label="Bottom type">
        <select className="input" value={site.bottom} onChange={(e) => setSite({ ...site, bottom: e.target.value as BottomType })}>
          {BOTTOMS.map((b) => (<option key={b} value={b}>{b}</option>))}
        </select>
      </Field>
      <Field label="Wave / wake exposure">
        <select className="input" value={site.waveExposure} onChange={(e) => setSite({ ...site, waveExposure: e.target.value as WaveExposure })}>
          {EXPOSURES.map((x) => (<option key={x} value={x}>{x.replace("_", " ")}</option>))}
        </select>
      </Field>
      <Field label="Shore height above water (ft)">
        <input type="number" step="0.5" min="0" className="input" value={site.shoreHeightAboveWaterFt}
          onChange={(e) => setSite({ ...site, shoreHeightAboveWaterFt: num(e.target.value, 0) })} />
      </Field>
      <Field label="Use">
        <select className="input" value={use} onChange={(e) => setUse(e.target.value as UseClass)}>
          <option value="residential">residential</option>
          <option value="commercial">commercial</option>
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={site.seasonalIce} onChange={(e) => setSite({ ...site, seasonalIce: e.target.checked })} />
        Seasonal ice
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
          See recommendation →
        </button>
      </div>
        <style>{`.input{margin-top:.25rem;display:block;width:100%;border-radius:.375rem;border:1px solid #cbd5e1;padding:.4rem .5rem;font-size:.875rem}`}</style>
      </form>
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

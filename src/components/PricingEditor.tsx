"use client";

import { useState } from "react";

export interface EditorItem {
  id: string;
  key: string;
  label: string;
  unit: string;
  unitPrice: number;
  enabled: boolean;
}
export interface EditorProfile {
  dockType: string;
  priceVisibility: string;
  items: EditorItem[];
}

const VISIBILITY: { value: string; label: string }[] = [
  { value: "full", label: "Full itemized breakdown" },
  { value: "total", label: "Total only" },
  { value: "starting_from", label: "“Starting from” anchor" },
  { value: "hidden_until_contact", label: "Hidden until contact (gate)" },
];

export default function PricingEditor({ profiles }: { profiles: EditorProfile[] }) {
  const [all, setAll] = useState(profiles);
  const [active, setActive] = useState(profiles[0]?.dockType ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const profile = all.find((p) => p.dockType === active);

  function patchProfile(mut: (p: EditorProfile) => EditorProfile) {
    setAll((prev) => prev.map((p) => (p.dockType === active ? mut(structuredClone(p)) : p)));
    setStatus(null);
  }

  async function save() {
    if (!profile) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/builder/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dockType: profile.dockType,
          priceVisibility: profile.priceVisibility,
          items: profile.items.map((i) => ({ id: i.id, unitPrice: i.unitPrice, enabled: i.enabled })),
        }),
      });
      setStatus(res.ok ? "Saved." : "Save failed.");
    } catch {
      setStatus("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">Catalog &amp; pricing</h3>
      <div className="mb-3 flex flex-wrap gap-1">
        {all.map((p) => (
          <button
            key={p.dockType}
            onClick={() => setActive(p.dockType)}
            className={`rounded px-3 py-1 text-xs font-medium ${p.dockType === active ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {p.dockType}
          </button>
        ))}
      </div>

      {profile && (
        <>
          <label className="block text-sm">
            <span className="text-slate-600">Price visibility (§4)</span>
            <select
              className="inp mt-0.5"
              value={profile.priceVisibility}
              onChange={(e) => patchProfile((p) => ({ ...p, priceVisibility: e.target.value }))}
            >
              {VISIBILITY.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </label>

          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1">On</th><th>Item</th><th>Unit</th><th className="text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {profile.items.map((it) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="py-1">
                    <input
                      type="checkbox"
                      checked={it.enabled}
                      onChange={(e) => patchProfile((p) => ({ ...p, items: p.items.map((x) => x.id === it.id ? { ...x, enabled: e.target.checked } : x) }))}
                    />
                  </td>
                  <td className="text-slate-700">{it.label || it.key}</td>
                  <td className="text-slate-400">{it.unit}</td>
                  <td className="text-right">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={it.unitPrice}
                      onChange={(e) => patchProfile((p) => ({ ...p, items: p.items.map((x) => x.id === it.id ? { ...x, unitPrice: Number(e.target.value) || 0 } : x) }))}
                      className="w-24 rounded border border-slate-300 px-2 py-0.5 text-right"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex items-center gap-3">
            <button onClick={save} disabled={busy} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">
              {busy ? "Saving…" : `Save ${profile.dockType} pricing`}
            </button>
            {status && <span className="text-xs text-emerald-700">{status}</span>}
          </div>
        </>
      )}
    </section>
  );
}

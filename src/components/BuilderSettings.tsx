"use client";

import { useState } from "react";

/** Per-tenant abandoned-lead threshold (§10 #7), range 1–30 days. */
export default function BuilderSettings({ initialDays }: { initialDays: number }) {
  const [days, setDays] = useState(initialDays);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/builder/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abandonedThresholdDays: days }),
      });
      setStatus(res.ok ? "Saved." : "Must be 1–30 days.");
    } catch {
      setStatus("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="text-slate-600">Mark leads abandoned after</span>
        <div className="mt-0.5 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => { setDays(Number(e.target.value)); setStatus(null); }}
            className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-sm text-slate-500">days of inactivity</span>
        </div>
      </label>
      <button onClick={save} disabled={busy} className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">
        {busy ? "Saving…" : "Save"}
      </button>
      {status && <span className="text-xs text-emerald-700">{status}</span>}
    </div>
  );
}

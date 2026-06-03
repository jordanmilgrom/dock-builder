"use client";

import { useState } from "react";

/** Save a design's current revision as a reusable starter template (§5.6). */
export default function SaveTemplateButton({ designId }: { designId: string }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    setBusy(true); setStatus(null);
    try {
      const res = await fetch("/api/builder/templates", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, designId }),
      });
      if (res.ok) { setStatus("Saved as template ✓"); setOpen(false); setName(""); }
      else setStatus("Could not save template.");
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
        Save as template
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className="inp w-56" value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
      <button onClick={save} disabled={busy || !name} className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">Save</button>
      <button onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:underline">Cancel</button>
      {status && <span className="text-xs text-emerald-700">{status}</span>}
    </div>
  );
}

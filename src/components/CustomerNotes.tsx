"use client";

import { useState } from "react";

const MAX = 5000;

/** Builder CRM notes editor for a customer (§5.6). */
export default function CustomerNotes({ customerId, initialNotes }: { customerId: string; initialNotes: string }) {
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/builder/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      setStatus(res.ok ? "Saved." : "Save failed.");
    } catch {
      setStatus("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <textarea
        className="block w-full rounded border border-slate-300 px-2 py-1 text-sm"
        rows={4}
        maxLength={MAX}
        value={notes}
        onChange={(e) => { setNotes(e.target.value); setStatus(null); }}
        placeholder="Private notes about this customer…"
      />
      <div className="mt-1 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">
          {busy ? "Saving…" : "Save notes"}
        </button>
        <span className="text-xs text-slate-400">{notes.length}/{MAX}</span>
        {status && <span className="text-xs text-emerald-700">{status}</span>}
      </div>
    </div>
  );
}

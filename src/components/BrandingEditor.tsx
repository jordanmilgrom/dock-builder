"use client";

import { useState } from "react";

export interface BrandingInitial {
  name: string;
  logoText: string;
  primaryColor: string;
  secondaryColor: string;
  removeBadge: boolean;
  slug: string;
}

export default function BrandingEditor({
  initial,
  canRemoveBadge,
}: {
  initial: BrandingInitial;
  canRemoveBadge: boolean;
}) {
  const [b, setB] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  function set<K extends keyof BrandingInitial>(k: K, v: BrandingInitial[K]) {
    setB((prev) => ({ ...prev, [k]: v }));
    setStatus(null);
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/builder/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      const data = (await res.json()) as { ok?: boolean; slugError?: string };
      setStatus(data.ok ? "Saved." : data.slugError === "slug_taken" ? "Subdomain taken." : "Saved (slug unchanged).");
    } catch {
      setStatus("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">Branding</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Business name"><input className="inp" value={b.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Subdomain (.app.com)"><input className="inp" value={b.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
        <Field label="Logo text"><input className="inp" value={b.logoText} onChange={(e) => set("logoText", e.target.value)} /></Field>
        <div />
        <Field label="Primary color"><input type="color" value={b.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} /></Field>
        <Field label="Header color"><input type="color" value={b.secondaryColor} onChange={(e) => set("secondaryColor", e.target.value)} /></Field>
      </div>
      <label className={`mt-3 flex items-center gap-2 text-sm ${canRemoveBadge ? "text-slate-700" : "text-slate-400"}`}>
        <input type="checkbox" disabled={!canRemoveBadge} checked={b.removeBadge} onChange={(e) => set("removeBadge", e.target.checked)} />
        Remove &quot;Powered by&quot; badge {canRemoveBadge ? "" : "(Pro & Premium)"}
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">
          {busy ? "Saving…" : "Save branding"}
        </button>
        {status && <span className="text-xs text-emerald-700">{status}</span>}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

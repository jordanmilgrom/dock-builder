"use client";

import { useState } from "react";

interface Setup {
  domain: string;
  txtName: string;
  txtValue: string;
  cnameTarget: string;
}

/** Custom-domain config (§5.7). Gated by entitlements.customDomain (Premium). */
export default function CustomDomainConfig({
  entitled,
  initialDomain,
  verified,
  cnameTarget,
}: {
  entitled: boolean;
  initialDomain: string | null;
  verified: boolean;
  cnameTarget: string;
}) {
  const [domain, setDomain] = useState(initialDomain ?? "");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [status, setStatus] = useState<string | null>(verified ? "Verified ✓" : null);
  const [busy, setBusy] = useState(false);

  if (!entitled) {
    return <p className="text-sm text-slate-500">Custom domains are a Premium feature.</p>;
  }

  async function save() {
    setBusy(true); setStatus(null);
    try {
      const res = await fetch("/api/builder/custom-domain", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }),
      });
      const data = (await res.json()) as Setup & { error?: string };
      if (res.ok) { setSetup(data); setStatus("Add the DNS records below, then verify."); }
      else setStatus(data.error === "invalid_hostname" ? "Enter a valid hostname." : data.error === "taken" ? "That domain is taken." : "Failed.");
    } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setStatus("Checking DNS…");
    try {
      const res = await fetch("/api/builder/custom-domain", { method: "PUT" });
      const data = (await res.json()) as { ok?: boolean; reason?: string };
      setStatus(data.ok ? "Verified ✓" : `Not verified yet${data.reason ? ` (${data.reason})` : ""}. DNS can take a while.`);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="text-slate-600">Custom domain</span>
          <input className="inp mt-0.5 w-64" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="design.yourcompany.com" />
        </label>
        <button onClick={save} disabled={busy || !domain} className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">Save</button>
        <button onClick={verify} disabled={busy} className="rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Verify</button>
      </div>
      <p className="text-xs text-slate-500">
        Point a CNAME at <code className="rounded bg-slate-100 px-1">{cnameTarget}</code>.
      </p>
      {setup && (
        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs">
          <div>TXT <code>{setup.txtName}</code> = <code className="break-all">{setup.txtValue}</code></div>
          <div>CNAME <code>{setup.domain}</code> → <code>{setup.cnameTarget}</code></div>
        </div>
      )}
      {status && <p className="text-xs text-emerald-700">{status}</p>}
    </div>
  );
}

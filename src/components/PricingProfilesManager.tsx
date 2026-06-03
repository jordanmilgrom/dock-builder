"use client";

import { useEffect, useState } from "react";

interface Profile { id: string; name: string; dockType: string; isDefault: boolean }
const DOCK_TYPES = ["floating", "pile", "pipe", "crib", "suspension"];

/** Manage extra pricing profiles (§7). Gated by entitlements.multipleProfiles (Premium). */
export default function PricingProfilesManager({ entitled }: { entitled: boolean }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState("");
  const [dockType, setDockType] = useState("floating");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/builder/pricing-profiles");
    if (res.ok) setProfiles(((await res.json()) as { profiles: Profile[] }).profiles);
  }
  useEffect(() => { if (entitled) void load(); }, [entitled]);

  if (!entitled) return <p className="text-sm text-slate-500">Multiple pricing profiles (e.g. per location) are a Premium feature.</p>;

  async function create() {
    setBusy(true); setStatus(null);
    try {
      const res = await fetch("/api/builder/pricing-profiles", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, dockType }),
      });
      if (res.ok) { setName(""); void load(); } else setStatus("Could not create profile.");
    } finally { setBusy(false); }
  }

  const extra = profiles.filter((p) => !p.isDefault);
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Default profile is used unless a design is switched to another.</p>
      {extra.length > 0 && (
        <ul className="text-sm">
          {extra.map((p) => (
            <li key={p.id} className="flex justify-between border-b border-slate-100 py-1">
              <span>{p.name}</span><span className="text-xs text-slate-400">{p.dockType}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <input className="inp w-48" value={name} onChange={(e) => setName(e.target.value)} placeholder="North location" />
        <select className="inp w-36" value={dockType} onChange={(e) => setDockType(e.target.value)}>
          {DOCK_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button onClick={create} disabled={busy || !name} className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">Add profile</button>
      </div>
      {status && <p className="text-xs text-red-600">{status}</p>}
    </div>
  );
}

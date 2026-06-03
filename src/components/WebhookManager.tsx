"use client";

import { useEffect, useState } from "react";

interface Endpoint {
  id: string;
  url: string;
  eventKinds: string[];
  lastDeliveryStatus: string | null;
}

/** Webhook endpoint management (§5.9). Gated by entitlements.webhooks (Premium). */
export default function WebhookManager({ entitled }: { entitled: boolean }) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [secret, setSecret] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/builder/webhooks");
    if (res.ok) {
      const data = (await res.json()) as { endpoints: Endpoint[]; eventKinds: string[] };
      setEndpoints(data.endpoints);
      setKinds(data.eventKinds);
    }
  }
  useEffect(() => { if (entitled) void load(); }, [entitled]);

  if (!entitled) return <p className="text-sm text-slate-500">Outbound webhooks are a Premium feature.</p>;

  function toggle(k: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }

  async function create() {
    setSecret(null); setStatus(null);
    const res = await fetch("/api/builder/webhooks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, eventKinds: [...selected] }),
    });
    const data = (await res.json()) as { ok?: boolean; secret?: string; error?: string };
    if (res.ok && data.ok) { setSecret(data.secret ?? null); setUrl(""); setSelected(new Set()); void load(); }
    else setStatus(data.error ?? "Failed.");
  }

  async function revoke(id: string) { await fetch(`/api/builder/webhooks/${id}`, { method: "DELETE" }); void load(); }
  async function test(id: string) {
    const res = await fetch(`/api/builder/webhooks/${id}`, { method: "POST" });
    const data = (await res.json()) as { ok?: boolean; status?: number };
    setStatus(data.ok ? `Test delivered (HTTP ${data.status}).` : "Test failed.");
  }

  return (
    <div className="space-y-3">
      <ul className="text-sm">
        {endpoints.map((e) => (
          <li key={e.id} className="flex items-center justify-between border-b border-slate-100 py-1">
            <span className="truncate">{e.url}<span className="ml-1 text-xs text-slate-400">{e.eventKinds.length} events · {e.lastDeliveryStatus ?? "no deliveries"}</span></span>
            <span className="flex gap-2">
              <button onClick={() => test(e.id)} className="text-xs text-brand hover:underline">Test</button>
              <button onClick={() => revoke(e.id)} className="text-xs text-red-600 hover:underline">Revoke</button>
            </span>
          </li>
        ))}
      </ul>
      <input className="inp" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-crm.example.com/dock-hook" />
      <div className="flex flex-wrap gap-1">
        {kinds.map((k) => (
          <button key={k} onClick={() => toggle(k)} className={`rounded px-2 py-0.5 text-xs ${selected.has(k) ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>{k}</button>
        ))}
      </div>
      <button onClick={create} disabled={!url || selected.size === 0} className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">Add endpoint</button>
      {secret && (
        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          Signing secret (shown once — store it now): <code className="break-all">{secret}</code>
        </p>
      )}
      {status && <p className="text-xs text-slate-600">{status}</p>}
    </div>
  );
}

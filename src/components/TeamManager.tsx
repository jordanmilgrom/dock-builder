"use client";

import { useEffect, useState } from "react";

interface Team {
  members: { id: string; email: string; role: string }[];
  pending: { id: string; email: string; expiresAt: string }[];
}

/** Team management (§5.6). Gated by entitlements.team (Pro+). */
export default function TeamManager({ entitled }: { entitled: boolean }) {
  const [team, setTeam] = useState<Team>({ members: [], pending: [] });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/builder/team");
    if (res.ok) setTeam((await res.json()) as Team);
  }
  useEffect(() => { if (entitled) void load(); }, [entitled]);

  if (!entitled) return <p className="text-sm text-slate-500">Inviting teammates is a Pro feature.</p>;

  async function invite() {
    setBusy(true); setStatus(null); setLink(null);
    try {
      const res = await fetch("/api/builder/team", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok?: boolean; acceptUrl?: string; error?: string };
      if (res.ok && data.ok) { setLink(data.acceptUrl ?? null); setEmail(""); void load(); }
      else setStatus(data.error === "already_member" ? "Already a member." : "Could not invite.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <ul className="text-sm">
        {team.members.map((m) => (
          <li key={m.id} className="flex justify-between border-b border-slate-100 py-1">
            <span>{m.email}</span><span className="text-xs text-slate-400">{m.role.replace("builder_", "")}</span>
          </li>
        ))}
        {team.pending.map((p) => (
          <li key={p.id} className="flex justify-between py-1 text-slate-400">
            <span>{p.email}</span><span className="text-xs">pending</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <input className="inp w-56" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@email.com" />
        <button onClick={invite} disabled={busy || !email} className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">Invite</button>
      </div>
      {link && <p className="rounded border border-cyan-200 bg-cyan-50 p-2 text-xs text-cyan-900">Dev invite link: <a className="break-all underline" href={link}>{link}</a></p>}
      {status && <p className="text-xs text-red-600">{status}</p>}
    </div>
  );
}

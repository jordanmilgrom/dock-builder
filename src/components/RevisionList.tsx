"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Row {
  version: number;
  changeSummary: string;
  authorRole: string;
  createdAt: string;
  total: number | null;
  currency: string;
  isCurrent: boolean;
}

export default function RevisionList({ designId, revisions }: { designId: string; revisions: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  async function act(fromVersion: number, mode: "restore" | "branch") {
    setBusy(fromVersion);
    try {
      const res = await fetch(`/api/designs/${designId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromVersion, mode }),
      });
      if (res.ok) router.push(`/design/${designId}`);
    } finally {
      setBusy(null);
    }
  }

  const fmt = (n: number, c: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);

  return (
    <ol className="space-y-2">
      {[...revisions].reverse().map((r) => (
        <li key={r.version} className="flex items-center justify-between rounded border border-slate-200 bg-white p-3 text-sm">
          <div>
            <p className="font-medium">
              v{r.version}{" "}
              {r.isCurrent && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">current</span>}
            </p>
            <p className="text-slate-600">{r.changeSummary}</p>
            <p className="text-xs text-slate-400">
              {r.authorRole} · {new Date(r.createdAt).toLocaleString("en-US")}
              {r.total != null && <> · {fmt(r.total, r.currency)}</>}
            </p>
          </div>
          {!r.isCurrent && (
            <div className="flex gap-2">
              <button onClick={() => act(r.version, "restore")} disabled={busy != null} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50">
                Restore
              </button>
              <button onClick={() => act(r.version, "branch")} disabled={busy != null} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50">
                Branch
              </button>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

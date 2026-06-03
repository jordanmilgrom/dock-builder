"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Builder-only end-state controls (Won/Lost vocabulary is fine here). */
export default function LeadOutcomeButtons({ leadId, status }: { leadId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(outcome: "accepted" | "closed") {
    setBusy(true);
    try {
      const res = await fetch(`/api/builder/leads/${leadId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status !== "quoted") return null;
  return (
    <div className="flex gap-2">
      <button onClick={() => set("accepted")} disabled={busy} className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
        Mark Won (accepted)
      </button>
      <button onClick={() => set("closed")} disabled={busy} className="rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
        Mark Lost (closed)
      </button>
    </div>
  );
}

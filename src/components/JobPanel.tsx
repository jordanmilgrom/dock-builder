"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JobMilestone, JobStatus } from "@/lib/types";

const NEXT: Record<JobStatus, JobStatus | null> = {
  in_production: "install_scheduled",
  install_scheduled: "complete",
  complete: null,
};
const BUILDER_LABEL: Record<JobStatus, string> = {
  in_production: "In production",
  install_scheduled: "Install scheduled",
  complete: "Complete",
};

/** Builder job controls: advance phase + edit notes (§5.4 job phase). */
export default function JobPanel({
  jobId,
  status,
  notes,
  milestones,
}: {
  jobId: string;
  status: JobStatus;
  notes: string;
  milestones: JobMilestone[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState(notes);
  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  const next = NEXT[status];

  async function advance() {
    if (!next) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/builder/jobs/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    setBusy(true);
    setNoteStatus(null);
    try {
      const res = await fetch(`/api/builder/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: noteText }),
      });
      setNoteStatus(res.ok ? "Saved." : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          Job · <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">{BUILDER_LABEL[status]}</span>
        </h3>
        {next && (
          <button onClick={advance} disabled={busy} className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            Advance to {BUILDER_LABEL[next]}
          </button>
        )}
      </div>

      {milestones.length > 0 && (
        <ol className="mt-2 space-y-0.5 text-xs text-slate-500">
          {milestones.map((m, i) => (
            <li key={i}>✓ {m.label} · {new Date(m.at).toLocaleDateString("en-US")}</li>
          ))}
        </ol>
      )}

      <div className="mt-3">
        <textarea className="block w-full rounded border border-slate-300 px-2 py-1 text-sm" rows={2} value={noteText} maxLength={5000} onChange={(e) => { setNoteText(e.target.value); setNoteStatus(null); }} placeholder="Job notes (install date, crew, etc.)" />
        <div className="mt-1 flex items-center gap-2">
          <button onClick={saveNotes} disabled={busy} className="rounded bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-800 disabled:opacity-50">Save notes</button>
          {noteStatus && <span className="text-xs text-emerald-700">{noteStatus}</span>}
        </div>
      </div>
    </section>
  );
}

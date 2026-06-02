"use client";

import { useState } from "react";
import { devBranding } from "@/lib/seed";

export interface CaptureResult {
  email: string;
  magicLink: string;
}

/**
 * Contact-capture gate (§5.3). Collects email + an explicit, consent-first
 * follow-up opt-in. The moment this succeeds, an unsubmitted design becomes a
 * followable lead (Phase 3 acts on it).
 */
export default function SaveGate({
  designId,
  source,
  onCancel,
  onCaptured,
}: {
  designId: string;
  source: "save_gate" | "price_gate";
  onCancel: () => void;
  onCaptured: (r: CaptureResult) => void;
}) {
  const [email, setEmail] = useState("");
  const [optedIn, setOptedIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, optedIn, source, designId }),
      });
      const data = (await res.json()) as { ok?: boolean; magicLink?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error === "invalid_email" ? "Please enter a valid email." : "Could not save.");
        return;
      }
      onCaptured({ email, magicLink: data.magicLink ?? "" });
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">
          {source === "price_gate" ? "See your estimate" : "Save your design"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Enter your email and we&apos;ll send you a link to come back to your design anytime.
        </p>
        <input
          type="email"
          className="mt-3 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={optedIn} onChange={(e) => setOptedIn(e.target.checked)} />
          <span>I&apos;d like {devBranding.name} to contact me about my dock design.</span>
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
            onClick={submit}
            disabled={busy || email.length === 0}
          >
            {busy ? "Saving…" : "Save & continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

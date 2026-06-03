"use client";

import { useState } from "react";

/** Starts Stripe Checkout for an upgrade. Card capture is Stripe-hosted. */
export default function BillingButtons({ currentTier }: { currentTier: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(tier: string) {
    setBusy(tier);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else setError(data.error === "price_not_configured" ? "Billing isn’t configured in this environment." : "Could not start checkout.");
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  const tiers = [
    { tier: "pro", label: "Upgrade to Pro" },
    { tier: "premium", label: "Upgrade to Premium" },
  ].filter((t) => t.tier !== currentTier);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tiers.map((t) => (
        <button
          key={t.tier}
          onClick={() => checkout(t.tier)}
          disabled={busy !== null}
          className="rounded border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-cyan-50 disabled:opacity-50"
        >
          {busy === t.tier ? "Starting…" : t.label}
        </button>
      ))}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

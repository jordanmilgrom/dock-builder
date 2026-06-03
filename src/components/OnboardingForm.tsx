"use client";

import { useState } from "react";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

const ERRORS: Record<string, string> = {
  invalid_email: "Enter a valid email.",
  invalid_slug: "Subdomain can use letters, numbers, and hyphens only.",
  reserved_slug: "That subdomain is reserved — pick another.",
  slug_taken: "That subdomain is taken — pick another.",
  missing_fields: "Fill in every field.",
};

export default function OnboardingForm() {
  const [email, setEmail] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [slug, setSlug] = useState("");
  const [touchedSlug, setTouchedSlug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ slug: string; hostedHint: string } | null>(null);

  const effectiveSlug = touchedSlug ? slug : slugify(tenantName);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, tenantName, slug: effectiveSlug }),
      });
      const data = (await res.json()) as { ok?: boolean; slug?: string; hostedHint?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(ERRORS[data.error ?? ""] ?? "Could not create your account.");
        return;
      }
      setDone({ slug: data.slug!, hostedHint: data.hostedHint ?? `?tenant=${data.slug}` });
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-lg font-bold text-emerald-900">You&apos;re live — 14-day trial started 🎉</h2>
        <p className="mt-2 text-sm text-emerald-800">
          Your hosted configurator is at <code className="rounded bg-white px-1">{done.slug}.app.com</code>.
        </p>
        <p className="mt-1 text-xs text-emerald-700">
          Local dev / preview: open <a className="underline" href={`/${done.hostedHint}`}>/{done.hostedHint}</a>
        </p>
        <a href="/builder" className="mt-4 inline-block rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
          Go to your dashboard →
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">Start your dock configurator</h1>
      <p className="mt-1 text-sm text-slate-600">
        Create your branded, hosted configurator. 14-day free trial — no card needed to start.
      </p>
      <label className="mt-4 block text-sm">
        <span className="text-slate-600">Business name</span>
        <input className="mt-0.5 block w-full rounded border border-slate-300 px-3 py-2 text-sm" value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="Harbor Works" />
      </label>
      <label className="mt-3 block text-sm">
        <span className="text-slate-600">Subdomain</span>
        <div className="mt-0.5 flex items-center rounded border border-slate-300">
          <input className="block w-full rounded-l px-3 py-2 text-sm" value={effectiveSlug} onChange={(e) => { setTouchedSlug(true); setSlug(slugify(e.target.value)); }} placeholder="harbor-works" />
          <span className="px-2 text-sm text-slate-400">.app.com</span>
        </div>
      </label>
      <label className="mt-3 block text-sm">
        <span className="text-slate-600">Your email</span>
        <input type="email" className="mt-0.5 block w-full rounded border border-slate-300 px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@harborworks.com" />
      </label>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        className="mt-4 w-full rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
        onClick={submit}
        disabled={busy || !email || !tenantName || !effectiveSlug}
      >
        {busy ? "Creating…" : "Create my configurator"}
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";

/** Reusable magic-link request form for builder + platform-admin sign-in. */
export default function MagicLoginForm({
  endpoint,
  title,
  subtitle,
}: {
  endpoint: string;
  title: string;
  subtitle: string;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok?: boolean; magicLink?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error === "invalid_email" ? "Enter a valid email." : "Could not send link.");
        return;
      }
      setLink(data.magicLink ?? null);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      <input
        type="email"
        className="mt-4 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        className="mt-3 w-full rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
        onClick={submit}
        disabled={busy || email.length === 0}
      >
        {busy ? "Sending…" : "Email me a sign-in link"}
      </button>
      {link && (
        <p className="mt-3 rounded border border-cyan-200 bg-cyan-50 p-2 text-xs text-cyan-900">
          Dev magic link (normally emailed):{" "}
          <a className="break-all underline" href={link}>{link}</a>
        </p>
      )}
    </div>
  );
}

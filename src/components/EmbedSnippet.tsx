"use client";

import { useState } from "react";

/** Shows the copy-paste embed snippet (§5.7). Gated by entitlements.embed. */
export default function EmbedSnippet({ snippet, entitled }: { snippet: string; entitled: boolean }) {
  const [copied, setCopied] = useState(false);

  if (!entitled) {
    return <p className="text-sm text-slate-500">The embeddable widget is a Pro feature. Upgrade to embed the configurator on your own site.</p>;
  }
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">Paste this into your site where the configurator should appear:</p>
      <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{snippet}</pre>
      <button
        onClick={() => { void navigator.clipboard?.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="mt-2 rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800"
      >
        {copied ? "Copied ✓" : "Copy snippet"}
      </button>
    </div>
  );
}

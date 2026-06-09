"use client";

import { useEffect, useRef, useState } from "react";
import { DEBOUNCE_MS, debounce } from "@/lib/propertiesPanel";

/** Small shared controls for the right-rail Properties panel (Phase 7). */

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-200 px-4 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

/**
 * Number input that holds local text while editing and commits the parsed value
 * on a 200 ms debounce (kickoff: all Properties inputs debounce before writing
 * the in-memory config). Blur flushes immediately.
 */
export function DebouncedNum({
  label,
  value,
  onCommit,
  step = 0.5,
  min = 0,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  step?: number;
  min?: number;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => setLocal(String(value)), [value]);

  const latest = useRef(onCommit);
  latest.current = onCommit;
  const debounced = useRef<((n: number) => void) & { flush: () => void; cancel: () => void }>();
  if (!debounced.current) debounced.current = debounce((n: number) => latest.current(n), DEBOUNCE_MS);

  function change(raw: string) {
    setLocal(raw);
    const n = Number(raw);
    if (Number.isFinite(n)) debounced.current!(n);
  }

  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={local}
        onChange={(e) => change(e.target.value)}
        onBlur={() => debounced.current!.flush()}
        className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
    </label>
  );
}

/** Label + value with −/+ stepper buttons (no debounce — discrete commits). */
export function Stepper({
  label,
  value,
  display,
  onStep,
}: {
  label: string;
  value: number;
  display?: string;
  onStep: (dir: -1 | 1) => void;
}) {
  return (
    <div className="text-sm">
      <span className="text-slate-600">{label}</span>
      <div className="mt-0.5 flex items-center rounded border border-slate-300">
        <button onClick={() => onStep(-1)} className="px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label={`${label} down`}>−</button>
        <span className="flex-1 text-center font-medium text-slate-800">{display ?? value}</span>
        <button onClick={() => onStep(1)} className="px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label={`${label} up`}>+</button>
      </div>
    </div>
  );
}

export function Sel({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-sm">
        {options.map((o) => (<option key={o} value={o}>{o.replace(/_/g, " ")}</option>))}
      </select>
    </label>
  );
}

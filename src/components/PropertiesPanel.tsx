"use client";

import type { DockConfig, DockPiece, pricingEngine, validationEngine } from "@/engine";
import { selectionPill } from "@/lib/propertiesPanel";
import DesignProperties, { type DesignActions } from "./DesignProperties";
import PieceProperties from "./PieceProperties";

/**
 * Right-rail Properties panel (Phase 7). Always visible. A pill switches between
 * the selected piece's editor and the design-level editor; live engine output
 * (estimate / warnings / auto-fixes) renders below. Reads engine results passed
 * in — it never calls the engine itself.
 */
export default function PropertiesPanel({
  selectedIndex,
  piece,
  config,
  update,
  onUpdatePiece,
  onDeletePiece,
  validation,
  estimate,
  priceHidden,
  actions,
}: {
  selectedIndex: number | null;
  piece: DockPiece | null;
  config: DockConfig;
  update: (mut: (c: DockConfig) => DockConfig) => void;
  onUpdatePiece: (patch: Partial<DockPiece>) => void;
  onDeletePiece: () => void;
  validation: ReturnType<typeof validationEngine>;
  estimate: ReturnType<typeof pricingEngine>;
  priceHidden: boolean;
  actions: DesignActions;
}) {
  const pill = selectionPill(selectedIndex);

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pill === "Selection" ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>
          {pill}
        </span>
        <span className="text-xs text-slate-400">
          {pill === "Selection" ? "Editing selected piece" : "Editing the whole design"}
        </span>
      </div>

      {piece ? (
        <PieceProperties piece={piece} onUpdate={onUpdatePiece} onDelete={onDeletePiece} />
      ) : (
        <DesignProperties config={config} update={update} actions={actions} />
      )}

      <div className="mt-auto">
        <Panel title="Engineering checks">
          <Metrics validation={validation} />
          <Issues label="Errors" items={validation.errors.map((e) => e.message)} tone="error" />
          <Issues label="Warnings" items={validation.warnings.map((w) => w.message)} tone="warn" />
          <Issues label="Auto-fixes applied" items={validation.autoFixes} tone="info" />
        </Panel>
        <Panel title="Estimate">
          {priceHidden ? (
            <p className="text-sm text-slate-600">Enter your contact info to see this builder&apos;s estimate.</p>
          ) : (
            <EstimateTable estimate={estimate} />
          )}
        </Panel>
      </div>
    </aside>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-200 px-4 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Metrics({ validation }: { validation: ReturnType<typeof validationEngine> }) {
  const d = validation.derived;
  const items: [string, string][] = [
    ["Deck area", `${d.deckAreaFt2} ft²`],
    ["Sections", `${d.sectionCount}`],
    ["Max joist span", `${d.maxJoistSpanFt} ft`],
    ["Est. weight", `${d.estWeightLbs.toLocaleString()} lbs`],
  ];
  if (d.floatCount > 0) {
    items.push(["Required buoyancy", `${d.requiredBuoyancyLbs.toLocaleString()} lbs`]);
    items.push(["Floats", `${d.floatCount}`]);
    if (d.estFreeboardIn != null) items.push(["Est. freeboard", `${d.estFreeboardIn} in`]);
  }
  if (d.pilingCount > 0) items.push(["Pilings", `${d.pilingCount}`]);
  if (d.gangwayLengthFt > 0) items.push(["Gangway", `${d.gangwayLengthFt} ft`]);
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 border-b border-slate-100 py-0.5">
          <dt className="text-slate-500">{k}</dt>
          <dd className="font-medium text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Issues({ label, items, tone }: { label: string; items: string[]; tone: "error" | "warn" | "info" }) {
  if (items.length === 0) return null;
  const cls = tone === "error" ? "border-red-200 bg-red-50 text-red-800" : tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <div className={`mt-2 rounded border p-2 text-xs ${cls}`}>
      <p className="font-semibold">{label}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.map((m) => (<li key={m}>{m}</li>))}
      </ul>
    </div>
  );
}

function EstimateTable({ estimate }: { estimate: ReturnType<typeof pricingEngine> }) {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: estimate.currency, maximumFractionDigits: 0 }).format(n);
  const showItems = estimate.priceVisibility === "full";
  return (
    <div className="text-sm">
      {showItems && (
        <table className="mb-2 w-full">
          <tbody>
            {estimate.lineItems.map((li) => (
              <tr key={li.key} className="border-b border-slate-100">
                <td className="py-0.5 text-slate-600">{li.label} <span className="text-slate-400">×{li.qty}</span></td>
                <td className="py-0.5 text-right font-medium">{fmt(li.subtotal)}</td>
              </tr>
            ))}
            <tr><td className="py-0.5 text-slate-600">Labor / install</td><td className="py-0.5 text-right">{fmt(estimate.labor)}</td></tr>
            {estimate.delivery > 0 && <tr><td className="py-0.5 text-slate-600">Delivery</td><td className="py-0.5 text-right">{fmt(estimate.delivery)}</td></tr>}
            {estimate.markup > 0 && <tr><td className="py-0.5 text-slate-600">Markup</td><td className="py-0.5 text-right">{fmt(estimate.markup)}</td></tr>}
          </tbody>
        </table>
      )}
      <div className="flex items-center justify-between border-t border-slate-300 pt-2 text-base font-bold">
        <span>{estimate.priceVisibility === "starting_from" ? "Starting from" : "Total"}</span>
        <span>{fmt(estimate.total)}</span>
      </div>
      {estimate.minimumApplied && <p className="mt-1 text-xs text-slate-500">Minimum project price applied.</p>}
    </div>
  );
}

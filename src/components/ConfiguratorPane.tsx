"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  pricingEngine,
  validationEngine,
  type DockConfig,
  type DockPiece,
  type DockType,
  type PricingProfile,
  type Rotation,
} from "@/engine";
import { parseViewParam, VIEW_LABELS, VIEW_MODES, viewSearchString, type ViewMode } from "@/lib/viewSwitcher";
import CanvasMode, { unionBbox } from "./CanvasMode";
import { placeToRight } from "@/lib/newPiecePlacement";
import SchematicMode from "./SchematicMode";
import ThreeDMode from "./ThreeDMode";
import PropertiesPanel from "./PropertiesPanel";
import CustomPieceModal from "./CustomPieceModal";
import SaveGate, { type CaptureResult } from "./SaveGate";
import type { DesignActions } from "./DesignProperties";

/**
 * Canvas-first configurator shell (Phase 7). Three columns — left palette, the
 * active view (Canvas / Schematic / 3D), right Properties — under a top view
 * switcher persisted in `?view=`. Owns the in-memory DockConfig + selection and
 * runs the (unchanged) pricing/validation engines for live feedback. This
 * replaces the old two-column Configurator form across every call site.
 */
export default function ConfiguratorPane({
  designId,
  initialConfig,
  initialVersion,
  emailCaptured,
  profiles,
  brandName,
  mode = "customer",
  leadId,
  alreadySubmitted = false,
  threeDEnabled = false,
  primaryColor,
  quotable = true,
}: {
  designId: string;
  initialConfig: DockConfig;
  initialVersion: number;
  emailCaptured: boolean;
  profiles: Partial<Record<DockType, PricingProfile>>;
  brandName: string;
  mode?: "customer" | "builder";
  leadId?: string;
  alreadySubmitted?: boolean;
  threeDEnabled?: boolean;
  primaryColor?: string;
  quotable?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view: ViewMode = parseViewParam(searchParams.get("view"));
  const isBuilder = mode === "builder";

  const [config, setConfig] = useState<DockConfig>(initialConfig);
  const [selected, setSelected] = useState<number | null>(null);
  const [version, setVersion] = useState(initialVersion);
  const [captured, setCaptured] = useState(emailCaptured || isBuilder);
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<null | "save">(null);
  const [pending, setPending] = useState<null | "save" | "pdf">(null);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [modal, setModal] = useState<null | DockPiece["pieceKind"]>(null);
  const [paletteOpen, setPaletteOpen] = useState(true);

  const profile = useMemo(
    () => profiles[config.dockType] ?? profiles[initialConfig.dockType]!,
    [config.dockType, profiles, initialConfig.dockType],
  );
  const validation = useMemo(() => validationEngine(config), [config]);
  const estimate = useMemo(() => pricingEngine(config, profile, { deliveryDistanceMiles: 30 }), [config, profile]);
  const hasErrors = validation.errors.length > 0;
  const priceHidden = estimate.priceVisibility === "hidden_until_contact" && !captured;

  const pieces: DockPiece[] = config.pieces ?? [
    { pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: config.overall.lengthFt, widthFt: config.overall.widthFt },
  ];

  function update(mut: (c: DockConfig) => DockConfig) {
    setConfig((c) => mut(structuredClone(c)));
    setDirty(true);
    setStatus(null);
  }
  function setPieces(next: DockPiece[]) {
    update((c) => {
      const b = piecesBounds(next);
      return { ...c, pieces: next, overall: { ...c.overall, lengthFt: b.lengthFt, widthFt: b.widthFt } };
    });
  }

  // ---- palette / piece ops ----
  function addPiece(p: DockPiece) {
    // Place to the right of the existing design (1 ft gap) so new pieces never
    // land on top of existing ones; the canvas auto-fits to bring it into view.
    const { posX, posY } = pieces.length ? placeToRight(unionBbox(pieces)) : { posX: 0, posY: 0 };
    setPieces([...pieces, { ...p, posX, posY }]);
    setSelected(pieces.length);
  }
  function updatePiece(patch: Partial<DockPiece>) {
    if (selected == null) return;
    setPieces(pieces.map((p, i) => (i === selected ? ({ ...p, ...patch } as DockPiece) : p)));
  }
  function deletePiece() {
    if (selected == null) return;
    setPieces(pieces.filter((_, i) => i !== selected));
    setSelected(null);
  }

  // ---- persistence (unchanged from the old Configurator) ----
  async function persist(): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(`/api/designs/${designId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = (await res.json()) as { revision?: { version: number }; error?: string };
      if (!res.ok || !data.revision) { setStatus("Save failed."); return false; }
      setVersion(data.revision.version);
      setDirty(false);
      setStatus(`Saved v${data.revision.version}`);
      return true;
    } catch {
      setStatus("Network error.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function handleSave() {
    if (hasErrors) return;
    if (!captured) { setPending("save"); setGate("save"); return; }
    await persist();
  }
  async function handlePdf() {
    if (!captured) { setPending("pdf"); setGate("save"); return; }
    if (dirty) { const ok = await persist(); if (!ok) return; }
    window.open(`/api/designs/${designId}/pdf`, "_blank");
  }
  async function handleSubmit() {
    if (hasErrors || !captured || submitted) return;
    if (dirty) { const ok = await persist(); if (!ok) return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/designs/${designId}/submit`, { method: "POST" });
      if (res.ok) { setSubmitted(true); setStatus("Submitted — the builder will review and send your quote."); }
      else setStatus("Could not submit.");
    } finally {
      setBusy(false);
    }
  }
  async function handleSendQuote() {
    if (hasErrors || !leadId || !quotable) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/builder/leads/${leadId}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = (await res.json()) as { ok?: boolean; revision?: { version: number } };
      if (res.ok && data.ok) {
        if (data.revision) setVersion(data.revision.version);
        setDirty(false);
        setStatus(`Quote sent${data.revision ? ` (v${data.revision.version})` : ""}.`);
      } else setStatus("Could not send quote.");
    } catch {
      setStatus("Network error.");
    } finally {
      setBusy(false);
    }
  }
  async function onCaptured(r: CaptureResult) {
    setCaptured(true);
    setGate(null);
    setMagicLink(r.magicLink || null);
    if (pending === "save" || pending === "pdf") {
      const ok = await persist();
      if (ok && pending === "pdf") window.open(`/api/designs/${designId}/pdf`, "_blank");
    }
    setPending(null);
  }

  function switchView(v: ViewMode) {
    router.replace(`${pathname}${viewSearchString(v, searchParams.toString())}`, { scroll: false });
  }

  const actions: DesignActions = {
    mode, busy, dirty, version, submitted, hasErrors, captured, quotable,
    historyHref: `/design/${designId}/history`, status,
    onSave: handleSave, onPdf: handlePdf, onSubmit: handleSubmit, onSendQuote: handleSendQuote,
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[32rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Left rail — palette */}
      <div className={`flex flex-col border-r border-slate-200 bg-slate-50 transition-all ${paletteOpen ? "w-[220px]" : "w-16"}`}>
        <button
          onClick={() => setPaletteOpen((o) => !o)}
          className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100"
        >
          {paletteOpen && <span>Add pieces</span>}
          <span>{paletteOpen ? "«" : "»"}</span>
        </button>
        {view === "canvas" ? (
          <div className="flex flex-col gap-1 p-2">
            <PaletteBtn open={paletteOpen} icon="▭" label="Rectangle 8×20" onClick={() => addPiece({ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 20, widthFt: 8 })} />
            <PaletteBtn open={paletteOpen} icon="□" label="Square 8×8" onClick={() => addPiece({ pieceKind: "rectangle", posX: 0, posY: 0, rotationDeg: 0, lengthFt: 8, widthFt: 8 })} />
            <PaletteBtn open={paletteOpen} icon="◹" label="Right triangle 4×4" onClick={() => addPiece({ pieceKind: "right_triangle", posX: 0, posY: 0, rotationDeg: 0, legAFt: 4, legBFt: 4 })} />
            <PaletteBtn open={paletteOpen} icon="▭+" label="Custom rectangle…" onClick={() => setModal("rectangle")} />
            <PaletteBtn open={paletteOpen} icon="◹+" label="Custom triangle…" onClick={() => setModal("right_triangle")} />
          </div>
        ) : (
          paletteOpen && <p className="p-3 text-xs text-slate-400">Switch to Canvas to add or edit pieces.</p>
        )}
      </div>

      {/* Main pane — view switcher + active view */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-1 border-b border-slate-200 px-3 py-2">
          {VIEW_MODES.map((m) => (
            <button
              key={m}
              onClick={() => switchView(m)}
              disabled={m === "3d" && !threeDEnabled}
              title={m === "3d" && !threeDEnabled ? "Interactive 3D is available on Pro & Premium." : undefined}
              className={`rounded px-3 py-1 text-sm font-medium ${view === m ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"} ${m === "3d" && !threeDEnabled ? "opacity-40" : ""}`}
            >
              {VIEW_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="relative flex-1 overflow-hidden">
          {view === "canvas" && (
            <CanvasMode
              pieces={pieces}
              selectedIndex={selected}
              onChange={setPieces}
              onSelect={setSelected}
              {...(primaryColor ? { primaryColor } : {})}
            />
          )}
          {view === "schematic" && <SchematicMode config={config} />}
          {view === "3d" && (threeDEnabled
            ? <ThreeDMode config={config} {...(primaryColor ? { primaryColor } : {})} />
            : <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">Interactive 3D is available on Pro &amp; Premium.</div>)}
        </div>
      </div>

      {/* Right rail — properties */}
      <div className="w-[340px] border-l border-slate-200">
        <PropertiesPanel
          selectedIndex={selected}
          piece={selected != null ? pieces[selected] ?? null : null}
          config={config}
          update={update}
          onUpdatePiece={updatePiece}
          onDeletePiece={deletePiece}
          validation={validation}
          estimate={estimate}
          priceHidden={priceHidden}
          actions={actions}
        />
      </div>

      {modal && (
        <CustomPieceModal kind={modal} onCancel={() => setModal(null)} onAdd={(p) => { addPiece(p); setModal(null); }} />
      )}
      {gate && (
        <SaveGate designId={designId} source="save_gate" brandName={brandName} onCancel={() => { setGate(null); setPending(null); }} onCaptured={onCaptured} />
      )}
      {magicLink && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-cyan-200 bg-cyan-50 p-2 text-xs text-cyan-900 shadow">
          Dev magic link (normally emailed): <a className="break-all underline" href={magicLink}>{magicLink}</a>
        </div>
      )}
    </div>
  );
}

function PaletteBtn({ open, icon, label, onClick }: { open: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-2 text-left text-sm text-slate-700 hover:border-brand hover:bg-cyan-50"
    >
      <span className="text-base leading-none">{icon}</span>
      {open && <span className="truncate">{label}</span>}
    </button>
  );
}

/** Bounding length×width (ft) across drawn pieces, honoring 90° rotations. */
function piecesBounds(pieces: DockPiece[]): { lengthFt: number; widthFt: number } {
  const rotate = (x: number, y: number, deg: Rotation): [number, number] =>
    deg === 90 ? [-y, x] : deg === 180 ? [-x, -y] : deg === 270 ? [y, -x] : [x, y];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pieces) {
    const corners = p.pieceKind === "right_triangle"
      ? [[0, 0], [p.legAFt ?? 0, 0], [0, p.legBFt ?? 0]]
      : [[0, 0], [p.lengthFt ?? 0, 0], [p.lengthFt ?? 0, p.widthFt ?? 0], [0, p.widthFt ?? 0]];
    for (const [x, y] of corners) {
      const [rx, ry] = rotate(x!, y!, p.rotationDeg);
      minX = Math.min(minX, p.posX + rx); maxX = Math.max(maxX, p.posX + rx);
      minY = Math.min(minY, p.posY + ry); maxY = Math.max(maxY, p.posY + ry);
    }
  }
  if (!Number.isFinite(minX)) return { lengthFt: 1, widthFt: 1 };
  return { lengthFt: Math.max(1, Math.round(maxX - minX)), widthFt: Math.max(1, Math.round(maxY - minY)) };
}

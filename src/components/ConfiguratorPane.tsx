"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { matchShortcut } from "@/lib/canvasShortcuts";
import { createHistory } from "@/lib/undoRedo";
import { bringToFront, copyPieces, duplicatePieces, pastePieces, sendToBack } from "@/lib/clipboardOps";
import type { DrawTool } from "@/lib/clickDragDraw";
import { resolveBathymetry, snapGangwayToEdge, type Bathymetry } from "@/engine";
import SchematicMode from "./SchematicMode";
import SiteMode from "./SiteMode";
import ThreeDMode from "./ThreeDMode";
import PropertiesPanel from "./PropertiesPanel";
import PieceContextMenu, { type ContextAction, type ContextMenuState } from "./PieceContextMenu";
import SaveGate, { type CaptureResult } from "./SaveGate";
import type { DesignActions } from "./DesignProperties";

const TOOLS: { tool: DrawTool; icon: string; label: string }[] = [
  { tool: "rectangle", icon: "▭", label: "Rectangle" },
  { tool: "square", icon: "□", label: "Square" },
  { tool: "right_triangle", icon: "◹", label: "Right triangle" },
  { tool: "gangway", icon: "▤", label: "Gangway" },
];

/**
 * Canvas-first configurator shell (Phase 7 + 10). Owns the DockConfig, the
 * multi-piece selection set, the armed drawing tool, undo/redo, the clipboard,
 * and keyboard shortcuts (Canvas tab only). Engines stay untouched.
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
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [armedTool, setArmedTool] = useState<DrawTool | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [version, setVersion] = useState(initialVersion);
  const [captured, setCaptured] = useState(emailCaptured || isBuilder);
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<null | "save">(null);
  const [pending, setPending] = useState<null | "save" | "pdf">(null);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(true);

  const clipboard = useRef<DockPiece[]>([]);
  const history = useRef(createHistory<DockConfig>());
  const applying = useRef(false);

  const primary = selectedIndices.length ? selectedIndices[selectedIndices.length - 1]! : null;

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

  // Undo/redo: snapshot every config change (rapid edits coalesce in the buffer).
  useEffect(() => {
    if (applying.current) { applying.current = false; return; }
    history.current.push(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

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

  // ---- piece ops ----
  function addPiece(p: DockPiece) {
    const { posX, posY } = pieces.length ? placeToRight(unionBbox(pieces)) : { posX: 0, posY: 0 };
    setPieces([...pieces, { ...p, posX, posY }]);
    setSelectedIndices([pieces.length]);
  }
  function addDrawnPiece(p: DockPiece) {
    let placed = p;
    // Phase 11: a freshly-drawn gangway snaps to the nearest dock-piece edge.
    if (p.pieceKind === "gangway") {
      const targets = pieces
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => q.pieceKind !== "gangway")
        .map(({ q, i }) => ({ id: String(i), bbox: dockPieceBbox(q) }));
      const snap = snapGangwayToEdge({ posX: p.posX, posY: p.posY, lengthFt: p.lengthFt ?? 0, widthFt: p.widthFt ?? 0 }, targets);
      if (snap) placed = { ...p, posX: snap.posX, posY: snap.posY, connectsToPieceId: snap.connectsToPieceId };
    }
    setPieces([...pieces, placed]);
    setSelectedIndices([pieces.length]);
  }
  function setBathymetry(b: Bathymetry) {
    update((c) => ({ ...c, bathymetry: b }));
  }
  function updatePiece(patch: Partial<DockPiece>) {
    if (primary == null) return;
    setPieces(pieces.map((p, i) => (i === primary ? ({ ...p, ...patch } as DockPiece) : p)));
  }
  function deleteSelection() {
    if (!selectedIndices.length) return;
    const drop = new Set(selectedIndices);
    setPieces(pieces.filter((_, i) => !drop.has(i)));
    setSelectedIndices([]);
  }
  function duplicateSelection() {
    if (!selectedIndices.length) return;
    const { pieces: next, newIndices } = duplicatePieces(pieces, selectedIndices);
    setPieces(next);
    setSelectedIndices(newIndices);
  }
  function copySelection() {
    if (selectedIndices.length) clipboard.current = copyPieces(pieces, selectedIndices);
  }
  function pasteClipboard() {
    if (!clipboard.current.length) return;
    const { pieces: next, newIndices } = pastePieces(pieces, clipboard.current);
    setPieces(next);
    setSelectedIndices(newIndices);
  }
  function selectAll() {
    setSelectedIndices(pieces.map((_, i) => i));
  }
  function undo() {
    const s = history.current.undo();
    if (s) { applying.current = true; setConfig(s); setSelectedIndices([]); setDirty(true); }
  }
  function redo() {
    const s = history.current.redo();
    if (s) { applying.current = true; setConfig(s); setSelectedIndices([]); setDirty(true); }
  }

  // ---- keyboard shortcuts (Canvas tab only; ignore while typing) ----
  useEffect(() => {
    if (view !== "canvas") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const a = matchShortcut(e);
      if (!a) return;
      e.preventDefault();
      switch (a) {
        case "copy": copySelection(); break;
        case "paste": pasteClipboard(); break;
        case "duplicate": duplicateSelection(); break;
        case "delete": deleteSelection(); break;
        case "selectAll": selectAll(); break;
        case "undo": undo(); break;
        case "redo": redo(); break;
        case "deselect": setSelectedIndices([]); setArmedTool(null); setMenu(null); break;
        case "fit": break; // handled inside CanvasMode (it owns the transform)
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onContextAction(a: ContextAction) {
    switch (a) {
      case "duplicate": duplicateSelection(); break;
      case "delete": deleteSelection(); break;
      case "bringToFront": setPieces(bringToFront(pieces, selectedIndices)); break;
      case "sendToBack": setPieces(sendToBack(pieces, selectedIndices)); break;
      case "paste": pasteClipboard(); break;
      case "selectAll": selectAll(); break;
      case "properties": break;
      case "fit": break;
    }
  }

  // ---- persistence ----
  async function persist(): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(`/api/designs/${designId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config }),
      });
      const data = (await res.json()) as { revision?: { version: number }; error?: string };
      if (!res.ok || !data.revision) { setStatus("Save failed."); return false; }
      setVersion(data.revision.version);
      setDirty(false);
      setStatus(`Saved v${data.revision.version}`);
      history.current.clear(); // saved revisions are the long-term history
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
    } finally { setBusy(false); }
  }
  async function handleSendQuote() {
    if (hasErrors || !leadId || !quotable) return;
    setBusy(true); setStatus(null);
    try {
      const res = await fetch(`/api/builder/leads/${leadId}/quote`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config }),
      });
      const data = (await res.json()) as { ok?: boolean; revision?: { version: number } };
      if (res.ok && data.ok) {
        if (data.revision) setVersion(data.revision.version);
        setDirty(false);
        setStatus(`Quote sent${data.revision ? ` (v${data.revision.version})` : ""}.`);
      } else setStatus("Could not send quote.");
    } catch { setStatus("Network error."); } finally { setBusy(false); }
  }
  async function onCaptured(r: CaptureResult) {
    setCaptured(true); setGate(null); setMagicLink(r.magicLink || null);
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
      {/* Left rail — drawing tools */}
      <div className={`flex flex-col border-r border-slate-200 bg-slate-50 transition-all ${paletteOpen ? "w-[220px]" : "w-16"}`}>
        <button
          onClick={() => setPaletteOpen((o) => !o)}
          className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100"
        >
          {paletteOpen && <span>Draw</span>}
          <span>{paletteOpen ? "«" : "»"}</span>
        </button>
        {view === "canvas" ? (
          <div className="flex flex-col gap-1 p-2">
            {TOOLS.map((t) => (
              <button
                key={t.tool}
                onClick={() => setArmedTool((cur) => (cur === t.tool ? null : t.tool))}
                title={`${t.label} — click to arm, then click-drag on the canvas (click to drop a default size)`}
                className={`flex items-center gap-2 rounded border px-2 py-2 text-left text-sm ${armedTool === t.tool ? "border-brand bg-cyan-100 text-brand" : "border-slate-200 bg-white text-slate-700 hover:border-brand hover:bg-cyan-50"}`}
              >
                <span className="text-base leading-none">{t.icon}</span>
                {paletteOpen && <span className="truncate">{t.label}</span>}
              </button>
            ))}
            {paletteOpen && (
              <p className="mt-1 px-1 text-[11px] leading-snug text-slate-400">
                Click a tool, then drag on the canvas to draw — or click once to drop a default size.
              </p>
            )}
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
              config={config}
              selectedIndices={selectedIndices}
              onChange={setPieces}
              onSelectionChange={setSelectedIndices}
              armedTool={armedTool}
              onDrawn={addDrawnPiece}
              onDisarm={() => setArmedTool(null)}
              onContextMenu={(info) => {
                if (info.onPiece && info.index != null && !selectedIndices.includes(info.index)) setSelectedIndices([info.index]);
                setMenu({ x: info.clientX, y: info.clientY, onPiece: info.onPiece, canPaste: clipboard.current.length > 0 });
              }}
              {...(primaryColor ? { primaryColor } : {})}
            />
          )}
          {view === "site" && <SiteMode bathymetry={resolveBathymetry(config)} onChange={setBathymetry} />}
          {view === "schematic" && <SchematicMode config={config} />}
          {view === "3d" && (threeDEnabled
            ? <ThreeDMode config={config} {...(primaryColor ? { primaryColor } : {})} />
            : <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">Interactive 3D is available on Pro &amp; Premium.</div>)}
        </div>
      </div>

      {/* Right rail — properties */}
      <div className="w-[340px] border-l border-slate-200">
        <PropertiesPanel
          selectedIndex={primary}
          selectionCount={selectedIndices.length}
          piece={primary != null ? pieces[primary] ?? null : null}
          config={config}
          update={update}
          onUpdatePiece={updatePiece}
          onDeletePiece={deleteSelection}
          validation={validation}
          estimate={estimate}
          priceHidden={priceHidden}
          actions={actions}
        />
      </div>

      {menu && <PieceContextMenu state={menu} onAction={onContextAction} onClose={() => setMenu(null)} />}
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

/** Axis-aligned world bbox of one piece (rotation-aware). */
function dockPieceBbox(p: DockPiece): { minX: number; minY: number; maxX: number; maxY: number } {
  const rotate = (x: number, y: number, deg: Rotation): [number, number] =>
    deg === 90 ? [-y, x] : deg === 180 ? [-x, -y] : deg === 270 ? [y, -x] : [x, y];
  const corners = p.pieceKind === "right_triangle"
    ? [[0, 0], [p.legAFt ?? 0, 0], [0, p.legBFt ?? 0]]
    : [[0, 0], [p.lengthFt ?? 0, 0], [p.lengthFt ?? 0, p.widthFt ?? 0], [0, p.widthFt ?? 0]];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of corners) {
    const [rx, ry] = rotate(x!, y!, p.rotationDeg);
    minX = Math.min(minX, p.posX + rx); maxX = Math.max(maxX, p.posX + rx);
    minY = Math.min(minY, p.posY + ry); maxY = Math.max(maxY, p.posY + ry);
  }
  return { minX, minY, maxX, maxY };
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

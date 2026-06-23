"use client";

import { useEffect, useRef } from "react";
import { SHORTCUT_HINT } from "@/lib/canvasShortcuts";

/**
 * Right-click context menu (Phase 10). Positioned at the cursor, clamped to the
 * viewport. On a piece → Duplicate / Delete / Bring to front / Send to back /
 * Properties. On empty canvas → Paste / Select all / Fit to view. Dismissed on
 * click-away, Esc, or after a choice.
 */

export type ContextAction =
  | "duplicate"
  | "delete"
  | "bringToFront"
  | "sendToBack"
  | "properties"
  | "paste"
  | "selectAll"
  | "fit";

export interface ContextMenuState {
  x: number;
  y: number;
  onPiece: boolean;
  canPaste: boolean;
}

const PIECE_ITEMS: { action: ContextAction; label: string; hint?: string; danger?: boolean }[] = [
  { action: "duplicate", label: "Duplicate", hint: SHORTCUT_HINT.duplicate },
  { action: "delete", label: "Delete", hint: SHORTCUT_HINT.delete, danger: true },
  { action: "bringToFront", label: "Bring to front" },
  { action: "sendToBack", label: "Send to back" },
  { action: "properties", label: "Properties" },
];

export default function PieceContextMenu({
  state,
  onAction,
  onClose,
}: {
  state: ContextMenuState;
  onAction: (a: ContextAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const items = state.onPiece
    ? PIECE_ITEMS
    : ([
        { action: "paste", label: "Paste", hint: SHORTCUT_HINT.paste, disabled: !state.canPaste },
        { action: "selectAll", label: "Select all", hint: SHORTCUT_HINT.selectAll },
        { action: "fit", label: "Fit to view", hint: SHORTCUT_HINT.fit },
      ] as const);

  // Clamp to the viewport so the menu never overflows offscreen.
  const left = Math.min(state.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 200);
  const top = Math.min(state.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 220);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[180px] rounded-md border border-slate-200 bg-white py-1 text-sm shadow-xl"
      style={{ left, top }}
    >
      {items.map((it) => {
        const disabled = "disabled" in it && it.disabled;
        return (
          <button
            key={it.action}
            role="menuitem"
            disabled={disabled}
            onClick={() => { onAction(it.action as ContextAction); onClose(); }}
            className={`flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left hover:bg-slate-100 disabled:opacity-40 ${"danger" in it && it.danger ? "text-red-600" : "text-slate-700"}`}
          >
            <span>{it.label}</span>
            {"hint" in it && it.hint && <span className="text-xs text-slate-400">{it.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

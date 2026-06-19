/**
 * Canvas keyboard shortcut matcher (Phase 10). Pure: maps a keyboard event to a
 * canvas action. The component listens only while the Canvas tab is active and
 * dispatches the returned action.
 */

export type CanvasAction =
  | "copy"
  | "paste"
  | "duplicate"
  | "delete"
  | "selectAll"
  | "undo"
  | "redo"
  | "deselect"
  | "fit";

export interface KeyEventLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

/** The Cmd (mac) / Ctrl (win/linux) modifier. */
function mod(e: KeyEventLike): boolean {
  return Boolean(e.metaKey || e.ctrlKey);
}

export function matchShortcut(e: KeyEventLike): CanvasAction | null {
  const k = e.key.toLowerCase();
  if (mod(e)) {
    switch (k) {
      case "c": return "copy";
      case "v": return "paste";
      case "d": return "duplicate";
      case "a": return "selectAll";
      case "z": return e.shiftKey ? "redo" : "undo";
      case "y": return "redo"; // common Windows redo
      default: return null;
    }
  }
  if (k === "delete" || k === "backspace") return "delete";
  if (k === "escape") return "deselect";
  if (k === "f") return "fit";
  return null;
}

/** Human-readable hint for a menu, e.g. "⌘D". */
export const SHORTCUT_HINT: Record<CanvasAction, string> = {
  copy: "⌘C",
  paste: "⌘V",
  duplicate: "⌘D",
  delete: "Del",
  selectAll: "⌘A",
  undo: "⌘Z",
  redo: "⌘⇧Z",
  deselect: "Esc",
  fit: "F",
};

/**
 * In-memory clipboard + duplicate/z-order ops (Phase 10). Pure. Not the OS
 * clipboard — a session-local `DockPiece[]`. Paste/duplicate offset +2 ft, +2 ft.
 */

import type { DockPiece } from "@/engine";

export const PASTE_OFFSET_FT = 2;

/** Deep-clone the selected pieces (by index) for the clipboard. */
export function copyPieces(pieces: readonly DockPiece[], selectedIdx: readonly number[]): DockPiece[] {
  return selectedIdx
    .filter((i) => i >= 0 && i < pieces.length)
    .map((i) => structuredClone(pieces[i]!));
}

/** Offset a set of pieces by (dx, dy) ft — clones, never mutates. */
export function offsetPieces(pieces: readonly DockPiece[], dx: number, dy: number): DockPiece[] {
  return pieces.map((p) => ({ ...structuredClone(p), posX: p.posX + dx, posY: p.posY + dy }));
}

/**
 * Paste the clipboard into the piece list, offset +2/+2. Returns the new full
 * list plus the indices of the pasted pieces (for auto-select).
 */
export function pastePieces(
  pieces: readonly DockPiece[],
  clipboard: readonly DockPiece[],
  offset = PASTE_OFFSET_FT,
): { pieces: DockPiece[]; newIndices: number[] } {
  const pasted = offsetPieces(clipboard, offset, offset);
  const next = [...pieces, ...pasted];
  const newIndices = pasted.map((_, k) => pieces.length + k);
  return { pieces: next, newIndices };
}

/** Duplicate the current selection in place (+2/+2), auto-selecting the copies. */
export function duplicatePieces(
  pieces: readonly DockPiece[],
  selectedIdx: readonly number[],
  offset = PASTE_OFFSET_FT,
): { pieces: DockPiece[]; newIndices: number[] } {
  return pastePieces(pieces, copyPieces(pieces, selectedIdx), offset);
}

/** Max / min z across pieces (for bring-to-front / send-to-back). */
function zRange(pieces: readonly DockPiece[]): { min: number; max: number } {
  let min = 0, max = 0;
  for (const p of pieces) {
    const z = p.z ?? 0;
    min = Math.min(min, z);
    max = Math.max(max, z);
  }
  return { min, max };
}

/** Bring the selected pieces to the front (z above everything else). */
export function bringToFront(pieces: readonly DockPiece[], selectedIdx: readonly number[]): DockPiece[] {
  const top = zRange(pieces).max + 1;
  const sel = new Set(selectedIdx);
  return pieces.map((p, i) => (sel.has(i) ? { ...p, z: top } : p));
}

/** Send the selected pieces to the back. */
export function sendToBack(pieces: readonly DockPiece[], selectedIdx: readonly number[]): DockPiece[] {
  const bottom = zRange(pieces).min - 1;
  const sel = new Set(selectedIdx);
  return pieces.map((p, i) => (sel.has(i) ? { ...p, z: bottom } : p));
}

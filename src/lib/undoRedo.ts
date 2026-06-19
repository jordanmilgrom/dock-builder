/**
 * In-memory undo/redo ring buffer (Phase 10). Generic over snapshot type (the
 * caller pushes `DockConfig` snapshots). Pure data structure — no I/O.
 *
 * - Max 50 entries (oldest dropped).
 * - Consecutive pushes within `coalesceMs` (500 ms) REPLACE the last entry, so a
 *   multi-step drag becomes one undo step.
 * - A new push clears the redo stack.
 * - `clear()` resets (called on design save).
 */

export const MAX_HISTORY = 50;
export const COALESCE_MS = 500;

export interface History<T> {
  push(snapshot: T, now?: number): void;
  undo(): T | undefined;
  redo(): T | undefined;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
  size(): number;
}

export function createHistory<T>(max = MAX_HISTORY, coalesceMs = COALESCE_MS): History<T> {
  let past: T[] = [];
  let future: T[] = [];
  let lastPushAt = -Infinity;

  return {
    push(snapshot, now = Date.now()) {
      future = []; // any new edit invalidates redo
      // Coalesce only between two real edits — never fold the first edit into the
      // baseline snapshot (so the baseline stays undoable).
      if (past.length > 1 && now - lastPushAt < coalesceMs) {
        past[past.length - 1] = snapshot; // coalesce rapid edits
      } else {
        past.push(snapshot);
        if (past.length > max) past.shift();
      }
      lastPushAt = now;
    },
    undo() {
      if (past.length <= 1) return undefined; // keep the baseline snapshot
      const current = past.pop()!;
      future.push(current);
      lastPushAt = -Infinity; // the next push after an undo never coalesces
      return past[past.length - 1];
    },
    redo() {
      const next = future.pop();
      if (next === undefined) return undefined;
      past.push(next);
      lastPushAt = -Infinity;
      return next;
    },
    canUndo() {
      return past.length > 1;
    },
    canRedo() {
      return future.length > 0;
    },
    clear() {
      past = [];
      future = [];
      lastPushAt = -Infinity;
    },
    size() {
      return past.length;
    },
  };
}

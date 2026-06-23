# Phase 10 — Canvas UX polish + selection + click-drag drawing

Makes the canvas feel like Figma/Illustrator: multi-select, marquee, right-click
menu, keyboard shortcuts, undo/redo, zoom buttons, a rotation handle that rotates
WITH the piece, and click-and-drag drawing from armed palette tools. **Strict
scope: Canvas + Properties UI.** Zero engine changes; the only data-shape touch is
the additive `DockPiece.z` JSON field (z-order). No Prisma DDL.

## Deliverable → file → test

| # | Deliverable | File(s) | Test |
|---|---|---|---|
| 1 | Gesture lifecycle (CSS-transform pattern, commit once) | `lib/canvasGesture.ts`; `CanvasMode` | `canvasGesture.test.ts`, perf guard in `canvas-power-user.test.ts` |
| 2 | Rotation handle math + position fix | `lib/rotationMath.ts`; `CanvasMode` `Handles` | `rotationMath.test.ts`, `e2e/rotate-handle-grabbable.test.ts` |
| 3 | Multi-select (shift-click, marquee, Cmd-A, Esc) | `lib/selection.ts`; `CanvasMode`; `ConfiguratorPane` (`Set`/array) | `selection.test.ts` |
| 4 | Right-click context menu | `components/PieceContextMenu.tsx`; `ConfiguratorPane` | (wired; actions covered by clipboard/selection libs) |
| 5 | Keyboard shortcuts | `lib/canvasShortcuts.ts`; `ConfiguratorPane` | `canvasShortcuts.test.ts` |
| 6 | Undo/redo (50-step ring, 500 ms coalesce, clear on save) | `lib/undoRedo.ts`; `ConfiguratorPane` | `undoRedo.test.ts` |
| 7 | Zoom buttons (+ / − / 100% / Fit) | `CanvasMode` | (uses tested `scaleToFit`) |
| 8 | Click-and-drag drawing; retire `CustomPieceModal` | `lib/clickDragDraw.ts`; `CanvasMode`; `ConfiguratorPane` palette | `clickDragDraw.test.ts` |
| 9 | Gangway placeholder on Canvas | `lib/gangwayPreview.ts`; `CanvasMode` | `gangwayPreview.test.ts` |
| — | Clipboard (copy/paste/duplicate +2/+2, z-order) | `lib/clipboardOps.ts` | `clipboardOps.test.ts` |
| — | Power-user flow | — | `e2e/canvas-power-user.test.ts` |

## Notes / judgment calls

- **No browser harness** (node-vitest only), so all canvas interactions are
  extracted into pure libs and exercised there; the e2e tests drive those libs +
  a perf guard (a gesture commits state exactly once — the "≤2 renders/gesture"
  intent). The components consume the same libs.
- **Rotation handle bug** (confirmed in alpha): the handle was offset straight-up
  in *screen* space regardless of rotation. Fixed via `handleUpDir(rotationDeg)`
  — the offset now follows the piece's local "up", so at 90° the handle sits to
  the right (grabbable). Rotation uses atan2-around-center with a ±5° snap to 90°.
- **Palette = armed tools.** Click a tool to arm it (crosshair, "Esc to cancel"),
  then drag to draw custom dimensions, or click once to drop a default size — the
  two behaviors the kickoff asked for, unified. `CustomPieceModal` is deleted.
- **Selection** is index-based (`number[]`) at the shell; the pure `selection.ts`
  works on generic string ids. Resize/rotate act on the most-recently-selected
  piece; drag and bulk Duplicate/Delete/z-order act on the whole selection.
- **Undo/redo** snapshots every config change; rapid drag frames coalesce inside
  500 ms into one entry; cleared on save (saved revisions are the long-term
  history). The baseline snapshot is never coalesced away.
- **Gangway placeholder** is read-only (dashed gray rect + label) left of the
  leftmost piece — Phase 11 makes it a real draggable piece.

## Migration / acme-docks

`DockPiece.z` defaults 0 (JSON field; existing pieces read as 0). No schema/seed
changes.

## Out of scope (Phase 10)

Bathymetry / shoreline / accessory placement / draggable gangway / 3D materials
(Phase 11); mobile-touch; real-time collaboration; tutorial overlay.

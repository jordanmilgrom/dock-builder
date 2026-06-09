# Phase 7 — Canvas-first IA + drag-and-drop polish

**Scope: UI/IA only.** Zero engine changes, zero `DockConfig` shape changes, and
exactly one additive `Tenant` column. The pure engines in `src/engine`,
`blueprint.ts`, pricing, validation, the 3D scene spec, and the PDF are all
untouched — the new views consume them as-is.

## What changed

Opening a design now loads a full-pane **Canvas editor** inside a three-column
shell, with a top view switcher and a right-side Properties panel. The starting
questionnaire is now an **opt-in wizard**.

### Information architecture

`ConfiguratorPane` (`src/components/ConfiguratorPane.tsx`) replaces the old
two-column `Configurator` form across every call site (design page, builder
revise-and-requote, embed). Layout:

- **Left rail** — collapsible piece palette (220 px open / 64 px collapsed):
  Rectangle 8×20, Square 8×8, Right triangle 4×4, and custom rectangle/triangle
  via `CustomPieceModal`. New pieces drop into the viewport center, auto-selected.
- **Main pane** — the active view, under a `Canvas / Schematic / 3D` tab bar. The
  active tab is persisted in the URL (`?view=`, default `canvas`).
- **Right rail** — the always-visible `PropertiesPanel` (340 px).

### Views

- **Canvas** (`CanvasMode`) — full-pane SVG with pan (middle-mouse / Space-drag),
  zoom-to-cursor (scroll, 0.1×–10×), auto-fit on mount and on add/delete,
  click-to-select, drag-reposition (1 ft snap), an 8-handle resize (corner =
  both dims, edge = one, 6 in snap on release, 4 ft floor; triangle leg handles),
  and a rotation handle (click = +90°, drag = free, snaps 90° on release). A zoom
  readout + "Fit to view" sit bottom-right.
- **Schematic** (`SchematicMode`) — read-only 2×2 grid of the four engine
  blueprint views; click a tile to expand (others collapse to a thumbnail strip),
  `✕`/`Esc` to return.
- **3D** (`ThreeDMode`) — the existing `DockView3D` filling the pane with a
  "Reset camera" button; orbit/zoom/pan preserved. Gated by
  `entitlements.fullThreeD`.

### Properties panel

`PropertiesPanel` shows a `Selection` / `Design` pill and swaps between:

- `PieceProperties` — dimensions (6 in steppers), position (1 ft), rotation
  (0/90/180/270 + free input), a read-only per-piece construction note (Phase 8),
  and Delete.
- `DesignProperties` — site conditions, gangway, materials, accessories, a
  recommendation badge, and the Save / PDF / Submit (or Send quote) actions.

Live engine output (metrics, warnings, auto-fixes, estimate) renders below. All
typed inputs debounce 200 ms before writing the in-memory `DockConfig`.

### Opt-in wizard

`CanvasLanding` replaces the always-on questionnaire. First-time visitors get a
card offering **Start the wizard →** (a 4-step stepper modal that ends by creating
a starting design from the recommended type) or **Skip — I'll draw it myself**.
Returning customers and `skipWizardByDefault` (Premium) tenants skip the card and
open the canvas directly.

## The one schema change

`Tenant.skipWizardByDefault Boolean @default(false)` — additive, defaults false so
existing tenants are unchanged. Premium-only, toggled in the branding editor
(`/builder`), enforced in `PATCH /api/builder/branding`. Migration:
`prisma/migrations/20260607000000_phase7_skip_wizard`.

## Pure libs (the testable core)

Browser interactions live in framework-free modules so they unit-test under node
(this repo has no jsdom/Playwright harness):

| Module | Responsibility |
| --- | --- |
| `src/lib/scaleToFit.ts` | `fitBbox`, `zoomAround`, pan, world↔screen |
| `src/lib/resizeHandles.ts` | 8-handle rect + triangle-leg resize, snap, min-dim |
| `src/lib/viewSwitcher.ts` | Canvas/Schematic/3D URL state |
| `src/lib/propertiesPanel.ts` | steppers, snaps, selection pill, debounce |

## Tests

- Unit: `scaleToFit`, `resizeHandles`, `viewSwitcher`, `propertiesPanel` (43).
- Flow (`e2e/`, node-driven): `canvas-first-flow`, `properties-panel`,
  `wizard-flow`. Browser-level interaction is exercised through the pure libs +
  DB round-trips; the design surface wiring is asserted via source checks.

## Cleanup

`Configurator.tsx`, `DockPiecesCanvas.tsx`, and `QuestionnaireForm.tsx` are
removed; `CustomPieceModal` (helpers + modal) is relocated to its own module.

## Out of scope (Phase 7)

Per-piece construction type, even-distribute spacing, multi-select, undo/redo,
mobile/touch gestures, tutorials, multi-user.

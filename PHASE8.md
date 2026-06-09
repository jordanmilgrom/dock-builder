# Phase 8 — Hybrid construction + even-distribute spacing

Two domain gaps from dock-industry alpha testing:

1. **Per-piece construction.** Real hybrid docks combine floating, pile, and
   roll-in (wheel) sections in one installation. `DockConfig.dockType` is now only
   the *default* for new pieces; every `DockPiece` carries its own
   `construction: 'floating' | 'pile' | 'wheel'` (enum is forward-compatible —
   `pipe` slots in later without a migration). Per-piece is the source of truth
   for layout, pricing, and validation.
2. **Even-distribute spacing.** The old "corner + every X ft" pile rule left a
   short, uneven last bay (22 ft @ 8 ft → 8 + 8 + 6). `evenDistribute` distributes
   supports *evenly* with a maximum gap (→ three equal ~7.33 ft bays) and never
   overhangs.

## Schema / config

`DockPiece.construction` and `OverallConfig.maxGapFt` (renamed from `bayFt`, range
4–10, default 8) both live in the `DockConfig` JSON (immutable revision
snapshots), not in relational columns — so, as with the Phase 6 sections→pieces
shim, migration is a **config transform**, applied lazily on read and available
explicitly as `migrateConfigToPhase8(config)`:

- every piece without a `construction` is stamped from the design `dockType`
  (`pipe`/`crib`/`suspension` → `pile`);
- `overall.bayFt` → `overall.maxGapFt` (default 8); `bayFt` still read as a
  fallback for un-migrated configs.

The seeded `Starter floating dock` template is stamped `floating`; a new
`Acme hybrid dock` template (floating + pile rectangle joined by a triangle
connector) exercises the new path.

## Engine

| Area | Change |
| --- | --- |
| `evenDistribute.ts` | `evenDistribute(runLengthFt, maxGapFt)` — single source for float + pile spacing (both axes). |
| `pieces.ts` | `floatLayoutForPiece` / `pileLayoutForPiece` / `wheelLayoutForPiece` branch on `piece.construction`; `maxGapFtFor`; `pileLastBayShort` replaces `pieceCantilever`. Wheels: 2 per rectangle at local `(0, w/2)` and `(length, w/2)`. |
| `geometry.ts` | Buoyancy + float count over floating pieces only; pile count over pile pieces; `wheelCount` / `suggestedWheelLayout`. |
| `validation.ts` | Dropped the `pile_cantilever` **error**; added advisories `pile_lastbay_short`, `mixed_construction_adjacency`, `triangle_construction_mismatch`. |
| `pricing.ts` / `seed.ts` | Bill floats + piles + wheels by actual per-piece counts; new `wheel_per_wheel` line (roll-in kit pricing). |

## Renderers (single shared geometry)

- **2D canvas** (`CanvasMode`): wheel pieces draw a 50%-primary frame, two primary
  wheel circles (radius ∝ width/8), and bracket arms to the centerline.
- **Schematic** (`blueprint.ts`): plan view draws floats / piles / wheel circles
  per piece by construction.
- **3D** (`view3d.ts` + `DockView3D`): wheel pieces emit two `CylinderGeometry`
  wheels (axis along length) + `BoxGeometry` bracket arms; deck rides at a 14 in
  freeboard. Deck height is computed per piece.

## UI

`PieceProperties` gains a **Construction** dropdown (Floating / Pile / Wheel) with
per-option tooltips; changing it re-runs the engine immediately (live warnings +
pricing).

## Tests

`evenDistribute`, `pieceConstruction`, `mixedAdjacencyWarning`,
`triangleConstructionMismatch`, `wheelRender`, `migration-construction`, and
`e2e/hybrid-dock-flow`. Canonical pile expectations updated where even-distribute
replaced the grid (the old `pile_cantilever` cases are now advisories). Full suite
green.

## Out of scope (forward-compatible)

Pipe-dock construction; inter-piece run detection (a 24+8 side from two rectangles
is two runs); per-piece `maxGapFt` override; wheel freeboard from real kit specs;
connector-hardware SKUs (the advisory mentions them).

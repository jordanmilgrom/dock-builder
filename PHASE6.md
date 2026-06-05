# Phase 6 — Real-world geometry: multi-piece docks, 2-row corner floats, pile bay grid

Alpha testing with a dock-industry expert surfaced three gaps. Phase 6 fixes them.
Engines stay pure (`src/engine` exports only functions); the change is schema +
engine + UI.

## 1. A dock is now composed of pieces (not one rectangle)

`DockConfig.pieces: DockPiece[]` — each piece is a **rectangle** (`lengthFt ×
widthFt`) or a **right triangle** (`legAFt`, `legBFt`, hypotenuse implied),
placed at `(posX, posY)` in feet and rotated `0|90|180|270`. Customers compose
the dock on a drawing canvas (`DockPiecesCanvas`): add rectangles/triangles, drag
on a 1 ft grid, rotate 90°, edges snap to neighbors within 6 in.

- `deckAreaFt2` sums piece areas (triangle = `legA·legB/2`); touching edges don't
  double-count.
- `resolvePieces(config)` is the single resolver. **Back-compat:** configs with no
  `pieces` are read as a chain of rectangle pieces from `(0,0)` — from `sections`
  if present, else the `overall` length×width (floating docks auto-section by the
  §3.3 max length, as before). No DB rewrite needed — proven by
  `src/engine/migration.test.ts`.

## 2. Floats: two rows minimum + a float at every corner

Departing from the literal §3.1 wording ("two rows when wider than ~6 ft"), Phase
6 follows industry practice:

- **Two rows minimum** at any practical width; **+1 row per full 6 ft** above
  6 ft → `rowCount = max(2, floor(widthFt/6) + 1)`: 5–11 ft → 2 rows, **12 ft → 3**,
  **18 ft → 4**.
- A **float at every corner** and **≤ 8 ft spacing** within a row.
- Triangles get a float at each of the 3 corners + along the legs at ≤ 8 ft.

Float **count is now placement-driven** (sum of layout positions across pieces),
not buoyancy-only; buoyancy adequacy is still checked via freeboard/submergence
(over-floating just raises freeboard). The loose `ceil(w/6)` form undercounts at
12/18 ft, so we use the `floor+1` step that matches the cited examples.

**Sources** (recorded in `constants.ts` + here):
- Dock Builders Supply — float spacing & corner-float guidance — https://www.dockbuilders.com/
- NyDock / PolyDock modular layout — https://nydock.com/
- BARR Plastics — flotation sizing — https://www.barrplastics.com/
- ABYC — float/stability guidance (general)

## 3. Pile docks: piles at every corner, deck snapped to the bay grid

- A pile at **every piece corner** (4 rectangle / 3 triangle) plus internal piles
  on a **configurable bay grid** (`overall.bayFt`, default **8 ft**, range 4–10).
- **No cantilever**: a rectangle whose run (length) doesn't divide by the bay
  (within 0.25 ft) raises **`pile_cantilever`** with the nearest valid length.
  (Previously overhang was unrestricted.) e.g. 16×8 @ 8 ft → 6 piles; 17×8 → error.
- The unsupported joist run is the **bay**, not the piece length, so a pile dock
  longer than the joist span is fine as long as the bay ≤ span; a bay larger than
  the span raises `joist_span_exceeded`.

## Rendering

`planView`, the elevations, the isometric, and `DockView3D` all iterate
`resolvePieces(config)` and draw each piece at its placement; floats and piles
render at **engine-supplied positions** (`suggestedFloatLayout` /
`suggestedPileLayout`), not heuristics. The PDF render path is unchanged in
mechanics.

## Migration / data

Additive only — no Prisma migration (geometry lives in the `config` JSONB).
`overall` is kept in sync (bounding dims) for labels/back-compat. The seeded
acme-docks "Starter floating dock" template now carries one rectangle piece.
Saved customer designs from earlier phases read through the back-compat shim.

## Tests (Postgres CI as before)

`src/engine/multiPiece.test.ts`, `floatRows.test.ts`, `pileCorners.test.ts`,
`triangle.test.ts`, `migration.test.ts`, and `e2e/multi-piece-flow.test.ts`, plus
updated canonical expectations (40×6 floating now lays out **16** floats across
its 2 auto-sections → reconciled pricing). 195 tests total; customer-copy audit
stays green.

## Out of scope

Curved/arc pieces; rotations other than 0/90/180/270; per-piece variable bay
spacing; the Phase 5 alpha follow-ups (badge gating, `started` label, Send-Quote
no-op) — a separate `claude/polish-pass`; marketplace; modular-kit `shipped`
state; AR / water animation.

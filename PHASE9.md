# Phase 9 — Domain logic + schematic + 3D corrections + multi-construction

Seven domain bugs from an expert alpha walk-through, plus per-piece construction
goes from a single enum to a **set** (a deck can be floating *and* pile-anchored).
Engine + blueprint + 3D work only — no canvas paradigm change, no new pages.

## Multi-construction per piece (item 1)

`DockPiece.construction` (scalar, deprecated) → `DockPiece.constructions:
PieceConstruction[]` (default `['floating']`, treated as a set). Both live in the
`DockConfig` JSON (immutable revision snapshots), so migration is a **config
transform** (`migrateConfigToPhase9`) — no Prisma DDL. Every consumer (layout,
geometry, validation, pricing, blueprint, view3d, `PieceProperties`) reads the
set; a `['floating','pile']` piece gets **both** a float layout and a pile layout,
both rendered, both priced. `PieceProperties` is now a 3-way checkbox group.

## Deliverable → file → test

| # | Deliverable | File(s) | Test |
|---|---|---|---|
| 1 | Multi-construction set | `engine/types.ts`, `engine/pieces.ts` (`resolveConstructions`), all consumers | `pieceConstruction.test.ts`, `migrationPhase9.test.ts` |
| 2 | Recommendation rewrite | `engine/recommend.ts` (cites Dock Builders Supply / NyDock / BARR / ABYC) | `engine/recommend.test.ts` (8 cases) |
| 3 | Auto-split too-long sections | `engine/autoSplit.ts`; wired into validation (advisory), pricing (connectors), blueprint + view3d (split preview) | `engine/autoSplit.test.ts` |
| 4 | Pile rendering in schematic | `engine/blueprint.ts` (plan/side/end now render per construction **set**, additively) | `engine/blueprint.test.ts` |
| 5 | Richer side/end elevations | `engine/blueprint.ts` (water band, bottom, shoreline, gangway, freeboard/embedment/rise callouts) | `engine/blueprint.test.ts` |
| 6 | 3D deck heights | `lib/view3d.ts` (`deckBottomYFor`: floating=freeboard, pile=shore−0.5, wheel=14in, multi=avg) | `lib/view3dDeckHeight.test.ts` |
| 7 | Gangway by length + slope warning | `engine/gangway.ts` (`computeGangway`), `DesignProperties` mode radio | `lib/gangwayLength.test.ts` |

## Notes / judgment calls (kickoff inconsistencies, resolved)

- **Auto-split examples.** The kickoff's `60→[32,28]` and `65→[32.5,32.5]`
  contradict its own stated algorithm ("N = ceil(len/max), equal sections") and
  the 32 ft max (32.5 > 32). We implemented the documented equal-split: `60→[30,30]`,
  `65→[~21.7×3]`, `96→[32,32,32]`, `30→[30]`. (3 of the 4 examples already match.)
- **Gangway threshold.** Prose says warn > 1:8, but the test cases (`1:9 warns`,
  `1:12 clean`) and the message ("ADA recommends 1:12") only fit a **1:12**
  threshold. We warn when steeper than 1:12. The "36 ft" example exceeds the
  stated 3–24 ft length range, so the clean-1:12 case is covered with 24 ft / 2 ft.
- **Recommendation → wizard.** The wizard surfaces `recommendConstructions` +
  reasons and maps the primary recommendation to the create-design `dockType`
  (floating→floating, pile/wheel→pile, since there is no `wheel` dockType). The
  first piece's construction then defaults accordingly; the customer can add
  wheel via the per-piece checkboxes.
- **Connection-detail (5th) view** (item 5, "optional") is deferred; the four
  views are all per-construction and richer.
- No Prisma DDL: `constructions` and the gangway `{ mode }` are JSON config fields.

## Migration / acme-docks

`migrateConfigToPhase9` converts scalar → `constructions` arrays and normalizes
gangways. The seeded `Acme hybrid dock` template and the starter template are
stamped through it; the alpha-test 60 ft floating piece keeps its length but the
Schematic/3D now show the auto-split preview.

## Out of scope (Phase 9)

Canvas interactions (Phase 10); bathymetry / accessory placement / 3D materials
(Phase 11); the `pipe` construction value (still deferred).

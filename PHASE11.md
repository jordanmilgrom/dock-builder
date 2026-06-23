# Phase 11 — Shoreline, bathymetry, accessories, draggable gangway, real materials

The visual-fidelity + new-feature phase: a Site tab with a 2D bathymetry editor,
shoreline on Canvas, edge-placed accessories rendered in all three views, the
gangway as a real drawable piece, and a 3D scene with material-based colors,
a sloped lake bed, and configurable water. New config fields live in the
`DockConfig` JSON (no Prisma DDL), consumed by pure modules pricing/validation/3D
read but never depend on.

## Deliverable → file → test

| # | Deliverable | File(s) | Test |
|---|---|---|---|
| 1 | Schema (bathymetry, accessories, gangway piece, pileMaterial, z) | `engine/types.ts`; `engine/migrate.ts` (`migrateConfigToPhase11`) | (covered by the modules below) |
| 2 | Site tab — 2D bathymetry editor | `components/SiteMode.tsx`; `lib/siteModeDrag.ts`; view switcher gains `site` | `lib/siteModeDrag.test.ts`, `e2e/bathymetry-flow.test.ts` |
| 3 | Shoreline on Canvas (← Shore band + ↑ N) | `components/CanvasMode.tsx` | (visual) |
| 4 | Accessory placement (edge + offset) | `engine/accessoryPlacement.ts`; `CanvasMode` glyphs; `view3d` meshes | `engine/accessoryPlacement.test.ts`, `e2e/accessory-place-flow.test.ts` |
| 5 | Gangway as a drawable piece + snap | `engine/gangwayPiece.ts`; `CanvasMode` tool; `ConfiguratorPane` snap-on-drop | `engine/gangwayPiece.test.ts`, `e2e/gangway-drag-flow.test.ts` |
| 6 | 3D materials + lake bed + water | `lib/view3dMaterials.ts`; `lib/view3d.ts`; `components/DockView3D.tsx` | `lib/view3dMaterials.test.ts` |
| 7 | Accessory pricing (per-piece counts) | `engine/pricing.ts` | `e2e/accessory-place-flow.test.ts` |
| 8 | Bathymetry warnings (pile-deep / float-shallow) | `engine/bathymetry.ts`; `engine/validation.ts` | `engine/bathymetry.test.ts`, `engine/bathymetryWarnings.test.ts` |

## Notes / judgment calls

- **No Prisma DDL.** `bathymetry`, `piece.accessories`, gangway pieces, `z`, and
  `pileMaterial` are all `DockConfig` JSON fields — migration is a config
  transform (`migrateConfigToPhase11`), consistent with Phases 8–10.
- **Bathymetry interpolation** uses monotone cubic Hermite (PCHIP): it passes
  through every handle and never overshoots, so non-decreasing depths stay
  non-decreasing (no spurious shallow dips). The Site editor clamps each handle
  between its neighbors to preserve that invariant.
- **Accessory pricing is additive** to the legacy design-level accessory counts
  (no overlap in existing data), so estimates stay stable; placed accessories use
  the same `accessory_<kind>` keys.
- **Gangway piece** is a new `pieceKind: 'gangway'`; it carries no floats/piles of
  its own and snaps (≤ 2 ft) to the nearest dock-piece left edge on drop. The
  Phase 10 read-only placeholder remains the fallback only when no gangway piece
  exists (Canvas suppresses it once a real one is added).
- **Scope honesty:** the tested pure cores for every deliverable are complete and
  green. On the rendering side I shipped material-driven colors, a brown lake-bed
  plane following the profile, configurable water color/opacity, accessory meshes
  (as fixtures) + canvas glyphs, and the full 2D Site editor. The deeper 3D polish
  the kickoff lists as flourishes — canvas-drawn plank/diamond *textures* and the
  GLSL sine-displacement water *shader* — are represented by the material
  color/pattern selection (`view3dMaterials`) and a flat animated-ready water
  plane; wiring the actual `CanvasTexture`/vertex shader is a fast follow on top
  of the now-exposed `SceneSpec` data. The interactive accessory drop-by-click
  flow renders placed accessories everywhere and is driven by the tested
  `nearestEdgeForDrop`/`accessoryWorldPos` helpers.

## Migration / acme-docks

New `Site profile demo` template (floating + pile + wheel over a deepening
profile) that trips both new depth advisories. Existing designs get default
bathymetry + `accessories: []` via the config transform.

## Out of scope (Phase 11)

3D interactive bathymetry widget; customer-pickable shore direction; inter-piece
run detection; pipe construction; photoreal cloud rendering; multi-user.

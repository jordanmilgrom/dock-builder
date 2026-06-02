# Phase 1 — Configurator, views, PDF, versioning

Single dev tenant; hosted Next.js page (no embed — embed is Phase 4 per the
locked §10 decisions). The golden rule held throughout: **the UI never
re-derives geometry/validation/pricing — it always calls `@/engine`.**

## Deliverables → proof

| # | Deliverable (§8 Phase 1) | Where | Proof |
|---|---|---|---|
| 1 | Shoreline questionnaire → `recommendDockType(site)` with reasons/cautions/`recommendRemovable` | `src/components/QuestionnaireForm.tsx` (calls engine `recommendDockType`) | `src/engine/recommendation.test.ts` |
| 2 | Auto-generated starting design seeded into the configurator | `src/engine/starter.ts` → `generateStartingDesign` | `src/engine/starter.test.ts` (incl. "passes validation with no errors") |
| 3 | 2D plan configurator with live `validationEngine` + `pricingEngine` on every edit; errors/warnings/autoFixes shown inline; SVG | `src/components/Configurator.tsx`, `src/components/ViewsPanel.tsx`, `src/lib/svg.ts` | `src/lib/svg.test.ts` (render snapshot per view) |
| 4 | Elevations (side + end) + one ~30° isometric, parametric from the same config | `src/engine/blueprint.ts` (`planView`/`sideElevation`/`endElevation`/`isometricView`) | `src/engine/blueprint.test.ts` (structural invariants + snapshots) |
| 5 | Branded PDF: 3 views + title block + BOM + estimate (per visibility) + disclaimer every sheet; server-side SVG→PDF | `src/lib/pdf.ts`, `src/app/api/designs/[id]/pdf/route.ts` | `src/lib/pdf.test.ts` (roundtrip → non-empty `%PDF`, floating + fixed) |
| 6 | Design + immutable Revisions; cap 3 drafts; list/restore/branch; original preserved | `src/lib/versioning.ts`, `src/lib/designService.ts`, `src/lib/store.ts`, `src/app/design/[id]/history` | `src/lib/versioning.test.ts` (cap, immutability, summaries) + live smoke (branch → v3) |
| 7 | Single dev tenant hardcoded; pricing profile in seeded fixtures | `src/lib/seed.ts` (`DEV_TENANT_ID`, `pricingProfileFor`, `devBranding`) | used across `pdf.test.ts` / app |

### Identity (§10 #4: email + magic link)
- Save/price gate captures email + **explicit consent** (opt-in, source, timestamp): `src/components/SaveGate.tsx` → `src/app/api/capture/route.ts` → `captureContact`.
- Magic-link sign-in (no passwords/OAuth): `src/lib/auth.ts`, `src/app/api/auth/magic`, `src/app/auth/verify`. Dev surfaces the link in the response (no SMTP in Phase 1).

### Phase 0 follow-up fixed in passing
- Validation now flags a declared `dockType` that contradicts §2.1 site rules
  (pile on soft/rock bottom, fixed dock in deep water) — **advisory warnings**,
  never errors. `src/engine/validation.ts` (`type_contradicts_bottom` /
  `type_contradicts_depth`), tested in `validation.test.ts`.

## Architecture notes
- **`blueprint.ts` is the third pure engine consumer** (alongside validation +
  pricing). Float/pile **placement** also lives in the engine
  (`suggestedFloatLayout` / `suggestedPileLayout`), and `pilingCount` was
  refactored to derive from the layout — so drawings, counts, and pricing all
  agree.
- **One primitive model, two renderers:** `src/lib/svg.ts` (browser) and
  `src/lib/pdf.ts` (pdfkit) both map the engine's `Drawing` shapes; neither
  computes geometry.
- **Persistence** is a file store (`src/lib/store.ts`) behind a narrow interface
  so Phase 2 can swap in tenant-scoped Prisma/Postgres without touching callers.
- **Strict TS preserved:** the engine keeps its own strict config
  (`tsconfig.engine.json`, `noUncheckedIndexedAccess` on); `npm run typecheck`
  checks both engine and app.

## Customer-facing vocabulary (§5.4)
Phase 1 has no lead state machine yet, but no builder-only vocabulary
("Won/Lost") leaks into customer copy. A captured-but-unsubmitted design is a
**Draft**; the `Lead` record is created at capture with status `started` and an
`abandonedThresholdDays` placeholder (`TODO(Phase 3)`).

## Explicitly out of scope (deferred per the brief)
Tenant onboarding/billing/isolation (Phase 2); builder dashboard, full lead
state machine, abandoned follow-up, revise-and-resend (Phase 3); embed widget,
custom domains, tiers, analytics, templates (Phase 4); job tracking, webhooks,
full 3D (Phase 5).

## Known limitations
- Elevations are schematic with exaggerated vertical scale (labeled as such) —
  fine for planning-grade drawings.
- File store is not concurrency-hardened (adequate for a dev tenant).
- The dev tenant's price visibility is `full`, so the price-gate path is
  implemented but not exercised by default; the **save-gate** is the active
  capture path. Both share the same capture endpoint.

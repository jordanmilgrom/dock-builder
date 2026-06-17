# Dock Configurator

Multi-tenant SaaS dock configurator. Built in phases against the canonical spec.

- **Phase 0 (merged):** the headless, fully-tested engines — the credibility core.
- **Phase 1 (this):** the customer-facing configurator app on top of the engines —
  questionnaire → recommendation → auto-starting design → live-validated 2D
  configurator with four parametric views → branded PDF → design versioning.

## Phase 1 — the configurator app

A hosted Next.js (App Router) app for a single dev tenant. The golden rule:
**the UI never re-derives geometry, validation, or pricing — it always calls the
engine.** A new pure engine module, `blueprint.ts`, emits framework-free drawing
primitives for every view; the on-screen SVG renderer and the server-side PDF
renderer are both dumb mappers over those identical primitives, so the screen and
the print can never diverge.

```bash
npm install
npm run dev        # configurator at http://localhost:3000
npm run build      # production build (also runs Next's type check)
npm test           # 86 unit/integration tests (engine + app lib)
npm run typecheck  # strict engine tsc + app tsc
```

Flow: shoreline questionnaire (`/`) → recommendation + reasons/cautions →
auto-seeded `DockConfig` in the configurator (`/design/[id]`) with live
`validationEngine` + `pricingEngine` on every edit, four views, save/price gate
capturing email + consent, immutable revisions with restore/branch
(`/design/[id]/history`), and a branded multi-sheet PDF
(`/api/designs/[id]/pdf`). Identity is email + magic link (no passwords).
Persistence is a small file store behind a narrow interface (Prisma/Postgres
swap-in is Phase 2). See `PHASE1.md` for the deliverable-by-deliverable map.

---

## Phase 0 — Engines

Headless, fully-tested engines for the Dock Configurator SaaS: the credibility
core that everything else is built on. Pure functions over a single `DockConfig`
JSON, exactly as the spec mandates in §7.1:

> The dock-config JSON drives three pure, unit-tested consumers: **validation
> engine**, **pricing engine**, and **view/blueprint generator**. Build these first.

The engines are framework-free TypeScript so they run **identically client-side**
(live configurator feedback) **and server-side** (authoritative re-validation and
pricing).

## What's in this phase

| Module | Responsibility | Spec |
|---|---|---|
| `src/engine/types.ts` | `DockConfig`, validation/pricing result types | §7.4–§7.6 |
| `src/engine/constants.ts` | **Every** engineering threshold, one configurable file | §3, §11 |
| `src/engine/geometry.ts` | Derived metrics: area, sections, buoyancy, floats, freeboard, gangway, span, pilings | §3, §6 |
| `src/engine/recommendation.ts` | Advisory dock-type recommendation from the shoreline questionnaire | §2.1 |
| `src/engine/validation.ts` | `validationEngine(config)` → `errors` / `warnings` / `autoFixes` / `derived` | §3, §7.6 |
| `src/engine/pricing.ts` | `pricingEngine(config, profile)` → itemized breakdown | §4 |

The geometry/derived-metrics calculator is shared by the validation and pricing
engines so they can never disagree about how big a dock is.

> **Planning-grade disclaimer (spec framing).** Outputs are *planning-grade*
> estimates and drawings, not stamped engineering or legal/permit/environmental
> advice: *"Estimates and drawings are for planning only. Confirm final design
> with your builder and check your local laws, regulations, and environmental
> rules before building."*

## Usage

```ts
import {
  validationEngine,
  pricingEngine,
  recommendDockType,
  type DockConfig,
  type PricingProfile,
} from "./src/engine/index.js";

const result = validationEngine(config);
if (!result.ok) {
  // result.errors block the estimate/lead; result.warnings need acknowledgement;
  // result.autoFixes describe fixes the configurator should apply.
}
console.log(result.derived); // deckAreaFt2, requiredBuoyancyLbs, floatCount, ...

const estimate = pricingEngine(config, profile, { deliveryDistanceMiles: 40 });
// estimate.lineItems is always the full breakdown; estimate.priceVisibility tells
// the caller how much of it to actually show (§4).
```

## Engine contracts

### `validationEngine(config) → ValidationResult`
- **`errors`** — block the estimate/lead. Reserved for things the engine *cannot*
  silently fix: invalid dimensions, joist **spacing** beyond the max, a
  user-declared bay/section that exceeds its span or max-section length,
  submergence over the 50% hard limit, a gangway past the residential comfort
  ceiling (or ADA limit for commercial), and bare/exposed EPS floats.
- **`warnings`** — advisory; the customer must acknowledge. Width below the
  two-way-traffic minimum, single-row floats on a wide section, steep-but-legal
  gangways, open-water exposure, shallow-water grounding risk, mooring-whip and
  GFCI suggestions, etc.
- **`autoFixes`** — human-readable descriptions of fixes the engine *would* apply
  (the configurator applies them to the working copy). Auto-sectioning a long
  floating dock, adding pile bents under a long fixed run, adding connectors.
- **`derived`** — the shared metrics bundle (area, required buoyancy, float/pile
  counts, freeboard, gangway length, max joist span, est. weight).

The engine is **pure**: it never mutates the input config.

### `pricingEngine(config, profile, options?) → PricingResult`
`estimate = Σ(quantity × unit price) + labor + delivery + markup`, floored by an
optional minimum. The **full breakdown is always computed**; `priceVisibility`
(`full` / `total` / `starting_from` / `hidden_until_contact`) is echoed back so
the caller can gate the *display* without the engine ever hiding internal data
(§4). Quantities come from the shared geometry module; accessories are
namespaced (`accessory_<type>`, or `..._per_linear_ft` for linear items).

## Key engineering-model decisions

Where the spec is explicitly *illustrative*, these are the concrete, internally
consistent choices the engine makes. All numbers live in `constants.ts` and are
"configurable defaults to be verified locally" (§11).

- **Flotation is self-consistent.** The §3.1 quick-method multiplier (area ×
  28–35) gives the *required* buoyancy. The engine calibrates so that, when
  installed buoyancy equals the requirement, the dock sits at the **40% design
  submergence** target — i.e. `designLoad = 0.40 × requiredBuoyancy`, and
  `submergence = designLoad / installedBuoyancy`. This makes the multiplier,
  float count, submergence, and freeboard one coherent model and reproduces the
  spec's canonical example exactly (240 ft² → 7,440 lbs → 8 floats → ~9–10 in
  freeboard). Submergence > 50% is an error.
- **Exposure changes float count, not just a label.** Rougher water uses a
  smaller usable fraction of each float's rating (sheltered `0.24`, inland lake
  `0.32`, open water `0.40`), so open water needs *more* floats than sheltered.
  Inland lake is the calibration baseline.
- **An unsupported joist run is governed by support spacing, not section
  length.** On a floating dock the joists ride the floats (≤ 8 ft apart); on a
  fixed dock they ride pile bents the engine spaces ≤ span. So a long fixed run
  is an **auto-fix** (add bents) rather than an error; a *user-declared* oversized
  bay is an error. Section length is bounded separately by the max-section rule
  (handling/transport).
- **Recommendation is advisory and never blocks** — it seeds the auto-generated
  starting design (§5.3).

## Development

```bash
npm install
npm run typecheck   # strict tsc, no emit
npm test            # vitest — 53 tests
npm run coverage    # v8 coverage (engine ~92%)
```

Requires Node ≥ 20. Strict TypeScript (`strict`, `noUncheckedIndexedAccess`).

## Spec traceability

This repo implements **Phase 0** of the canonical Dock Configurator SaaS spec.
Later phases (not built yet) per §8:

- **Phase 1** — Configurator UI + 2D/elevation/isometric views + branded PDF +
  design versioning.
- **Phase 2** — Multi-tenancy, builder onboarding, Stripe billing.
- **Phase 3** — Leads, the `started`/`abandoned`→…→`won`/`lost` state machine,
  builder dashboard/CRM, revise-and-resend loop.
- **Phase 4** — Embed widget, custom domains, tiers, analytics, templates.
- **Phase 5** — Optional job-tracking, webhooks, full 3D.
- **Phase 6** — Real-world geometry: multi-piece docks, per-piece float/pile layout.
- **Phase 7** — Canvas-first IA: a full-pane Canvas editor with a Canvas/Schematic/3D
  view switcher and a right-rail Properties panel; the questionnaire becomes an
  opt-in wizard. UI/IA only — engines unchanged. See [PHASE7.md](PHASE7.md).
- **Phase 8** — Hybrid construction: per-piece `construction` (floating / pile /
  wheel) and `evenDistribute` support spacing across floats + piles. See
  [PHASE8.md](PHASE8.md).
- **Phase 9** — Domain corrections: multi-factor recommendation, auto-split for
  too-long sections, per-construction schematic + 3D rendering, gangway-by-length,
  and multi-construction-per-piece (`constructions[]`). See [PHASE9.md](PHASE9.md).

The engines here are the stable foundation those phases consume.

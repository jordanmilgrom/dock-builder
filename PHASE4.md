# Phase 4 — Embed, custom domains, white-label, analytics, templates, team, multi-profile

Phase 4 turns on the surfaces deferred from Phase 2/3 and unlocks the rest of the
tier-gated behavior. End-state: a Pro/Premium builder can embed the configurator
on their own site under their own domain with the badge off, see analytics, ship
starter templates, and add teammates. Engines (`src/engine`) unchanged.

## Tier → entitlements (§10 #2)

`lib/entitlements.ts` gained `embed`, `customDomain`, `analytics`, `team`. The
Stripe webhook reducer maps tiers automatically (it calls
`effectiveEntitlements`), so no webhook code changed.

| Entitlement | Starter | Pro | Premium |
| --- | --- | --- | --- |
| removeBadge / brandedPdf | – | ✅ | ✅ |
| abandonedFollowUp | – | ✅ | ✅ |
| **embed** | – | ✅ | ✅ |
| **team** | – | ✅ | ✅ |
| **customDomain** | – | – | ✅ |
| **analytics** | – | – | ✅ |
| multipleProfiles | – | – | ✅ |

A `past_due`/`canceled` subscription drops to the Starter floor.

## Deliverables

| # | Feature | Where |
| --- | --- | --- |
| 1 | Embeddable widget | `lib/embed.ts`, `/api/embed-loader` (`/embed.js` rewrite), `/embed` + `/embed/design/[id]` (chrome stripped via layout + `x-pathname`), `components/EmbedResizer.tsx`. See EMBED.md |
| 2 | Custom domain | `lib/customDomain.ts` (TXT token, `dns/promises` verify, O(1) indexed lookup), middleware `customDomainCandidate` → node `getRequestResolution`, unverified placeholder in layout, `/api/builder/custom-domain` |
| 3 | White-label | layout + PDF consult `entitlements.removeBadge` && Branding toggle (badge hidden on hosted page AND embed iframe) |
| 4 | Analytics | `lib/analytics.ts` `getDashboardMetrics`, thin `Event` table, events emitted from `designService`/`leadService`/`sweep`/customer pages, dashboard widget |
| 5 | Starter templates | `Template` model, `scope.createTemplate/listTemplates`, `designService.createDesignFromTemplate`, "Start from a template" cards (no tier gate) |
| 6 | Team / multi-user | `lib/team.ts` (invite/accept), `Invitation` model, `/api/builder/team`, `/api/invitations/accept`, `authz.roleCanAdminister` (members blocked from billing/team/custom-domain) |
| 7 | Multiple pricing profiles | `PricingProfile.name/isDefault`, `Design.pricingProfileId`, `scope.createPricingProfile/getPricingProfileById`, `priceConfig` honors the design's profile, `/api/builder/pricing-profiles` (Premium) |

## Custom domain DNS

Builder enters a hostname → app mints a TXT token. Add **two records**:

- `TXT  _dock-verify.<domain>  =  dock-verify=<token>`
- `CNAME  <domain>  →  cname.app.com` (`CUSTOM_DOMAIN_TARGET`, configurable)

The app polls DNS (default every 5 min, up to 4 h) until the TXT matches, then
sets `customDomainVerifiedAt`. Until verified, requests to the host show a
"Domain not verified yet" placeholder. Resolution is O(1) against the unique
indexed `Tenant.customDomain` column.

## Analytics

Compute-on-read roll-ups over the `Event` table (`getDashboardMetrics(tenantId,
{ days })`). **Swap path** when the table grows: replace the grouped queries with
a materialized view refreshed on a schedule — the function signature is stable so
the dashboard widget is unaffected. Suggested **event retention: 365 days**
(prune older rows via a cron in a later phase).

## Migration / data

`*_phase4_embed_analytics_team`: `Tenant +customDomain (unique) /
customDomainVerifiedAt / customDomainTxtToken`; `PricingProfile +name/isDefault`
(unique relaxed to `(tenantId, name, dockType)`, existing rows backfilled
`isDefault=true`); `Design +pricingProfileId` (nullable FK, null → default);
new `Template`, `Event`, `Invitation` tables. **acme-docks** is upgraded to
**Premium** in dev and seeded with a "Starter floating dock" template so the e2e
flows exercise Phase 4 end-to-end.

## Tests (against the CI Postgres service)

`embed`, `customDomain`, `analytics`, `templates`, `team`, `multipleProfiles`,
`e2e/embed-flow` — plus the Phase 3 customer-copy audit stays green. 149 total.

## Out of scope (Phase 5+)

Job tracking, outbound webhooks, full 3D; SMS/push/Slack; marketplace; passwords/
OAuth (still magic-link only).

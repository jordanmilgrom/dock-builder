# Phase 5 — Jobs, outbound webhooks, 3D viewer, SMS/Slack channels

Phase 5 is the optional/premium layer (§8 + §9). An accepted quote becomes a
tracked Job; job/lead/design events fire signed outbound webhooks; a Three.js
viewer renders the design in 3D; and SMS + Slack join email behind the Phase 3
`notifyBuilder` interface. Engines (`src/engine`) unchanged.

## Tier → entitlements (§10 #2)

`lib/entitlements.ts` gained `jobTracking` (Pro+), `fullThreeD` (Pro+),
`slackNotifications` (Pro+), `smsNotifications` (Premium); `webhooks` (Premium)
now fires. The Stripe reducer maps tiers automatically (one source of truth).

| Entitlement | Starter | Pro | Premium |
| --- | --- | --- | --- |
| jobTracking | – | ✅ | ✅ |
| fullThreeD | – | ✅ | ✅ |
| slackNotifications | – | ✅ | ✅ |
| smsNotifications | – | – | ✅ |
| webhooks | – | – | ✅ |

## Deliverables

| # | Feature | Where |
| --- | --- | --- |
| 1 | Job tracking (§5.4 job phase) | `lib/jobs.ts` (state machine + dual-vocab labels), `Job` model, `scope.createJob/getJobByLead/updateJob`, created in `leadService.setOutcome` on accept (entitled only), `/api/builder/jobs/[id]`, `/builder/jobs` tab, JobPanel on lead detail, customer job label on `/designs` |
| 2 | Outbound webhooks (§5.9) | `lib/webhooks.ts` (sign/verify, fire/enqueue, drain+retries), `WebhookEndpoint`/`WebhookDelivery` models, `/api/builder/webhooks(/[id])`, `/api/internal/drain-webhooks` (X-Cron-Secret), WebhookManager UI. WEBHOOKS.md |
| 3 | Full 3D viewer | `lib/view3d.ts` (pure scene spec from DockConfig + engine metrics), `components/DockView3D.tsx` (Three.js r128 CDN, orbit, graceful degrade), `Design3DToggle` (dynamic `ssr:false`, Schematic/3D), gated by `fullThreeD`. PDF still uses parametric views |
| 4 | SMS + Slack channels | `lib/notifications.ts` `makeTwilioTransport`/`makeSlackTransport` + `dispatchNotification` (multi-channel fan-out, per-channel isolation), `/api/builder/channels`, NotificationChannels UI. Twilio via `TWILIO_*` env (no SDK, no-op if unset); Slack via per-tenant `slackWebhookUrl` |

## Job state machine

`in_production → install_scheduled → complete` (linear). A Job is created when a
lead is accepted **and** the tenant has `jobTracking`; otherwise the lead stays at
`accepted` with no Job (migration never touches existing accepted leads). The Lead
status field is unchanged — Job is its own machine joined by `leadId`. Customer
labels: **Being built / Installation scheduled / Complete** (no Won/Lost; the
Phase 3 grep audit still passes).

## Notifications

`dispatchNotification` fans a notification out to email (always) + SMS + Slack
(when configured and entitled). Each channel is isolated — one failing never
blocks the others. Transports are env/dev-aware (log in tests/dev; SMTP/Twilio/
Slack in prod; no-op when unconfigured).

## 3D viewer

`buildSceneSpec(config)` turns the DockConfig + `validationEngine` derived counts
into extruded boxes (deck, floats, pilings, gangway, water) — **no engine
duplication**. `DockView3D` loads Three.js r128 from the Cloudflare CDN, builds
the scene with pointer-drag orbit + lighting, and degrades to a friendly message
if the CDN script can't load. It is always behind `dynamic(import, { ssr: false })`
so SSR never touches WebGL.

## Migration / data

`*_phase5_jobs_webhooks` (purely additive): `JobStatus` enum + `Job`,
`WebhookEndpoint`, `WebhookDelivery` tables; `Tenant +slackWebhookUrl/
twilioFromOverride`; index `(status, nextAttemptAt)` for the drain. acme-docks
(Premium in dev) is seeded with one webhook endpoint at
`https://example.test/dock-events` (mocked in tests). **No seeded Job** —
production Jobs only land via real quoted→accepted transitions.

## Tests (against the CI Postgres service)

`jobs`, `webhooks`, `notifyChannels`, `view3d`, `e2e/jobs-flow` — 175 total. The
Phase 3 customer-copy audit stays green.

## Out of scope (deliberately deferred)

`shipped` sub-state for modular-kit builders; marketplace / cross-tenant discovery
(§9); passwords/OAuth; heavy 3D (physics, water animation, AR).

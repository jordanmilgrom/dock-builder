# Phase 3 — Leads CRM: state machine, abandoned recovery, revise-and-resend, notifications

Phase 3 turns captured leads into a real CRM loop. End-state: a builder logs into
their dashboard, sees abandoned and submitted leads, opens one (it auto-marks
"in review"), edits the design, re-quotes, sends it back, and the customer sees
the new quote in their account — all with a strict dual vocabulary that never
shows Won/Lost to customers. Engines (`src/engine`) are unchanged.

## Lead state machine (§5.4)

`src/lib/leadStatus.ts` is the pure source of truth:

```
started ──submit──▶ submitted ──builder opens──▶ in_review ──send quote──▶ quoted ──▶ accepted | closed
   │
   └ (derived) abandoned ──submit──▶ submitted
```

- **`started`** is created the moment contact is captured (save/price gate).
- **`started → abandoned` is DERIVED**, never user-set: `deriveStatus()` reads
  `lastActivityAt + tenant.abandonedThresholdDays`. Display + filter only; the
  hourly sweep persists it.
- **`submitted`** when the customer hits *Submit to builder*.
- **`submitted → in_review`** auto-sets when the builder first opens the lead
  (free "they've seen it" signal).
- **`in_review → quoted`** when the builder sends a quote. **Re-quoting does NOT
  advance status** — it records a new `quotedRevisionId` and a new immutable
  builder revision (§5.5).
- **`quoted → accepted | closed`** ends the quote phase.

### Dual vocabulary

`leadStatusLabel(state, audience)` is the single label helper. Customer copy is
free of Won/Lost (`accepted → "Accepted"`, `closed → "Closed"`, `quoted →
"Quote ready"`). A grep audit (`e2e/customer-copy.test.ts`) fails the build if
"Won"/"Lost" ever appears in a customer-facing component or page.

## Revise-and-resend (§5.5)

Builders edit the design from a lead (`/builder/leads/[id]`, builder-mode
`Configurator`). Sending re-quotes through `POST /api/builder/leads/[id]/quote`
saves a **builder-authored** immutable revision and points `quotedRevisionId` at
it. The customer's original submission is preserved as **v1** forever — proven by
`lib/reviseResend.test.ts`. The audit trail (authorRole/authorId/createdAt/
changeSummary) surfaces in the builder lead detail and the customer history.

## Abandoned threshold + sweep (§10 #7, §8 item 6)

- Default **3 days** of inactivity; per-tenant override 1–30 via the builder
  dashboard (`tenant.abandonedThresholdDays`).
- Hourly cron hits **`/api/internal/sweep-abandoned`**, protected by the
  **`X-Cron-Secret`** header matching `CRON_SECRET`. It flips eligible
  `started` leads to `abandoned` and fires the abandoned notification
  (entitlement-gated). Scheduled via `vercel.json` (`0 * * * *`).

Local invocation:

```bash
curl -X POST -H "X-Cron-Secret: $CRON_SECRET" \
  http://localhost:3000/api/internal/sweep-abandoned
# → { ok: true, tenantsScanned, leadsScanned, abandoned, notified }
```

## Notifications (§8 item 5)

- **New-lead** notification fires when a lead enters `submitted` (all tiers).
- **Abandoned-lead** notification fires on `started → abandoned` — only for
  **Pro+** tenants with `entitlements.abandonedFollowUp` (the entitlement Phase 2
  recorded). The Phase 2 entitlement now drives behavior.
- Delivery is **email-only (v1)** behind `notifyBuilder(channel, payload)`
  (`src/lib/notifications.ts`) so Phase 5 can add SMS/webhook without touching
  callers. Transport: `logTransport` in dev/test, SMTP via `SMTP_URL` in
  production, **no-op if `SMTP_URL` is unset** (no mail-vendor SDK pulled in).
  Every notification is also persisted for the dashboard panel.

## Abuse controls (§5.8)

- **3-draft cap** per (tenant, customer) enforced at the service boundary
  (`createDesignFromSite`); tested in `lib/abuse.test.ts`.
- **Lead-creation rate limits**: **30 / minute / IP** and **200 / hour / tenant**
  (`src/lib/rateLimit.ts`), enforced on first capture in `/api/capture`.
  In-memory fixed-window (adequate for v1, single region).

## Migration / data (§8)

`prisma/migrations/*_phase3_leads_crm`:
- `Lead`: `+ lastActivityAt, submittedAt, quotedRevisionId, updatedAt`,
  `- abandonedThresholdDays` (per-tenant now); `status` is the §5.4 machine.
- `Tenant`: `+ abandonedThresholdDays Int @default(3)`.
- `Customer`: `+ notes @db.Text` (5,000-char cap at the API).
- `+ Notification` table.

The migration is **safe on a populated table** (defaults on new NOT NULL columns)
and backfills `status` from `submittedAt`. The same logic is exposed as the
idempotent, tested `backfillLeadStatuses()` (`lib/backfill.test.ts`).

## Tests (all against the CI Postgres service)

`leadStatus`, `notifications`, `sweepAbandoned`, `reviseResend`, `abuse`,
`backfill`, `e2e/builder-leads-flow`, `e2e/customer-copy` — 128 tests total.

## Out of scope (later phases)

Job tracking (in_production / install_scheduled / complete), outbound webhooks,
full 3D (Phase 5); embed widget, custom domains, analytics dashboards (Phase 4);
SMS/push/Slack (Phase 5); passwords/OAuth (still magic-link only).

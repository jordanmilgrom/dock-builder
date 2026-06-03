# Phase 2 — Multi-tenancy, Postgres, Stripe billing, self-serve onboarding

Phase 2 turns the single-tenant Phase 1 configurator into a multi-tenant SaaS
where a builder can sign up, get a branded hosted configurator on a vanity
subdomain, and start a Stripe-billed subscription — ending with a paying builder
live on a hosted page. The pure engines in `src/engine` are unchanged.

## Architecture

| Concern | Where |
| --- | --- |
| Tenant data model (Postgres) | `prisma/schema.prisma` — `tenantId` on every tenant-owned table |
| **Tenant isolation seam** | `src/lib/tenantScope.ts` — the only path to tenant-owned rows; every read/write is filtered by `tenantId` |
| Prisma client | `src/lib/db.ts` (never used directly for tenant tables) |
| Tier → entitlements | `src/lib/entitlements.ts` |
| Stripe billing (pure reducer) | `src/lib/stripe.ts`; webhook at `src/app/api/stripe/webhook` |
| Onboarding (signup + catalog clone + trial) | `src/lib/onboarding.ts`; API `src/app/api/onboarding` |
| Subdomain routing | `src/middleware.ts` + `src/lib/tenantRouting.ts` (pure) → `src/lib/tenant.ts` (resolve) |
| Auth roles (magic-link only) | `src/lib/auth.ts`, `src/lib/authz.ts`, `src/lib/session.ts` |
| Design flows (now tenant-scoped, async) | `src/lib/designService.ts` (same function set as Phase 1) |
| Builder dashboard / editors | `src/app/builder/*`, `src/app/api/builder/*` |
| Platform admin | `src/app/admin/*` |
| Default catalog (source of truth) | `src/lib/seed.ts` — cloned per tenant at onboarding |
| acme-docks migration | `src/lib/acmeSeed.ts`, `prisma/seed.ts` |

### Tenant isolation

`createTenantScope(tenantId)` returns a repository whose every query injects
`tenantId`:

- **reads** use `findFirst({ where: { id, tenantId } })` → another tenant's row
  resolves to `null`;
- **writes** use `updateMany({ where: { id, tenantId } })` → a cross-tenant write
  affects 0 rows;
- **creates** force `tenantId` from the scope.

Proven by `src/lib/tenantScope.test.ts` (tenant A cannot read/write tenant B).

## Local development

```bash
# 1. Start Postgres and create databases (any local Postgres 16 works)
createdb dock_dev && createdb dock_test

# 2. Configure env
cp .env.example .env   # point DATABASE_URL at dock_dev

# 3. Apply schema + seed the acme-docks dev tenant
npm run db:migrate
npm run db:seed        # creates tenant acme-docks + builder_admin + platform_admin

# 4. Run
npm run dev
```

### Subdomain routing & the local-dev fallback

Production resolves tenants from `{slug}.app.com`. Local dev has no wildcard DNS,
so **append `?tenant={slug}` to any URL** and the middleware resolves that tenant:

- `http://localhost:3000/?tenant=acme-docks` → the acme-docks hosted configurator
- with no host/query match, the `DEFAULT_TENANT_SLUG` (acme-docks) is used, so the
  Phase 1 flow keeps working on the root domain.

The same `?tenant=` fallback is how you exercise tenants on a Vercel preview URL.
Real wildcard DNS / custom domains are Phase 4.

### Sign in

- **Customers** — magic link from the save/price gate (tenant-bound session).
- **Builders** — `/builder/login` (magic link, scoped to the request's tenant) →
  `/builder` dashboard.
- **Platform admins** — `/admin/login` (magic link, no tenant) → `/admin`.

In dev there is no SMTP, so magic links are returned inline in the response.

## Billing

Subscriptions are Stripe-hosted (Checkout). Tiers map to entitlements on the
tenant row; the webhook (`/api/stripe/webhook`) mirrors `status` +
`entitlements`. A `past_due`/`canceled` subscription drops to the Starter floor
without losing the recorded tier. Card data never touches our servers.

| Tier | Badge | Branded PDF | Lead cap | Other (recorded) |
| --- | --- | --- | --- | --- |
| Starter | on | standard PDF | 100/mo | — |
| Pro | removable | yes | 1000/mo | abandoned-follow-up (Phase 3) |
| Premium | removable | yes | unlimited | multi-profile, webhooks (Phase 5) |

## Tests (all run against Postgres)

- `src/lib/tenantScope.test.ts` — tenant isolation (read + write).
- `src/lib/stripe.webhook.test.ts` — subscription status flips entitlements.
- `src/lib/onboarding.test.ts` — signup → tenant → catalog clone → branding → trial.
- `e2e/tenant-customer-flow.test.ts` — full Phase 1 flow on acme-docks (questionnaire
  → recommendation → save + capture → version history → branded PDF roundtrip).

CI provisions a Postgres service, runs `prisma migrate deploy`, then typecheck +
test + build.

## Out of scope (later phases)

Builder leads inbox / lead state machine / abandoned follow-up (Phase 3); embed
widget, custom domains, analytics (Phase 4); outbound webhooks, full 3D (Phase 5);
passwords / OAuth (still magic-link only).

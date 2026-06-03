# Outbound webhooks (§5.9, §7.3, Phase 5)

Premium tenants register HTTPS endpoints in the builder dashboard. Lead, job, and
design events enqueue **signed** deliveries that an hourly cron drains with
retries.

## Event kinds

`lead.created`, `lead.submitted`, `lead.quoted`, `lead.accepted`, `lead.closed`,
`job.in_production`, `job.install_scheduled`, `job.complete`, `design.revised`.

## Delivery format

`POST {your-url}` with a plain-JSON body:

```json
{ "event": "job.complete", "at": "2026-06-03T12:00:00.000Z", "data": { "jobId": "…", "leadId": "…", "status": "complete" } }
```

Header:

```
X-Dock-Signature: t=1717416000,v1=<hex HMAC-SHA256>
```

where `v1 = HMAC_SHA256(secret, `${t}.${rawBody}`)`. The signing **secret is shown
exactly once** when you create the endpoint (symmetric HMAC requires storing it
to sign; it is never returned by read APIs afterward).

## Verification recipe

```js
import crypto from "node:crypto";

function verify(secret, header, rawBody) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  // constant-time compare; optionally reject if |now - t| is too large (replay).
  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}
```

(`src/lib/webhooks.ts` exports `signPayload` + `verifySignature` used by the tests.)

## Retry policy

Each delivery is attempted up to **5 times**. After a failed attempt the next is
scheduled after: **30s → 5m → 30m → 2h → 12h**. After the 5th attempt the
delivery is marked `failed`. Deliveries persist in the `WebhookDelivery` table
(`status`, `attempt`, `nextAttemptAt`, `lastError`).

## Draining

The cron route `POST /api/internal/drain-webhooks` (protected by the
`X-Cron-Secret` header reused from Phase 3) dispatches all due deliveries.
Hourly via `vercel.json`.

```bash
curl -X POST -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/api/internal/drain-webhooks
```

## Testing an endpoint

The dashboard "Test" button sends an immediate signed `lead.created` test
delivery to confirm the URL + signature path before real events flow.

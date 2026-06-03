# Embeddable widget — host protocol (§5.7, Phase 4)

Builders on **Pro+** can embed the configurator on their own site. The snippet:

```html
<script src="https://app.com/embed.js" data-tenant="acme-docks" async></script>
```

## How it works

1. `/embed.js` (rewritten to `/api/embed-loader`) serves a tiny, framework-free
   loader (≤ 8 KB, deterministic, cacheable). It reads its own
   `data-tenant`, injects an `<iframe>` pointing at
   `https://app.com/embed?tenant={slug}`, and inserts it right after the script
   tag. It **never reads or writes the host page's cookies**.
2. The iframe loads the app's `/embed` page (chrome stripped) — the same Phase
   1/3 questionnaire → configurator → submit flow, themed to the tenant's
   branding. Leads created inside the iframe belong to that tenant.
3. Entitlement: the `/embed` page checks `entitlements.embed`. Starter tenants
   see a "Pro feature" message instead of the configurator.

## postMessage protocol

The iframe posts messages to `window.parent`; the loader **validates
`event.origin` against the app origin** (strict allow-list, `isAllowedOrigin`)
and ignores everything else.

| message | direction | payload | effect |
| --- | --- | --- | --- |
| `dock-embed:resize` | iframe → host | `{ height: number }` | loader sets iframe height (no inner scrollbars) |
| `dock-embed:scrollTop` | iframe → host | `{}` | loader scrolls the iframe into view |

The iframe posts with target `"*"` (it can't know the host origin); no sensitive
data is ever sent — only the content height. The **host** side enforces origin.

## CORS / cookies

- The loader script is served with `Cache-Control: public` and is CORS-safe
  (plain JS, no credentials).
- Customer sessions are **first-party to the app origin** (the iframe's origin),
  set `httpOnly; SameSite=Lax`. In a cross-site iframe these are third-party
  cookies; modern browsers may partition or block them. For v1 this works on
  same-site previews and browsers that allow it; Storage Access / partitioned
  cookies are a future hardening step. The host page's own cookies are never
  touched.

## Theming

The iframe inherits the tenant's branding (colors) from their dashboard
settings. The "Powered by" badge follows `entitlements.removeBadge` +
the Branding toggle, exactly like the hosted page.

/**
 * Pure subdomain → tenant-slug resolution (§8 Phase 2 item 6).
 *
 * No I/O, no `server-only`, no Prisma — safe to import from edge middleware AND
 * unit tests. Production: `{slug}.app.com`. Local dev (no wildcard DNS): the
 * `?tenant={slug}` query param wins. Falls back to DEFAULT_TENANT_SLUG so the
 * Phase 1 flow keeps working on the root domain.
 */

export const TENANT_SLUG_HEADER = "x-tenant-slug";

/** Subdomains that are never tenants (platform surfaces live here). */
export const RESERVED_SUBDOMAINS = new Set(["www", "app", "admin", "api", "dashboard"]);

export interface SlugResolutionOpts {
  /** Apex domain, e.g. "app.com". */
  appDomain: string;
  /** Slug used when nothing else resolves (root domain / local dev). */
  defaultSlug: string;
}

/**
 * Resolve the tenant slug for a request. Query param `?tenant=` takes precedence
 * (local dev fallback), then the subdomain of `appDomain`, then the default.
 */
export function parseTenantSlug(
  host: string | null | undefined,
  url: URL,
  opts: SlugResolutionOpts,
): string {
  const q = url.searchParams.get("tenant");
  if (q && isValidSlug(q)) return q.toLowerCase();

  if (host) {
    const hostname = host.split(":")[0]!.toLowerCase();
    const suffix = `.${opts.appDomain.toLowerCase()}`;
    if (hostname.endsWith(suffix)) {
      const sub = hostname.slice(0, -suffix.length);
      if (sub && !sub.includes(".") && !RESERVED_SUBDOMAINS.has(sub) && isValidSlug(sub)) {
        return sub;
      }
    }
  }
  return opts.defaultSlug;
}

/** Slugs are DNS-label-ish: lowercase alphanumerics + hyphens, 1–63 chars. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug.toLowerCase());
}

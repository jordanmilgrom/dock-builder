import { NextResponse, type NextRequest } from "next/server";
import { parseTenantSlug, TENANT_SLUG_HEADER } from "@/lib/tenantRouting";

/**
 * Wildcard subdomain routing (§8 Phase 2 item 6). Resolves `{slug}.app.com`
 * (prod) or the `?tenant={slug}` query fallback (local dev / Vercel preview)
 * into a tenant slug and injects it as a request header. Edge-safe: pure string
 * parsing only — the actual slug→tenant DB lookup happens in node route handlers
 * and server components via getTenantContext().
 */
export function middleware(req: NextRequest): NextResponse {
  const slug = parseTenantSlug(req.headers.get("host"), req.nextUrl, {
    appDomain: process.env.APP_DOMAIN ?? "app.com",
    defaultSlug: process.env.DEFAULT_TENANT_SLUG ?? "acme-docks",
  });
  const headers = new Headers(req.headers);
  headers.set(TENANT_SLUG_HEADER, slug);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import {
  CUSTOM_HOST_HEADER,
  PATHNAME_HEADER,
  TENANT_SLUG_HEADER,
  customDomainCandidate,
  parseTenantSlug,
} from "@/lib/tenantRouting";

/**
 * Tenant routing (§8 Phase 2 item 6 + Phase 4 custom domains). Edge-safe: pure
 * string parsing only. Resolves a slug from `{slug}.app.com` / `?tenant=`, flags
 * a custom-domain host for node-side O(1) lookup, and records the pathname so the
 * root layout can drop chrome for the embed iframe. No DB here.
 */
export function middleware(req: NextRequest): NextResponse {
  const appDomain = process.env.APP_DOMAIN ?? "app.com";
  const host = req.headers.get("host");

  const slug = parseTenantSlug(host, req.nextUrl, {
    appDomain,
    defaultSlug: process.env.DEFAULT_TENANT_SLUG ?? "acme-docks",
  });
  const customHost = customDomainCandidate(host, req.nextUrl, { appDomain });

  const headers = new Headers(req.headers);
  headers.set(TENANT_SLUG_HEADER, slug);
  headers.set(PATHNAME_HEADER, req.nextUrl.pathname);
  if (customHost) headers.set(CUSTOM_HOST_HEADER, customHost);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

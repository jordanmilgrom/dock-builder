import { type NextRequest } from "next/server";
import { buildEmbedLoader } from "@/lib/embed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves the embed loader (`/embed.js` via rewrite). Plain JS, no framework, no
 * cookies. The loader is tenant-agnostic — the tenant comes from the snippet's
 * `data-tenant`; entitlement gating happens when the `/embed` iframe page loads.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const appOrigin = process.env.APP_ORIGIN ?? req.nextUrl.origin;
  const body = buildEmbedLoader(appOrigin);
  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
